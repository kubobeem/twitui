import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CONFIG_DIR, VENV_DIR } from './config.ts';
import { RpcError, type ErrorKind } from './types.ts';

/** Absolute path to the bundled bridge script (works for global installs too). */
const BRIDGE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'python', 'twitui_bridge.py');

export interface BridgeOptions {
  fake?: boolean;
  pythonBin?: string;
  onLog?: (level: string, message: string) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: RpcError) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BRIDGE_RESTARTS = 3;

function toKind(kind: unknown): ErrorKind {
  const valid: ErrorKind[] = ['session_expired', 'rate_limited', 'forbidden', 'not_found', 'auth', 'not_supported', 'upstream'];
  return valid.includes(kind as ErrorKind) ? (kind as ErrorKind) : 'upstream';
}

/** Locate or create the Python venv with twifork installed. */
export async function ensureVenv(onLog?: (msg: string) => void, force = false): Promise<string> {
  const pythonBin = process.env['TWITUI_PYTHON'] ?? 'python';
  const venvPython = process.platform === 'win32' ? join(VENV_DIR, 'Scripts', 'python.exe') : join(VENV_DIR, 'bin', 'python');

  if (force) {
    await rm(VENV_DIR, { recursive: true, force: true }).catch(() => undefined);
  }
  if (existsSync(venvPython)) {
    // Verify twifork is importable; reinstall if missing.
    const probe = spawn(venvPython, ['-c', 'import twikit'], { stdio: 'ignore' });
    const ok = await new Promise<boolean>((resolve) => {
      probe.on('exit', (code) => resolve(code === 0));
      probe.on('error', () => resolve(false));
    });
    if (ok) return venvPython;
    onLog?.('twifork not importable in venv; reinstalling…');
    await rm(VENV_DIR, { recursive: true, force: true }).catch(() => undefined);
  }

  await mkdir(CONFIG_DIR, { recursive: true });
  const uvBin = process.env['TWITUI_UV'] ?? 'uv';
  const hasUv = await new Promise<boolean>((resolve) => {
    const p = spawn(uvBin, ['--version'], { stdio: 'ignore' });
    p.on('exit', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });

  const run = (cmd: string, args: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      onLog?.(`$ ${cmd} ${args.join(' ')}`);
      const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      p.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(stderr.slice(-400) || `${cmd} exited ${code}`))));
      p.on('error', reject);
    });

  if (hasUv) {
    // uv path: can even install Python itself if missing.
    try {
      await run(uvBin, ['venv', VENV_DIR, '--python', '3.12']);
    } catch {
      await run(uvBin, ['python', 'install', '3.12']);
      await run(uvBin, ['venv', VENV_DIR, '--python', '3.12']);
    }
    await run(uvBin, ['pip', 'install', '--python', venvPython, 'twifork[impersonate]']);
    return venvPython;
  }

  // Plain python + venv + pip path.
  try {
    await run(pythonBin, ['-m', 'venv', VENV_DIR]);
  } catch (e) {
    throw new Error(
      `Python setup failed and uv was not found. Install Python 3.10+ or uv (https://docs.astral.sh/uv/). Detail: ${(e as Error).message}`,
    );
  }
  await run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  await run(venvPython, ['-m', 'pip', 'install', 'twifork[impersonate]']);
  return venvPython;
}

export class Bridge extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pythonBin!: string;
  private fake: boolean;
  private pending = new Map<string, PendingRequest>();
  private buffer = '';
  private restarts = 0;
  private starting = false;
  private onLog?: (level: string, message: string) => void;

  constructor(opts: BridgeOptions = {}) {
    super();
    this.fake = opts.fake ?? false;
    this.onLog = opts.onLog;
    this.pythonBin = opts.pythonBin ?? (process.platform === 'win32'
      ? join(VENV_DIR, 'Scripts', 'python.exe')
      : join(VENV_DIR, 'bin', 'python'));
  }

  get running(): boolean {
    return this.proc !== null && this.proc.exitCode === null;
  }

  async start(timeoutMs = 120_000): Promise<void> {
    if (this.running) return;
    this.starting = true;

    if (!existsSync(this.pythonBin)) {
      if (this.fake) {
        // fake mode needs any system python (no venv setup required)
        for (const candidate of ['python', 'python3']) {
          const probe = spawn(candidate, ['--version'], { stdio: 'ignore' });
          const ok = await new Promise<boolean>((resolve) => {
            probe.on('exit', (code) => resolve(code === 0));
            probe.on('error', () => resolve(false));
          });
          if (ok) {
            this.pythonBin = candidate;
            break;
          }
        }
      } else {
        // First run: build the venv.
        await ensureVenv((m) => this.onLog?.('info', m));
      }
    }

    const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    if (this.fake) env['TWITUI_FAKE'] = '1';
    const proc = spawn(this.pythonBin, ['-X', 'utf8', BRIDGE_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
    this.proc = proc;

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line) as { level?: string; message?: string };
          this.onLog?.(rec.level ?? 'info', rec.message ?? line);
        } catch {
          this.onLog?.('info', line);
        }
      }
    });
    proc.on('exit', (code) => {
      this.proc = null;
      this.rejectAll(new RpcError(-32000, `bridge exited (code ${code})`, 'upstream'));
      if (this.starting) return; // initial start failed; do not auto-restart here
      this.restarts += 1;
      if (this.restarts <= MAX_BRIDGE_RESTARTS) {
        this.emit('restarting', this.restarts);
        setTimeout(() => { void this.start(timeoutMs); }, 1000 * this.restarts);
      } else {
        this.emit('dead');
      }
    });

    // Handshake: ping works without initialization (initialize with real
    // cookies happens later via TwituiApi.initialize). Pinging here just
    // verifies the bridge process is alive and speaking JSON-RPC.
    await this.request('ping', {}, Math.min(timeoutMs, 30_000));
    this.starting = false;
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const id = msg['id'] as string | number | null;
      if (id !== undefined && id !== null && (msg['result'] !== undefined || msg['error'] !== undefined)) {
        const pending = this.pending.get(String(id));
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(String(id));
        if (msg['error'] !== undefined) {
          const err = msg['error'] as { code?: number; message?: string; data?: { kind?: string; retryAfter?: number } };
          pending.reject(new RpcError(err.code ?? -32000, err.message ?? 'unknown error', toKind(err.data?.kind), (err.data ?? {}) as Record<string, unknown>));
        } else {
          pending.resolve(msg['result']);
        }
      }
      // notifications ignored in v1
    }
  }

  private rejectAll(err: RpcError): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    if (!this.running) {
      return Promise.reject(new RpcError(-32000, 'bridge not running', 'upstream'));
    }
    const id = randomUUID();
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(-32000, `bridge request timed out: ${method}`, 'upstream'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      this.proc!.stdin.write(payload);
    });
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;
    try {
      await this.request('shutdown', {}, 2000);
    } catch {
      /* ignore */
    }
    proc.kill();
    this.proc = null;
    this.rejectAll(new RpcError(-32000, 'bridge stopped', 'upstream'));
  }
}

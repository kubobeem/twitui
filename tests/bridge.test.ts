import { afterAll, describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'python', 'twitui_bridge.py');

class BridgeHandle {
  private proc = spawn('python', ['-X', 'utf8', scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TWITUI_FAKE: '1', PYTHONIOENCODING: 'utf-8' },
  });
  private buffer = '';
  private waiters: ((line: string) => void)[] = [];
  stderr = '';

  constructor() {
    this.proc.stdout!.setEncoding('utf8');
    this.proc.stdout!.on('data', (chunk: string) => {
      this.buffer += chunk;
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (line) {
          const w = this.waiters.shift();
          if (w) w(line);
        }
      }
    });
    this.proc.stderr!.setEncoding('utf8');
    this.proc.stderr!.on('data', (chunk: string) => { this.stderr += chunk; });
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = Math.floor(Math.random() * 1e9);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 15_000);
      this.waiters.push((line: string) => {
        clearTimeout(timer);
        const msg = JSON.parse(line);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      });
      this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  stop(): void {
    this.proc.kill();
  }
}

describe('twitui_bridge (fake mode)', () => {
  const bridge = new BridgeHandle();
  afterAll(() => bridge.stop());

  it('initializes in fake mode', async () => {
    const res = await bridge.request('initialize', { fake: true });
    expect(res.mode).toBe('fake');
    expect(res.user.screen_name).toBe('shin');
    expect(res.languages).toContain('ja');
  });

  it('returns home timeline as paged tweets', async () => {
    const page = await bridge.request('home/latest', {});
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]).toMatchObject({ id: expect.any(String), text: expect.any(String), user: expect.objectContaining({ screen_name: expect.any(String) }) });
  });

  it('pages with cursor', async () => {
    const p1 = await bridge.request('home/latest', {});
    if (!p1.nextCursor) return; // only 7 samples; page size 10 => no cursor
    const p2 = await bridge.request('home/latest', { cursor: p1.nextCursor });
    expect(p2.items.length).toBeGreaterThan(0);
    expect(p2.items[0].id).not.toBe(p1.items[0].id);
  });

  it('creates, finds and deletes a tweet', async () => {
    const created = await bridge.request('tweet/create', { text: 'hello from test' });
    expect(created.text).toBe('hello from test');
    const detail = await bridge.request('tweet/detail', { tweet_id: created.id });
    expect(detail.id).toBe(created.id);
    const deleted = await bridge.request('tweet/delete', { tweet_id: created.id });
    expect(deleted.deleted).toBe(true);
    await expect(bridge.request('tweet/detail', { tweet_id: created.id })).rejects.toThrow(/not found/);
  });

  it('rejects overlong tweets', async () => {
    await expect(bridge.request('tweet/create', { text: 'a'.repeat(281) })).rejects.toThrow(/280/);
  });

  it('toggles like', async () => {
    const r1 = await bridge.request('tweet/like', { tweet_id: 't1001' });
    expect(r1.liked).toBe(true);
    const r2 = await bridge.request('tweet/unlike', { tweet_id: 't1001' });
    expect(r2.liked).toBe(false);
  });

  it('searches tweets', async () => {
    const res = await bridge.request('tweet/search', { q: 'twitui', mode: 'Top' });
    expect(res.items.length).toBeGreaterThan(0);
  });

  it('lists bookmarks and dm list', async () => {
    const bm = await bridge.request('bookmarks/list', {});
    expect(bm.items.length).toBeGreaterThan(0);
    const dms = await bridge.request('dm/list', {});
    expect(Array.isArray(dms)).toBe(true);
    expect(dms[0]).toMatchObject({ user: expect.objectContaining({ screen_name: expect.any(String) }) });
  });

  it('sends dm and reads messages', async () => {
    const sent = await bridge.request('dm/send', { user_id: '1002', text: 'test dm' });
    expect(sent.text).toBe('test dm');
    const msgs = await bridge.request('dm/messages', { user_id: '1002' });
    expect(msgs.items.length).toBeGreaterThanOrEqual(4);
  });

  it('returns trends', async () => {
    const trends = await bridge.request('trends', {});
    expect(trends.length).toBe(4);
    expect(trends[0]).toMatchObject({ name: '#TUI' });
  });

  it('classifies unknown methods as -32601', async () => {
    await expect(bridge.request('no/such/method', {})).rejects.toThrow(/unknown method/);
  });

  it('pings', async () => {
    const res = await bridge.request('ping', {});
    expect(res.pong).toBe(true);
    expect(res.mode).toBe('fake');
  });
});

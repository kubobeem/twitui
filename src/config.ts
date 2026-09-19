import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = join(homedir(), '.config', 'twikit-tui');
export const ENV_FILE = join(CONFIG_DIR, '.env');
export const CONFIG_JSON = join(CONFIG_DIR, 'config.json');
export const VENV_DIR = join(CONFIG_DIR, 'venv');

export interface AppConfig {
  uiLang?: 'ja' | 'en';
  pollInterval?: number;
  media?: { timelinePreview?: boolean };
}

export interface Credentials {
  AUTH_TOKEN: string;
  CT0: string;
}

async function ensureDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

/** Parse a pasted cookie string in several formats into credentials. */
export function parseCookieInput(input: string): Credentials | null {
  const text = input.trim();
  if (!text) return null;

  // 1) Raw JSON: {"auth_token": "...", "ct0": "..."}
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const authToken = String(obj['auth_token'] ?? obj['AUTH_TOKEN'] ?? '');
      const ct0 = String(obj['ct0'] ?? obj['CT0'] ?? '');
      if (authToken && ct0) return { AUTH_TOKEN: authToken, CT0: ct0 };
    } catch {
      /* fall through */
    }
  }

  // 2) Cookie header style: "auth_token=...; ct0=...; other=..."
  const pair = /(?:^|;\s*)auth_token=([^;\s]+)/.exec(text);
  const ct0 = /(?:^|;\s*)ct0=([^;\s]+)/.exec(text);
  if (pair && ct0) {
    return { AUTH_TOKEN: decodeURIComponent(pair[1]!), CT0: decodeURIComponent(ct0[1]!) };
  }

  // 3) Two lines / "name: value" style (also handles newlines between pairs)
  const authTokenMatch = /auth_token\s*[:=]\s*"?([A-Za-z0-9%]+)"?/i.exec(text);
  const ct0Match = /\bct0\s*[:=]\s*"?([A-Za-z0-9%]+)"?/i.exec(text);
  if (authTokenMatch && ct0Match) {
    return { AUTH_TOKEN: decodeURIComponent(authTokenMatch[1]!), CT0: decodeURIComponent(ct0Match[1]!) };
  }

  return null;
}

export async function loadCredentials(): Promise<Credentials | null> {
  // environment variables take precedence
  const envAuth = process.env['AUTH_TOKEN'];
  const envCt0 = process.env['CT0'];
  if (envAuth && envCt0) return { AUTH_TOKEN: envAuth, CT0: envCt0 };

  try {
    const raw = await readFile(ENV_FILE, 'utf8');
    const map = new Map<string, string>();
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
      if (m) map.set(m[1]!, m[2]!.replace(/^["']|["']$/g, ''));
    }
    const AUTH_TOKEN = map.get('AUTH_TOKEN');
    const CT0 = map.get('CT0');
    if (AUTH_TOKEN && CT0) return { AUTH_TOKEN, CT0 };
  } catch {
    /* no file */
  }
  return null;
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  await ensureDir();
  const body = `# twitui credentials - DO NOT commit this file\nAUTH_TOKEN=${creds.AUTH_TOKEN}\nCT0=${creds.CT0}\n`;
  await writeFile(ENV_FILE, body, { mode: 0o600 });
  try {
    await chmod(ENV_FILE, 0o600);
  } catch {
    /* windows: chmod is best-effort */
  }
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_JSON, 'utf8');
    return { ...parseEnvConfig(), ...(JSON.parse(raw) as AppConfig) };
  } catch {
    return parseEnvConfig();
  }
}

function parseEnvConfig(): AppConfig {
  const cfg: AppConfig = {};
  const lang = process.env['UI_LANG'];
  if (lang === 'ja' || lang === 'en') cfg.uiLang = lang;
  const poll = Number(process.env['POLL_INTERVAL']);
  if (Number.isFinite(poll) && poll >= 30) cfg.pollInterval = poll;
  return cfg;
}

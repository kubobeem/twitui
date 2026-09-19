#!/usr/bin/env node
// Connects to a Chromium-based browser's DevTools protocol (launched with
// --remote-debugging-port=PORT) and saves the x.com auth_token / ct0 cookies
// directly to ~/.config/twikit-tui/.env — cookie values are never printed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const port = process.argv[2] ?? '9222';

const ver = await fetch(`http://127.0.0.1:${port}/json/version`)
  .then((r) => r.json())
  .catch((e) => {
    console.error('CDP_NOT reachable:', e.message);
    process.exit(2);
  });

const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

ws.onerror = () => {
  console.error('WS error');
  process.exit(2);
};

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
};

ws.onopen = async () => {
  try {
    const { cookies } = await send('Storage.getCookies');
    const xc = cookies.filter(
      (c) => c.domain.endsWith('x.com') || c.domain.endsWith('twitter.com'),
    );
    const found = {};
    for (const n of ['auth_token', 'ct0']) {
      const c = xc.find((x) => x.name === n);
      if (c) found[n] = c.value;
    }
    const missing = ['auth_token', 'ct0'].filter((n) => !found[n]);
    if (missing.length > 0) {
      console.error('MISSING cookies:', missing.join(', '));
      process.exit(3);
    }
    const dir = join(homedir(), '.config', 'twikit-tui');
    mkdirSync(dir, { recursive: true });
    const body = `# twitui credentials - DO NOT commit this file\nAUTH_TOKEN=${found.auth_token}\nCT0=${found.ct0}\n`;
    const envPath = join(dir, '.env');
    writeFileSync(envPath, body);
    console.log('WROTE', envPath, '| auth_token:', found.auth_token.length, 'chars, ct0:', found.ct0.length, 'chars');
    process.exit(0);
  } catch (e) {
    console.error('ERR', e.message);
    process.exit(1);
  }
};

#!/usr/bin/env node
/** Launch the real TUI with saved cookies, capture frames, verify timeline
 * rendered (screen name / tweets visible), then quit. Never prints cookies. */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const envFile = join(homedir(), '.config', 'twikit-tui', '.env');
if (!existsSync(envFile)) {
  console.error('FAIL: no .env at', envFile);
  process.exit(1);
}
const env = readFileSync(envFile, 'utf8');
if (!/AUTH_TOKEN=/.test(env) || !/CT0=/.test(env)) {
  console.error('FAIL: .env missing AUTH_TOKEN/CT0');
  process.exit(1);
}
console.log('.env found (AUTH_TOKEN + CT0 present)');

const child = spawn(process.execPath, ['dist/cli.js', '--lang', 'ja'], {
  cwd: root,
  // NOTE: no CI=1 — Ink buffers all frames until exit in CI mode, so a
  // SIGKILLed harness would see zero output. Without CI, Ink streams frames.
  env: { ...process.env },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });
child.on('error', (err) => {
  console.error('spawn error:', err.message);
  process.exit(1);
});

const timeout = setTimeout(() => {
  child.kill('SIGKILL');
}, 90_000);

// UI renders in ja by default; accept both ja/en tab labels.
// Last condition: at least one tweet row ("@user" + text) in the center column.
const wanted = [/@Qaa_a_a_a/, /For you|おすすめ/i, /Following|フォロー中/, /@\w{2,}\s*\n|@\w{2,}: /];
let done = false;
const timer = setInterval(() => {
  if (!done && Math.round(Date.now() / 1000) % 15 === 0) {
    console.error(`[harness] ${out.length} bytes; matches: name=${/@Qaa_a_a_a/.test(out)} foryou=${/For you/i.test(out)} following=${/Following/.test(out)}`);
  }
  if (wanted.every((re) => re.test(out))) {
    done = true;
    clearInterval(timer);
    clearTimeout(timeout);
    child.kill('SIGKILL');
    const hasTweets = /@[\w_]{2,}:/.test(out);
    console.log(`timeline rendered: screen name + tabs visible (bytes=${out.length}, tweets visible=${hasTweets})`);
    console.log('REAL-TUI OK');
    process.exit(0);
  }
}, 1000);

child.on('exit', (code) => {
  if (!done) {
    clearInterval(timer);
    clearTimeout(timeout);
    console.error(`FAIL: TUI exited early (code=${code}). bytes=${out.length}. Last output:\n${out.slice(-1500)}`);
    writeFileSync('tui_smoke_dump.txt', out);
    process.exit(1);
  }
});

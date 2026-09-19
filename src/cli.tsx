#!/usr/bin/env node
import React, { useEffect, useState } from 'react';
import { EventEmitter } from 'node:events';
import { render, Text, Box, useApp } from 'ink';
import { Bridge } from './rpc.ts';
import { TwituiApi } from './api.ts';
import { loadCredentials, loadConfig, saveCredentials, parseCookieInput } from './config.ts';
import { SetupScreen } from './ui/SetupScreen.tsx';
import { App } from './ui/App.tsx';
import { createT, getLang } from './i18n.ts';
import { RpcError } from './types.ts';
import type { User } from './types.ts';
import type { Credentials } from './config.ts';

interface Args {
  fake: boolean;
  setup: boolean;
  reinstall: boolean;
  help: boolean;
  lang?: string;
  poll?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { fake: false, setup: false, reinstall: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fake') args.fake = true;
    else if (a === '--setup') args.setup = true;
    else if (a === '--reinstall-backend') args.reinstall = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--lang' && argv[i + 1]) { args.lang = argv[++i]; }
    else if (a === '--poll' && argv[i + 1]) { args.poll = Number(argv[++i]); }
  }
  return args;
}

const HELP = `twitui — X (Twitter) TUI client powered by twifork

Usage: twitui [options]

Options:
  --fake                Run with the in-memory fake client (no cookies needed)
  --setup               Re-enter cookies
  --reinstall-backend   Rebuild the Python venv and reinstall twifork
  --lang <ja|en>        UI language (default: from config / locale)
  --poll <seconds>      Timeline poll interval (default: 120, min 30)
  -h, --help            Show this help
`;

function ErrorPane({ message, hint }: { message: string; hint?: string }): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" width={72} paddingX={2}>
      <Text bold color="red">twitui error</Text>
      <Text>{message}</Text>
      {hint && <Text dimColor>{hint}</Text>}
    </Box>
  );
}

function Bootstrap(): React.ReactElement {
  const { exit } = useApp();
  const args = parseArgs(process.argv);
  const [phase, setPhase] = useState<'starting' | 'setup' | 'app' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const [hint, setHint] = useState<string | undefined>(undefined);
  const [bridge] = useState(() => new Bridge({ fake: args.fake || process.env['TWITUI_FAKE'] === '1' }));
  const api = new TwituiApi(bridge);
  const [session, setSession] = useState<{ creds: Credentials; user: User; mode: 'fake' | 'real' } | null>(null);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof loadConfig>> | null>(null);

  useEffect(() => {
    void (async () => {
      const cfg = await loadConfig();
      if (args.poll && args.poll >= 30) cfg.pollInterval = args.poll;
      if (args.lang === 'ja' || args.lang === 'en') cfg.uiLang = args.lang;
      setConfig(cfg);

      if (args.reinstall) {
        const { ensureVenv } = await import('./rpc.ts');
        try {
          await ensureVenv((m) => console.error(m), true);
        } catch (e) {
          setErrorMsg((e as Error).message);
          setHint('Install Python 3.10+ or uv, then retry.');
          setPhase('error');
          return;
        }
      }

      if (args.help) {
        console.log(HELP);
        exit();
        return;
      }

      const fake = args.fake || process.env['TWITUI_FAKE'] === '1';
      if (fake) {
        try {
          await bridge.start();
          const res = await api.initialize({ AUTH_TOKEN: '', CT0: '' }, cfg.uiLang ?? getLang(cfg.uiLang), true);
          setSession({ creds: { AUTH_TOKEN: '', CT0: '' }, user: res.user, mode: res.mode });
          setPhase('app');
        } catch (e) {
          setErrorMsg((e as Error).message);
          setPhase('error');
        }
        return;
      }

      const creds = await loadCredentials();
      if (!creds || args.setup) {
        await bridge.start();
        setPhase('setup');
        return;
      }

      try {
        await bridge.start();
        const res = await api.initialize(creds, cfg.uiLang ?? getLang(cfg.uiLang), false);
        setSession({ creds, user: res.user, mode: res.mode });
        setPhase('app');
      } catch (e) {
        if (e instanceof RpcError && (e.kind === 'session_expired' || e.kind === 'auth')) {
          setPhase('setup');
          return;
        }
        setErrorMsg((e as Error).message);
        setHint('Try: twitui --reinstall-backend  (rebuilds the Python venv)');
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'starting') {
    return <Text dimColor>twitui: starting bridge…</Text>;
  }
  if (phase === 'error') {
    return <ErrorPane message={errorMsg} hint={hint} />;
  }
  if (phase === 'setup') {
    return (
      <SetupScreen
        api={api}
        lang={config?.uiLang}
        onDone={(creds, user) => {
          void saveCredentials(creds);
          setSession({ creds, user: user as User, mode: 'real' });
          setPhase('app');
        }}
      />
    );
  }
  if (phase === 'app' && session && config) {
    return (
      <App
        api={api}
        me={session.user}
        mode={session.mode}
        pollIntervalMs={(config.pollInterval ?? 120) * 1000}
        uiLang={config.uiLang}
        timelinePreview={config.media?.timelinePreview !== false}
      />
    );
  }
  return <Text>…</Text>;
}

const interactive = Boolean(process.stdin.isTTY);
/** Ink 6's useInput throws when stdin is not a TTY. Under pipes/CI the app has
 * no keyboard anyway, so feed it an inert TTY-like stdin to keep rendering. */
function makeMockStdin(): NodeJS.ReadStream {
  const emitter = new EventEmitter() as unknown as NodeJS.ReadStream;
  const fake = emitter as unknown as Record<string, unknown>;
  fake['isTTY'] = true;
  fake['setEncoding'] = () => {};
  fake['setRawMode'] = () => {};
  fake['ref'] = () => {};
  fake['unref'] = () => {};
  fake['read'] = () => null;
  fake['resume'] = () => {};
  fake['pause'] = () => {};
  return emitter;
}

const renderOptions: Parameters<typeof render>[1] = { exitOnCtrlC: false };
if (!interactive) renderOptions.stdin = makeMockStdin();
const app = render(<Bootstrap />, renderOptions);
process.on('SIGINT', () => {
  app.unmount();
  process.exit(0);
});

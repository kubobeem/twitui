import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { parseCookieInput, saveCredentials, type Credentials } from '../config.ts';
import { TwituiApi } from '../api.ts';
import { RpcError } from '../types.ts';
import { createT, getLang, type T } from '../i18n.ts';

interface SetupScreenProps {
  api: TwituiApi;
  lang?: string;
  onDone: (creds: Credentials, user: { id: string; screen_name: string; name: string }) => void;
  expired?: boolean;
}

/** First-run / session-expired cookie setup screen. */
export function SetupScreen({ api, lang, onDone, expired }: SetupScreenProps): React.ReactElement {
  const t: T = createT(getLang(lang));
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'invalid' | 'rejected'>('idle');
  const [rejectMsg, setRejectMsg] = useState('');

  useInput((ch, key) => {
    if (key.escape) return; // no escape from setup (Ctrl+C exits via Ink default)
    if (key.return) {
      if (status === 'verifying') return;
      const creds = parseCookieInput(input);
      if (!creds) {
        setStatus('invalid');
        return;
      }
      setStatus('verifying');
      void api.initialize(creds, t === undefined ? 'en' : getLang(lang), false)
        .then((res) => saveCredentials(creds).then(() => onDone(creds, res.user)))
        .catch((e: unknown) => {
          setStatus('rejected');
          setRejectMsg(e instanceof RpcError ? e.message : String(e));
        });
      return;
    }
    if (key.backspace || key.delete) setInput((s) => s.slice(0, -1));
    else if (ch && !key.ctrl && !key.meta) setInput((s) => s + ch);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" width={72} paddingX={2} paddingY={1}>
      <Text bold color="cyan">{t('setup.title')}</Text>
      <Text>{t('setup.steps')}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>{t('setup.inputLabel')}:</Text>
        <Box borderStyle="single" borderColor={status === 'invalid' ? 'red' : 'gray'} paddingX={1}>
          <Text>{input}</Text>
          <Text inverse> </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        {status === 'idle' && <Text dimColor>[{t('setup.verify')}] Enter</Text>}
        {status === 'verifying' && <Text color="yellow">{t('setup.verifying')}</Text>}
        {status === 'invalid' && <Text color="red">{t('setup.invalid')}</Text>}
        {status === 'rejected' && <Text color="red">{t('setup.rejected', { message: rejectMsg })}</Text>}
      </Box>
      {expired && <Text color="yellow">⚠ {t('setup.expired')}</Text>}
      <Box marginTop={1}>
        <Text dimColor>{t('setup.quitHint')}</Text>
      </Box>
    </Box>
  );
}

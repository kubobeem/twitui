import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { T } from '../../i18n.ts';
import { Tweet as TweetType } from '../../types.ts';

export type ComposeMode = 'new' | 'reply' | 'quote';

interface ComposeModalProps {
  mode: ComposeMode;
  t: T;
  parent?: TweetType | null;
  onSubmit: (text: string, mediaPaths: string[]) => Promise<void>;
  onClose: () => void;
}

/** x.com-style centered compose modal. Ctrl+Enter submits, Esc closes. */
export function ComposeModal({ mode, t, parent, onSubmit, onClose }: ComposeModalProps) {
  const [text, setText] = useState('');
  const [mediaInput, setMediaInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<'text' | 'media'>('text');

  const title = mode === 'new' ? t('compose.title') : mode === 'reply' ? t('compose.replyTitle') : t('compose.quoteTitle');
  const over = text.length > 280;

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.ctrl && input === 'c') {
      onClose();
      return;
    }
    if (key.tab) {
      setField((f) => (f === 'text' ? 'media' : 'text'));
      return;
    }
    if (key.ctrl && input === 'e' && !over && text.trim() && !submitting) {
      void doSubmit();
      return;
    }
    if (key.return && key.ctrl && !over && text.trim() && !submitting) {
      void doSubmit();
      return;
    }
    if (field === 'text') {
      if (key.backspace || key.delete) setText((s) => s.slice(0, -1));
      else if (input && !key.ctrl) setText((s) => (s.length < 1000 ? s + input : s));
    } else if (input && !key.ctrl) {
      setMediaInput((s) => s + input);
    } else if (key.backspace || key.delete) {
      setMediaInput((s) => s.slice(0, -1));
    }
  });

  const doSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const paths = mediaInput.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
      await onSubmit(text, paths);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const counterColor = over ? 'red' : text.length > 260 ? 'yellow' : 'dim';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" width={64} paddingX={2} paddingY={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">{title}</Text>
        <Text dimColor>[×] Esc</Text>
      </Box>
      {parent && (
        <Box marginBottom={1}>
          <Text dimColor>↘ @{parent.user.screen_name}: {parent.text.slice(0, 50)}</Text>
        </Box>
      )}
      <Box borderStyle="single" borderColor={field === 'text' ? 'cyan' : 'gray'} paddingX={1}>
        <Text>{text}</Text>
        {field === 'text' && <Text inverse> </Text>}
      </Box>
      <Box justifyContent="flex-end">
        <Text color={counterColor}>{text.length}/280</Text>
      </Box>
      <Box borderStyle="single" borderColor={field === 'media' ? 'cyan' : 'gray'} paddingX={1}>
        <Text dimColor>🖼 {t('compose.attach')}:</Text>
        <Text>{mediaInput}</Text>
        {field === 'media' && <Text inverse> </Text>}
      </Box>
      {error && <Text color="red">{error}</Text>}
      <Box justifyContent="space-between" marginTop={1}>
        <Text dimColor>{t('compose.ctrlEnter')}</Text>
        <Text color={submitting ? 'yellow' : over || !text.trim() ? 'gray' : 'green'}>
          {submitting ? '…' : `[${t('action.send')}]`}
        </Text>
      </Box>
    </Box>
  );
}

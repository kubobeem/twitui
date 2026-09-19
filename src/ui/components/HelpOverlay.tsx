import React from 'react';
import { Box, Text } from 'ink';
import type { T } from '../../i18n.ts';

export function HelpOverlay({ t, onClose }: { t: T; onClose: () => void }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" width={64} paddingX={2}>
      <Text bold color="yellow">{t('help.title')} (?)</Text>
      <Text>{t('help.lines')}</Text>
      <Text dimColor>Esc / ? で閉じる</Text>
      <Text dimColor> </Text>
      <Text dimColor>{typeof onClose === 'function' ? '' : ''}</Text>
    </Box>
  );
}

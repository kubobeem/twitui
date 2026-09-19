import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { renderImageFromUrl } from '../../media/render.ts';
import type { T } from '../../i18n.ts';

interface MediaViewProps {
  url: string;
  maxCols?: number;
  maxRows?: number;
  t: T;
}

/** Renders an image inline (kitty) or as braille art; shows a link fallback on failure. */
export function MediaView({ url, maxCols = 40, maxRows = 14, t }: MediaViewProps) {
  const [art, setArt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setArt(null);
    setFailed(false);
    void renderImageFromUrl(url, maxCols, maxRows).then((res) => {
      if (cancelled) return;
      if (res === null) setFailed(true);
      else setArt(res);
    });
    return () => {
      cancelled = true;
    };
  }, [url, maxCols, maxRows]);

  if (failed) {
    return (
      <Box flexDirection="column">
        <Text dimColor>🖼 {t('media.notSupported')}</Text>
        <Text dimColor>{url}</Text>
      </Box>
    );
  }
  if (art === null) {
    return <Text dimColor>{t('media.loading')}</Text>;
  }
  return (
    <Box flexDirection="column">
      {art.split('\n').map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}

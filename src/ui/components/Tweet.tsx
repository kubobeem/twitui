import React from 'react';
import { Box, Text } from 'ink';
import type { Tweet as TweetType } from '../../types.ts';
import type { T } from '../../i18n.ts';

export function formatRelativeTime(ts: number | null, createdAt: string | null, t: T): string {
  if (ts) {
    const d = Math.max(0, Date.now() - ts * 1000);
    if (d < 60_000) return `${Math.floor(d / 1000)}s`;
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
    return `${Math.floor(d / 86_400_000)}d`;
  }
  void t;
  return createdAt ?? '';
}

export function formatCount(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface TweetProps {
  tweet: TweetType;
  selected: boolean;
  t: T;
  width: number;
  fake?: boolean;
}

export const TweetRow = React.memo(function TweetRow({ tweet, selected, t, width, fake }: TweetProps) {
  const inner = Math.max(20, width - 4);
  const nameColor = tweet.user.verified ? 'green' : 'white';
  const time = formatRelativeTime(tweet.created_ts, tweet.created_at, t);

  return (
    <Box borderStyle={selected ? 'round' : undefined} borderColor="cyan" paddingLeft={selected ? 1 : 2} flexDirection="column">
      <Box>
        <Text color={nameColor} bold>{tweet.user.name}</Text>
        <Text dimColor> @{tweet.user.screen_name}</Text>
        {tweet.user.verified && <Text color="cyan"> ✔</Text>}
        {fake && <Text color="magenta"> [{t('fakeBadge')}]</Text>}
        <Text dimColor> · {time}</Text>
      </Box>
      <Text wrap="truncate-end">{tweet.text.slice(0, inner * 6)}</Text>
      {tweet.photo_url && <Text dimColor>🖼 {tweet.photo_url}</Text>}
      {tweet.video_url && <Text dimColor>🎬 {tweet.video_url}</Text>}
      {tweet.quoted_tweet && (
        <Box borderStyle="single" borderColor="gray" paddingLeft={1} marginTop={0}>
          <Text dimColor>↘ {tweet.quoted_tweet.user.screen_name}: {tweet.quoted_tweet.text.slice(0, inner)}</Text>
        </Box>
      )}
      <Box gap={2}>
        <Text dimColor>💬 {formatCount(tweet.reply_count)}</Text>
        <Text color={tweet.retweeted ? 'green' : 'dim'}>🔁 {formatCount(tweet.retweet_count)}</Text>
        <Text color={tweet.liked ? 'red' : 'dim'}>♥ {formatCount(tweet.favorite_count)}</Text>
        <Text color={tweet.bookmarked ? 'yellow' : 'dim'}>🔖</Text>
        <Text dimColor>👁 {formatCount(tweet.view_count)}</Text>
      </Box>
    </Box>
  );
});

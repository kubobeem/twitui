import React from 'react';
import { Box, Text } from 'ink';
import type { User } from '../../types.ts';
import type { T } from '../../i18n.ts';

export type Section = 'home' | 'explore' | 'dm' | 'bookmarks' | 'profile';

const SECTIONS: { key: Section; icon: string; num: string; labelKey: string }[] = [
  { key: 'home', icon: '🏠', num: '1', labelKey: 'nav.home' },
  { key: 'explore', icon: '🔍', num: '2', labelKey: 'nav.explore' },
  { key: 'dm', icon: '✉', num: '3', labelKey: 'nav.dm' },
  { key: 'bookmarks', icon: '🔖', num: '4', labelKey: 'nav.bookmarks' },
  { key: 'profile', icon: '👤', num: '5', labelKey: 'nav.profile' },
];

interface SidebarProps {
  active: Section;
  me: User | null;
  t: T;
  dmUnread: number;
  collapsed: boolean;
}

export const Sidebar = React.memo(function Sidebar({ active, me, t, dmUnread, collapsed }: SidebarProps) {
  if (collapsed) {
    return (
      <Box flexDirection="column" width={4} borderStyle="single" borderColor="gray">
        {SECTIONS.map((s) => (
          <Text key={s.key} color={active === s.key ? 'cyan' : 'gray'}>
            {active === s.key ? '▶' : ' '}{s.num}
          </Text>
        ))}
        <Text> </Text>
        <Text color="cyan">✏</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" width={20} borderStyle="single" borderColor="gray" paddingRight={1}>
      {SECTIONS.map((s) => (
        <Box key={s.key}>
          <Text color={active === s.key ? 'cyan' : 'white'} bold={active === s.key}>
            {active === s.key ? '▶ ' : '  '}{s.icon} {t(s.labelKey)}
          </Text>
          {s.key === 'dm' && dmUnread > 0 && <Text color="red"> [{dmUnread}]</Text>}
        </Box>
      ))}
      <Box marginTop={1} flexDirection="column">
        {me && (
          <>
            <Text bold>{me.name}</Text>
            <Text dimColor>@{me.screen_name}</Text>
          </>
        )}
      </Box>
      <Box marginTop={1}>
        <Text backgroundColor="cyan" color="black" bold> {t('nav.post')} (n) </Text>
      </Box>
    </Box>
  );
});

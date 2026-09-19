import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { spawn } from 'node:child_process';
import { Box, Text, useInput, useApp } from 'ink';
import { TwituiApi } from '../api.ts';
import type { Tweet, User, DmConversation, DmMessage, Space, Trend, Paged } from '../types.ts';
import { RpcError } from '../types.ts';
import { createT, getLang, type T } from '../i18n.ts';
import { useTimeline } from './hooks/useTimeline.ts';
import { TweetRow, formatCount } from './components/Tweet.tsx';
import { Sidebar, type Section } from './components/Sidebar.tsx';
import { ComposeModal, type ComposeMode } from './components/ComposeModal.tsx';
import { HelpOverlay } from './components/HelpOverlay.tsx';
import { MediaView } from './components/MediaView.tsx';
import { useMouse } from './hooks/useMouse.ts';

type Screen =
  | { kind: 'timeline' }
  | { kind: 'search'; query: string; mode: 'Top' | 'Latest' }
  | { kind: 'explore' }
  | { kind: 'detail'; tweet: Tweet }
  | { kind: 'profile'; user: User }
  | { kind: 'bookmarks' }
  | { kind: 'dm-list' }
  | { kind: 'dm-chat'; user: User }
  | { kind: 'spaces' };

interface AppProps {
  api: TwituiApi;
  me: User;
  mode: 'fake' | 'real';
  pollIntervalMs: number;
  uiLang?: string;
  timelinePreview: boolean;
}

interface ListState<T> {
  items: T[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
}

function useList<T>(fetcher: (cursor?: string) => Promise<Paged<T>>, deps: unknown[]): ListState<T> & { reload: () => void; loadMore: () => void } {
  const [state, setState] = useState<ListState<T>>({ items: [], cursor: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    void fetcher(undefined)
      .then((page) => {
        if (cancelled) return;
        cursorRef.current = page.nextCursor;
        setState({ items: page.items, cursor: page.nextCursor, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ items: [], cursor: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const loadMore = useCallback(() => {
    if (!cursorRef.current || state.loading) return;
    setState((s) => ({ ...s, loading: true }));
    void fetcher(cursorRef.current ?? undefined)
      .then((page) => {
        cursorRef.current = page.nextCursor;
        setState((s) => ({ items: [...s.items, ...page.items], cursor: page.nextCursor, loading: false, error: null }));
      })
      .catch((e: unknown) => {
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
      });
  }, [fetcher, state.loading]);

  return { ...state, reload: () => setTick((n) => n + 1), loadMore };
}

export function App({ api, me, mode, pollIntervalMs, uiLang, timelinePreview }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const t: T = useMemo(() => createT(getLang(uiLang)), [uiLang]);
  const [screen, setScreen] = useState<Screen>({ kind: 'timeline' });
  const [section, setSection] = useState<Section>('home');
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [selected, setSelected] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [compose, setCompose] = useState<{ mode: ComposeMode; parent: Tweet | null } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [quitArmed, setQuitArmed] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchField, setSearchField] = useState(false);
  const [dmInput, setDmInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dmUnread] = useState(0);
  const [width] = useState(100);
  const [spaceIdInput, setSpaceIdInput] = useState('');
  const searchFieldRef = useRef(searchField);
  searchFieldRef.current = searchField;
  const listTopRef = useRef(0); // top y of the scrollable list (measured via rendered header height)

  // ---- mouse support (SGR protocol; Ink has no native mouse API) ----
  useMouse(useCallback((ev) => {
    if (compose || helpOpen) return;
    switch (ev.type) {
      case 'wheel-up':
        setSelected((s) => Math.max(0, s - 1));
        break;
      case 'wheel-down':
        setSelected((s) => Math.min(Math.max(0, itemCountRef.current - 1), s + 1));
        break;
      case 'click': {
        // rows start after sidebar header; approximate row hit by y offset from list top
        const rel = ev.y - listTopRef.current;
        if (rel >= 0) {
          // rows are ~6 lines tall in the list (border+name+text+actions)
          const row = Math.floor(rel / 6);
          if (row < itemCountRef.current) {
            setSelected(row);
          }
        }
        break;
      }
      default:
        break;
    }
  }, [compose, helpOpen]), true);

  const showBanner = useCallback((msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner(null), 4000);
  }, []);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof RpcError) {
      if (e.kind === 'rate_limited') showBanner(t('error.rateLimited', { seconds: Number(e.data['retryAfter'] ?? 0) || '?' }));
      else if (e.kind === 'session_expired') showBanner(t('setup.expired'));
      else if (e.kind === 'not_found') showBanner(t('error.notFound'));
      else if (e.kind === 'forbidden') showBanner(t('error.forbidden'));
      else showBanner(t('error.upstream', { message: e.message }));
    } else {
      showBanner(e instanceof Error ? e.message : String(e));
    }
  }, [showBanner, t]);

  // ---- timeline (home) with polling ----
  const timelineFetcher = useCallback((cursor?: string) => {
    return tab === 'following' ? api.homeLatest(cursor) : api.homeForYou(cursor);
  }, [api, tab]);
  const timeline = useTimeline({ pollIntervalMs, enabled: screen.kind === 'timeline', fetcher: timelineFetcher });
  const visibleTweets = useMemo(
    () => (timeline.newCount > 0 ? timeline.tweets : timeline.tweets),
    [timeline.tweets, timeline.newCount],
  );

  // ---- generic lists ----
  const bookmarks = useList<Tweet>(useCallback((c?: string) => api.bookmarks(c), [api]), [screen.kind]);
  const trends = useList<Trend>(
    // trends is a bare array, wrap into Paged
    useCallback(async (c?: string) => {
      void c;
      const items = await api.trends();
      return { items, nextCursor: null };
    }, [api]),
    [screen.kind],
  );
  const dmList = useList<DmConversation>(useCallback(async (c?: string) => {
    void c;
    const items = await api.dmList();
    return { items, nextCursor: null };
  }, [api]), [screen.kind]);
  const spaces = useList<Space>(useCallback(async (c?: string) => {
    void c;
    const items = await api.spacesList();
    return { items, nextCursor: null };
  }, [api]), [screen.kind]);

  const [searchResults, setSearchResults] = useState<ListState<Tweet>>({ items: [], cursor: null, loading: false, error: null });
  const [profileTweets, setProfileTweets] = useState<ListState<Tweet>>({ items: [], cursor: null, loading: false, error: null });
  const [detailReplies, setDetailReplies] = useState<Tweet[]>([]);
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);

  // search execution
  const runSearch = useCallback(async (q: string, searchMode: 'Top' | 'Latest') => {
    setSearchResults({ items: [], cursor: null, loading: true, error: null });
    setSelected(0);
    try {
      const page = await api.search(q, searchMode);
      setSearchResults({ items: page.items, cursor: page.nextCursor, loading: false, error: null });
    } catch (e) {
      setSearchResults({ items: [], cursor: null, loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [api]);

  // profile load
  const loadProfile = useCallback(async (user: User, profileTab: 'Tweets' | 'TweetsAndReplies' | 'Media' | 'Likes' = 'Tweets') => {
    setProfileTweets({ items: [], cursor: null, loading: true, error: null });
    try {
      const page = await api.userTweets(user.id, profileTab);
      setProfileTweets({ items: page.items, cursor: page.nextCursor, loading: false, error: null });
    } catch (e) {
      setProfileTweets({ items: [], cursor: null, loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [api]);

  // dm chat load
  const loadDmMessages = useCallback(async (userId: string) => {
    try {
      const page = await api.dmMessages(userId);
      setDmMessages(page.items);
    } catch (e) {
      handleError(e);
    }
  }, [api, handleError]);

  useEffect(() => {
    if (screen.kind === 'detail') {
      setDetailReplies(screen.tweet.replies ?? []);
    }
    if (screen.kind === 'profile') {
      void loadProfile(screen.user);
    }
    if (screen.kind === 'dm-chat') {
      void loadDmMessages(screen.user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.kind, (screen as { tweet?: Tweet }).tweet?.id, (screen as { user?: User }).user?.id]);

  // active list helpers
  const activeList: { items: unknown[]; loading: boolean; error: string | null } = useMemo(() => {
    switch (screen.kind) {
      case 'timeline': return { items: visibleTweets, loading: timeline.loading, error: timeline.error ?? timeline.backoffSeconds > 0 ? `backoff ${timeline.backoffSeconds}s` : null };
      case 'search': return searchResults;
      case 'bookmarks': return bookmarks;
      case 'explore': return trends;
      case 'dm-list': return dmList;
      case 'spaces': return spaces;
      case 'profile': return profileTweets;
      default: return { items: [], loading: false, error: null };
    }
  }, [screen.kind, visibleTweets, timeline.loading, timeline.error, timeline.backoffSeconds, searchResults, bookmarks, trends, dmList, spaces, profileTweets]);

  const itemCount = activeList.items.length;
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;

  const move = useCallback((delta: number) => {
    setSelected((s) => Math.max(0, Math.min(itemCount - 1, s + delta)));
  }, [itemCount]);

  const selectedTweet = useCallback((): Tweet | null => {
    const items = activeList.items as Tweet[];
    return items[selected] ?? null;
  }, [activeList, selected]);

  // ---- actions ----
  const doLike = useCallback(async (tweet: Tweet) => {
    try {
      const res = tweet.liked ? await api.unlike(tweet.id) : await api.like(tweet.id);
      timeline.patchTweet(tweet.id, { liked: res.liked, favorite_count: tweet.favorite_count + (res.liked ? 1 : -1) });
    } catch (e) { handleError(e); }
  }, [api, handleError, timeline]);

  const doRetweet = useCallback(async (tweet: Tweet) => {
    try {
      const res = tweet.retweeted ? await api.unretweet(tweet.id) : await api.retweet(tweet.id);
      timeline.patchTweet(tweet.id, { retweeted: res.retweeted, retweet_count: tweet.retweet_count + (res.retweeted ? 1 : -1) });
    } catch (e) { handleError(e); }
  }, [api, handleError, timeline]);

  const doBookmark = useCallback(async (tweet: Tweet) => {
    try {
      const res = tweet.bookmarked ? await api.unbookmark(tweet.id) : await api.bookmark(tweet.id);
      timeline.patchTweet(tweet.id, { bookmarked: res.bookmarked });
    } catch (e) { handleError(e); }
  }, [api, handleError, timeline]);

  const doDelete = useCallback(async (tweetId: string) => {
    try {
      await api.deleteTweet(tweetId);
      timeline.removeTweet(tweetId);
      showBanner('deleted');
    } catch (e) { handleError(e); }
  }, [api, handleError, showBanner, timeline]);

  const openDetail = useCallback(async (tweet: Tweet) => {
    setScreen({ kind: 'detail', tweet });
    setSelected(0);
    try {
      const full = await api.tweetDetail(tweet.id);
      setDetailReplies(full.replies ?? []);
    } catch (e) { handleError(e); }
  }, [api, handleError]);

  const openProfile = useCallback(async (screenName: string) => {
    try {
      const user = await api.userDetail(screenName.replace(/^@/, ''));
      setScreen({ kind: 'profile', user });
      setSelected(0);
    } catch (e) { handleError(e); }
  }, [api, handleError]);

  const openLink = useCallback((tweet: Tweet) => {
    const url = tweet.photo_url ?? tweet.video_url ?? `https://x.com/${tweet.user.screen_name}/status/${tweet.id}`;
    const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  }, []);

  const submitCompose = useCallback(async (text: string, mediaPaths: string[]) => {
    if (!compose) return;
    try {
      const mediaIds: string[] = [];
      for (const p of mediaPaths) {
        const m = await api.mediaUpload(p);
        mediaIds.push(m.media_id);
      }
      const parent = compose.parent;
      const created = await api.createTweet(
        text,
        mediaIds,
        compose.mode === 'reply' && parent ? parent.id : undefined,
      );
      if (compose.mode === 'new') timeline.prependTweet(created);
      setCompose(null);
      showBanner(t('action.send') + ' ✓');
    } catch (e) {
      throw e; // compose modal shows the error
    }
  }, [api, compose, showBanner, t, timeline]);

  // measure list top for mouse row mapping (header is 3 lines, badge/banner add more)
  useEffect(() => {
    listTopRef.current = 3 + (screen.kind === 'timeline' && timeline.newCount > 0 ? 1 : 0) +
      (timeline.backoffSeconds > 0 && screen.kind === 'timeline' ? 1 : 0) + (banner ? 1 : 0) +
      (confirmDelete ? 1 : 0);
  }, [screen.kind, timeline.newCount, timeline.backoffSeconds, banner, confirmDelete]);

  // ---- input handling ----
  useInput((input, key) => {
    if (compose) return; // compose modal handles its own input
    if (helpOpen) {
      if (key.escape || input === '?') setHelpOpen(false);
      return;
    }

    if (confirmDelete) {
      if (input === 'y' || input === 'Y') {
        void doDelete(confirmDelete);
        setConfirmDelete(null);
      } else if (key.escape || key.return || input === 'n') {
        setConfirmDelete(null);
      }
      return;
    }

    if (searchField) {
      if (key.escape) { setSearchField(false); setSearchInput(''); return; }
      if (key.return) {
        if (searchInput.trim()) {
          setScreen({ kind: 'search', query: searchInput, mode: 'Top' });
          void runSearch(searchInput, 'Top');
        }
        setSearchField(false);
        return;
      }
      if (key.backspace || key.delete) setSearchInput((s) => s.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setSearchInput((s) => s + input);
      return;
    }

    if (screen.kind === 'dm-chat') {
      if (key.escape) { setScreen({ kind: 'dm-list' }); return; }
      if (key.return && dmInput.trim()) {
        const userId = screen.user.id;
        void api.dmSend(userId, dmInput)
          .then((sent) => { setDmMessages((prev) => [...prev, sent]); setDmInput(''); })
          .catch(handleError);
        return;
      }
      if (key.backspace || key.delete) setDmInput((s) => s.slice(0, -1));
      else if (input && !key.ctrl) setDmInput((s) => s + input);
      return;
    }

    if (screen.kind === 'explore' && input === 'o') {
      void openProfile(spaceIdInput || 'shin');
      return;
    }

    if (key.ctrl && input === 'c') {
      if (quitArmed) exit();
      else { setQuitArmed(true); setTimeout(() => setQuitArmed(false), 2000); }
      return;
    }

    // global keys
    switch (input) {
      case 'q':
        if (screen.kind !== 'timeline') { setScreen({ kind: 'timeline' }); setSelected(0); }
        else if (quitArmed) exit();
        else { setQuitArmed(true); setTimeout(() => setQuitArmed(false), 2000); showBanner(t('quit.confirm')); }
        return;
      case '?': setHelpOpen(true); return;
      case 'n': setCompose({ mode: 'new', parent: null }); return;
      case '/': setSearchField(true); setSearchInput(''); return;
      case 'r':
        if (screen.kind === 'timeline') void timeline.refresh();
        return;
      case 'x':
        if (screen.kind === 'timeline') timeline.acceptNew();
        return;
      case 'Tab':
        if (screen.kind === 'timeline') setTab((prev) => (prev === 'foryou' ? 'following' : 'foryou'));
        return;
      case '1': setSection('home'); setScreen({ kind: 'timeline' }); return;
      case '2': setSection('explore'); setScreen({ kind: 'explore' }); return;
      case '3': setSection('dm'); setScreen({ kind: 'dm-list' }); return;
      case '4': setSection('bookmarks'); setScreen({ kind: 'bookmarks' }); return;
      case '5': setSection('profile'); setScreen({ kind: 'profile', user: me }); return;
      default: break;
    }

    // navigation keys
    if (key.upArrow || input === 'k') { move(-1); return; }
    if (key.downArrow || input === 'j') {
      move(1);
      // auto load more near bottom
      if (selected >= itemCount - 3) {
        if (screen.kind === 'bookmarks') bookmarks.loadMore();
        if (screen.kind === 'search') void runSearch((screen as { query: string }).query, (screen as { mode: 'Top' | 'Latest' }).mode);
      }
      return;
    }

    if (key.return || input === 'Enter') {
      const tweet = selectedTweet();
      if (tweet && (screen.kind === 'timeline' || screen.kind === 'search' || screen.kind === 'bookmarks' || screen.kind === 'profile')) {
        void openDetail(tweet);
      } else if (screen.kind === 'dm-list') {
        const conv = (dmList.items as DmConversation[])[selected];
        if (conv) setScreen({ kind: 'dm-chat', user: conv.user });
      } else if (screen.kind === 'explore') {
        const trend = (trends.items as Trend[])[selected];
        if (trend) {
          setScreen({ kind: 'search', query: trend.name, mode: 'Top' });
          void runSearch(trend.name, 'Top');
        }
      }
      return;
    }

    // tweet actions
    const tweet = selectedTweet();
    if (!tweet) return;
    switch (input) {
      case 'l': void doLike(tweet); return;
      case 't': void doRetweet(tweet); return;
      case 'b': void doBookmark(tweet); return;
      case 'r': {
        setCompose({ mode: 'reply', parent: tweet });
        return;
      }
      case 'Q': setCompose({ mode: 'quote', parent: tweet }); return;
      case 'd':
        if (tweet.user.id === me.id) setConfirmDelete(tweet.id);
        return;
      case 'o': openLink(tweet); return;
      case 'u': void openProfile(tweet.user.screen_name); return;
      default: return;
    }
  });

  // ---- rendering ----
  const centerWidth = width - 22 - 24;
  const showRight = width >= 100;

  const renderHeader = (): React.ReactElement => {
    const titles: Record<string, string> = {
      timeline: t('nav.home'),
      search: `${t('search.placeholder')} ${(screen as { query?: string }).query ?? ''}`,
      explore: t('nav.explore'),
      detail: screen.kind === 'detail' ? `@${screen.tweet.user.screen_name}` : '',
      profile: screen.kind === 'profile' ? `@${screen.user.screen_name}` : '',
      bookmarks: t('nav.bookmarks'),
      'dm-list': t('dm.title'),
      'dm-chat': screen.kind === 'dm-chat' ? `@${screen.user.screen_name}` : '',
      spaces: t('spaces.title'),
    };
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold>{titles[screen.kind] ?? ''}</Text>
        {screen.kind === 'timeline' && (
          <Box marginLeft={2} gap={1}>
            <Text color={tab === 'foryou' ? 'cyan' : 'gray'} bold={tab === 'foryou'}>{t('tab.foryou')}</Text>
            <Text color={tab === 'following' ? 'cyan' : 'gray'} bold={tab === 'following'}>{t('tab.following')}</Text>
          </Box>
        )}
        {screen.kind === 'search' && (
          <Box marginLeft={2} gap={1}>
            <Text color={screen.mode === 'Top' ? 'cyan' : 'gray'}>{t('tab.top')}</Text>
            <Text color={screen.mode === 'Latest' ? 'cyan' : 'gray'}>{t('tab.latest')}</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderList = (): React.ReactElement[] => {
    if (screen.kind === 'timeline') {
      return visibleTweets.map((tweet, i) => (
        <TweetRow key={`tl-${tweet.id}`} tweet={tweet} selected={i === selected} t={t} width={centerWidth} fake={mode === 'fake'} />
      ));
    }
    if (screen.kind === 'detail') {
      const tweet = (screen as { tweet: Tweet }).tweet;
      const rows: React.ReactElement[] = [<TweetRow key="main" tweet={tweet} selected={false} t={t} width={centerWidth} />];
      rows.push(<Text key="replies-h" dimColor>— {t('action.reply')} —</Text>);
      rows.push(...detailReplies.map((r, i) => <TweetRow key={r.id} tweet={r} selected={i === selected} t={t} width={centerWidth} />));
      return rows;
    }
    if (screen.kind === 'dm-list') {
      return (dmList.items as DmConversation[]).map((conv, i) => (
        <Box key={conv.user.id} paddingLeft={i === selected ? 1 : 2} borderStyle={i === selected ? 'round' : undefined}>
          <Text bold>@{conv.user.screen_name}</Text>
          <Text dimColor> {conv.last_message.slice(0, 40)}</Text>
        </Box>
      ));
    }
    if (screen.kind === 'dm-chat') {
      const rows: React.ReactElement[] = dmMessages.map((m) => (
        <Box key={m.id} justifyContent={m.user.id === me.id ? 'flex-end' : 'flex-start'}>
          <Text color={m.user.id === me.id ? 'cyan' : 'white'}>{m.user.id === me.id ? m.text : `@${m.user.screen_name}: ${m.text}`}</Text>
        </Box>
      ));
      rows.push(
        <Box key="input" borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text dimColor>{t('dm.inputPlaceholder')} </Text>
          <Text>{dmInput}</Text>
          <Text inverse> </Text>
        </Box>,
      );
      return rows;
    }
    if (screen.kind === 'explore') {
      return (trends.items as Trend[]).map((tr, i) => (
        <Box key={tr.name} paddingLeft={i === selected ? 1 : 2} borderStyle={i === selected ? 'round' : undefined}>
          <Text bold>{i + 1}. {tr.name}</Text>
          <Text dimColor> {formatCount(tr.tweet_count)} tweets</Text>
        </Box>
      ));
    }
    if (screen.kind === 'spaces') {
      return (spaces.items as Space[]).map((sp, i) => (
        <Box key={sp.id} paddingLeft={i === selected ? 1 : 2} borderStyle={i === selected ? 'round' : undefined}>
          <Text bold>{sp.title}</Text>
          <Text color={sp.state === 'live' ? 'red' : 'gray'}> ● {sp.state}</Text>
          <Text dimColor> 👥 {sp.listener_count}</Text>
        </Box>
      ));
    }
    const items = activeList.items as Tweet[];
    const rows = items.map((tweet, i) => (
      <TweetRow key={`${screen.kind}-${tweet.id}`} tweet={tweet} selected={i === selected} t={t} width={centerWidth} fake={mode === 'fake'} />
    ));
    if (activeList.error) rows.push(<Text key="err" color="red">{activeList.error}</Text>);
    else if (activeList.loading && items.length === 0) rows.push(<Text key="load" dimColor>…</Text>);
    else if (items.length === 0) rows.push(<Text key="empty" dimColor>{t('error.tweetEmpty')}</Text>);
    return rows;
  };

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Sidebar active={section} me={me} t={t} dmUnread={dmUnread} collapsed={false} />
        <Box flexDirection="column" width={centerWidth}>
          {renderHeader()}
          {screen.kind === 'timeline' && timeline.newCount > 0 && (
            <Box>
              <Text color="cyan" bold> ↑ {t('newTweets', { count: timeline.newCount })}</Text>
            </Box>
          )}
          {timeline.backoffSeconds > 0 && screen.kind === 'timeline' && (
            <Box>
              <Text color="yellow">{t('error.rateLimited', { seconds: timeline.backoffSeconds })}</Text>
            </Box>
          )}
          {banner && (
            <Box>
              <Text color="yellow">⚠ {banner}</Text>
            </Box>
          )}
          {confirmDelete && (
            <Box>
              <Text color="red">{t('error.deleteConfirm')}</Text>
            </Box>
          )}
          <Box flexDirection="column">{renderList()}</Box>
        </Box>
        {showRight && (
          <Box flexDirection="column" width={24}>
            <Box borderStyle="single" borderColor="gray" paddingX={1}>
              {searchField ? (
                <>
                  <Text color="cyan">🔍 </Text>
                  <Text>{searchInput}</Text>
                  <Text inverse> </Text>
                </>
              ) : (
                <Text dimColor>🔍 {t('search.placeholder')} ( / )</Text>
              )}
            </Box>
            <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
              <Text bold>{t('trends.title')}</Text>
              {(trends.items as Trend[]).slice(0, 6).map((tr, i) => (
                <Text key={tr.name} dimColor={i !== selected}>{i + 1}. {tr.name}</Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
      {compose && (
        <ComposeModal
          mode={compose.mode}
          parent={compose.parent}
          t={t}
          onClose={() => setCompose(null)}
          onSubmit={submitCompose}
        />
      )}
      {helpOpen && <HelpOverlay t={t} onClose={() => setHelpOpen(false)} />}
      {screen.kind === 'timeline' && timelinePreview && visibleTweets[selected]?.photo_url && (
        <MediaView url={visibleTweets[selected]!.photo_url!} maxCols={40} maxRows={12} t={t} />
      )}
    </Box>
  );
}

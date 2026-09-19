import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { spawn } from 'node:child_process';
import { Box, Text, useInput, useApp } from 'ink';
import { RpcError } from "../types.js";
import { createT, getLang } from "../i18n.js";
import { useTimeline } from "./hooks/useTimeline.js";
import { TweetRow, formatCount } from "./components/Tweet.js";
import { Sidebar } from "./components/Sidebar.js";
import { ComposeModal } from "./components/ComposeModal.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import { MediaView } from "./components/MediaView.js";
import { useMouse } from "./hooks/useMouse.js";
function useList(fetcher, deps) {
    const [state, setState] = useState({ items: [], cursor: null, loading: true, error: null });
    const [tick, setTick] = useState(0);
    const cursorRef = useRef(null);
    useEffect(() => {
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));
        void fetcher(undefined)
            .then((page) => {
            if (cancelled)
                return;
            cursorRef.current = page.nextCursor;
            setState({ items: page.items, cursor: page.nextCursor, loading: false, error: null });
        })
            .catch((e) => {
            if (cancelled)
                return;
            setState({ items: [], cursor: null, loading: false, error: e instanceof Error ? e.message : String(e) });
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick]);
    const loadMore = useCallback(() => {
        if (!cursorRef.current || state.loading)
            return;
        setState((s) => ({ ...s, loading: true }));
        void fetcher(cursorRef.current ?? undefined)
            .then((page) => {
            cursorRef.current = page.nextCursor;
            setState((s) => ({ items: [...s.items, ...page.items], cursor: page.nextCursor, loading: false, error: null }));
        })
            .catch((e) => {
            setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
        });
    }, [fetcher, state.loading]);
    return { ...state, reload: () => setTick((n) => n + 1), loadMore };
}
export function App({ api, me, mode, pollIntervalMs, uiLang, timelinePreview }) {
    const { exit } = useApp();
    const t = useMemo(() => createT(getLang(uiLang)), [uiLang]);
    const [screen, setScreen] = useState({ kind: 'timeline' });
    const [section, setSection] = useState('home');
    const [tab, setTab] = useState('foryou');
    const [selected, setSelected] = useState(0);
    const [helpOpen, setHelpOpen] = useState(false);
    const [compose, setCompose] = useState(null);
    const [banner, setBanner] = useState(null);
    const [quitArmed, setQuitArmed] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [searchField, setSearchField] = useState(false);
    const [dmInput, setDmInput] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [dmUnread] = useState(0);
    const [width] = useState(100);
    const [spaceIdInput, setSpaceIdInput] = useState('');
    const searchFieldRef = useRef(searchField);
    searchFieldRef.current = searchField;
    const listTopRef = useRef(0); // top y of the scrollable list (measured via rendered header height)
    // ---- mouse support (SGR protocol; Ink has no native mouse API) ----
    useMouse(useCallback((ev) => {
        if (compose || helpOpen)
            return;
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
    const showBanner = useCallback((msg) => {
        setBanner(msg);
        setTimeout(() => setBanner(null), 4000);
    }, []);
    const handleError = useCallback((e) => {
        if (e instanceof RpcError) {
            if (e.kind === 'rate_limited')
                showBanner(t('error.rateLimited', { seconds: Number(e.data['retryAfter'] ?? 0) || '?' }));
            else if (e.kind === 'session_expired')
                showBanner(t('setup.expired'));
            else if (e.kind === 'not_found')
                showBanner(t('error.notFound'));
            else if (e.kind === 'forbidden')
                showBanner(t('error.forbidden'));
            else
                showBanner(t('error.upstream', { message: e.message }));
        }
        else {
            showBanner(e instanceof Error ? e.message : String(e));
        }
    }, [showBanner, t]);
    // ---- timeline (home) with polling ----
    const timelineFetcher = useCallback((cursor) => {
        return tab === 'following' ? api.homeLatest(cursor) : api.homeForYou(cursor);
    }, [api, tab]);
    const timeline = useTimeline({ pollIntervalMs, enabled: screen.kind === 'timeline', fetcher: timelineFetcher });
    const visibleTweets = useMemo(() => (timeline.newCount > 0 ? timeline.tweets : timeline.tweets), [timeline.tweets, timeline.newCount]);
    // ---- generic lists ----
    const bookmarks = useList(useCallback((c) => api.bookmarks(c), [api]), [screen.kind]);
    const trends = useList(
    // trends is a bare array, wrap into Paged
    useCallback(async (c) => {
        void c;
        const items = await api.trends();
        return { items, nextCursor: null };
    }, [api]), [screen.kind]);
    const dmList = useList(useCallback(async (c) => {
        void c;
        const items = await api.dmList();
        return { items, nextCursor: null };
    }, [api]), [screen.kind]);
    const spaces = useList(useCallback(async (c) => {
        void c;
        const items = await api.spacesList();
        return { items, nextCursor: null };
    }, [api]), [screen.kind]);
    const [searchResults, setSearchResults] = useState({ items: [], cursor: null, loading: false, error: null });
    const [profileTweets, setProfileTweets] = useState({ items: [], cursor: null, loading: false, error: null });
    const [detailReplies, setDetailReplies] = useState([]);
    const [dmMessages, setDmMessages] = useState([]);
    // search execution
    const runSearch = useCallback(async (q, searchMode) => {
        setSearchResults({ items: [], cursor: null, loading: true, error: null });
        setSelected(0);
        try {
            const page = await api.search(q, searchMode);
            setSearchResults({ items: page.items, cursor: page.nextCursor, loading: false, error: null });
        }
        catch (e) {
            setSearchResults({ items: [], cursor: null, loading: false, error: e instanceof Error ? e.message : String(e) });
        }
    }, [api]);
    // profile load
    const loadProfile = useCallback(async (user, profileTab = 'Tweets') => {
        setProfileTweets({ items: [], cursor: null, loading: true, error: null });
        try {
            const page = await api.userTweets(user.id, profileTab);
            setProfileTweets({ items: page.items, cursor: page.nextCursor, loading: false, error: null });
        }
        catch (e) {
            setProfileTweets({ items: [], cursor: null, loading: false, error: e instanceof Error ? e.message : String(e) });
        }
    }, [api]);
    // dm chat load
    const loadDmMessages = useCallback(async (userId) => {
        try {
            const page = await api.dmMessages(userId);
            setDmMessages(page.items);
        }
        catch (e) {
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
    }, [screen.kind, screen.tweet?.id, screen.user?.id]);
    // active list helpers
    const activeList = useMemo(() => {
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
    const move = useCallback((delta) => {
        setSelected((s) => Math.max(0, Math.min(itemCount - 1, s + delta)));
    }, [itemCount]);
    const selectedTweet = useCallback(() => {
        const items = activeList.items;
        return items[selected] ?? null;
    }, [activeList, selected]);
    // ---- actions ----
    const doLike = useCallback(async (tweet) => {
        try {
            const res = tweet.liked ? await api.unlike(tweet.id) : await api.like(tweet.id);
            timeline.patchTweet(tweet.id, { liked: res.liked, favorite_count: tweet.favorite_count + (res.liked ? 1 : -1) });
        }
        catch (e) {
            handleError(e);
        }
    }, [api, handleError, timeline]);
    const doRetweet = useCallback(async (tweet) => {
        try {
            const res = tweet.retweeted ? await api.unretweet(tweet.id) : await api.retweet(tweet.id);
            timeline.patchTweet(tweet.id, { retweeted: res.retweeted, retweet_count: tweet.retweet_count + (res.retweeted ? 1 : -1) });
        }
        catch (e) {
            handleError(e);
        }
    }, [api, handleError, timeline]);
    const doBookmark = useCallback(async (tweet) => {
        try {
            const res = tweet.bookmarked ? await api.unbookmark(tweet.id) : await api.bookmark(tweet.id);
            timeline.patchTweet(tweet.id, { bookmarked: res.bookmarked });
        }
        catch (e) {
            handleError(e);
        }
    }, [api, handleError, timeline]);
    const doDelete = useCallback(async (tweetId) => {
        try {
            await api.deleteTweet(tweetId);
            timeline.removeTweet(tweetId);
            showBanner('deleted');
        }
        catch (e) {
            handleError(e);
        }
    }, [api, handleError, showBanner, timeline]);
    const openDetail = useCallback(async (tweet) => {
        setScreen({ kind: 'detail', tweet });
        setSelected(0);
        try {
            const full = await api.tweetDetail(tweet.id);
            setDetailReplies(full.replies ?? []);
        }
        catch (e) {
            handleError(e);
        }
    }, [api, handleError]);
    const openProfile = useCallback(async (screenName) => {
        try {
            const user = await api.userDetail(screenName.replace(/^@/, ''));
            setScreen({ kind: 'profile', user });
            setSelected(0);
        }
        catch (e) {
            handleError(e);
        }
    }, [api, handleError]);
    const openLink = useCallback((tweet) => {
        const url = tweet.photo_url ?? tweet.video_url ?? `https://x.com/${tweet.user.screen_name}/status/${tweet.id}`;
        const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
        spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
    }, []);
    const submitCompose = useCallback(async (text, mediaPaths) => {
        if (!compose)
            return;
        try {
            const mediaIds = [];
            for (const p of mediaPaths) {
                const m = await api.mediaUpload(p);
                mediaIds.push(m.media_id);
            }
            const parent = compose.parent;
            const created = await api.createTweet(text, mediaIds, compose.mode === 'reply' && parent ? parent.id : undefined);
            if (compose.mode === 'new')
                timeline.prependTweet(created);
            setCompose(null);
            showBanner(t('action.send') + ' ✓');
        }
        catch (e) {
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
        if (compose)
            return; // compose modal handles its own input
        if (helpOpen) {
            if (key.escape || input === '?')
                setHelpOpen(false);
            return;
        }
        if (confirmDelete) {
            if (input === 'y' || input === 'Y') {
                void doDelete(confirmDelete);
                setConfirmDelete(null);
            }
            else if (key.escape || key.return || input === 'n') {
                setConfirmDelete(null);
            }
            return;
        }
        if (searchField) {
            if (key.escape) {
                setSearchField(false);
                setSearchInput('');
                return;
            }
            if (key.return) {
                if (searchInput.trim()) {
                    setScreen({ kind: 'search', query: searchInput, mode: 'Top' });
                    void runSearch(searchInput, 'Top');
                }
                setSearchField(false);
                return;
            }
            if (key.backspace || key.delete)
                setSearchInput((s) => s.slice(0, -1));
            else if (input && !key.ctrl && !key.meta)
                setSearchInput((s) => s + input);
            return;
        }
        if (screen.kind === 'dm-chat') {
            if (key.escape) {
                setScreen({ kind: 'dm-list' });
                return;
            }
            if (key.return && dmInput.trim()) {
                const userId = screen.user.id;
                void api.dmSend(userId, dmInput)
                    .then((sent) => { setDmMessages((prev) => [...prev, sent]); setDmInput(''); })
                    .catch(handleError);
                return;
            }
            if (key.backspace || key.delete)
                setDmInput((s) => s.slice(0, -1));
            else if (input && !key.ctrl)
                setDmInput((s) => s + input);
            return;
        }
        if (screen.kind === 'explore' && input === 'o') {
            void openProfile(spaceIdInput || 'shin');
            return;
        }
        if (key.ctrl && input === 'c') {
            if (quitArmed)
                exit();
            else {
                setQuitArmed(true);
                setTimeout(() => setQuitArmed(false), 2000);
            }
            return;
        }
        // global keys
        switch (input) {
            case 'q':
                if (screen.kind !== 'timeline') {
                    setScreen({ kind: 'timeline' });
                    setSelected(0);
                }
                else if (quitArmed)
                    exit();
                else {
                    setQuitArmed(true);
                    setTimeout(() => setQuitArmed(false), 2000);
                    showBanner(t('quit.confirm'));
                }
                return;
            case '?':
                setHelpOpen(true);
                return;
            case 'n':
                setCompose({ mode: 'new', parent: null });
                return;
            case '/':
                setSearchField(true);
                setSearchInput('');
                return;
            case 'r':
                if (screen.kind === 'timeline')
                    void timeline.refresh();
                return;
            case 'x':
                if (screen.kind === 'timeline')
                    timeline.acceptNew();
                return;
            case 'Tab':
                if (screen.kind === 'timeline')
                    setTab((prev) => (prev === 'foryou' ? 'following' : 'foryou'));
                return;
            case '1':
                setSection('home');
                setScreen({ kind: 'timeline' });
                return;
            case '2':
                setSection('explore');
                setScreen({ kind: 'explore' });
                return;
            case '3':
                setSection('dm');
                setScreen({ kind: 'dm-list' });
                return;
            case '4':
                setSection('bookmarks');
                setScreen({ kind: 'bookmarks' });
                return;
            case '5':
                setSection('profile');
                setScreen({ kind: 'profile', user: me });
                return;
            default: break;
        }
        // navigation keys
        if (key.upArrow || input === 'k') {
            move(-1);
            return;
        }
        if (key.downArrow || input === 'j') {
            move(1);
            // auto load more near bottom
            if (selected >= itemCount - 3) {
                if (screen.kind === 'bookmarks')
                    bookmarks.loadMore();
                if (screen.kind === 'search')
                    void runSearch(screen.query, screen.mode);
            }
            return;
        }
        if (key.return || input === 'Enter') {
            const tweet = selectedTweet();
            if (tweet && (screen.kind === 'timeline' || screen.kind === 'search' || screen.kind === 'bookmarks' || screen.kind === 'profile')) {
                void openDetail(tweet);
            }
            else if (screen.kind === 'dm-list') {
                const conv = dmList.items[selected];
                if (conv)
                    setScreen({ kind: 'dm-chat', user: conv.user });
            }
            else if (screen.kind === 'explore') {
                const trend = trends.items[selected];
                if (trend) {
                    setScreen({ kind: 'search', query: trend.name, mode: 'Top' });
                    void runSearch(trend.name, 'Top');
                }
            }
            return;
        }
        // tweet actions
        const tweet = selectedTweet();
        if (!tweet)
            return;
        switch (input) {
            case 'l':
                void doLike(tweet);
                return;
            case 't':
                void doRetweet(tweet);
                return;
            case 'b':
                void doBookmark(tweet);
                return;
            case 'r': {
                setCompose({ mode: 'reply', parent: tweet });
                return;
            }
            case 'Q':
                setCompose({ mode: 'quote', parent: tweet });
                return;
            case 'd':
                if (tweet.user.id === me.id)
                    setConfirmDelete(tweet.id);
                return;
            case 'o':
                openLink(tweet);
                return;
            case 'u':
                void openProfile(tweet.user.screen_name);
                return;
            default: return;
        }
    });
    // ---- rendering ----
    const centerWidth = width - 22 - 24;
    const showRight = width >= 100;
    const renderHeader = () => {
        const titles = {
            timeline: t('nav.home'),
            search: `${t('search.placeholder')} ${screen.query ?? ''}`,
            explore: t('nav.explore'),
            detail: screen.kind === 'detail' ? `@${screen.tweet.user.screen_name}` : '',
            profile: screen.kind === 'profile' ? `@${screen.user.screen_name}` : '',
            bookmarks: t('nav.bookmarks'),
            'dm-list': t('dm.title'),
            'dm-chat': screen.kind === 'dm-chat' ? `@${screen.user.screen_name}` : '',
            spaces: t('spaces.title'),
        };
        return (_jsxs(Box, { borderStyle: "single", borderColor: "gray", paddingX: 1, children: [_jsx(Text, { bold: true, children: titles[screen.kind] ?? '' }), screen.kind === 'timeline' && (_jsxs(Box, { marginLeft: 2, gap: 1, children: [_jsx(Text, { color: tab === 'foryou' ? 'cyan' : 'gray', bold: tab === 'foryou', children: t('tab.foryou') }), _jsx(Text, { color: tab === 'following' ? 'cyan' : 'gray', bold: tab === 'following', children: t('tab.following') })] })), screen.kind === 'search' && (_jsxs(Box, { marginLeft: 2, gap: 1, children: [_jsx(Text, { color: screen.mode === 'Top' ? 'cyan' : 'gray', children: t('tab.top') }), _jsx(Text, { color: screen.mode === 'Latest' ? 'cyan' : 'gray', children: t('tab.latest') })] }))] }));
    };
    const renderList = () => {
        if (screen.kind === 'timeline') {
            return visibleTweets.map((tweet, i) => (_jsx(TweetRow, { tweet: tweet, selected: i === selected, t: t, width: centerWidth, fake: mode === 'fake' }, `tl-${tweet.id}`)));
        }
        if (screen.kind === 'detail') {
            const tweet = screen.tweet;
            const rows = [_jsx(TweetRow, { tweet: tweet, selected: false, t: t, width: centerWidth }, "main")];
            rows.push(_jsxs(Text, { dimColor: true, children: ["\u2014 ", t('action.reply'), " \u2014"] }, "replies-h"));
            rows.push(...detailReplies.map((r, i) => _jsx(TweetRow, { tweet: r, selected: i === selected, t: t, width: centerWidth }, r.id)));
            return rows;
        }
        if (screen.kind === 'dm-list') {
            return dmList.items.map((conv, i) => (_jsxs(Box, { paddingLeft: i === selected ? 1 : 2, borderStyle: i === selected ? 'round' : undefined, children: [_jsxs(Text, { bold: true, children: ["@", conv.user.screen_name] }), _jsxs(Text, { dimColor: true, children: [" ", conv.last_message.slice(0, 40)] })] }, conv.user.id)));
        }
        if (screen.kind === 'dm-chat') {
            const rows = dmMessages.map((m) => (_jsx(Box, { justifyContent: m.user.id === me.id ? 'flex-end' : 'flex-start', children: _jsx(Text, { color: m.user.id === me.id ? 'cyan' : 'white', children: m.user.id === me.id ? m.text : `@${m.user.screen_name}: ${m.text}` }) }, m.id)));
            rows.push(_jsxs(Box, { borderStyle: "single", borderColor: "cyan", paddingX: 1, children: [_jsxs(Text, { dimColor: true, children: [t('dm.inputPlaceholder'), " "] }), _jsx(Text, { children: dmInput }), _jsx(Text, { inverse: true, children: " " })] }, "input"));
            return rows;
        }
        if (screen.kind === 'explore') {
            return trends.items.map((tr, i) => (_jsxs(Box, { paddingLeft: i === selected ? 1 : 2, borderStyle: i === selected ? 'round' : undefined, children: [_jsxs(Text, { bold: true, children: [i + 1, ". ", tr.name] }), _jsxs(Text, { dimColor: true, children: [" ", formatCount(tr.tweet_count), " tweets"] })] }, tr.name)));
        }
        if (screen.kind === 'spaces') {
            return spaces.items.map((sp, i) => (_jsxs(Box, { paddingLeft: i === selected ? 1 : 2, borderStyle: i === selected ? 'round' : undefined, children: [_jsx(Text, { bold: true, children: sp.title }), _jsxs(Text, { color: sp.state === 'live' ? 'red' : 'gray', children: [" \u25CF ", sp.state] }), _jsxs(Text, { dimColor: true, children: [" \uD83D\uDC65 ", sp.listener_count] })] }, sp.id)));
        }
        const items = activeList.items;
        const rows = items.map((tweet, i) => (_jsx(TweetRow, { tweet: tweet, selected: i === selected, t: t, width: centerWidth, fake: mode === 'fake' }, `${screen.kind}-${tweet.id}`)));
        if (activeList.error)
            rows.push(_jsx(Text, { color: "red", children: activeList.error }, "err"));
        else if (activeList.loading && items.length === 0)
            rows.push(_jsx(Text, { dimColor: true, children: "\u2026" }, "load"));
        else if (items.length === 0)
            rows.push(_jsx(Text, { dimColor: true, children: t('error.tweetEmpty') }, "empty"));
        return rows;
    };
    return (_jsxs(Box, { flexDirection: "column", width: width, children: [_jsxs(Box, { children: [_jsx(Sidebar, { active: section, me: me, t: t, dmUnread: dmUnread, collapsed: false }), _jsxs(Box, { flexDirection: "column", width: centerWidth, children: [renderHeader(), screen.kind === 'timeline' && timeline.newCount > 0 && (_jsx(Box, { children: _jsxs(Text, { color: "cyan", bold: true, children: [" \u2191 ", t('newTweets', { count: timeline.newCount })] }) })), timeline.backoffSeconds > 0 && screen.kind === 'timeline' && (_jsx(Box, { children: _jsx(Text, { color: "yellow", children: t('error.rateLimited', { seconds: timeline.backoffSeconds }) }) })), banner && (_jsx(Box, { children: _jsxs(Text, { color: "yellow", children: ["\u26A0 ", banner] }) })), confirmDelete && (_jsx(Box, { children: _jsx(Text, { color: "red", children: t('error.deleteConfirm') }) })), _jsx(Box, { flexDirection: "column", children: renderList() })] }), showRight && (_jsxs(Box, { flexDirection: "column", width: 24, children: [_jsx(Box, { borderStyle: "single", borderColor: "gray", paddingX: 1, children: searchField ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: "cyan", children: "\uD83D\uDD0D " }), _jsx(Text, { children: searchInput }), _jsx(Text, { inverse: true, children: " " })] })) : (_jsxs(Text, { dimColor: true, children: ["\uD83D\uDD0D ", t('search.placeholder'), " ( / )"] })) }), _jsxs(Box, { borderStyle: "single", borderColor: "gray", paddingX: 1, flexDirection: "column", children: [_jsx(Text, { bold: true, children: t('trends.title') }), trends.items.slice(0, 6).map((tr, i) => (_jsxs(Text, { dimColor: i !== selected, children: [i + 1, ". ", tr.name] }, tr.name)))] })] }))] }), compose && (_jsx(ComposeModal, { mode: compose.mode, parent: compose.parent, t: t, onClose: () => setCompose(null), onSubmit: submitCompose })), helpOpen && _jsx(HelpOverlay, { t: t, onClose: () => setHelpOpen(false) }), screen.kind === 'timeline' && timelinePreview && visibleTweets[selected]?.photo_url && (_jsx(MediaView, { url: visibleTweets[selected].photo_url, maxCols: 40, maxRows: 12, t: t }))] }));
}

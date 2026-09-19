import { useCallback, useEffect, useRef, useState } from 'react';
import { RpcError } from "../../types.js";
const MANUAL_REFRESH_COOLDOWN_MS = 5000;
/**
 * Timeline state machine per spec §16:
 * idle -> poll (interval) -> success: back to interval / failure: backoff x2 (cap 600s).
 * New items are held behind a "N new" badge (x.com style), scroll position preserved.
 */
export function useTimeline({ pollIntervalMs, enabled, fetcher }) {
    const [tweets, setTweets] = useState([]);
    const [pending, setPending] = useState([]);
    const [newCount, setNewCount] = useState(0);
    const [backoffSeconds, setBackoffSeconds] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const cursorRef = useRef(null);
    const knownIdsRef = useRef(new Set());
    const backoffRef = useRef(pollIntervalMs);
    const lastManualRef = useRef(0);
    const tweetMapRef = useRef(new Map());
    const loadedOnceRef = useRef(false);
    const acceptNew = useCallback(() => {
        setTweets((prev) => {
            const fresh = pending.filter((t) => !knownIdsRef.current.has(t.id));
            return [...fresh, ...prev];
        });
        for (const t of pending) {
            knownIdsRef.current.add(t.id);
            tweetMapRef.current.set(t.id, t);
        }
        setPending([]);
        setNewCount(0);
    }, [pending]);
    const fetchPage = useCallback(async (cursor) => {
        const page = await fetcher(cursor);
        return page;
    }, [fetcher]);
    const refresh = useCallback(async (opts) => {
        const now = Date.now();
        if (!opts?.jumpToNew && now - lastManualRef.current < MANUAL_REFRESH_COOLDOWN_MS)
            return;
        lastManualRef.current = now;
        setLoading(true);
        setError(null);
        try {
            const page = await fetchPage(undefined);
            const fresh = [];
            for (const t of page.items) {
                if (!knownIdsRef.current.has(t.id))
                    fresh.push(t);
                knownIdsRef.current.add(t.id);
                tweetMapRef.current.set(t.id, t);
            }
            cursorRef.current = page.nextCursor;
            setPending((prevPending) => {
                const all = [...fresh, ...prevPending];
                // First successful load: show tweets immediately (nothing is "new"
                // yet — x.com shows content on open, badge only for later arrivals).
                if (!loadedOnceRef.current) {
                    loadedOnceRef.current = true;
                    setTweets(all);
                    setPending([]);
                    setNewCount(0);
                    return prevPending;
                }
                setNewCount(all.length);
                return all;
            });
            backoffRef.current = pollIntervalMs;
            setBackoffSeconds(0);
            if (opts?.jumpToNew) {
                setTweets((prev) => {
                    const seen = new Set();
                    const merged = [...page.items, ...prev].filter((t) => {
                        if (seen.has(t.id))
                            return false;
                        seen.add(t.id);
                        return true;
                    });
                    return merged;
                });
                setPending([]);
                setNewCount(0);
            }
        }
        catch (e) {
            if (e instanceof RpcError && e.kind === 'rate_limited') {
                backoffRef.current = Math.min(600_000, backoffRef.current * 2);
                setBackoffSeconds(Math.round(backoffRef.current / 1000));
            }
            else {
                setError(e instanceof Error ? e.message : String(e));
                backoffRef.current = Math.min(600_000, backoffRef.current * 2);
                setBackoffSeconds(Math.round(backoffRef.current / 1000));
            }
        }
        finally {
            setLoading(false);
        }
    }, [fetchPage, pollIntervalMs]);
    const loadMore = useCallback(async () => {
        if (!cursorRef.current || loading)
            return;
        setLoading(true);
        try {
            const page = await fetchPage(cursorRef.current ?? undefined);
            for (const t of page.items) {
                knownIdsRef.current.add(t.id);
                tweetMapRef.current.set(t.id, t);
            }
            cursorRef.current = page.nextCursor;
            setTweets((prev) => [...prev, ...page.items]);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setLoading(false);
        }
    }, [fetchPage, loading]);
    // polling loop with backoff
    useEffect(() => {
        if (!enabled)
            return;
        let cancelled = false;
        let timer;
        const tick = async () => {
            if (!cancelled) {
                await refresh();
                timer = setTimeout(tick, backoffRef.current);
            }
        };
        timer = setTimeout(tick, 500); // initial load shortly after mount
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [enabled, refresh]);
    const patchTweet = useCallback((id, patch) => {
        setTweets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
        setPending((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    }, []);
    const removeTweet = useCallback((id) => {
        setTweets((prev) => prev.filter((t) => t.id !== id));
        setPending((prev) => prev.filter((t) => t.id !== id));
    }, []);
    const prependTweet = useCallback((tweet) => {
        knownIdsRef.current.add(tweet.id);
        tweetMapRef.current.set(tweet.id, tweet);
        setTweets((prev) => [tweet, ...prev]);
    }, []);
    return {
        tweets,
        newCount,
        backoffSeconds,
        loading,
        error,
        refresh,
        loadMore,
        acceptNew,
        patchTweet,
        removeTweet,
        prependTweet,
    };
}

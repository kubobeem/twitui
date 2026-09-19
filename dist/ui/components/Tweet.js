import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { Box, Text } from 'ink';
export function formatRelativeTime(ts, createdAt, t) {
    if (ts) {
        const d = Math.max(0, Date.now() - ts * 1000);
        if (d < 60_000)
            return `${Math.floor(d / 1000)}s`;
        if (d < 3_600_000)
            return `${Math.floor(d / 60_000)}m`;
        if (d < 86_400_000)
            return `${Math.floor(d / 3_600_000)}h`;
        return `${Math.floor(d / 86_400_000)}d`;
    }
    void t;
    return createdAt ?? '';
}
export function formatCount(n) {
    if (n >= 10_000)
        return `${(n / 1000).toFixed(1)}万`;
    if (n >= 1000)
        return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}
export const TweetRow = React.memo(function TweetRow({ tweet, selected, t, width, fake }) {
    const inner = Math.max(20, width - 4);
    const nameColor = tweet.user.verified ? 'green' : 'white';
    const time = formatRelativeTime(tweet.created_ts, tweet.created_at, t);
    return (_jsxs(Box, { borderStyle: selected ? 'round' : undefined, borderColor: "cyan", paddingLeft: selected ? 1 : 2, flexDirection: "column", children: [_jsxs(Box, { children: [_jsx(Text, { color: nameColor, bold: true, children: tweet.user.name }), _jsxs(Text, { dimColor: true, children: [" @", tweet.user.screen_name] }), tweet.user.verified && _jsx(Text, { color: "cyan", children: " \u2714" }), fake && _jsxs(Text, { color: "magenta", children: [" [", t('fakeBadge'), "]"] }), _jsxs(Text, { dimColor: true, children: [" \u00B7 ", time] })] }), _jsx(Text, { wrap: "truncate-end", children: tweet.text.slice(0, inner * 6) }), tweet.photo_url && _jsxs(Text, { dimColor: true, children: ["\uD83D\uDDBC ", tweet.photo_url] }), tweet.video_url && _jsxs(Text, { dimColor: true, children: ["\uD83C\uDFAC ", tweet.video_url] }), tweet.quoted_tweet && (_jsx(Box, { borderStyle: "single", borderColor: "gray", paddingLeft: 1, marginTop: 0, children: _jsxs(Text, { dimColor: true, children: ["\u2198 ", tweet.quoted_tweet.user.screen_name, ": ", tweet.quoted_tweet.text.slice(0, inner)] }) })), _jsxs(Box, { gap: 2, children: [_jsxs(Text, { dimColor: true, children: ["\uD83D\uDCAC ", formatCount(tweet.reply_count)] }), _jsxs(Text, { color: tweet.retweeted ? 'green' : 'dim', children: ["\uD83D\uDD01 ", formatCount(tweet.retweet_count)] }), _jsxs(Text, { color: tweet.liked ? 'red' : 'dim', children: ["\u2665 ", formatCount(tweet.favorite_count)] }), _jsx(Text, { color: tweet.bookmarked ? 'yellow' : 'dim', children: "\uD83D\uDD16" }), _jsxs(Text, { dimColor: true, children: ["\uD83D\uDC41 ", formatCount(tweet.view_count)] })] })] }));
});

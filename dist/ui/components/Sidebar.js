import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import React from 'react';
import { Box, Text } from 'ink';
const SECTIONS = [
    { key: 'home', icon: '🏠', num: '1', labelKey: 'nav.home' },
    { key: 'explore', icon: '🔍', num: '2', labelKey: 'nav.explore' },
    { key: 'dm', icon: '✉', num: '3', labelKey: 'nav.dm' },
    { key: 'bookmarks', icon: '🔖', num: '4', labelKey: 'nav.bookmarks' },
    { key: 'profile', icon: '👤', num: '5', labelKey: 'nav.profile' },
];
export const Sidebar = React.memo(function Sidebar({ active, me, t, dmUnread, collapsed }) {
    if (collapsed) {
        return (_jsxs(Box, { flexDirection: "column", width: 4, borderStyle: "single", borderColor: "gray", children: [SECTIONS.map((s) => (_jsxs(Text, { color: active === s.key ? 'cyan' : 'gray', children: [active === s.key ? '▶' : ' ', s.num] }, s.key))), _jsx(Text, { children: " " }), _jsx(Text, { color: "cyan", children: "\u270F" })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", width: 20, borderStyle: "single", borderColor: "gray", paddingRight: 1, children: [SECTIONS.map((s) => (_jsxs(Box, { children: [_jsxs(Text, { color: active === s.key ? 'cyan' : 'white', bold: active === s.key, children: [active === s.key ? '▶ ' : '  ', s.icon, " ", t(s.labelKey)] }), s.key === 'dm' && dmUnread > 0 && _jsxs(Text, { color: "red", children: [" [", dmUnread, "]"] })] }, s.key))), _jsx(Box, { marginTop: 1, flexDirection: "column", children: me && (_jsxs(_Fragment, { children: [_jsx(Text, { bold: true, children: me.name }), _jsxs(Text, { dimColor: true, children: ["@", me.screen_name] })] })) }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { backgroundColor: "cyan", color: "black", bold: true, children: [" ", t('nav.post'), " (n) "] }) })] }));
});

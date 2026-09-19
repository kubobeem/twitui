import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
export function HelpOverlay({ t, onClose }) {
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", width: 64, paddingX: 2, children: [_jsxs(Text, { bold: true, color: "yellow", children: [t('help.title'), " (?)"] }), _jsx(Text, { children: t('help.lines') }), _jsx(Text, { dimColor: true, children: "Esc / ? \u3067\u9589\u3058\u308B" }), _jsx(Text, { dimColor: true, children: " " }), _jsx(Text, { dimColor: true, children: typeof onClose === 'function' ? '' : '' })] }));
}

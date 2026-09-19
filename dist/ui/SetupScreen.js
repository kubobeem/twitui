import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { parseCookieInput, saveCredentials } from "../config.js";
import { RpcError } from "../types.js";
import { createT, getLang } from "../i18n.js";
/** First-run / session-expired cookie setup screen. */
export function SetupScreen({ api, lang, onDone, expired }) {
    const t = createT(getLang(lang));
    const [input, setInput] = useState('');
    const [status, setStatus] = useState('idle');
    const [rejectMsg, setRejectMsg] = useState('');
    useInput((ch, key) => {
        if (key.escape)
            return; // no escape from setup (Ctrl+C exits via Ink default)
        if (key.return) {
            if (status === 'verifying')
                return;
            const creds = parseCookieInput(input);
            if (!creds) {
                setStatus('invalid');
                return;
            }
            setStatus('verifying');
            void api.initialize(creds, t === undefined ? 'en' : getLang(lang), false)
                .then((res) => saveCredentials(creds).then(() => onDone(creds, res.user)))
                .catch((e) => {
                setStatus('rejected');
                setRejectMsg(e instanceof RpcError ? e.message : String(e));
            });
            return;
        }
        if (key.backspace || key.delete)
            setInput((s) => s.slice(0, -1));
        else if (ch && !key.ctrl && !key.meta)
            setInput((s) => s + ch);
    });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", width: 72, paddingX: 2, paddingY: 1, children: [_jsx(Text, { bold: true, color: "cyan", children: t('setup.title') }), _jsx(Text, { children: t('setup.steps') }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsxs(Text, { children: [t('setup.inputLabel'), ":"] }), _jsxs(Box, { borderStyle: "single", borderColor: status === 'invalid' ? 'red' : 'gray', paddingX: 1, children: [_jsx(Text, { children: input }), _jsx(Text, { inverse: true, children: " " })] })] }), _jsxs(Box, { marginTop: 1, children: [status === 'idle' && _jsxs(Text, { dimColor: true, children: ["[", t('setup.verify'), "] Enter"] }), status === 'verifying' && _jsx(Text, { color: "yellow", children: t('setup.verifying') }), status === 'invalid' && _jsx(Text, { color: "red", children: t('setup.invalid') }), status === 'rejected' && _jsx(Text, { color: "red", children: t('setup.rejected', { message: rejectMsg }) })] }), expired && _jsxs(Text, { color: "yellow", children: ["\u26A0 ", t('setup.expired')] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: t('setup.quitHint') }) })] }));
}

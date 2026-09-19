import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
/** x.com-style centered compose modal. Ctrl+Enter submits, Esc closes. */
export function ComposeModal({ mode, t, parent, onSubmit, onClose }) {
    const [text, setText] = useState('');
    const [mediaInput, setMediaInput] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [field, setField] = useState('text');
    const title = mode === 'new' ? t('compose.title') : mode === 'reply' ? t('compose.replyTitle') : t('compose.quoteTitle');
    const over = text.length > 280;
    useInput((input, key) => {
        if (key.escape) {
            onClose();
            return;
        }
        if (key.ctrl && input === 'c') {
            onClose();
            return;
        }
        if (key.tab) {
            setField((f) => (f === 'text' ? 'media' : 'text'));
            return;
        }
        if (key.ctrl && input === 'e' && !over && text.trim() && !submitting) {
            void doSubmit();
            return;
        }
        if (key.return && key.ctrl && !over && text.trim() && !submitting) {
            void doSubmit();
            return;
        }
        if (field === 'text') {
            if (key.backspace || key.delete)
                setText((s) => s.slice(0, -1));
            else if (input && !key.ctrl)
                setText((s) => (s.length < 1000 ? s + input : s));
        }
        else if (input && !key.ctrl) {
            setMediaInput((s) => s + input);
        }
        else if (key.backspace || key.delete) {
            setMediaInput((s) => s.slice(0, -1));
        }
    });
    const doSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const paths = mediaInput.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
            await onSubmit(text, paths);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSubmitting(false);
        }
    };
    const counterColor = over ? 'red' : text.length > 260 ? 'yellow' : 'dim';
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", width: 64, paddingX: 2, paddingY: 1, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { bold: true, color: "cyan", children: title }), _jsx(Text, { dimColor: true, children: "[\u00D7] Esc" })] }), parent && (_jsx(Box, { marginBottom: 1, children: _jsxs(Text, { dimColor: true, children: ["\u2198 @", parent.user.screen_name, ": ", parent.text.slice(0, 50)] }) })), _jsxs(Box, { borderStyle: "single", borderColor: field === 'text' ? 'cyan' : 'gray', paddingX: 1, children: [_jsx(Text, { children: text }), field === 'text' && _jsx(Text, { inverse: true, children: " " })] }), _jsx(Box, { justifyContent: "flex-end", children: _jsxs(Text, { color: counterColor, children: [text.length, "/280"] }) }), _jsxs(Box, { borderStyle: "single", borderColor: field === 'media' ? 'cyan' : 'gray', paddingX: 1, children: [_jsxs(Text, { dimColor: true, children: ["\uD83D\uDDBC ", t('compose.attach'), ":"] }), _jsx(Text, { children: mediaInput }), field === 'media' && _jsx(Text, { inverse: true, children: " " })] }), error && _jsx(Text, { color: "red", children: error }), _jsxs(Box, { justifyContent: "space-between", marginTop: 1, children: [_jsx(Text, { dimColor: true, children: t('compose.ctrlEnter') }), _jsx(Text, { color: submitting ? 'yellow' : over || !text.trim() ? 'gray' : 'green', children: submitting ? '…' : `[${t('action.send')}]` })] })] }));
}

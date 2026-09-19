import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { renderImageFromUrl } from "../../media/render.js";
/** Renders an image inline (kitty) or as braille art; shows a link fallback on failure. */
export function MediaView({ url, maxCols = 40, maxRows = 14, t }) {
    const [art, setArt] = useState(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let cancelled = false;
        setArt(null);
        setFailed(false);
        void renderImageFromUrl(url, maxCols, maxRows).then((res) => {
            if (cancelled)
                return;
            if (res === null)
                setFailed(true);
            else
                setArt(res);
        });
        return () => {
            cancelled = true;
        };
    }, [url, maxCols, maxRows]);
    if (failed) {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { dimColor: true, children: ["\uD83D\uDDBC ", t('media.notSupported')] }), _jsx(Text, { dimColor: true, children: url })] }));
    }
    if (art === null) {
        return _jsx(Text, { dimColor: true, children: t('media.loading') });
    }
    return (_jsx(Box, { flexDirection: "column", children: art.split('\n').map((line, i) => (_jsx(Text, { children: line }, i))) }));
}

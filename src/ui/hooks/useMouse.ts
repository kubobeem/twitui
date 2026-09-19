import { useEffect, useRef } from 'react';
import { useStdout, useStdin } from 'ink';

export type MouseEventType = 'wheel-up' | 'wheel-down' | 'click' | 'motion';

export interface MouseEvent {
  type: MouseEventType;
  x: number;
  y: number;
}

const ENABLE = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const DISABLE = '\x1b[?1002l\x1b[?1006l\x1b[?1000l';

/**
 * SGR (1006) + button-event (1002) mouse tracking over raw stdin.
 * Ink has no built-in mouse API (as of 6.8), so we parse the escape
 * sequences ourselves: ESC [ < Cb ; Cx ; Cy (M|m)
 *   Cb 0  = left press        -> click
 *   Cb 32 = left drag         -> motion
 *   Cb 64 = wheel up          -> wheel-up
 *   Cb 65 = wheel down        -> wheel-down
 */
export function useMouse(onEvent: (e: MouseEvent) => void, enabled = true): void {
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const bufferRef = useRef('');

  useEffect(() => {
    if (!enabled || !stdin.isTTY || !stdout) return;

    stdout.write(ENABLE);

    const onData = (chunk: Buffer | string): void => {
      bufferRef.current += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const buf = bufferRef.current;

      let consumed = 0;
      while (consumed < buf.length) {
        const start = buf.indexOf('\x1b[<', consumed);
        if (start < 0) break;
        const endM = buf.indexOf('M', start);
        const endm = buf.indexOf('m', start);
        let end = -1;
        let isRelease = false;
        if (endM >= 0 && (endm < 0 || endM < endm)) {
          end = endM;
        } else if (endm >= 0) {
          end = endm;
          isRelease = true;
        }
        if (end < 0) break; // incomplete; wait for more data

        const body = buf.slice(start + 3, end);
        consumed = end + 1;
        const parts = body.split(';');
        if (parts.length !== 3) continue;
        const cb = Number(parts[0]);
        const cx = Number(parts[1]);
        const cy = Number(parts[2]);
        if (!Number.isFinite(cb) || !Number.isFinite(cx) || !Number.isFinite(cy)) continue;

        // ignore release events (we act on press) except drag/motion
        if (isRelease) continue;

        if (cb === 0) {
          handlerRef.current({ type: 'click', x: cx - 1, y: cy - 1 });
        } else if (cb === 32) {
          handlerRef.current({ type: 'motion', x: cx - 1, y: cy - 1 });
        } else if (cb === 64) {
          handlerRef.current({ type: 'wheel-up', x: cx - 1, y: cy - 1 });
        } else if (cb === 65) {
          handlerRef.current({ type: 'wheel-down', x: cx - 1, y: cy - 1 });
        }
      }
      bufferRef.current = buf.slice(Math.max(0, consumed - 0));
      // keep buffer small if stream has non-mouse junk
      if (bufferRef.current.length > 4096) bufferRef.current = '';
    };

    stdin.on('data', onData);
    const cleanup = (): void => {
      stdin.off('data', onData);
      stdout.write(DISABLE);
    };
    process.on('exit', cleanup);
    return () => {
      cleanup();
      process.off('exit', cleanup);
    };
  }, [enabled, stdin, stdout]);
}

/** Parse helper exported for tests. */
export function parseSgrMouse(buf: string): { events: MouseEvent[]; consumed: number } {
  const events: MouseEvent[] = [];
  let consumed = 0;
  let pos = 0;
  while (pos < buf.length) {
    const start = buf.indexOf('\x1b[<', pos);
    if (start < 0) break;
    const endM = buf.indexOf('M', start);
    const endm = buf.indexOf('m', start);
    let end = -1;
    if (endM >= 0 && (endm < 0 || endM < endm)) end = endM;
    else if (endm >= 0) end = endm;
    if (end < 0) break;
    const parts = buf.slice(start + 3, end).split(';');
    const isRelease = buf[end] === 'm';
    if (parts.length === 3 && !isRelease) {
      const cb = Number(parts[0]);
      const cx = Number(parts[1]) - 1;
      const cy = Number(parts[2]) - 1;
      let type: MouseEventType | null = null;
      if (cb === 0) type = 'click';
      else if (cb === 32) type = 'motion';
      else if (cb === 64) type = 'wheel-up';
      else if (cb === 65) type = 'wheel-down';
      if (type) events.push({ type, x: cx, y: cy });
    }
    consumed = end + 1;
    pos = end + 1;
  }
  return { events, consumed };
}

import { describe, it, expect } from 'vitest';
import { parseSgrMouse } from '../src/ui/hooks/useMouse.ts';

describe('parseSgrMouse', () => {
  it('parses wheel up/down events', () => {
    const buf = '\x1b[<64;10;5M\x1b[<65;10;5M';
    const { events, consumed } = parseSgrMouse(buf);
    expect(events).toEqual([
      { type: 'wheel-up', x: 9, y: 4 },
      { type: 'wheel-down', x: 9, y: 4 },
    ]);
    expect(consumed).toBe(buf.length);
  });

  it('parses click press and skips release', () => {
    // press (cb 0 ends with M), release (cb 0 ends with m) — release filtered in parser
    const buf = '\x1b[<0;3;7M';
    const { events } = parseSgrMouse(buf);
    expect(events).toEqual([{ type: 'click', x: 2, y: 6 }]);
  });

  it('does not emit click for release (m terminator)', () => {
    const buf = '\x1b[<0;3;7m';
    const { events } = parseSgrMouse(buf);
    // release events end with 'm'; they must never surface as clicks
    expect(events).toEqual([]);
  });

  it('handles partial sequences safely', () => {
    const { events } = parseSgrMouse('\x1b[<64;1');
    expect(events).toEqual([]);
  });

  it('handles motion (drag) events', () => {
    const { events } = parseSgrMouse('\x1b[<32;8;9M');
    expect(events).toEqual([{ type: 'motion', x: 7, y: 8 }]);
  });
});

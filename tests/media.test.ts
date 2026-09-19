import { describe, it, expect } from 'vitest';
import { renderBraille } from '../src/media/render.ts';
import { decodeImage, resize, fitCells } from '../src/media/decode.ts';

function solidImage(w: number, h: number, rgba: [number, number, number, number]) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width: w, height: h, rgba: data };
}

describe('decodeImage', () => {
  it('throws on unknown formats', () => {
    expect(() => decodeImage(Buffer.from('not an image'))).toThrow(/unsupported/);
  });
});

describe('resize', () => {
  it('keeps size when target matches', () => {
    const img = solidImage(4, 4, [255, 0, 0, 255]);
    expect(resize(img, 4, 4)).toBe(img);
  });

  it('averages pixels when shrinking', () => {
    const img = solidImage(2, 2, [0, 0, 0, 255]);
    const out = resize(img, 1, 1);
    expect(out.width).toBe(1);
    expect(out.rgba[0]).toBe(0);
    expect(out.rgba[3]).toBe(255);
  });
});

describe('fitCells', () => {
  it('caps by pixel budget (maxCols*pxW x maxRows*pxH)', () => {
    const img = solidImage(200, 100, [0, 0, 0, 255]);
    const { width, height } = fitCells(img, 60, 30, 2, 4);
    // pixel dims: cap is 60*2=120 x 30*4=120 => 120x60
    expect(width).toBeLessThanOrEqual(120);
    expect(height).toBeLessThanOrEqual(120);
    expect(width).toBe(120);
    expect(height).toBe(60);
  });
});

describe('renderBraille', () => {
  it('renders blank cells for white images', () => {
    const img = solidImage(20, 20, [255, 255, 255, 255]);
    const out = renderBraille(img, 10, 5);
    expect(out).toMatch(/^[\u2800]+/);
    expect(out.split('\n').length).toBeGreaterThan(0);
  });

  it('renders filled dots for black images', () => {
    const img = solidImage(20, 20, [0, 0, 0, 255]);
    const out = renderBraille(img, 10, 5);
    // all dots lit => U+28FF
    expect(out).toContain('\u28FF');
  });

  it('respects max columns', () => {
    const img = solidImage(400, 100, [0, 0, 0, 255]);
    const out = renderBraille(img, 20, 30);
    const firstLine = out.split('\n')[0]!;
    expect(firstLine.length).toBeLessThanOrEqual(20);
  });
});

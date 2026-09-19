import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export interface RawImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** Decode a JPEG or PNG buffer into raw RGBA. Throws on unknown formats. */
export function decodeImage(buf: Buffer): RawImage {
  // PNG signature
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
  }
  // JPEG SOI
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width: img.width, height: img.height, rgba: new Uint8Array(img.data) };
  }
  throw new Error('unsupported image format (png/jpeg only)');
}

export function fetchImage(url: string, timeoutMs = 10_000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'twitui/0.1' } })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((ab) => Buffer.from(ab))
    .finally(() => clearTimeout(timer));
}

/** Simple box-filter resize to target pixel dimensions. */
export function resize(img: RawImage, targetW: number, targetH: number): RawImage {
  if (img.width === targetW && img.height === targetH) return img;
  const out = new Uint8Array(targetW * targetH * 4);
  const xRatio = img.width / targetW;
  const yRatio = img.height / targetH;
  for (let y = 0; y < targetH; y++) {
    const sy0 = Math.floor(y * yRatio);
    const sy1 = Math.min(img.height, Math.max(sy0 + 1, Math.floor((y + 1) * yRatio)));
    for (let x = 0; x < targetW; x++) {
      const sx0 = Math.floor(x * xRatio);
      const sx1 = Math.min(img.width, Math.max(sx0 + 1, Math.floor((x + 1) * xRatio)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * img.width + sx) * 4;
          r += img.rgba[i]!;
          g += img.rgba[i! + 1]!;
          b += img.rgba[i + 2]!;
          a += img.rgba[i + 3]!;
          n++;
        }
      }
      const o = (y * targetW + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { width: targetW, height: targetH, rgba: out };
}

/** Fit image into a cell budget. braille: 2px wide x 4px tall per cell. */
export function fitCells(img: RawImage, maxCols: number, maxRows: number, pxPerCellW: number, pxPerCellH: number): { width: number; height: number } {
  const maxPxW = maxCols * pxPerCellW;
  const maxPxH = maxRows * pxPerCellH;
  const scale = Math.min(maxPxW / img.width, maxPxH / img.height, 1);
  return {
    width: Math.max(1, Math.round(img.width * scale)),
    height: Math.max(1, Math.round(img.height * scale)),
  };
}

import { deflateSync } from 'node:zlib';
import { detectProtocol } from "./protocol.js";
import { decodeImage, fetchImage, resize, fitCells } from "./decode.js";
const BRAILLE_BASE = 0x2800;
// dot bit order inside a braille cell (U+2800 block): left-to-right columns, top-to-bottom rows
const DOT_BITS = [
    [0x01, 0x08],
    [0x02, 0x10],
    [0x04, 0x20],
    [0x40, 0x80],
];
/** Render RGBA pixels as a braille-art string block. */
export function renderBraille(img, maxCols = 60, maxRows = 30, threshold = 128) {
    // fitCells returns PIXEL dims capped by maxCols*2 x maxRows*4
    const pixels = fitCells(img, maxCols, maxRows, 2, 4);
    const small = resize(img, pixels.width, pixels.height);
    const width = Math.max(1, Math.floor(pixels.width / 2)); // cells
    const height = Math.max(1, Math.floor(pixels.height / 4)); // cells
    const lines = [];
    for (let cy = 0; cy < height; cy++) {
        let line = '';
        for (let cx = 0; cx < width; cx++) {
            let bits = 0;
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const px = (cy * 4 + dy) * width * 2 + (cx * 2 + dx);
                    const i = px * 4;
                    const a = small.rgba[i + 3] ?? 0;
                    const lum = 0.2126 * (small.rgba[i] ?? 0) + 0.7152 * (small.rgba[i + 1] ?? 0) + 0.0722 * (small.rgba[i + 2] ?? 0);
                    if (a > 32 && lum < threshold) {
                        bits |= DOT_BITS[dy][dx];
                    }
                }
            }
            line += String.fromCodePoint(BRAILLE_BASE + bits);
        }
        lines.push(line);
    }
    return lines.join('\n');
}
/** Encode raw RGBA as a minimal PNG buffer (for kitty graphics transmission). */
export function encodePng(img) {
    const { width, height, rgba } = img;
    const CHUNK = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const typeBuf = Buffer.from(type, 'ascii');
        const crcInput = Buffer.concat([typeBuf, data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(crcInput) >>> 0);
        return Buffer.concat([len, typeBuf, data, crc]);
    };
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter: none
        rgba.subarray(y * width * 4, (y + 1) * width * 4).forEach((v, i) => {
            raw[y * (width * 4 + 1) + 1 + i] = v;
        });
    }
    const idat = CHUNK('IDAT', zlibDeflate(raw));
    const iend = CHUNK('IEND', Buffer.alloc(0));
    return Buffer.concat([signature, CHUNK('IHDR', ihdr), idat, iend]);
}
function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++)
            c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c;
}
function zlibDeflate(data) {
    return deflateSync(data);
}
/** Produce the kitty graphics protocol escape sequence for a PNG payload. */
export function kittyPngEscape(png, imageId) {
    const header = `\x1b_Gf=100,a=T,i=${imageId},q=2;`;
    const payload = png.toString('base64');
    const chunkSize = 4096;
    const parts = [];
    for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const more = i + chunkSize < payload.length ? '1' : '0';
        parts.push(`${i === 0 ? header : '\x1b_G'}m=${more};${chunk}\x1b\\`);
    }
    return parts.join('');
}
/** Download + render an image URL to terminal-ready output for the detected protocol. */
export async function renderImageFromUrl(url, maxCols = 60, maxRows = 30) {
    const proto = detectProtocol();
    let buf;
    try {
        buf = await fetchImage(url);
    }
    catch {
        return null;
    }
    let img;
    try {
        img = decodeImage(buf);
    }
    catch {
        return null;
    }
    if (proto === 'kitty') {
        // fitCells returns pixel dims capped by maxCols*10 x maxRows*20
        const pixels = fitCells(img, maxCols, maxRows, 10, 20);
        const small = resize(img, pixels.width, pixels.height);
        const png = encodePng(small);
        return kittyPngEscape(png, 1) + '\n';
    }
    // sixel/iterm/none all fall back to braille in v1 (see spec §5.4)
    return renderBraille(img, maxCols, maxRows);
}

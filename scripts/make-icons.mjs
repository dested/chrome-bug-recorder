/**
 * Generates the extension icons (a reticle: outer ring + centre dot) with zero
 * dependencies — a tiny hand-rolled PNG encoder plus node's zlib. Beats checking
 * binaries into git, and the mark stays editable as code.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];
const ACCENT = [255, 92, 57];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const body = out.subarray(4, 8 + data.length);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Coverage of the mark at a normalised radius (0 = centre, 1 = edge). */
function coverage(r) {
  const ringOuter = 0.94;
  const ringInner = 0.68;
  const dot = 0.34;
  if (r <= dot) return 1;
  if (r >= ringInner && r <= ringOuter) return 1;
  return 0;
}

function render(size) {
  const ss = 4; // supersample for cheap anti-aliasing
  const rgba = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss - half;
          const py = y + (sy + 0.5) / ss - half;
          hits += coverage(Math.hypot(px, py) / half);
        }
      }
      const alpha = Math.round((hits / (ss * ss)) * 255);
      const i = (y * size + x) * 4;
      rgba[i] = ACCENT[0];
      rgba[i + 1] = ACCENT[1];
      rgba[i + 2] = ACCENT[2];
      rgba[i + 3] = alpha;
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(resolve(OUT_DIR, `${size}.png`), encodePng(size, render(size)));
}
console.log(`icons → ${OUT_DIR} (${SIZES.join(', ')})`);

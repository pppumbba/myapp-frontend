// Draws the installable app's icons (public/icons) from the Wand mark: white squares on indigo.
// No image library: each pixel is worked out here and written as a PNG with node's zlib.
// Run again after changing the mark: node scripts/pwa-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const INDIGO = [0x4f, 0x39, 0xf6];
// The mark in its 32×32 box (see LogoMark in src/components/AppShell.tsx): x, y, size, radius, opacity.
const MARK = [
  [0, 0, 14, 2, 1],
  [15.5, 15.5, 9.5, 1.5, 0.55],
  [26.5, 26.5, 5.5, 1, 0.25],
];

/** How much of the point lies inside a rounded square (1 inside, 0 outside). */
const inRounded = (px, py, x, y, size, r) => {
  const dx = Math.max(x + r - px, 0, px - (x + size - r));
  const dy = Math.max(y + r - py, 0, py - (y + size - r));
  return dx * dx + dy * dy <= r * r ? 1 : 0;
};

/**
 * One icon, size px square. corner: the background's radius as a share of the size (0 fills
 * the square, for maskable icons the system crops). mark: the mark's width as a share of the size.
 */
function icon(size, { corner, mark }) {
  const scale = (size * mark) / 32;
  const offset = (size - 32 * scale) / 2;
  const samples = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let white = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          if (!inRounded(px, py, 0, 0, size, corner * size)) continue;
          bg++;
          const mx = (px - offset) / scale;
          const my = (py - offset) / scale;
          white += MARK.reduce((on, [rx, ry, s, r, a]) => Math.max(on, inRounded(mx, my, rx, ry, s, r) * a), 0);
        }
      const alpha = bg / samples ** 2;
      const w = bg ? white / bg : 0;
      const i = 1 + x * 4;
      for (let c = 0; c < 3; c++) row[i + c] = Math.round(INDIGO[c] + (255 - INDIGO[c]) * w);
      row[i + 3] = Math.round(alpha * 255);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

function png(size, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
const files = {
  'icon-192.png': icon(192, { corner: 0.22, mark: 0.6 }),
  'icon-512.png': icon(512, { corner: 0.22, mark: 0.6 }),
  // Maskable: the system crops to its own shape, so the mark keeps inside the middle 80%.
  'maskable-512.png': icon(512, { corner: 0, mark: 0.5 }),
  // iOS rounds the corners itself.
  'apple-touch-icon.png': icon(180, { corner: 0, mark: 0.56 }),
};
for (const [name, data] of Object.entries(files)) writeFileSync(new URL(name, dir), data);
console.log(`Wrote ${Object.keys(files).join(', ')} to public/icons`);

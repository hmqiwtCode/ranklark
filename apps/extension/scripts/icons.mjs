// Draws the Ranklark logo (three rising orange bars) into PNG icons — no image tools needed.
import fs from "node:fs";
import zlib from "node:zlib";

function png(size) {
  const px = Buffer.alloc(size * size * 4);
  const bars = [
    [3, 14, 5, 11, 0.55],
    [11.5, 9, 5, 16, 0.8],
    [20, 3, 5, 22, 1],
  ]; // x, y, w, h, alpha on a 28 grid
  const s = size / 28;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let a = 0;
      // 4×4 supersampling for smooth rounded ends
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const gx = (x + (sx + 0.5) / 4) / s,
            gy = (y + (sy + 0.5) / 4) / s;
          for (const [bx, by, bw, bh, ba] of bars) {
            const r = bw / 2,
              cx = bx + r;
            const inside =
              (gx >= bx && gx <= bx + bw && gy >= by + r && gy <= by + bh - r) ||
              Math.hypot(gx - cx, gy - (by + r)) <= r ||
              Math.hypot(gx - cx, gy - (by + bh - r)) <= r;
            if (inside) {
              a = Math.max(a, 0);
              a += ba / 16;
              break;
            }
          }
        }
      const i = (y * size + x) * 4;
      px[i] = 0xe1;
      px[i + 1] = 0x65;
      px[i + 2] = 0x40;
      px[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const n of [16, 32, 48, 128]) fs.writeFileSync(new URL(`../static/icons/icon${n}.png`, import.meta.url), png(n));
console.log("icons written");

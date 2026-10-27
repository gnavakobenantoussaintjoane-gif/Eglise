import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * Genere un PNG RGB (degrade diagonal + bandes) sans dependance externe.
 * Utilise par le seed pour fournir de vraies images de demonstration.
 */
export function generateGradientPng(
  width: number,
  height: number,
  from: [number, number, number],
  to: [number, number, number],
  seed = 0,
): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filtre None
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      const wave = Math.sin((x + seed * 37) / 42) * 10 + Math.cos((y + seed * 19) / 33) * 8;
      raw[offset] = Math.max(0, Math.min(255, Math.round(from[0] + (to[0] - from[0]) * t + wave)));
      raw[offset + 1] = Math.max(
        0,
        Math.min(255, Math.round(from[1] + (to[1] - from[1]) * t + wave)),
      );
      raw[offset + 2] = Math.max(
        0,
        Math.min(255, Math.round(from[2] + (to[2] - from[2]) * t - wave)),
      );
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const PALETTES: Array<[[number, number, number], [number, number, number]]> = [
  [
    [76, 29, 149],
    [124, 58, 237],
  ],
  [
    [109, 40, 217],
    [245, 243, 255],
  ],
  [
    [31, 41, 55],
    [109, 40, 217],
  ],
  [
    [124, 58, 237],
    [236, 72, 153],
  ],
  [
    [17, 24, 39],
    [76, 29, 149],
  ],
];

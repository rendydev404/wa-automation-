import { crc32, deflateSync } from "node:zlib";
import type { BitQr } from "../qr";

/**
 * PNG hitam-putih dari matriks QR (qr.ts) tanpa pustaka tambahan: grayscale 8-bit, tiap modul = `skala` piksel.
 * Hasilnya kecil (±1–3 KB) karena baris yang sama dikompres deflate.
 */
export function pngQr({ n, bit }: BitQr, skala = 8): Buffer {
  const bin = Buffer.from(bit, "base64");
  const gelap = (i: number): boolean => (bin[i >> 3] & (0x80 >> (i & 7))) !== 0;
  const sisi = n * skala;
  const baris = Buffer.alloc(sisi + 1); // byte filter 0 di depan tiap baris
  const mentah = Buffer.alloc((sisi + 1) * sisi);
  for (let y = 0; y < n; y++) {
    baris[0] = 0;
    for (let x = 0; x < n; x++) baris.fill(gelap(y * n + x) ? 0 : 255, 1 + x * skala, 1 + (x + 1) * skala);
    for (let k = 0; k < skala; k++) baris.copy(mentah, (y * skala + k) * (sisi + 1));
  }
  const potong = (jenis: string, isi: Buffer): Buffer => {
    const p = Buffer.alloc(4);
    p.writeUInt32BE(isi.length);
    const ji = Buffer.concat([Buffer.from(jenis, "ascii"), isi]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(ji) >>> 0);
    return Buffer.concat([p, ji, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(sisi, 0);
  ihdr.writeUInt32BE(sisi, 4);
  ihdr[8] = 8; // kedalaman bit
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    potong("IHDR", ihdr),
    potong("IDAT", deflateSync(mentah, { level: 9 })),
    potong("IEND", Buffer.alloc(0)),
  ]);
}

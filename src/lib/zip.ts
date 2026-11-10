import "server-only";
import { deflateRawSync } from "node:zlib";

/** Pembuat ZIP kecil tanpa dependensi (DEFLATE + CRC-32), cukup untuk unduhan SDK & contoh aplikasi. */

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABEL_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buatZip(berkas: { nama: string; isi: Buffer }[], waktu = new Date()): Buffer {
  const dosWaktu = ((waktu.getHours() << 11) | (waktu.getMinutes() << 5) | (waktu.getSeconds() >> 1)) & 0xffff;
  const dosTanggal = (((waktu.getFullYear() - 1980) << 9) | ((waktu.getMonth() + 1) << 5) | waktu.getDate()) & 0xffff;
  const lokal: Buffer[] = [];
  const pusat: Buffer[] = [];
  let posisi = 0;
  for (const f of berkas) {
    const nama = Buffer.from(f.nama.replace(/\\/g, "/"), "utf8");
    const padat = deflateRawSync(f.isi, { level: 9 });
    const crc = crc32(f.isi);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6); // nama UTF-8
    h.writeUInt16LE(8, 8); // deflate
    h.writeUInt16LE(dosWaktu, 10);
    h.writeUInt16LE(dosTanggal, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(padat.length, 18);
    h.writeUInt32LE(f.isi.length, 22);
    h.writeUInt16LE(nama.length, 26);
    lokal.push(h, nama, padat);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosWaktu, 12);
    c.writeUInt16LE(dosTanggal, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(padat.length, 20);
    c.writeUInt32LE(f.isi.length, 24);
    c.writeUInt16LE(nama.length, 28);
    c.writeUInt32LE(posisi, 42);
    pusat.push(c, nama);
    posisi += h.length + nama.length + padat.length;
  }
  const ukuranPusat = pusat.reduce((n, b) => n + b.length, 0);
  const akhir = Buffer.alloc(22);
  akhir.writeUInt32LE(0x06054b50, 0);
  akhir.writeUInt16LE(berkas.length, 8);
  akhir.writeUInt16LE(berkas.length, 10);
  akhir.writeUInt32LE(ukuranPusat, 12);
  akhir.writeUInt32LE(posisi, 16);
  return Buffer.concat([...lokal, ...pusat, akhir]);
}

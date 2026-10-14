/**
 * Kode QR dikirim ke browser sebagai bit matriksnya (±0,7 KB), bukan sebagai gambar (SVG-nya
 * ±13 KB); browser yang menggambarnya. Modul ini murni, dipakai server maupun komponen klien.
 */
export interface BitQr {
  /** Sisi matriks, termasuk tepi kosongnya. */
  n: number;
  /** n×n bit baris demi baris (bit tertinggi lebih dulu), base64. */
  bit: string;
}

export function kemasQr(data: boolean[][]): BitQr {
  const n = data.length;
  const byte = new Uint8Array(Math.ceil((n * n) / 8));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!data[y][x]) continue;
      const i = y * n + x;
      byte[i >> 3] |= 0x80 >> (i & 7);
    }
  }
  let s = "";
  for (const b of byte) s += String.fromCharCode(b);
  return { n, bit: btoa(s) };
}

/** Atribut `d` untuk <path> pada SVG ber-viewBox `0 0 n n`: satu persegi panjang per deret modul gelap. */
export function jalurQr({ n, bit }: BitQr): string {
  const s = atob(bit);
  const gelap = (i: number): boolean => (s.charCodeAt(i >> 3) & (0x80 >> (i & 7))) !== 0;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; ) {
      if (!gelap(y * n + x)) {
        x += 1;
        continue;
      }
      let p = 1;
      while (x + p < n && gelap(y * n + x + p)) p += 1;
      d += `M${x} ${y}h${p}v1h-${p}z`;
      x += p;
    }
  }
  return d;
}

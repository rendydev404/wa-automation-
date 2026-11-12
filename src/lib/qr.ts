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

export interface QrPixel {
  n: number;
  /** Piksel data utama (tinta gelap). */
  pikselUtama: string;
  /** Piksel data aksen (hijau zamrud gelap — tetap terbaca hitam oleh kamera HP). */
  pikselAksen: string;
  /** Bingkai piksel 3 mata sudut QR (7x7). */
  mataLuar: string;
  /** Inti piksel 3 mata sudut QR (3x3). */
  mataDalam: string;
  /** Titik tengah mata sudut QR (1x1). */
  mataPusat: string;
  /** Koordinat kotak 9x9 modul di tengah untuk lencana logo aplikasi. */
  logo: { x: number; y: number; ukuran: number };
}

/**
 * Palet warna gelap QR bergaya piksel (seluruhnya < 17% luminansi Rec.709, rasio kontras > 11,8:1 terhadap putih)
 * agar sensor luma kamera iPhone (iOS Vision / AVCaptureMetadataOutput) & Android selalu membacanya hitam pekat.
 */
export const WARNA_QR = {
  pikselUtama: "#0b1813",
  pikselAksen: "#0d3326",
  mataLuar: "#0b1813",
  mataDalam: "#0d291e",
  mataPusat: "#0b1813",
} as const;

/**
 * Susun jalur SVG bergaya grafik piksel dengan ruang 9×9 modul di tengah untuk logo aplikasi.
 * Dipasangkan dengan koreksi galat tinggi (`ecc: "Q"`, ~25%, `border: 3` -> QR Versi 15 berukuran 83×83):
 * - Seluruh 13 alignment pattern Versi 15 (`[6, 26, 48, 70]`) berada di luar area logo pusat (0% tertutup).
 * - Ketiga mata sudut 7×7 digambar utuh 1×1 tanpa celah internal (`pad = 0`) sehingga rasio wajib ISO `1:1:3:1:1`
 *   terjaga sempurna pada kamera iPhone (WA biasa maupun WA Business) dan Android.
 */
export function jalurQrPixel({ n, bit }: BitQr): QrPixel {
  const s = atob(bit);
  const gelap = (x: number, y: number): boolean => {
    const i = y * n + x;
    return (s.charCodeAt(i >> 3) & (0x80 >> (i & 7))) !== 0;
  };

  let tepi = 0;
  while (tepi < 8 && !gelap(tepi, tepi)) tepi += 1;
  if (tepi >= 8) tepi = 2;
  const pusat = Math.floor(n / 2);
  const radiusLogo = 4; // 9x9 modul di pusat (bebas alignment pattern pada V14-V17)
  const mata = [
    { x0: tepi, y0: tepi },
    { x0: n - tepi - 7, y0: tepi },
    { x0: tepi, y0: n - tepi - 7 },
  ];

  const kotak = (x: number, y: number, pad: number): string => {
    if (pad === 0) return `M${x} ${y}h1v1h-1z`;
    const u = +(1 - pad * 2).toFixed(2);
    const ox = +(x + pad).toFixed(2);
    const oy = +(y + pad).toFixed(2);
    return `M${ox} ${oy}h${u}v${u}h-${u}z`;
  };

  let pikselUtama = "";
  let pikselAksen = "";
  let mataLuar = "";
  let mataDalam = "";
  let mataPusat = "";

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!gelap(x, y)) continue;
      // Ruang tengah 9x9 modul dikosongkan untuk lencana logo aplikasi.
      if (Math.abs(x - pusat) <= radiusLogo && Math.abs(y - pusat) <= radiusLogo) continue;

      const m = mata.find((k) => x >= k.x0 && x < k.x0 + 7 && y >= k.y0 && y < k.y0 + 7);
      if (m) {
        const dx = x - m.x0;
        const dy = y - m.y0;
        if (dx === 3 && dy === 3) {
          mataPusat += kotak(x, y, 0);
        } else if (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) {
          mataDalam += kotak(x, y, 0);
        } else {
          mataLuar += kotak(x, y, 0);
        }
        continue;
      }

      // Modul data 0.92x0.92: tetap tampak bergrafik piksel tajam tanpa menggerus kontras gelap modul.
      if ((x + y * 3) % 7 === 0) {
        pikselAksen += kotak(x, y, 0.04);
      } else {
        pikselUtama += kotak(x, y, 0.04);
      }
    }
  }

  return {
    n,
    pikselUtama,
    pikselAksen,
    mataLuar,
    mataDalam,
    mataPusat,
    logo: { x: pusat - radiusLogo, y: pusat - radiusLogo, ukuran: radiusLogo * 2 + 1 },
  };
}

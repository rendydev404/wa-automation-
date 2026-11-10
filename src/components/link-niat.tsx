"use client";

import { useState } from "react";
import NextLink from "next/link";

/**
 * Tautan baris tabel/daftar panjang (mis. 25 akun di /admin/pengguna, transaksi, afiliator): prefetch baru dimulai saat
 * ada niat (kursor mendekat, sentuhan, fokus keyboard), bukan saat baris terlihat. Dengan Partial Prefetching setiap URL
 * berparameter ([id], [order]) tetap meminta pohon rutenya sendiri ke server, jadi tabel 25 baris = 25+ permintaan
 * prefetch per tampilan yang menyaingi klik pengguna. Diukur (docs/serah-terima-skrip/ukur-navigasi.mjs): /admin/pengguna
 * 22 -> 6 permintaan per perpindahan halaman. Kursor biasanya berada di atas tautan ±150 ms sebelum klik, cukup untuk
 * mengambil App Shell halaman tujuan sehingga kerangkanya tetap muncul seketika.
 */
export default function LinkNiat(props: React.ComponentProps<typeof NextLink>) {
  const [niat, setNiat] = useState(false);
  const mulai = () => setNiat(true);
  return (
    <NextLink
      {...props}
      prefetch={niat ? props.prefetch : false}
      onPointerEnter={(e) => {
        mulai();
        props.onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        mulai();
        props.onTouchStart?.(e);
      }}
      onFocus={(e) => {
        mulai();
        props.onFocus?.(e);
      }}
    />
  );
}

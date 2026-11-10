"use client";

import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useRef } from "react";
import type { HasilAksi } from "../lib/jenis";

/**
 * Form untuk server action: tombol kirim dengan keadaan "memproses", pesan berhasil/gagal, dan nilai yang perlu
 * disalin (rahasia webhook, kode pairing). Isian hanya dikosongkan bila aksinya berhasil, jadi tulisan pengguna tidak
 * hilang saat gagal.
 */
export function FormAksi({
  aksi,
  tombol,
  children,
  kelas = "form",
  gaya = "utama",
  kosongkan = true,
}: {
  aksi: (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>;
  tombol: string;
  children?: ReactNode;
  kelas?: string;
  gaya?: "utama" | "biasa" | "bahaya";
  kosongkan?: boolean;
}) {
  const [hasil, jalankan, sibuk] = useActionState(aksi, null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (hasil?.ok && kosongkan) form.current?.reset();
  }, [hasil, kosongkan]);

  function kirim(e: FormEvent<HTMLFormElement>) {
    // Dikirim manual supaya React tidak mengosongkan form saat aksinya gagal.
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => jalankan(fd));
  }

  return (
    <form ref={form} action={jalankan} onSubmit={kirim} className={kelas}>
      {children}
      <button type="submit" className={`tombol ${gaya}`} disabled={sibuk}>
        {sibuk ? "Memproses…" : tombol}
      </button>
      {hasil && (
        <div role="status" className={`catatan ${hasil.ok ? "ok" : "galat"}`}>
          <p>{hasil.pesan}</p>
          {hasil.rinci && <p className="kecil">{hasil.rinci}</p>}
          {hasil.tampil && (
            <div className="salin">
              <span className="kecil">{hasil.tampil.label}</span>
              <code>{hasil.tampil.nilai}</code>
              {hasil.tampil.petunjuk && <span className="kecil">{hasil.tampil.petunjuk}</span>}
            </div>
          )}
        </div>
      )}
    </form>
  );
}

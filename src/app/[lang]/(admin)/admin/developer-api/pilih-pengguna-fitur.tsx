"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import Link from "@/components/link";

export interface BarisPenggunaFitur {
  id: number;
  email: string;
  nama: string;
  akses_api: boolean;
  /** Jumlah fitur khusus; null = ikut global. */
  fitur_khusus: number | null;
}

/**
 * Pemilih akun untuk aturan fitur per pengguna. Tanpa kata kunci: akun yang diatur khusus lalu akun yang punya akses
 * portal (dari server). Cari langsung lewat rute pencarian Akses pengguna (debounce 200 ms, permintaan lama dibatalkan).
 */
export function PilihPenggunaFitur({ awal, total, global }: { awal: BarisPenggunaFitur[]; total: number; global: number }) {
  const [cari, setCari] = useState("");
  const [hasil, setHasil] = useState<BarisPenggunaFitur[] | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [gagal, setGagal] = useState(false);
  const pertama = useRef(true);

  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    const kata = cari.trim();
    if (!kata) return; // tanpa kata kunci: daftar awal dari server (lihat `daftar` di bawah)
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setMemuat(true);
      setGagal(false);
      try {
        const r = await fetch(`/api/admin/developer-api/pengguna?${new URLSearchParams({ q: kata })}`, { signal: ctrl.signal, cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        setHasil(((await r.json()) as { daftar: BarisPenggunaFitur[] }).daftar);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setGagal(true);
      } finally {
        if (!ctrl.signal.aborted) setMemuat(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [cari]);

  const kata = cari.trim();
  const daftar = kata ? (hasil ?? awal) : awal;
  const sibuk = memuat && !!kata;
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <h2 className="text-[15px] font-bold">Aturan fitur per pengguna</h2>
        <p className="text-[12.5px] text-muted">
          Pilih akun untuk membuka fitur tambahan atau menutup sebagian khusus untuk akun itu. Akun tanpa aturan khusus mengikuti daftar global ({global} fitur).
        </p>
      </div>
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama atau email akun…"
            aria-label="Cari akun"
            autoComplete="off"
            className="field h-10 min-h-0 py-2 pr-9 pl-9 text-[13.5px]"
          />
          {sibuk && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-faint" aria-hidden />}
        </div>
      </div>
      {gagal && kata && <p className="border-b border-line bg-danger-soft px-4 py-2 text-[12.5px] text-danger sm:px-5">Gagal memuat daftar akun. Coba lagi.</p>}
      {!kata && daftar.length > 0 && <p className="border-b border-line px-4 py-2 text-[11.5px] font-semibold tracking-wide text-faint uppercase sm:px-5">Diatur khusus & punya akses portal</p>}
      {daftar.length ? (
        <ul data-analitik-privat aria-busy={sibuk} className={`divide-y divide-line transition-opacity ${sibuk ? "opacity-60" : ""}`}>
          {daftar.map((u) => (
            <li key={u.id}>
              <Link prefetch={false} href={`/admin/developer-api?tab=fitur&lingkup=pengguna&u=${u.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle/50 sm:px-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-subtle text-[12.5px] font-bold text-muted uppercase">{(u.nama || u.email).charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{u.nama || u.email.split("@")[0]}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {u.email}
                    {!u.akses_api && <span className="text-faint"> · tanpa akses portal</span>}
                  </span>
                </span>
                {u.fitur_khusus !== null ? (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-bold text-accent tabular-nums">
                    Khusus {u.fitur_khusus}/{total}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11.5px] font-semibold text-muted">Ikut global</span>
                )}
                <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-[13px] text-muted">
          {sibuk ? "Memuat…" : kata ? `Tidak ada akun yang cocok dengan "${kata}".` : "Belum ada akun dengan aturan khusus atau akses portal. Cari akun di atas."}
        </p>
      )}
    </section>
  );
}

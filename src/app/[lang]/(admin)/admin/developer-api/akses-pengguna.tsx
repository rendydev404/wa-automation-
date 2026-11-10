"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, UsersRound } from "lucide-react";
import { aturAksesAction } from "@/app/actions-developer";
import { Saklar } from "@/components/ui";

export interface AkunPilihan {
  id: number;
  email: string;
  nama: string;
  peran: string;
  akses_api: boolean;
}

const BATAS = 30;
const LABEL_PERAN: Record<string, string> = { admin: "Admin", developer: "Developer" };
const SARING = [
  { nilai: false, label: "Semua" },
  { nilai: true, label: "Punya akses" },
] as const;

/**
 * Pemilih akses portal Developer API: daftar akun + cari langsung (debounce 200 ms; permintaan lama dibatalkan lewat
 * AbortController supaya hasil yang telat tidak menimpa yang baru). Sakelar per akun = beri/cabut akses, optimistis
 * dan dikembalikan bila server menolak.
 */
export function AksesPengguna({ awal, jumlahAwal }: { awal: AkunPilihan[]; jumlahAwal: number }) {
  const [cari, setCari] = useState("");
  const [hanyaAkses, setHanyaAkses] = useState(false);
  const [daftar, setDaftar] = useState(awal);
  const [jumlah, setJumlah] = useState(jumlahAwal);
  const [memuat, setMemuat] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [proses, setProses] = useState<ReadonlySet<number>>(new Set());
  const [, mulai] = useTransition();
  const pertama = useRef(true);

  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    const ctrl = new AbortController();
    const kata = cari.trim();
    const t = setTimeout(
      async () => {
        setMemuat(true);
        try {
          const q = new URLSearchParams({ q: kata });
          if (hanyaAkses) q.set("akses", "1");
          const r = await fetch(`/api/admin/developer-api/pengguna?${q}`, { signal: ctrl.signal, cache: "no-store" });
          if (!r.ok) throw new Error(String(r.status));
          const d = (await r.json()) as { daftar: AkunPilihan[]; jumlahAkses: number };
          setDaftar(d.daftar);
          setJumlah(d.jumlahAkses);
        } catch (e) {
          if ((e as Error).name !== "AbortError") setPesan({ ok: false, teks: "Gagal memuat daftar akun. Coba lagi." });
        } finally {
          if (!ctrl.signal.aborted) setMemuat(false);
        }
      },
      kata ? 200 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [cari, hanyaAkses]);

  const ubah = (akun: AkunPilihan, aktif: boolean) => {
    const ganti = (v: boolean) => setDaftar((d) => d.map((x) => (x.id === akun.id ? { ...x, akses_api: v } : x)));
    ganti(aktif);
    setJumlah((n) => n + (aktif ? 1 : -1));
    setProses((s) => new Set(s).add(akun.id));
    setPesan(null);
    mulai(async () => {
      const h = await aturAksesAction(akun.id, aktif);
      if (!h.ok) {
        ganti(!aktif);
        setJumlah((n) => n - (aktif ? 1 : -1));
      }
      setPesan({ ok: h.ok, teks: h.pesan ?? (h.ok ? "Tersimpan." : "Gagal.") });
      setProses((s) => {
        const b = new Set(s);
        b.delete(akun.id);
        return b;
      });
    });
  };

  const kata = cari.trim();
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">Akses portal</h2>
          <p className="text-[12.5px] text-muted">Hanya akun yang dinyalakan di sini yang melihat menu Developer API di workspace-nya.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent sm:self-auto">
          <UsersRound className="size-3.5" aria-hidden />
          {jumlah.toLocaleString("id-ID")} punya akses
        </span>
      </div>

      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama atau email…"
            aria-label="Cari akun"
            autoComplete="off"
            className="field h-10 min-h-0 py-2 pr-9 pl-9 text-[13.5px]"
          />
          {memuat && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-faint" aria-hidden />}
        </div>
        <div role="radiogroup" aria-label="Saring akun" className="flex shrink-0 gap-1 self-start rounded-lg bg-subtle p-1 sm:self-auto">
          {SARING.map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={hanyaAkses === o.nilai}
              onClick={() => setHanyaAkses(o.nilai)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${hanyaAkses === o.nilai ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {pesan && (
        <p role="status" className={`border-b border-line px-4 py-2 text-[12.5px] sm:px-5 ${pesan.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {pesan.teks}
        </p>
      )}

      {daftar.length ? (
        <ul data-analitik-privat aria-busy={memuat} className={`divide-y divide-line transition-opacity ${memuat ? "opacity-60" : ""}`}>
          {daftar.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-subtle text-[12.5px] font-bold text-muted uppercase">{(u.nama || u.email).charAt(0)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold">{u.nama || u.email.split("@")[0]}</span>
                  {LABEL_PERAN[u.peran] && <span className="shrink-0 rounded bg-subtle px-1.5 py-px text-[10.5px] font-bold text-muted uppercase">{LABEL_PERAN[u.peran]}</span>}
                </span>
                <span className="block truncate text-[12px] text-muted">{u.email}</span>
              </span>
              <span className={`hidden text-[12px] font-medium sm:inline ${u.akses_api ? "text-accent" : "text-faint"}`}>{u.akses_api ? "Punya akses" : "Tanpa akses"}</span>
              <Saklar aktif={u.akses_api} onUbah={(v) => ubah(u, v)} disabled={proses.has(u.id)} label={`Akses Developer API untuk ${u.email}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-[13px] text-muted">
          {memuat ? "Memuat…" : kata ? `Tidak ada akun yang cocok dengan "${kata}".` : hanyaAkses ? "Belum ada akun yang diberi akses." : "Belum ada akun."}
        </p>
      )}
      {daftar.length >= BATAS && <p className="border-t border-line px-4 py-2.5 text-[12px] text-faint sm:px-5">Menampilkan {BATAS} akun teratas. Ketik nama atau email untuk mempersempit.</p>}
    </section>
  );
}

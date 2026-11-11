"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Globe, Loader2, Search, UserRound } from "lucide-react";
import { simpanFiturGlobalAction, simpanFiturPenggunaAction } from "@/app/actions-developer";
import Link from "@/components/link";
import { Pesan } from "@/components/ui";
import { FITUR_API, type FiturApi, fiturPerGrup } from "@/lib/api-def";

export interface EndpointRingkas {
  metode: string;
  jalur: string;
}

/** Akun yang sedang diatur di mode Per pengguna. */
export interface PenggunaFitur {
  id: number;
  email: string;
  nama: string;
  akses_api: boolean;
  /** true = akun ini punya daftar fitur khusus (`dibagikan`); false = ikut global. */
  khusus: boolean;
  /** Daftar global saat ini (pembanding & isi awal saat beralih ke "Atur khusus"). */
  global: FiturApi[];
}

const WARNA_METODE: Record<string, string> = {
  GET: "text-success",
  POST: "text-accent",
  PUT: "text-warning",
  PATCH: "text-warning",
  DELETE: "text-danger",
};

/**
 * Katalog fitur Developer API: developer internal mencentang fitur yang dibagikan ke developer luar. Hanya fitur yang
 * dicentang yang muncul di formulir pengajuan, bisa dibuka per aplikasi, dan ikut lisensi mesin self-host.
 *
 * Dengan `pengguna`: form yang sama untuk satu akun. "Ikuti global" = akun memakai daftar global; "Atur khusus" =
 * daftar centang ini menggantikan global untuk akun itu (boleh membuka fitur yang tidak dibagikan global, atau menutup
 * sebagian).
 */
export function FormFiturGlobal({
  dibagikan,
  pemakaian,
  endpoint,
  pengguna,
}: {
  dibagikan: FiturApi[];
  pemakaian: Record<string, number>;
  endpoint: Record<string, EndpointRingkas[]>;
  pengguna?: PenggunaFitur;
}) {
  const [hasil, aksi, menyimpan] = useActionState(pengguna ? simpanFiturPenggunaAction : simpanFiturGlobalAction, null);
  const [, mulai] = useTransition();
  const [mode, setMode] = useState<"global" | "khusus">(pengguna && !pengguna.khusus ? "global" : "khusus");
  const [pilih, setPilih] = useState<Set<string>>(() => new Set(dibagikan));
  const ikutGlobal = !!pengguna && mode === "global";
  // Mode "Ikuti global": tampilan memperlihatkan daftar global (terkunci).
  const tampil: ReadonlySet<string> = ikutGlobal ? new Set(pengguna!.global) : pilih;
  // Setelah disimpan, panel dimuat ulang (revalidatePath) dengan `dibagikan` baru: pembanding ikut segar sendiri.
  const awal = [...dibagikan].sort().join();
  const [cari, setCari] = useState("");
  const kunci = [...pilih].sort().join();
  const berubah = pengguna ? (pengguna.khusus ? mode === "global" || kunci !== awal : mode === "khusus") : kunci !== awal;
  const total = FITUR_API.length;
  const globalSet = useMemo(() => new Set(pengguna?.global ?? []), [pengguna?.global]);

  const q = cari.trim().toLowerCase();
  const grup = useMemo(
    () =>
      fiturPerGrup(
        q
          ? FITUR_API.filter((f) => `${f.label} ${f.kode} ${f.keterangan} ${(endpoint[f.kode] ?? []).map((e) => e.jalur).join(" ")}`.toLowerCase().includes(q)).map((f) => f.kode)
          : undefined,
      ),
    [q, endpoint],
  );
  const dicabut = pengguna ? [] : dibagikan.filter((f) => !pilih.has(f) && (pemakaian[f] ?? 0) > 0);

  const ubah = (kode: string, nyala: boolean) =>
    setPilih((s) => {
      const b = new Set(s);
      if (nyala) b.add(kode);
      else b.delete(kode);
      return b;
    });
  const ubahBanyak = (kode: readonly string[], nyala: boolean) =>
    setPilih((s) => {
      const b = new Set(s);
      for (const k of kode) if (nyala) b.add(k);
      else b.delete(k);
      return b;
    });
  const gantiMode = (m: "global" | "khusus") => {
    // Beralih ke "Atur khusus" dari global: mulai dari daftar global supaya tinggal menambah/mengurangi.
    if (m === "khusus" && mode === "global" && pengguna && !pengguna.khusus) setPilih(new Set(pengguna.global));
    setMode(m);
  };
  const namaAkun = pengguna ? pengguna.nama || pengguna.email.split("@")[0] : "";

  return (
    // Dikirim manual (bukan `action={aksi}`): React me-reset form setelah action, dan reset itu mengembalikan
    // tampilan checkbox terkendali ke keadaan awal walau `pilih` sudah benar.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        mulai(() => aksi(fd));
      }}
      className="card min-w-0"
    >
      {pengguna && (
        <>
          <input type="hidden" name="user_id" value={pengguna.id} />
          <input type="hidden" name="mode" value={mode} />
        </>
      )}
      {!ikutGlobal && [...pilih].map((k) => <input key={k} type="hidden" name="fitur" value={k} />)}
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          {pengguna ? (
            <>
              <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-bold">
                <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="truncate" data-analitik-privat>
                  Fitur untuk {namaAkun}
                </span>
              </h2>
              <p className="truncate text-[12.5px] text-muted" data-analitik-privat>
                {pengguna.email} ·{" "}
                <span className="font-semibold text-fg tabular-nums">
                  {tampil.size} dari {total}
                </span>{" "}
                fitur {ikutGlobal ? "(ikut global)" : "khusus akun ini"}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[15px] font-bold">Fitur yang dibagikan</h2>
              <p className="text-[12.5px] text-muted">
                <span className="font-semibold text-fg tabular-nums">
                  {pilih.size} dari {total}
                </span>{" "}
                fitur bisa diajukan developer luar dan ditarik lewat API di mesin self-host mereka. Berlaku untuk semua akun, kecuali yang diatur khusus.
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="relative block w-full sm:w-56">
            <span className="sr-only">Cari fitur</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari fitur / endpoint…" className="field pl-9" />
          </label>
          <button type="button" disabled={ikutGlobal} onClick={() => ubahBanyak(FITUR_API.map((f) => f.kode), true)} className="btn btn-ghost border border-line">
            Pilih semua
          </button>
          <button type="button" disabled={ikutGlobal} onClick={() => ubahBanyak(FITUR_API.map((f) => f.kode), false)} className="btn btn-ghost border border-line">
            Kosongkan
          </button>
        </div>
      </div>

      {pengguna && (
        <div className="flex flex-col gap-3 border-b border-line bg-subtle/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div role="radiogroup" aria-label="Sumber fitur akun ini" className="inline-flex self-start rounded-xl border border-line bg-surface p-0.5 text-[12.5px] font-semibold">
            {(["global", "khusus"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => gantiMode(m)}
                className={`rounded-lg px-3 py-1.5 transition-colors ${mode === m ? "bg-ink text-ink-fg" : "text-muted hover:text-fg"}`}
              >
                {m === "global" ? `Ikuti global (${pengguna.global.length})` : "Atur khusus"}
              </button>
            ))}
          </div>
          <p className="text-[12px] leading-snug text-muted sm:max-w-md sm:text-right">
            {ikutGlobal
              ? "Akun ini memakai daftar global. Pilih Atur khusus untuk membuka fitur tambahan atau menutup sebagian khusus untuk akun ini."
              : "Daftar ini menggantikan global untuk akun ini, termasuk fitur yang tidak dibagikan global."}
          </p>
        </div>
      )}
      {pengguna && !pengguna.akses_api && (
        <p className="flex items-start gap-1.5 border-b border-line bg-warning-soft px-4 py-2 text-[12.5px] text-warning sm:px-5">
          <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
          <span>
            Akun ini belum punya akses portal Developer API, jadi belum bisa mengajukan aplikasi. Nyalakan di tab{" "}
            <Link prefetch={false} href="/admin/developer-api?tab=akses" className="font-semibold underline">
              Akses pengguna
            </Link>
            .
          </span>
        </p>
      )}

      <div className="divide-y divide-line">
        {grup.length ? (
          grup.map((g) => {
            const kodeGrup = g.fitur.map((f) => f.kode);
            const nyala = kodeGrup.filter((k) => tampil.has(k)).length;
            const semua = nyala === kodeGrup.length;
            return (
              <section key={g.kode} aria-labelledby={`grup-${g.kode}`} className="px-4 py-4 sm:px-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={`grup-${g.kode}`} className="flex items-center gap-2 text-[13.5px] font-bold">
                      {g.label}
                      <span className={`rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums ${nyala ? "bg-accent-soft text-accent" : "bg-subtle text-muted"}`}>
                        {nyala}/{kodeGrup.length}
                      </span>
                    </h3>
                    <p className="text-[12px] text-muted">{g.keterangan}</p>
                  </div>
                  {!ikutGlobal && (
                    <button type="button" onClick={() => ubahBanyak(kodeGrup, !semua)} className="shrink-0 text-[12.5px] font-semibold text-accent hover:underline">
                      {semua ? "Kosongkan grup" : "Pilih semua grup"}
                    </button>
                  )}
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {g.fitur.map((f) => {
                    const cek = tampil.has(f.kode);
                    const pakai = pemakaian[f.kode] ?? 0;
                    const ep = endpoint[f.kode] ?? [];
                    // Per pengguna (Atur khusus): tandai beda dengan global.
                    const beda = pengguna && !ikutGlobal ? (cek && !globalSet.has(f.kode) ? "tambah" : !cek && globalSet.has(f.kode) ? "tutup" : null) : null;
                    return (
                      <label
                        key={f.kode}
                        className={`flex items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${ikutGlobal ? "cursor-default opacity-75" : "cursor-pointer"} ${cek ? "border-accent bg-accent-soft" : `border-line bg-surface ${ikutGlobal ? "" : "hover:bg-subtle"}`}`}
                      >
                        <input
                          type="checkbox"
                          checked={cek}
                          disabled={ikutGlobal}
                          onChange={(e) => ubah(f.kode, e.target.checked)}
                          className="centang mt-0.5"
                          aria-describedby={`ket-${f.kode}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[13.5px] font-semibold">{f.label}</span>
                            <code className="rounded bg-subtle px-1.5 py-px text-[11px] text-muted">{f.kode}</code>
                            {!pengguna && pakai > 0 && <span className="text-[11.5px] font-semibold text-muted">· dipakai {pakai.toLocaleString("id-ID")} aplikasi</span>}
                            {beda === "tambah" && <span className="rounded bg-success-soft px-1.5 py-px text-[10.5px] font-bold text-success uppercase">Di luar global</span>}
                            {beda === "tutup" && <span className="rounded bg-warning-soft px-1.5 py-px text-[10.5px] font-bold text-warning uppercase">Ditutup untuk akun ini</span>}
                          </span>
                          <span id={`ket-${f.kode}`} className="mt-0.5 block text-[12px] leading-snug text-muted">
                            {f.keterangan}
                          </span>
                          {ep.length > 0 && (
                            <span className="mt-2 flex flex-wrap gap-1">
                              {ep.map((e) => (
                                <span key={`${e.metode} ${e.jalur}`} className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10.5px]">
                                  <span className={`font-bold ${WARNA_METODE[e.metode] ?? "text-muted"}`}>{e.metode}</span>
                                  <span className="truncate text-muted">{e.jalur}</span>
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Tidak ada fitur yang cocok dengan &quot;{cari}&quot;.</p>
        )}
      </div>

      {/* Menempel di bawah layar saat menggulir; di HP di atas bilah navigasi bawah (sama seperti paket-custom.tsx). */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur [border-bottom-left-radius:inherit] [border-bottom-right-radius:inherit] sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:bottom-0">
        <div className="min-w-0 text-[12.5px]">
          {dicabut.length > 0 ? (
            <span className="flex items-start gap-1.5 text-warning">
              <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
              <span>
                Akses dicabut dari aplikasi aktif:{" "}
                {dicabut.map((k) => `${FITUR_API.find((f) => f.kode === k)?.label ?? k} (${(pemakaian[k] ?? 0).toLocaleString("id-ID")} aplikasi)`).join(", ")}. Pilihan per aplikasi tetap tersimpan.
              </span>
            </span>
          ) : berubah ? (
            <span className="text-muted">Ada perubahan yang belum disimpan.</span>
          ) : (
            <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
          )}
        </div>
        <button type="submit" disabled={menyimpan || !berubah} className="btn btn-primary">
          {menyimpan && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pengguna ? (ikutGlobal ? "Kembalikan ke global" : "Simpan untuk akun ini") : "Simpan & kirim ke mesin"}
        </button>
      </div>
    </form>
  );
}

/** Pilihan lingkup di tab Fitur: daftar global atau aturan per pengguna. */
export function LingkupFitur({ lingkup, jumlahKhusus }: { lingkup: "global" | "pengguna"; jumlahKhusus: number }) {
  const opsi = [
    { nilai: "global", label: "Global", ikon: Globe, href: "/admin/developer-api?tab=fitur" },
    { nilai: "pengguna", label: "Per pengguna", ikon: UserRound, href: "/admin/developer-api?tab=fitur&lingkup=pengguna", hitung: jumlahKhusus },
  ] as const;
  return (
    <nav aria-label="Lingkup fitur" className="inline-flex max-w-full gap-1 rounded-lg bg-subtle p-1">
      {opsi.map((o) => {
        const aktif = lingkup === o.nilai;
        const Ikon = o.ikon;
        return (
          <Link
            key={o.nilai}
            prefetch={false}
            href={o.href}
            aria-current={aktif ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${aktif ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
          >
            <Ikon className="size-3.5" aria-hidden />
            {o.label}
            {"hitung" in o && <span className={`tabular-nums ${aktif ? "text-accent" : "text-faint"}`}>{o.hitung.toLocaleString("id-ID")}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

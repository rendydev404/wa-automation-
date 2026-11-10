"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Copy, KeyRound, Loader2, LogOut, Trash2, Unplug, X } from "lucide-react";
import {
  adminBlokirAction,
  adminBuatAkunAction,
  adminCabutSesiAction,
  adminHapusAction,
  adminHapusPaketAction,
  adminAiAction,
  adminAiAkunAction,
  adminHentikanLanggananAction,
  adminPaketAction,
  adminBonusKuotaAction,
  adminKuotaAction,
  adminPengaturanAction,
  adminPeranAction,
  adminPutuskanWaAction,
  adminResetPasswordAction,
  setKanalTampilAction,
} from "@/app/actions";
import { LogoKanal } from "@/components/logo-kanal";
import { KursInfo } from "@/components/kurs-info";
import { type OpsiModel, PilihModel } from "@/components/pilih-model";
import { PilihOpsi } from "@/components/pilih-opsi";
import { Pesan, Saklar, SubmitButton, TombolKonfirmasi } from "@/components/ui";
import { type JenisKomisi, hitungKomisiPaket } from "@/lib/afiliasi-def";
import type { InfoKurs } from "@/lib/kurs-def";
import type { Peran } from "@/lib/peran";
import { KANAL_BAYAR, type KanalBayar } from "@/lib/harga";
import { MASA_ID } from "@/lib/jaminan-def";

const ULANG_PERCOBAAN = [
  { nilai: "sekali", judul: "Sekali per akun", isi: "Free trial: dihitung sejak akun dibuat. Kuota habis atau masa percobaan lewat = AI berhenti sampai pengguna memilih paket." },
  { nilai: "bulanan", judul: "Diperbarui tiap bulan", isi: "Kuota terisi lagi setiap tanggal 1 (WIB) selama akun belum berlangganan." },
] as const;

export function FormPengaturan({
  buka,
  kuota,
  percobaan,
  kurs,
}: {
  buka: boolean;
  kuota: number;
  percobaan: { balasan: number; ulang: "sekali" | "bulanan"; hari: number };
  kurs: InfoKurs;
}) {
  const [hasil, aksi, menyimpan] = useActionState(adminPengaturanAction, null);
  const [, mulai] = useTransition();
  const [aktif, setAktif] = useState(buka);
  const [balasan, setBalasan] = useState(String(percobaan.balasan));
  const [ulang, setUlang] = useState<"sekali" | "bulanan">(percobaan.ulang);
  const [hari, setHari] = useState(String(percobaan.hari));
  const n = Number(balasan);
  const h = Number(hari);
  const sahBalasan = balasan.trim() !== "" && Number.isInteger(n) && n >= 0;
  const sahHari = ulang === "bulanan" || (hari.trim() !== "" && Number.isInteger(h) && h >= 0 && h <= 365);
  const sah = sahBalasan && sahHari;
  return (
    // Dikirim lewat transisi (bukan action form) supaya isian tidak direset React setelah tersimpan.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        mulai(() => aksi(fd));
      }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13.5px] font-semibold">Pendaftaran publik</p>
          <p className="text-[12.5px] text-muted">{aktif ? "Siapa pun bisa daftar & langsung aktif." : "Hanya admin yang bisa membuat akun."}</p>
        </div>
        <Saklar aktif={aktif} onUbah={setAktif} label="Pendaftaran publik" />
        {aktif && <input type="hidden" name="pendaftaran" value="on" />}
      </div>
      <div>
        <label htmlFor="kuota_bawaan" className="label">
          Kuota nomor akun baru
        </label>
        <input id="kuota_bawaan" name="kuota_bawaan" type="number" min={0} max={100} defaultValue={kuota} required className="field" />
      </div>
      <fieldset className="space-y-3 rounded-2xl border border-line p-4">
        <legend className="px-1 text-[13.5px] font-semibold">Kuota gratis (free trial)</legend>
        <div>
          <label htmlFor="kuota_percobaan" className="label">
            Balasan AI gratis untuk akun tanpa paket
          </label>
          <div className="flex items-center gap-2">
            <input
              id="kuota_percobaan"
              name="kuota_percobaan"
              type="number"
              inputMode="numeric"
              min={0}
              max={1_000_000}
              value={balasan}
              onChange={(e) => setBalasan(e.target.value)}
              required
              className="field w-32"
            />
            <span className="text-[13px] text-muted">balasan AI</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">0 = tanpa free trial (bawaan): AI baru membalas pelanggan setelah berlangganan; sebagai gantinya ada jaminan uang kembali {MASA_ID}.</p>
        </div>
        <div role="radiogroup" aria-label="Kuota gratis berlaku" className="grid gap-2">
          {ULANG_PERCOBAAN.map((o) => (
            <label
              key={o.nilai}
              className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                ulang === o.nilai ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong"
              }`}
            >
              <input type="radio" name="kuota_percobaan_ulang" value={o.nilai} checked={ulang === o.nilai} onChange={() => setUlang(o.nilai)} className="bulat mt-0.5" />
              <span>
                <span className="block text-[13px] font-semibold">{o.judul}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{o.isi}</span>
              </span>
            </label>
          ))}
        </div>
        {ulang === "sekali" ? (
          <div>
            <label htmlFor="kuota_percobaan_hari" className="label">
              Masa percobaan
            </label>
            <div className="flex items-center gap-2">
              <input
                id="kuota_percobaan_hari"
                name="kuota_percobaan_hari"
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                value={hari}
                onChange={(e) => setHari(e.target.value)}
                required
                className="field w-32"
              />
              <span className="text-[13px] text-muted">hari sejak akun dibuat (0 = tanpa batas waktu)</span>
            </div>
          </div>
        ) : (
          // Mode bulanan tidak memakai masa percobaan; nilainya tetap disimpan apa adanya.
          <input type="hidden" name="kuota_percobaan_hari" value={hari} />
        )}
        <p className="hint" aria-live="polite">
          {!sahBalasan
            ? "Isi jumlah balasan dengan angka bulat 0 atau lebih."
            : !sahHari
              ? "Isi masa percobaan 0–365 hari."
              : n === 0
                ? "Tanpa kuota gratis: AI hanya membalas untuk akun yang berlangganan."
                : ulang === "bulanan"
                  ? `Akun tanpa paket mendapat ${n.toLocaleString("id-ID")} balasan AI setiap bulan. Berlaku langsung untuk semua akun tanpa paket.`
                  : `Akun tanpa paket mendapat ${n.toLocaleString("id-ID")} balasan AI${h > 0 ? ` yang berlaku ${h} hari sejak akun dibuat` : ", tanpa batas waktu"}; habis atau lewat masanya = harus memilih paket. Berlaku langsung untuk semua akun tanpa paket.`}
        </p>
      </fieldset>
      <KursInfo info={kurs} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={menyimpan || !sah} className="btn btn-primary">
          {menyimpan && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan aturan
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

const PILIHAN_PERAN = [
  { id: "user", label: "Pengguna" },
  { id: "developer", label: "Developer" },
  { id: "admin", label: "Admin" },
] as const;

/** Satu metode pembayaran: tampil/sembunyi di halaman bayar. `keterangan` = alasan tersembunyi (mis. ditolak Midtrans). */
export function SaklarKanal({ kanal, tampil: awal, keterangan }: { kanal: KanalBayar; tampil: boolean; keterangan: string }) {
  const [tampil, setTampil] = useState(awal);
  const [galat, setGalat] = useState("");
  const [menunggu, mulai] = useTransition();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <LogoKanal kanal={kanal} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{KANAL_BAYAR[kanal].label}</span>
        <span className={`block text-[12px] ${galat ? "text-danger" : tampil ? "text-muted" : "text-warning"}`}>{galat || (tampil ? "Tampil di halaman bayar" : keterangan)}</span>
      </span>
      <Saklar
        aktif={tampil}
        disabled={menunggu}
        label={`Tampilkan ${KANAL_BAYAR[kanal].label}`}
        onUbah={(v) =>
          mulai(async () => {
            setGalat("");
            const h = await setKanalTampilAction(kanal, v);
            if (h.ok) setTampil(v);
            else setGalat(h.pesan ?? "Gagal menyimpan.");
          })
        }
      />
    </li>
  );
}

/** `bolehStaf`: pilihan peran Admin/Developer hanya untuk admin (developer internal hanya bisa membuat akun pengguna). */
export function FormBuatAkun({ bolehStaf }: { bolehStaf: boolean }) {
  const [hasil, aksi] = useActionState(adminBuatAkunAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (hasil?.ok) ref.current?.reset();
  }, [hasil]);
  return (
    <form ref={ref} action={aksi} className="space-y-3">
      <input name="nama" aria-label="Nama" placeholder="Nama" required minLength={2} maxLength={60} className="field" />
      <input name="email" aria-label="Email" type="email" placeholder="Email" required className="field" />
      <input name="password" aria-label="Password awal" type="text" placeholder="Password awal (min. 10, huruf + angka)" required minLength={10} autoComplete="off" className="field" />
      <div className="grid grid-cols-2 gap-3">
        <PilihOpsi name="peran" nilai="user" opsi={bolehStaf ? PILIHAN_PERAN : PILIHAN_PERAN.slice(0, 1)} label="Peran" />
        <input name="kuota" aria-label="Kuota nomor" type="number" min={0} max={100} placeholder="Kuota (bawaan)" className="field" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton>Buat akun</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function FormKuota({ id, kuota, bawaan }: { id: number; kuota: number | null; bawaan: number }) {
  const [hasil, aksi] = useActionState(adminKuotaAction, null);
  return (
    <form action={aksi} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="kuota" className="label">
        Jumlah perangkat WhatsApp maksimal
      </label>
      <div className="flex gap-2">
        <input id="kuota" name="kuota" type="number" min={0} max={100} defaultValue={kuota ?? ""} placeholder={`Bawaan (${bawaan})`} className="field" />
        <SubmitButton>Simpan</SubmitButton>
      </div>
      <p className="text-[12px] text-muted">Kosongkan = ikut kuota bawaan. 0 = tidak boleh menambah nomor.</p>
      <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
    </form>
  );
}

/** Bonus balasan AI tanpa biaya: pilihan cepat + isian bebas. */
export function FormBonusKuota({ id }: { id: number }) {
  const [jumlah, setJumlah] = useState("");
  // Berhasil = isian dikosongkan (catatan ikut direset React setelah aksi form selesai).
  const [hasil, aksi] = useActionState(async (lalu: Awaited<ReturnType<typeof adminBonusKuotaAction>> | null, data: FormData) => {
    const h = await adminBonusKuotaAction(lalu, data);
    if (h.ok) setJumlah("");
    return h;
  }, null);
  return (
    <form action={aksi} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor="bonus-jumlah" className="label">
          Jumlah balasan AI
        </label>
        <div className="flex flex-wrap gap-1.5 pb-2">
          {[100, 500, 1000, 5000].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setJumlah(String(n))}
              className={`min-h-9 rounded-lg border px-3 text-[12px] font-semibold tabular-nums transition-colors sm:min-h-0 sm:py-1 ${jumlah === String(n) ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-subtle hover:text-fg"}`}
            >
              +{n.toLocaleString("id-ID")}
            </button>
          ))}
        </div>
        <input
          id="bonus-jumlah"
          name="jumlah"
          type="number"
          inputMode="numeric"
          min={1}
          max={1_000_000}
          required
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value)}
          placeholder="mis. 500"
          className="field"
        />
      </div>
      <div>
        <label htmlFor="bonus-catatan" className="label">
          Catatan <span className="font-normal text-muted">(opsional, ikut terlihat pengguna)</span>
        </label>
        <input id="bonus-catatan" name="catatan" maxLength={200} placeholder="mis. kompensasi gangguan 4 Nov" className="field" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Beri bonus</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

const PILIHAN_AI_AKUN = [
  { id: "", nama: "Ikuti Mesin AI" },
  { id: "hermes", nama: "Hermes" },
  { id: "anthropic", nama: "Claude API" },
] as const;

export function FormAiAkun({ id, penyedia, umum, adaKunci }: { id: number; penyedia: "hermes" | "anthropic" | null; umum: string; adaKunci: boolean }) {
  const [hasil, aksi] = useActionState(adminAiAkunAction, null);
  const [pilih, setPilih] = useState<string>(penyedia ?? "");
  return (
    <form action={aksi} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <fieldset className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
        <legend className="label">Penyedia AI untuk semua nomor akun ini</legend>
        {PILIHAN_AI_AKUN.map((p) => {
          const mati = p.id === "anthropic" && !adaKunci && penyedia !== "anthropic";
          return (
            <label
              key={p.id}
              className={`rounded-xl border px-2.5 py-2 text-center text-[12.5px] font-semibold transition-colors ${pilih === p.id ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-subtle"} ${mati ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <input type="radio" name="penyedia" value={p.id} checked={pilih === p.id} onChange={() => setPilih(p.id)} disabled={mati} className="sr-only" />
              {p.nama}
            </label>
          );
        })}
      </fieldset>
      <p className="text-[12px] text-muted">
        {pilih === ""
          ? `Mengikuti pengaturan umum di Mesin AI: ${umum}.`
          : pilih === "anthropic"
            ? "Selalu Claude API (model utama & cadangan dari Mesin AI), apa pun paketnya. Bila Claude gagal, Hermes yang menjawab."
            : "Selalu Hermes, apa pun paketnya."}
      </p>
      {!adaKunci && <p className="text-[12px] text-muted">Claude API bisa dipilih setelah developer memasang ANTHROPIC_API_KEY di server.</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton>Simpan</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function FormBlokir({ id, diblokir, alasan }: { id: number; diblokir: boolean; alasan: string | null }) {
  const [hasil, aksi] = useActionState(adminBlokirAction, null);
  return (
    <form action={aksi} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="blokir" value={diblokir ? "0" : "1"} />
      {diblokir ? (
        <p className="text-[13px] text-muted">
          Diblokir{alasan ? `: “${alasan}”` : "."} Pengguna tidak bisa masuk dan AI tidak membalas di nomornya.
        </p>
      ) : (
        <>
          <label htmlFor="alasan" className="label">
            Alasan blokir (ditampilkan ke pengguna saat login)
          </label>
          <input id="alasan" name="alasan" maxLength={200} placeholder="mis. Mengirim spam" className="field" />
        </>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton className={diblokir ? "btn btn-primary" : "btn bg-danger text-white hover:opacity-90"}>{diblokir ? "Buka blokir" : "Blokir akun"}</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function AksiAkun({
  id,
  nama = "",
  email = "",
  jumlahNomor = 0,
  peran,
  pelakuAdmin,
  diriSendiri,
}: {
  id: number;
  nama?: string;
  email?: string;
  jumlahNomor?: number;
  /** Peran akun yang sedang dilihat. */
  peran: Peran;
  /** Yang membuka halaman ini admin (bukan developer): hanya admin yang boleh mengatur peran & mengubah akun admin. */
  pelakuAdmin: boolean;
  diriSendiri: boolean;
}) {
  const [pw, setPw] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  const jalankan = (fn: () => Promise<{ ok: boolean; pesan?: string }>) =>
    mulai(async () => {
      const h = await fn();
      setPesan({ ok: h.ok, teks: h.pesan ?? (h.ok ? "Selesai." : "Gagal.") });
    });

  if (peran === "admin" && !pelakuAdmin) {
    return <p className="text-[13px] text-muted">Akun admin hanya bisa diubah oleh admin.</p>;
  }

  return (
    <div className="space-y-3">
      {pelakuAdmin && !diriSendiri && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-muted">Peran</span>
          <div role="radiogroup" aria-label="Peran akun" className="inline-flex rounded-xl border border-line p-0.5">
            {PILIHAN_PERAN.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={peran === p.id}
                disabled={tunggu || peran === p.id}
                className={`rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${peran === p.id ? "bg-ink text-ink-signal" : "text-muted hover:bg-subtle"}`}
                onClick={() => jalankan(() => adminPeranAction(id, p.id))}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={tunggu}
          className="btn btn-ghost border border-line"
          onClick={() =>
            mulai(async () => {
              const h = await adminResetPasswordAction(id);
              if (h.ok && h.password) setPw(h.password);
              setPesan(h.ok ? { ok: true, teks: "Password lama tidak berlaku lagi; semua sesi dicabut." } : { ok: false, teks: h.pesan ?? "Gagal." });
            })
          }
        >
          <KeyRound className="size-4" aria-hidden /> Reset password
        </button>
        <button type="button" disabled={tunggu} className="btn btn-ghost border border-line" onClick={() => jalankan(() => adminCabutSesiAction(id))}>
          <LogOut className="size-4" aria-hidden /> Keluarkan dari semua perangkat
        </button>
        {!diriSendiri && email && <TombolHapusPengguna id={id} nama={nama} email={email} jumlahNomor={jumlahNomor} alihkan mode="tombol" />}
        {tunggu && <Loader2 className="size-4 animate-spin self-center text-muted" aria-hidden />}
      </div>
      {pw && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-[13px]">
          <p className="font-semibold text-warning">Password sementara (hanya tampil sekali):</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="rounded-lg bg-surface px-2.5 py-1.5 font-mono text-[13px] select-all">{pw}</code>
            <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(pw)} aria-label="Salin password">
              <Copy className="size-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1.5 text-muted">Berikan ke pengguna lewat jalur aman, lalu minta ia menggantinya di halaman Akun saya.</p>
        </div>
      )}
      {pesan && <Pesan ok={pesan.ok}>{pesan.teks}</Pesan>}
    </div>
  );
}

export function PutuskanWa({ id, jumlah }: { id: number; jumlah: number }) {
  if (!jumlah) return null;
  return (
    <TombolKonfirmasi
      label="Putuskan semua WhatsApp"
      tanya={`Cabut ${jumlah} perangkat tertaut?`}
      ya="Putuskan"
      className="btn btn-ghost border border-line"
      ikon={<Unplug className="size-4" aria-hidden />}
      aksi={() => adminPutuskanWaAction(id)}
    />
  );
}

/**
 * Tombol + dialog modal konfirmasi kustom untuk menghapus pengguna (baik dari tabel daftar pengguna
 * maupun dari halaman detail pengguna).
 */
export function TombolHapusPengguna({
  id,
  nama,
  email,
  jumlahNomor,
  alihkan = false,
  mode = "baris",
}: {
  id: number;
  nama: string;
  email: string;
  jumlahNomor: number;
  alihkan?: boolean;
  mode?: "baris" | "tombol";
}) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState("");
  const [tunggu, mulai] = useTransition();

  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !tunggu) setBuka(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buka, tunggu]);

  return (
    <>
      {mode === "baris" ? (
        <button
          type="button"
          onClick={() => {
            setGalat("");
            setBuka(true);
          }}
          data-analitik="Hapus pengguna"
          aria-label={`Hapus pengguna ${email}`}
          title={`Hapus ${email}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Hapus</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setGalat("");
            setBuka(true);
          }}
          className="btn btn-ghost border border-danger/30 text-danger hover:bg-danger-soft"
        >
          <Trash2 className="size-4" aria-hidden />
          Hapus pengguna
        </button>
      )}

      {buka && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`judul-hapus-${id}`}
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4 text-left"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !tunggu) setBuka(false);
          }}
        >
          <div className="card max-h-[calc(100svh-2rem)] w-full max-w-md animate-masuk overflow-y-auto border border-line bg-surface p-5 shadow-pop sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
                  <AlertTriangle className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 id={`judul-hapus-${id}`} className="text-[16px] font-bold text-fg">
                    Hapus Pengguna?
                  </h3>
                  <p className="text-[12.5px] text-muted">Tindakan ini permanen dan tidak bisa dibatalkan.</p>
                </div>
              </div>
              <button
                type="button"
                disabled={tunggu}
                onClick={() => setBuka(false)}
                aria-label="Tutup dialog"
                className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-fg"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div data-analitik-privat className="mt-4 rounded-xl border border-line bg-subtle/60 p-3.5 text-[13px]">
              <p className="truncate font-semibold text-fg">{nama || "(tanpa nama)"}</p>
              <p className="truncate font-mono text-[12px] text-muted">{email}</p>
              <p className="mt-1.5 text-[12px] text-muted">
                Perangkat terkait: <span className="font-semibold text-fg">{jumlahNomor} nomor WhatsApp</span>
              </p>
            </div>

            <p className="mt-3.5 text-[12.5px] leading-relaxed text-muted">
              Semua sesi WhatsApp tertaut akan dicabut, dan seluruh data nomor, knowledge base, katalog produk, serta histori percakapan akun ini akan dihapus permanen.
            </p>

            {galat && (
              <div className="mt-3">
                <Pesan ok={false}>{galat}</Pesan>
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" disabled={tunggu} onClick={() => setBuka(false)} className="btn btn-ghost border border-line">
                Batal
              </button>
              <button
                type="button"
                disabled={tunggu}
                onClick={() =>
                  mulai(async () => {
                    const h = await adminHapusAction(id, email, alihkan);
                    if (h && !h.ok) {
                      setGalat(h.pesan ?? "Gagal menghapus pengguna.");
                    } else {
                      setBuka(false);
                    }
                  })
                }
                className="btn bg-danger text-white hover:opacity-90"
              >
                {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                Ya, hapus permanen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function HapusAkun({ id, nama = "", email, jumlahNomor = 0 }: { id: number; nama?: string; email: string; jumlahNomor?: number }) {
  const [ketik, setKetik] = useState("");
  const [galat, setGalat] = useState("");
  const [tunggu, mulai] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TombolHapusPengguna id={id} nama={nama} email={email} jumlahNomor={jumlahNomor} alihkan mode="tombol" />
      </div>
      <div className="border-t border-line pt-3">
        <label htmlFor="konfirmasi-hapus" className="label [overflow-wrap:anywhere]">
          Atau ketik <span className="font-mono">{email}</span> untuk menghapus langsung
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="konfirmasi-hapus" value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder={email} autoComplete="off" className="field" />
          <button
            type="button"
            disabled={tunggu || ketik.trim().toLowerCase() !== email}
            className="btn bg-danger text-white hover:opacity-90"
            onClick={() =>
              mulai(async () => {
                const h = await adminHapusAction(id, ketik, true);
                if (h && !h.ok) setGalat(h.pesan ?? "Gagal.");
              })
            }
          >
            {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Hapus akun & semua nomornya
          </button>
        </div>
        {galat && (
          <div className="mt-2">
            <Pesan ok={false}>{galat}</Pesan>
          </div>
        )}
      </div>
    </div>
  );
}

export function FormAi({
  penyedia,
  model,
  cadangan,
  adaKunci,
  opsi,
}: {
  penyedia: "hermes" | "anthropic" | "per_paket";
  model: string;
  cadangan: string;
  adaKunci: boolean;
  /** Model dari akun Anthropic (atau saran bila kunci belum ada) beserta biaya per balasan dari tarif resmi × kurs. */
  opsi: OpsiModel[];
}) {
  const [hasil, aksi] = useActionState(adminAiAction, null);
  const [pilih, setPilih] = useState(penyedia);
  return (
    <form action={aksi} className="space-y-4">
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <legend className="label">Penyedia untuk semua nomor</legend>
        {(["hermes", "anthropic", "per_paket"] as const).map((p) => (
          <label
            key={p}
            className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${pilih === p ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-subtle"} ${p !== "hermes" && !adaKunci ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <input type="radio" name="penyedia" value={p} checked={pilih === p} onChange={() => setPilih(p)} disabled={p !== "hermes" && !adaKunci} className="sr-only" />
            {p === "hermes" ? "Hermes (utama)" : p === "anthropic" ? "Claude API (Anthropic)" : "Otomatis menurut paket"}
          </label>
        ))}
      </fieldset>
      {!adaKunci && <p className="text-[12px] text-muted">Claude API dan mode otomatis bisa dipilih setelah developer memasang ANTHROPIC_API_KEY di server.</p>}
      {pilih === "per_paket" && (
        <ul className="space-y-1.5 rounded-xl bg-subtle/60 p-3 text-[12.5px] text-muted">
          <li>
            <span className="font-semibold text-fg">Akun trial / gratis</span> (tanpa paket aktif): dijawab Hermes.
          </li>
          <li>
            <span className="font-semibold text-fg">Akun berbayar</span> (paket masih aktif): dijawab Claude API dengan model di bawah.
          </li>
          <li>
            <span className="font-semibold text-fg">Cadangan:</span> bila Claude gagal atau sedang sibuk, dicoba model cadangan dulu, lalu Hermes. Pelanggan tidak sampai tidak dibalas.
          </li>
          <li>Paket yang habis masa aktifnya otomatis kembali ke Hermes (perubahan terbaca dalam ±1 menit).</li>
        </ul>
      )}
      <div className={pilih !== "hermes" ? "space-y-3" : "hidden"}>
        <div>
          <label htmlFor="model-ai" className="label">
            Model utama
          </label>
          <PilihModel id="model-ai" name="model" nilai={model} opsi={opsi} label="Model utama" />
        </div>
        <div>
          <label htmlFor="cadangan-ai" className="label">
            Model cadangan (dipakai otomatis bila model utama sedang sibuk/gagal)
          </label>
          <PilihModel id="cadangan-ai" name="cadangan" nilai={cadangan} opsi={opsi} kosong="Tanpa cadangan" label="Model cadangan" />
        </div>
      </div>
      <p className="text-[12px] text-muted">Berlaku langsung untuk balasan berikutnya. Koneksi WhatsApp tidak terganggu. Coba dulu lewat &quot;Uji bot&quot; di halaman nomor.</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton>Simpan</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}


// ---------- Paket langganan ----------

export interface PaketForm {
  id: number;
  kode: string;
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
  deskripsi: string;
  aktif: boolean;
  unggulan: boolean;
  urutan: number;
  komisi_jenis: JenisKomisi;
  komisi_nilai: number;
}

/** Satu formulir untuk membuat (tanpa `paket`) atau mengubah paket. */
export function FormPaket({ paket }: { paket?: PaketForm }) {
  const [hasil, aksi] = useActionState(adminPaketAction, null);
  const p = paket;
  const [jenisKomisi, setJenisKomisi] = useState<JenisKomisi>(p?.komisi_jenis ?? "persen");
  const [nilaiKomisi, setNilaiKomisi] = useState<string>(String(p?.komisi_nilai ?? 20));
  const [hargaTeks, setHargaTeks] = useState<string>(String(p?.harga ?? ""));
  const hargaAngka = Number(hargaTeks.replace(/[^\d]/g, "")) || 0;
  const nilaiAngka = Number(nilaiKomisi.replace(/[^\d]/g, "")) || 0;
  const perkiraanKomisi = hitungKomisiPaket(hargaAngka, jenisKomisi, nilaiAngka);
  const kolom = "field text-[13px]";
  return (
    <form action={aksi} className="space-y-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Nama paket</span>
          <input name="nama" aria-label="Nama paket" placeholder="Nama paket" defaultValue={p?.nama} required maxLength={40} className={kolom} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Harga (Rp)</span>
          <input name="harga" aria-label="Harga (Rp)" placeholder="Harga (Rp)" inputMode="numeric" value={hargaTeks} onChange={(e) => setHargaTeks(e.target.value)} required className={kolom} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Durasi (hari)</span>
          <input name="durasi_hari" aria-label="Durasi (hari)" placeholder="Durasi (hari)" inputMode="numeric" defaultValue={p?.durasi_hari ?? 30} required className={kolom} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Kuota nomor</span>
          <input name="kuota_nomor" aria-label="Kuota nomor" placeholder="Kuota nomor" inputMode="numeric" defaultValue={p?.kuota_nomor} required className={kolom} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Kuota balasan AI</span>
          <input name="kuota_balasan" aria-label="Kuota balasan AI" placeholder="Kuota balasan AI" inputMode="numeric" defaultValue={p?.kuota_balasan} required className={kolom} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Urutan tampil</span>
          <input name="urutan" aria-label="Urutan tampil" placeholder="Urutan" inputMode="numeric" defaultValue={p?.urutan ?? 0} className={kolom} />
        </label>
      </div>
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold">Komisi afiliasi paket ini</span>
          <div role="radiogroup" aria-label="Jenis komisi afiliasi" className="inline-flex rounded-lg border border-line bg-subtle p-0.5 text-[12px] font-semibold">
            <button
              type="button"
              role="radio"
              aria-checked={jenisKomisi === "persen"}
              onClick={() => setJenisKomisi("persen")}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${jenisKomisi === "persen" ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              Persentase (%)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={jenisKomisi === "rupiah"}
              onClick={() => setJenisKomisi("rupiah")}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${jenisKomisi === "rupiah" ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              Nominal (Rp)
            </button>
          </div>
          <input type="hidden" name="komisi_jenis" value={jenisKomisi} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <div className="relative w-44">
            {jenisKomisi === "rupiah" && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[12.5px] font-semibold text-muted">Rp</span>}
            <input
              name="komisi_nilai"
              aria-label="Nilai komisi afiliasi"
              inputMode="numeric"
              value={nilaiKomisi}
              onChange={(e) => setNilaiKomisi(e.target.value.replace(/[^\d]/g, ""))}
              required
              className={`${kolom} tabular-nums ${jenisKomisi === "rupiah" ? "pl-8" : "pr-8"}`}
            />
            {jenisKomisi === "persen" && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12.5px] font-semibold text-muted">%</span>}
          </div>
          <span className="text-[12px] text-muted tabular-nums">
            {nilaiAngka <= 0
              ? "0 = paket ini tidak memberi komisi afiliasi."
              : hargaAngka > 0
                ? `Afiliator menerima Rp${perkiraanKomisi.toLocaleString("id-ID")} per pembelian.`
                : jenisKomisi === "persen"
                  ? `Afiliator menerima ${nilaiAngka}% dari harga beli.`
                  : `Afiliator menerima Rp${nilaiAngka.toLocaleString("id-ID")} per pembelian.`}
          </span>
        </div>
      </div>
      <input name="deskripsi" aria-label="Deskripsi singkat" placeholder="Deskripsi singkat" defaultValue={p?.deskripsi} maxLength={200} className={kolom} />
      {!p && <input name="kode" aria-label="Kode (opsional)" placeholder="Kode unik (opsional, mis. bisnis-tahunan)" className={kolom} />}
      <div className="flex flex-wrap items-center gap-4 text-[13px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="aktif" defaultChecked={p?.aktif ?? true} className="centang" /> Dijual
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="unggulan" defaultChecked={p?.unggulan} className="centang" /> Tandai &quot;paling banyak dipilih&quot;
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SubmitButton>{p ? "Simpan paket" : "Buat paket"}</SubmitButton>
          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        </div>
        {p && (
          <TombolKonfirmasi
            label="Hapus paket"
            tanya={`Hapus paket "${p.nama}"? Pelanggan yang sedang aktif tetap aman.`}
            ya="Ya, hapus"
            className="btn btn-ghost border border-line text-danger hover:bg-danger-soft"
            ikon={<Trash2 className="size-4" aria-hidden />}
            aksi={() => adminHapusPaketAction(p.id)}
          />
        )}
      </div>
    </form>
  );
}

// ---------- Langganan per pengguna ----------

export function HentikanLangganan({ id }: { id: number }) {
  return (
    <TombolKonfirmasi
      label="Hentikan langganan"
      tanya="Kembali ke kuota gratis?"
      ya="Hentikan"
      className="btn btn-ghost border border-line text-danger"
      aksi={() => adminHentikanLanggananAction(id)}
    />
  );
}

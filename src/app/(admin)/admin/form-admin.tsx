"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Copy, KeyRound, Loader2, LogOut, Unplug } from "lucide-react";
import {
  adminBlokirAction,
  adminBuatAkunAction,
  adminCabutSesiAction,
  adminHapusAction,
  adminAiAction,
  adminAiAkunAction,
  adminBerikanPaketAction,
  adminHentikanLanggananAction,
  adminPaketAction,
  adminKuotaAction,
  adminPengaturanAction,
  adminPeranAction,
  adminPutuskanWaAction,
  adminResetPasswordAction,
} from "@/app/actions";
import { KursInfo } from "@/components/kurs-info";
import { Pesan, Saklar, SubmitButton, TombolKonfirmasi } from "@/components/ui";
import type { InfoKurs } from "@/lib/kurs-def";

export function FormPengaturan({ buka, kuota, balasan, kurs }: { buka: boolean; kuota: number; balasan: number; kurs: InfoKurs }) {
  const [hasil, aksi] = useActionState(adminPengaturanAction, null);
  const [aktif, setAktif] = useState(buka);
  return (
    <form action={aksi} className="space-y-4">
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
      <div>
        <label htmlFor="kuota_balasan_gratis" className="label">
          Kuota balasan AI gratis per bulan (akun tanpa paket)
        </label>
        <input id="kuota_balasan_gratis" name="kuota_balasan_gratis" type="number" min={0} defaultValue={balasan} required className="field" />
      </div>
      <KursInfo info={kurs} />
      <div className="flex items-center gap-3">
        <SubmitButton>Simpan aturan</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function FormBuatAkun() {
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
        <select name="peran" aria-label="Peran" className="field">
          <option value="user">Pengguna</option>
          <option value="admin">Admin</option>
        </select>
        <input name="kuota" aria-label="Kuota nomor" type="number" min={0} max={100} placeholder="Kuota (bawaan)" className="field" />
      </div>
      <div className="flex items-center gap-3">
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
      <fieldset className="grid grid-cols-3 gap-2">
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
      <div className="flex items-center gap-3">
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
      <div className="flex items-center gap-3">
        <SubmitButton className={diblokir ? "btn btn-primary" : "btn bg-danger text-white hover:opacity-90"}>{diblokir ? "Buka blokir" : "Blokir akun"}</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function AksiAkun({ id, admin, diriSendiri }: { id: number; admin: boolean; diriSendiri: boolean }) {
  const [pw, setPw] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  const jalankan = (fn: () => Promise<{ ok: boolean; pesan?: string }>) =>
    mulai(async () => {
      const h = await fn();
      setPesan({ ok: h.ok, teks: h.pesan ?? (h.ok ? "Selesai." : "Gagal.") });
    });

  return (
    <div className="space-y-3">
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
        {!diriSendiri && (
          <button type="button" disabled={tunggu} className="btn btn-ghost border border-line" onClick={() => jalankan(() => adminPeranAction(id, admin ? "user" : "admin"))}>
            {admin ? "Jadikan pengguna biasa" : "Jadikan admin"}
          </button>
        )}
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

export function HapusAkun({ id, email }: { id: number; email: string }) {
  const [ketik, setKetik] = useState("");
  const [galat, setGalat] = useState("");
  const [tunggu, mulai] = useTransition();
  return (
    <div className="space-y-3">
      <label htmlFor="konfirmasi-hapus" className="label">
        Ketik <span className="font-mono">{email}</span> untuk menghapus
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="konfirmasi-hapus" value={ketik} onChange={(e) => setKetik(e.target.value)} autoComplete="off" className="field" />
        <button
          type="button"
          disabled={tunggu || ketik.trim().toLowerCase() !== email}
          className="btn bg-danger text-white hover:opacity-90"
          onClick={() =>
            mulai(async () => {
              const h = await adminHapusAction(id, ketik);
              if (h && !h.ok) setGalat(h.pesan ?? "Gagal.");
            })
          }
        >
          {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Hapus akun & semua nomornya
        </button>
      </div>
      {galat && <Pesan ok={false}>{galat}</Pesan>}
    </div>
  );
}

/** Model yang disarankan bila daftar dari Anthropic belum bisa diambil (kunci belum diisi). */
const MODEL_SARAN = [
  { id: "claude-haiku-5-5", nama: "Claude Haiku 5.5 — cepat & murah" },
  { id: "claude-sonnet-5-5", nama: "Claude Sonnet 5.5 — lebih pintar" },
];

export function FormAi({
  penyedia,
  model,
  cadangan,
  adaKunci,
  daftarModel,
  biaya,
}: {
  penyedia: "hermes" | "anthropic" | "per_paket";
  model: string;
  cadangan: string;
  adaKunci: boolean;
  /** Dari Anthropic (GET /v1/models) bila kunci sah; null = belum ada kunci / tak terjangkau. */
  daftarModel: { id: string; nama: string }[] | null;
  /** Perkiraan biaya per balasan (Rp) dari tarif resmi + profil token nyata; model tanpa tarif tidak tercantum. */
  biaya: Record<string, number>;
}) {
  const [hasil, aksi] = useActionState(adminAiAction, null);
  const [pilih, setPilih] = useState(penyedia);
  const opsi = (daftarModel?.length ? daftarModel : MODEL_SARAN).map((m) => ({
    ...m,
    nama: biaya[m.id] !== undefined ? `${m.nama} · ±Rp${biaya[m.id].toLocaleString("id-ID")}/balasan` : m.nama,
  }));
  const pilihan = (nilai: string) => (opsi.some((m) => m.id === nilai) || !nilai ? opsi : [{ id: nilai, nama: nilai }, ...opsi]);
  return (
    <form action={aksi} className="space-y-4">
      <fieldset className="grid gap-2 sm:grid-cols-3">
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
          <select id="model-ai" name="model" defaultValue={model} className="field">
            {pilihan(model).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cadangan-ai" className="label">
            Model cadangan (dipakai otomatis bila model utama sedang sibuk/gagal)
          </label>
          <select id="cadangan-ai" name="cadangan" defaultValue={cadangan} className="field">
            <option value="">Tanpa cadangan</option>
            {pilihan(cadangan).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[12px] text-muted">Berlaku langsung untuk balasan berikutnya. Koneksi WhatsApp tidak terganggu. Coba dulu lewat &quot;Uji bot&quot; di halaman nomor.</p>
      <div className="flex items-center gap-3">
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
}

/** Satu formulir untuk membuat (tanpa `paket`) atau mengubah paket. */
export function FormPaket({ paket }: { paket?: PaketForm }) {
  const [hasil, aksi] = useActionState(adminPaketAction, null);
  const p = paket;
  const kolom = "field text-[13px]";
  return (
    <form action={aksi} className="space-y-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-2 gap-2">
        <input name="nama" aria-label="Nama paket" placeholder="Nama paket" defaultValue={p?.nama} required maxLength={40} className={kolom} />
        <input name="harga" aria-label="Harga (Rp)" placeholder="Harga (Rp)" inputMode="numeric" defaultValue={p?.harga} required className={kolom} />
        <input name="durasi_hari" aria-label="Durasi (hari)" placeholder="Durasi (hari)" inputMode="numeric" defaultValue={p?.durasi_hari ?? 30} required className={kolom} />
        <input name="kuota_nomor" aria-label="Kuota nomor" placeholder="Kuota nomor" inputMode="numeric" defaultValue={p?.kuota_nomor} required className={kolom} />
        <input name="kuota_balasan" aria-label="Kuota balasan AI" placeholder="Kuota balasan AI" inputMode="numeric" defaultValue={p?.kuota_balasan} required className={kolom} />
        <input name="urutan" aria-label="Urutan tampil" placeholder="Urutan" inputMode="numeric" defaultValue={p?.urutan ?? 0} className={kolom} />
      </div>
      <input name="deskripsi" aria-label="Deskripsi singkat" placeholder="Deskripsi singkat" defaultValue={p?.deskripsi} maxLength={200} className={kolom} />
      {!p && <input name="kode" aria-label="Kode (opsional)" placeholder="Kode unik (opsional, mis. bisnis-tahunan)" className={kolom} />}
      <div className="flex flex-wrap items-center gap-4 text-[13px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="aktif" defaultChecked={p?.aktif ?? true} className="size-4 accent-[var(--c-accent)]" /> Dijual
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="unggulan" defaultChecked={p?.unggulan} className="size-4 accent-[var(--c-accent)]" /> Tandai &quot;paling banyak dipilih&quot;
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>{p ? "Simpan paket" : "Buat paket"}</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}


// ---------- Langganan per pengguna ----------

export function FormBerikanPaket({ id, paket }: { id: number; paket: { id: number; nama: string; durasi_hari: number }[] }) {
  const [hasil, aksi] = useActionState(adminBerikanPaketAction, null);
  return (
    <form action={aksi} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <select name="paket" aria-label="Paket" required className="field">
          {paket.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama} ({p.durasi_hari} hari)
            </option>
          ))}
        </select>
        <input name="hari" aria-label="Jumlah hari (opsional)" placeholder="Hari" inputMode="numeric" className="field" />
      </div>
      <p className="text-[12px] text-muted">Untuk pembayaran di luar Midtrans atau kompensasi. Hari kosong = durasi paket.</p>
      <div className="flex items-center gap-3">
        <SubmitButton>Berikan paket</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

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

/** Teks yang bisa disalin dengan satu klik (mis. URL notifikasi Midtrans). */
export function SalinTeks({ teks, label }: { teks: string; label: string }) {
  return (
    <div className="flex gap-2">
      <code tabIndex={0} className="field flex-1 overflow-x-auto font-mono text-[12px] whitespace-nowrap select-all">{teks}</code>
      <button type="button" className="btn btn-ghost border border-line" onClick={() => navigator.clipboard?.writeText(teks)} aria-label={label}>
        <Copy className="size-4" aria-hidden />
      </button>
    </div>
  );
}

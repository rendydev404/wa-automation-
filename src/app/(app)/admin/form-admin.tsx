"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Copy, KeyRound, Loader2, LogOut, Unplug } from "lucide-react";
import {
  adminBlokirAction,
  adminBuatAkunAction,
  adminCabutSesiAction,
  adminHapusAction,
  adminAiAction,
  adminKunciAiAction,
  adminKuotaAction,
  adminPengaturanAction,
  adminPeranAction,
  adminPutuskanWaAction,
  adminResetPasswordAction,
} from "@/app/actions";
import { Pesan, Saklar, SubmitButton, TombolKonfirmasi } from "@/components/ui";

export function FormPengaturan({ buka, kuota }: { buka: boolean; kuota: number }) {
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
  { id: "claude-haiku-5-5", nama: "Claude Haiku 5.5 — cepat & murah (±Rp14/balasan)" },
  { id: "claude-sonnet-5-5", nama: "Claude Sonnet 5.5 — lebih pintar (±Rp200/balasan)" },
];

export function FormAi({
  penyedia,
  model,
  cadangan,
  adaKunci,
  daftarModel,
}: {
  penyedia: "hermes" | "anthropic";
  model: string;
  cadangan: string;
  adaKunci: boolean;
  /** Dari Anthropic (GET /v1/models) bila kunci sah; null = belum ada kunci / tak terjangkau. */
  daftarModel: { id: string; nama: string }[] | null;
}) {
  const [hasil, aksi] = useActionState(adminAiAction, null);
  const [pilih, setPilih] = useState(penyedia);
  const opsi = daftarModel?.length ? daftarModel : MODEL_SARAN;
  const pilihan = (nilai: string) => (opsi.some((m) => m.id === nilai) || !nilai ? opsi : [{ id: nilai, nama: nilai }, ...opsi]);
  return (
    <form action={aksi} className="space-y-4">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="label">Penyedia untuk semua nomor</legend>
        {(["hermes", "anthropic"] as const).map((p) => (
          <label
            key={p}
            className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${pilih === p ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-subtle"} ${p === "anthropic" && !adaKunci ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <input type="radio" name="penyedia" value={p} checked={pilih === p} onChange={() => setPilih(p)} disabled={p === "anthropic" && !adaKunci} className="sr-only" />
            {p === "hermes" ? "Hermes (utama)" : "Claude API (Anthropic)"}
          </label>
        ))}
      </fieldset>
      {!adaKunci && <p className="text-[12px] text-muted">Claude API bisa dipilih setelah API key Anthropic diisi di bawah.</p>}
      <div className={pilih === "anthropic" ? "space-y-3" : "hidden"}>
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

/** API key Anthropic: hanya bentuk samaran yang pernah sampai ke browser. */
export function FormKunciAi({ samaran }: { samaran: string | null }) {
  const [hasil, aksi] = useActionState(adminKunciAiAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (hasil?.ok) ref.current?.reset();
  }, [hasil]);
  return (
    <form ref={ref} action={aksi} className="space-y-3">
      <label htmlFor="kunci-ai" className="label">
        API key Anthropic {samaran && <span className="font-mono font-normal text-muted">· tersimpan: {samaran}</span>}
      </label>
      <input
        id="kunci-ai"
        name="kunci"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={samaran ? "Isi untuk mengganti kunci" : "sk-ant-..."}
        className="field font-mono text-[12.5px]"
      />
      <p className="text-[12px] text-muted">Dicek dulu ke Anthropic, lalu disimpan terenkripsi. Buat di Claude Console → API Keys, dan pasang Spend limits di sana.</p>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{samaran ? "Ganti kunci" : "Simpan kunci"}</SubmitButton>
        {samaran && (
          <button type="submit" name="hapus" value="1" formNoValidate className="btn btn-ghost border border-line text-danger">
            Hapus kunci
          </button>
        )}
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

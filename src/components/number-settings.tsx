"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { hapusNomorAction, setBotAktifAction, setSaringProspekAction, setSaringSpamAction, setSinkronAction, setSinkronCgAction, ubahNomorAction } from "@/app/actions";
import type { StatusMl } from "@/lib/prospek";
import { LencanaSesi } from "./connection-card";
import { Pesan, Saklar, SubmitButton, TombolKonfirmasi } from "./ui";
import { useSesiNomor } from "./wa-status";

export function LencanaTerhubung({ id }: { id: number }) {
  return <LencanaSesi status={useSesiNomor(id)?.status} />;
}

export function SaklarBot({ id, aktif: awal, label }: { id: number; aktif: boolean; label: string }) {
  const [aktif, setAktif] = useOptimistic(awal);
  const [, mulai] = useTransition();
  return (
    <label className="flex w-full items-center justify-between gap-4">
      <span className="text-[13px] leading-tight">
        <span className="block font-semibold text-fg">Balasan otomatis</span>
        <span className="block text-xs text-muted">{aktif ? "AI membalas chat masuk" : "AI tidak membalas"}</span>
      </span>
      <Saklar
        aktif={aktif}
        label={`Balasan otomatis ${label}`}
        onUbah={(v) =>
          mulai(async () => {
            setAktif(v);
            await setBotAktifAction(id, v);
          })
        }
      />
    </label>
  );
}

function SaklarSpam({ id, aktif: awal }: { id: number; aktif: boolean }) {
  const [aktif, setAktif] = useOptimistic(awal);
  const [, mulai] = useTransition();
  return (
    <div className="space-y-2 rounded-xl bg-subtle/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold">Abaikan spam & promosi judi</p>
          <p className="mt-0.5 text-[12.5px] text-muted">{aktif ? "AI tidak membalas spam yang jelas" : "Semua pesan dibalas AI, termasuk spam"}</p>
        </div>
        <Saklar
          aktif={aktif}
          label="Abaikan spam dan promosi judi"
          onUbah={(v) =>
            mulai(async () => {
              setAktif(v);
              await setSaringSpamAction(id, v);
            })
          }
        />
      </div>
      <p className="hint">
        Promosi judi online dikenali dari pola katanya; spam lain (promosi yang tidak diminta, penipuan, ajakan asusila) dinilai AI. Bila ragu, AI
        tetap membalas. Chat yang pernah Anda balas sendiri tidak pernah disaring. Pesan spam tetap tercatat di histori dengan tanda
        &quot;Spam&quot;, dan bisa Anda tandai &quot;Bukan spam&quot;.
      </p>
    </div>
  );
}

/** Angka ringkas ML untuk pemilik: tahap belajar dan hasil yang terukur (bukan klaim). */
function RingkasMl({ ml }: { ml: StatusMl }) {
  const akurasiAudit = ml.diaudit >= 10 ? Math.round((ml.audit_benar / ml.diaudit) * 100) : null;
  const butir = [
    { label: "Tahap", nilai: ml.aktif ? "Aktif" : "Magang" },
    { label: "Pengalaman", nilai: ml.pengalaman.toLocaleString("id-ID") },
    { label: "AI dihemat", nilai: ml.dihemat.toLocaleString("id-ID") },
    { label: "Akurasi", nilai: akurasiAudit !== null ? `${akurasiAudit}%` : ml.presisi !== null ? `${Math.round(ml.presisi * 100)}%` : "–" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {butir.map((b) => (
        <div key={b.label} className="rounded-lg bg-surface px-3 py-2">
          <dt className="text-[11px] text-muted">{b.label}</dt>
          <dd className="text-[13.5px] font-bold tabular-nums">{b.nilai}</dd>
        </div>
      ))}
    </dl>
  );
}

function SaklarProspek({ id, aktif: awal, ml }: { id: number; aktif: boolean; ml: StatusMl }) {
  const [aktif, setAktif] = useOptimistic(awal);
  const [, mulai] = useTransition();
  return (
    <div className="space-y-3 rounded-xl bg-subtle/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold">Saring yang bukan prospek</p>
          <p className="mt-0.5 text-[12.5px] text-muted">{aktif ? "Chat iseng & bot tidak dilayani terus-menerus" : "Semua chat dilayani AI tanpa penyaringan"}</p>
        </div>
        <Saklar
          aktif={aktif}
          label="Saring yang bukan prospek"
          onUbah={(v) =>
            mulai(async () => {
              setAktif(v);
              await setSaringProspekAction(id, v);
            })
          }
        />
      </div>
      {aktif && <RingkasMl ml={ml} />}
      <p className="hint">
        AI menilai setiap pesan. Pelanggan yang bertanya, memesan, atau komplain dilayani tanpa batas. Setelah 3 pesan beruntun yang jelas di luar
        urusan usaha, chat dibisukan; chat bot/auto-reply dibisukan 6 jam. Machine learning di server belajar sendiri dari setiap penilaian dan
        hasilnya. Selama tahap magang ia hanya mengamati. Setelah lolos ujian malam, ia mulai menghemat panggilan AI. Chat yang pernah Anda
        balas sendiri tidak pernah disaring, dan chat yang dibisukan tetap tercatat di histori.
      </p>
    </div>
  );
}

const SINKRON = {
  ss: {
    judul: "Data Suka Shawarma otomatis",
    info: "Menu, harga, promo & outlet dari database kasir. Diperbarui sendiri setiap kali ada perubahan.",
    belumSiap: "Belum dikonfigurasi di server (SINKRON_SS_*).",
    aksi: setSinkronAction,
  },
  cg: {
    judul: "Data ChatGerCep otomatis",
    info: "Paket, harga, kuota, free trial, metode bayar yang aktif, komisi afiliasi & fitur dari sistem ini. Diperbarui sendiri setiap kali admin mengubahnya. Khusus admin: pemilik nomor tidak melihat dokumen ini.",
    belumSiap: "",
    aksi: setSinkronCgAction,
  },
} as const;

/** Knowledge otomatis khusus admin: data kasir Suka Shawarma (`ss`) atau data sistem ChatGerCep sendiri (`cg`). */
export function SaklarSinkron({ jenis, id, aktif: awal, siap, keterangan }: { jenis: keyof typeof SINKRON; id: number; aktif: boolean; siap: boolean; keterangan: string }) {
  const j = SINKRON[jenis];
  const [aktif, setAktif] = useOptimistic(awal);
  const [galat, setGalat] = useState<string | null>(null);
  const [menunggu, mulai] = useTransition();
  return (
    <section className="card px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">{j.judul}</h2>
          <p className="hint mt-0.5">{j.info}</p>
        </div>
        <Saklar
          aktif={aktif}
          disabled={!siap || menunggu}
          label={j.judul}
          onUbah={(v) =>
            mulai(async () => {
              setAktif(v);
              setGalat(null);
              const h = await j.aksi(id, v);
              if (!h.ok) setGalat(h.pesan ?? "Gagal.");
            })
          }
        />
      </div>
      <p className="hint mt-2">{!siap ? j.belumSiap : menunggu ? "Mengambil data…" : (galat ?? keterangan)}</p>
    </section>
  );
}

export function NumberSettings({
  id,
  label,
  instruksi,
  tungguDetik,
  tungguBacaDetik,
  jedaDetik,
  saringSpam,
  saringProspek,
  ml,
}: {
  id: number;
  label: string;
  instruksi: string;
  tungguDetik: number;
  tungguBacaDetik: number;
  jedaDetik: number;
  saringSpam: boolean;
  saringProspek: boolean;
  ml: StatusMl;
}) {
  const [hasil, aksi] = useActionState(ubahNomorAction, null);
  // Tampilkan dalam menit bila pas kelipatan 60 (mis. 1800 -> 30 menit), selain itu dalam detik.
  const [satuanJeda, setSatuanJeda] = useState<"detik" | "menit">(jedaDetik % 60 === 0 ? "menit" : "detik");
  const jedaAwal = jedaDetik % 60 === 0 ? jedaDetik / 60 : jedaDetik;
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-bold tracking-tight">Pengaturan nomor</h2>
      </div>
      <form action={aksi} className="space-y-5 px-5 py-5">
        <input type="hidden" name="id" value={id} />
        <div>
          <label htmlFor="label" className="label">
            Nama
          </label>
          <input id="label" name="label" required maxLength={60} defaultValue={label} className="field" />
        </div>

        <fieldset className="space-y-4 rounded-xl bg-subtle/70 p-4 sm:space-y-3">
          <legend className="float-left mb-1 w-full text-[13px] font-bold">Serah-terima manusia ↔ AI</legend>
          <div className="clear-both flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <label htmlFor="tunggu_detik" className="text-[13px] text-fg">
              AI menjawab bila pesan belum dibuka manusia dalam
            </label>
            <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
              <input id="tunggu_detik" name="tunggu_detik" type="number" required min={2} max={120} step={1} defaultValue={tungguDetik} className="field w-20 px-2 py-1.5 text-center tabular-nums" />
              detik
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <label htmlFor="tunggu_baca_detik" className="text-[13px] text-fg">
              Chat sudah dibuka di HP tapi tidak dibalas: AI ambil alih setelah
            </label>
            <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
              <input
                id="tunggu_baca_detik"
                name="tunggu_baca_detik"
                type="number"
                required
                min={2}
                max={600}
                step={1}
                defaultValue={tungguBacaDetik}
                className="field w-20 px-2 py-1.5 text-center tabular-nums"
              />
              detik
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <label htmlFor="jeda_nilai" className="text-[13px] text-fg">
              Setelah manusia membalas, AI diam di chat itu selama
            </label>
            <span className="flex shrink-0 items-center gap-1.5">
              <input
                id="jeda_nilai"
                name="jeda_nilai"
                type="number"
                required
                min={0}
                max={satuanJeda === "detik" ? 86_400 : 1440}
                step={1}
                defaultValue={jedaAwal}
                className="field w-20 px-2 py-1.5 text-center tabular-nums"
              />
              <select
                name="jeda_satuan"
                aria-label="Satuan lama AI diam"
                value={satuanJeda}
                onChange={(e) => setSatuanJeda(e.target.value as "detik" | "menit")}
                className="field w-auto cursor-pointer py-1.5 pr-2 pl-2.5"
              >
                <option value="detik">detik</option>
                <option value="menit">menit</option>
              </select>
            </span>
          </div>
          <p className="hint">
            Begitu chat dibuka di HP, AI langsung menahan diri; tidak jadi dibalas, AI mengambil alih. WhatsApp tidak memberi tahu saat Anda
            mengetik, jadi tandanya adalah pesan terbaca di HP — &quot;Laporan dibaca&quot; di WhatsApp nomor ini harus aktif. Lama AI diam bisa
            diisi dalam detik atau menit (maks 24 jam); isi 0 bila AI hanya perlu mundur untuk pesan itu saja. Pesan pelanggan yang masuk selagi AI
            diam dan tidak Anda balas tetap dijawab AI begitu waktunya habis.
          </p>
        </fieldset>

        <SaklarProspek id={id} aktif={saringProspek} ml={ml} />

        <SaklarSpam id={id} aktif={saringSpam} />

        <div>
          <label htmlFor="instruksi" className="label">
            Instruksi khusus <span className="font-normal text-faint">(opsional)</span>
          </label>
          <textarea
            id="instruksi"
            name="instruksi"
            rows={4}
            maxLength={2000}
            defaultValue={instruksi}
            placeholder="Contoh: Sapa pelanggan dengan ramah dan jawab singkat. Untuk permintaan penawaran, tanyakan dulu kebutuhannya."
            className="field resize-y leading-relaxed"
          />
          <p className="hint mt-1.5">Gaya bicara dan alur khusus nomor ini. Siapa pemilik nomor dan faktanya (layanan, harga, jadwal) taruh di base knowledge.</p>
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton>Simpan</SubmitButton>
          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        </div>
      </form>
    </section>
  );
}

export function HapusNomor({ id }: { id: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-4">
      <div>
        <p className="text-[13.5px] font-semibold">Hapus nomor ini</p>
        <p className="hint">Koneksi WhatsApp-nya diputus dan seluruh base knowledge-nya terhapus. Tidak bisa dikembalikan.</p>
      </div>
      <TombolKonfirmasi label="Hapus nomor" tanya="Hapus nomor beserta knowledge-nya?" ya="Ya, hapus" aksi={() => hapusNomorAction(id)} ikon={<Trash2 className="size-4" aria-hidden />} />
    </div>
  );
}

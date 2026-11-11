"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { hapusNomorAction, setBotAktifAction, setSaringProspekAction, setSaringSpamAction, setSinkronAction, setSinkronCgAction, ubahNomorAction } from "@/app/actions";
import { angka } from "@/lib/format";
import type { StatusMl } from "@/lib/prospek";
import { useBahasa } from "./bahasa";
import { InstruksiNomor } from "./instruksi-nomor";
import { LencanaSesi } from "./connection-card";
import { bukaTabNomor } from "./tab-nomor";
import { Pesan, Saklar, SubmitButton, TombolKonfirmasi } from "./ui";
import { useSesiNomor } from "./wa-status";

export function LencanaTerhubung({ id }: { id: number }) {
  return <LencanaSesi status={useSesiNomor(id)?.status} />;
}

/**
 * Saklar utama AI nomor ini. Aturan pakai: tanpa product knowledge saklar terkunci (server juga menolak menyalakannya,
 * dan jembatan WhatsApp tidak membalas), dengan tautan langsung ke tab Knowledge.
 */
export function SaklarBot({ id, aktif: awal, label, adaKnowledge = true }: { id: number; aktif: boolean; label: string; adaKnowledge?: boolean }) {
  const [aktif, setAktif] = useOptimistic(awal);
  const [galat, setGalat] = useState<string | null>(null);
  const [, mulai] = useTransition();
  const { t } = useBahasa();
  return (
    <div className="w-full">
      <label data-analitik-privat className="flex w-full items-center justify-between gap-4">
        <span className="text-[13px] leading-tight">
          <span className="block font-semibold text-fg">{t("Balasan otomatis", "Auto-reply")}</span>
          <span className={`block text-xs ${adaKnowledge ? "text-muted" : "text-warning"}`}>
            {!adaKnowledge
              ? t("Belum bisa aktif: Informasi Usaha kosong", "Can't turn on yet: no Business Info")
              : aktif
                ? t("AI membalas chat masuk", "AI replies to incoming chats")
                : t("AI tidak membalas", "AI doesn't reply")}
          </span>
        </span>
        <Saklar
          aktif={aktif && adaKnowledge}
          disabled={!adaKnowledge}
          label={t(`Balasan otomatis ${label}`, `Auto-reply for ${label}`)}
          analitik="Saklar balasan otomatis"
          onUbah={(v) =>
            mulai(async () => {
              setGalat(null);
              setAktif(v);
              const h = await setBotAktifAction(id, v);
              if (!h.ok) setGalat(h.pesan ?? null);
            })
          }
        />
      </label>
      {!adaKnowledge && (
        <button type="button" onClick={() => bukaTabNomor("knowledge")} className="mt-1.5 text-[12px] font-semibold text-accent hover:underline">
          {t("Isi Informasi Usaha →", "Add Business Info →")}
        </button>
      )}
      {galat && <p className="mt-1.5 text-[12px] font-semibold text-danger">{galat}</p>}
    </div>
  );
}

function SaklarSpam({ id, aktif: awal }: { id: number; aktif: boolean }) {
  const [aktif, setAktif] = useOptimistic(awal);
  const [, mulai] = useTransition();
  const { t } = useBahasa();
  return (
    <div className="space-y-2 rounded-xl bg-subtle/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold">{t("Abaikan spam & promosi judi", "Ignore spam & gambling promos")}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {aktif ? t("AI tidak membalas spam yang jelas", "AI doesn't reply to obvious spam") : t("Semua pesan dibalas AI, termasuk spam", "AI replies to every message, spam included")}
          </p>
        </div>
        <Saklar
          aktif={aktif}
          label={t("Abaikan spam dan promosi judi", "Ignore spam and gambling promos")}
          onUbah={(v) =>
            mulai(async () => {
              setAktif(v);
              await setSaringSpamAction(id, v);
            })
          }
        />
      </div>
      <p className="hint">
        {t(
          "Promosi judi online dikenali dari pola katanya; spam lain (promosi yang tidak diminta, penipuan, ajakan asusila) dinilai AI. Bila ragu, AI tetap membalas. Chat yang pernah Anda balas sendiri tidak pernah disaring. Pesan spam tetap tercatat di histori dengan tanda \"Spam\", dan bisa Anda tandai \"Bukan spam\".",
          "Online gambling promos are recognized by their wording; other spam (unsolicited promos, scams, indecent offers) is judged by AI. When in doubt, AI still replies. Chats you've replied to yourself are never filtered. Spam stays in the history with a \"Spam\" tag, and you can mark it \"Not spam\".",
        )}
      </p>
    </div>
  );
}

/** Angka ringkas ML untuk pemilik: tahap belajar dan hasil yang terukur (bukan klaim). */
function RingkasMl({ ml }: { ml: StatusMl }) {
  const { b, t } = useBahasa();
  const akurasiAudit = ml.diaudit >= 10 ? Math.round((ml.audit_benar / ml.diaudit) * 100) : null;
  const butir = [
    { label: t("Tahap", "Stage"), nilai: ml.aktif ? t("Aktif", "Active") : t("Magang", "Training") },
    { label: t("Pengalaman", "Experience"), nilai: angka(ml.pengalaman, b) },
    { label: t("AI dihemat", "AI calls saved"), nilai: angka(ml.dihemat, b) },
    { label: t("Akurasi", "Accuracy"), nilai: akurasiAudit !== null ? `${akurasiAudit}%` : ml.presisi !== null ? `${Math.round(ml.presisi * 100)}%` : "–" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {butir.map((x) => (
        <div key={x.label} className="rounded-lg bg-surface px-3 py-2">
          <dt className="text-[11px] text-muted">{x.label}</dt>
          <dd className="text-[13.5px] font-bold tabular-nums">{x.nilai}</dd>
        </div>
      ))}
    </dl>
  );
}

function SaklarProspek({ id, aktif: awal, ml }: { id: number; aktif: boolean; ml: StatusMl }) {
  const [aktif, setAktif] = useOptimistic(awal);
  const [, mulai] = useTransition();
  const { t } = useBahasa();
  return (
    <div className="space-y-3 rounded-xl bg-subtle/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold">{t("Saring yang bukan prospek", "Filter out non-leads")}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {aktif
              ? t("Chat iseng & bot tidak dilayani terus-menerus", "Idle chatter & bots aren't served endlessly")
              : t("Semua chat dilayani AI tanpa penyaringan", "AI serves every chat without filtering")}
          </p>
        </div>
        <Saklar
          aktif={aktif}
          label={t("Saring yang bukan prospek", "Filter out non-leads")}
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
        {t(
          "AI menilai setiap pesan. Pelanggan yang bertanya, memesan, atau komplain dilayani tanpa batas. Setelah 3 pesan beruntun yang jelas di luar urusan usaha, chat dibisukan; chat bot/auto-reply dibisukan 6 jam. Machine learning di server belajar sendiri dari setiap penilaian dan hasilnya. Selama tahap magang ia hanya mengamati. Setelah lolos ujian malam, ia mulai menghemat panggilan AI. Chat yang pernah Anda balas sendiri tidak pernah disaring, dan chat yang dibisukan tetap tercatat di histori.",
          "AI judges every message. Customers who ask, order, or complain are always served. After 3 messages in a row that are clearly unrelated to your business, the chat is muted; bot/auto-reply chats are muted for 6 hours. Machine learning on the server learns on its own from every judgment and its outcome. While in training it only observes. Once it passes the nightly test, it starts saving AI calls. Chats you've replied to yourself are never filtered, and muted chats still appear in the history.",
        )}
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
  spamBoleh = true,
  mlBoleh = true,
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
  /** Mesin self-host: fitur `spam` / `ml` dibuka lisensi (pusat: selalu true). Ditutup = sakelarnya tidak tampil. */
  spamBoleh?: boolean;
  mlBoleh?: boolean;
}) {
  const [hasil, aksi] = useActionState(ubahNomorAction, null);
  const { t } = useBahasa();
  // Tampilkan dalam menit bila pas kelipatan 60 (mis. 1800 -> 30 menit), selain itu dalam detik.
  const [satuanJeda, setSatuanJeda] = useState<"detik" | "menit">(jedaDetik % 60 === 0 ? "menit" : "detik");
  const jedaAwal = jedaDetik % 60 === 0 ? jedaDetik / 60 : jedaDetik;
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-bold tracking-tight">{t("Pengaturan nomor", "Number settings")}</h2>
      </div>
      <form action={aksi} className="space-y-5 px-5 py-5">
        <input type="hidden" name="id" value={id} />
        <div>
          <label htmlFor="label" className="label">
            {t("Nama", "Name")}
          </label>
          <input id="label" name="label" required maxLength={60} defaultValue={label} className="field" />
        </div>

        <fieldset className="space-y-4 rounded-xl bg-subtle/70 p-4 sm:space-y-3">
          <legend className="float-left mb-1 w-full text-[13px] font-bold">{t("Serah-terima manusia ↔ AI", "Human ↔ AI handover")}</legend>
          <div className="clear-both flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <label htmlFor="tunggu_detik" className="text-[13px] text-fg">
              {t("AI menjawab bila pesan belum dibuka manusia dalam", "AI replies if no human has opened the message within")}
            </label>
            <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
              <input id="tunggu_detik" name="tunggu_detik" type="number" required min={2} max={120} step={1} defaultValue={tungguDetik} className="field w-20 px-2 py-1.5 text-center tabular-nums" />
              {t("detik", "seconds")}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <label htmlFor="tunggu_baca_detik" className="text-[13px] text-fg">
              {t("Chat sudah dibuka di HP tapi tidak dibalas: AI ambil alih setelah", "Chat opened on the phone but not answered: AI takes over after")}
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
              {t("detik", "seconds")}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <label htmlFor="jeda_nilai" className="text-[13px] text-fg">
              {t("Setelah manusia membalas, AI diam di chat itu selama", "After a human replies, AI stays quiet in that chat for")}
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
              <input type="hidden" name="jeda_satuan" value={satuanJeda} />
              <span role="radiogroup" aria-label={t("Satuan lama AI diam", "Unit for how long AI stays quiet")} className="inline-flex rounded-xl border border-line-strong bg-surface p-0.5">
                {(["detik", "menit"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={satuanJeda === u}
                    onClick={() => setSatuanJeda(u)}
                    className={`min-h-9 rounded-[0.6rem] px-3 text-[13px] font-semibold transition-colors ${satuanJeda === u ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
                  >
                    {u === "detik" ? t("detik", "seconds") : t("menit", "minutes")}
                  </button>
                ))}
              </span>
            </span>
          </div>
          <p className="hint">
            {t(
              "Begitu chat dibuka di HP, AI langsung menahan diri; tidak jadi dibalas, AI mengambil alih. WhatsApp tidak memberi tahu saat Anda mengetik, jadi tandanya adalah pesan terbaca di HP — \"Laporan dibaca\" di WhatsApp nomor ini harus aktif. Lama AI diam bisa diisi dalam detik atau menit (maks 24 jam); isi 0 bila AI hanya perlu mundur untuk pesan itu saja. Pesan pelanggan yang masuk selagi AI diam dan tidak Anda balas tetap dijawab AI begitu waktunya habis.",
              "As soon as a chat is opened on the phone, AI holds back; if nobody replies, AI takes over. WhatsApp doesn't signal when you're typing, so the cue is the message being read on the phone — \"Read receipts\" must be on in this number's WhatsApp. The quiet period can be set in seconds or minutes (max 24 hours); enter 0 if AI only needs to step back for that one message. Customer messages that arrive while AI is quiet and that you don't answer are still answered by AI once the time is up.",
            )}
          </p>
        </fieldset>

        {mlBoleh && <SaklarProspek id={id} aktif={saringProspek} ml={ml} />}

        {spamBoleh && <SaklarSpam id={id} aktif={saringSpam} />}

        <InstruksiNomor awal={instruksi} />
        <div className="flex items-center gap-3">
          <SubmitButton>{t("Simpan", "Save")}</SubmitButton>
          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        </div>
      </form>
    </section>
  );
}

export function HapusNomor({ id }: { id: number }) {
  const { t } = useBahasa();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-4">
      <div>
        <p className="text-[13.5px] font-semibold">{t("Hapus nomor ini", "Delete this number")}</p>
        <p className="hint">
          {t(
            "Koneksi WhatsApp-nya diputus dan seluruh Informasi Usaha-nya terhapus. Tidak bisa dikembalikan.",
            "Its WhatsApp connection is cut and all of its Business Info is deleted. This can't be undone.",
          )}
        </p>
      </div>
      <TombolKonfirmasi
        label={t("Hapus nomor", "Delete number")}
        tanya={t("Hapus nomor beserta Informasi Usaha-nya?", "Delete the number and its Business Info?")}
        ya={t("Ya, hapus", "Yes, delete")}
        aksi={() => hapusNomorAction(id)}
        ikon={<Trash2 className="size-4" aria-hidden />}
      />
    </div>
  );
}

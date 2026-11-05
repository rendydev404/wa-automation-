import { Suspense } from "react";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { BookOpenText, Bot, ChevronRight, FileText, FlaskConical, Lightbulb, MessageCircleMore, MessagesSquare, Package, Settings2, Smartphone, Users } from "lucide-react";
import { ConnectionCard } from "@/components/connection-card";
import { HistoriPercakapan } from "@/components/conversation-history";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { IkonKoneksi, LangkahMulai } from "@/components/langkah-mulai";
import { TabNomor } from "@/components/tab-nomor";
import { PanelPelajaran } from "@/components/panel-pelajaran";
import { HapusNomor, LencanaTerhubung, NumberSettings, SaklarBot, SaklarSinkron } from "@/components/number-settings";
import { KartuStat, Meter, Sparkline } from "@/components/stat";
import { TestChat } from "@/components/test-chat";
import { PanelKatalog } from "@/components/panel-katalog";
import { daftarProduk, katalogBoleh } from "@/lib/katalog";
import { sekarang } from "@/lib/db";
import { angka, formatNomor, tanggal } from "@/lib/format";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { BATAS_UTUH, daftarDokumen } from "@/lib/knowledge";
import { statHarian, tanggalWib } from "@/lib/numbers";
import { nomorUntuk } from "@/lib/akses";
import { daftarPelajaran, jumlahPelajaran } from "@/lib/pelajaran";
import { ambilPesanPercakapan, daftarPercakapan, ringkasanPercakapan } from "@/lib/percakapan";
import { statusMl } from "@/lib/prospek";
import { requireUser } from "@/lib/session";
import { TUR_NOMOR } from "@/components/isi-tur";
import { TurOtomatis } from "@/components/tur";
import { turSelesai } from "@/lib/pengguna";
import { konfigurasi as konfigurasiSinkron, nomorSinkron, statusSinkron, type Status } from "@/lib/sinkron";
import { nomorSinkronCg, statusSinkronCg, type StatusCg } from "@/lib/sinkron-cg";
import { deretHarian, hariTerakhir, persen } from "@/lib/tren";

function teksStatusSinkron(s: Status | StatusCg): string {
  if (s.galat) return `Tarikan terakhir gagal: ${s.galat}`;
  if (!s.waktu) return "Belum pernah menarik data.";
  return `Terakhir diperbarui ${tanggal(s.waktu)} (${s.karakter.toLocaleString("id-ID")} karakter).`;
}

export default async function HalamanNomor(props: PageProps<"/[lang]/nomor/[id]">) {
  const { t } = await teksHalaman();
  return (
    <div>
      <nav aria-label={t("Jejak halaman", "Breadcrumb")} className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/dashboard" className="font-medium text-muted transition-colors hover:text-fg">
              {t("Ringkasan", "Overview")}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            {t("Detail nomor", "Number details")}
          </li>
        </ol>
      </nav>
      <Suspense fallback={<Kerangka />}>
        <Isi params={props.params} />
      </Suspense>
    </div>
  );
}

async function Isi({ params }: { params: Promise<{ id: string }> }) {
  const { b, t } = await teksHalaman();
  const user = await requireUser();
  const nomor = await nomorUntuk(user, (await params).id);
  if (!nomor) notFound(); // nomor milik orang lain = tidak ditemukan
  const id = nomor.id;
  const admin = user.peran === "admin";

  const hari = hariTerakhir(tanggalWib(), 7);
  const [dokumen, sinkronIds, statusSs, sinkronCgIds, statusCg, ringkasanChat, daftarChat, stat, totalPelajaran, pelajaran, tur, produk, katalogAktif, ml] = await Promise.all([
    daftarDokumen(id, admin),
    admin ? nomorSinkron() : Promise.resolve([] as number[]),
    admin ? statusSinkron() : Promise.resolve(null),
    admin ? nomorSinkronCg() : Promise.resolve([] as number[]),
    admin ? statusSinkronCg() : Promise.resolve(null),
    ringkasanPercakapan(id),
    daftarPercakapan(id),
    statHarian(hari[0], id),
    jumlahPelajaran(id),
    daftarPelajaran(id),
    turSelesai(user.id),
    daftarProduk(id),
    admin ? Promise.resolve(true) : katalogBoleh(nomor.user_id),
    statusMl(id),
  ]);
  const chatPertama = daftarChat.daftar[0] ? await ambilPesanPercakapan(id, daftarChat.daftar[0].id) : null;
  const total = dokumen.reduce((n, d) => n + d.jumlah_karakter, 0);
  const tren = deretHarian(hari, stat);
  const kini = tren[tren.length - 1];
  const rasio = persen(kini.dibalas, kini.masuk);

  const kartuSinkron = admin && (
    <aside className="min-w-0 space-y-4">
      <p className="text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">{t("Data otomatis · khusus admin", "Automatic data · admin only")}</p>
      <SaklarSinkron jenis="cg" id={nomor.id} aktif={sinkronCgIds.includes(nomor.id)} siap keterangan={statusCg ? teksStatusSinkron(statusCg) : ""} />
      <SaklarSinkron jenis="ss" id={nomor.id} aktif={sinkronIds.includes(nomor.id)} siap={!!konfigurasiSinkron()} keterangan={statusSs ? teksStatusSinkron(statusSs) : ""} />
    </aside>
  );
  const knowledge = (
    <KnowledgePanel
      numberId={nomor.id}
      total={total}
      batasUtuh={BATAS_UTUH}
      dokumen={dokumen.map((d) => ({
        id: d.id,
        judul: d.judul,
        sumber: d.sumber,
        ukuran_byte: d.ukuran_byte,
        jumlah_karakter: d.jumlah_karakter,
        tanggal: tanggal(d.created_at, b),
      }))}
    />
  );

  return (
    <div className="space-y-6">
      {/* Identitas nomor + saklar utama dalam satu kartu. */}
      <header className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-xl font-bold text-ink-signal uppercase">
            <span aria-hidden className="kisi-tinta absolute inset-0" />
            <span className="relative">{nomor.label.trim().charAt(0) || "#"}</span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{nomor.label}</h1>
              <LencanaTerhubung id={nomor.id} />
            </div>
            <p className="mt-0.5 text-[13.5px] text-muted tabular-nums">{nomor.wa_id ? formatNomor(nomor.wa_id) : t("Belum ada nomor tertaut", "No number linked yet")}</p>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-subtle/50 px-4 py-3 sm:min-w-64" data-tur="saklar-bot">
          <SaklarBot id={nomor.id} aktif={!!nomor.bot_aktif} label={nomor.label} adaKnowledge={total > 0} />
        </div>
      </header>

      <section aria-label={t("Statistik nomor ini", "Stats for this number")} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KartuStat
          label={t("Pesan masuk hari ini", "Messages in today")}
          nilai={angka(kini.masuk, b)}
          ikon={<MessageCircleMore className="size-4" aria-hidden />}
          keterangan={t("7 hari: ", "7 days: ") + angka(tren.reduce((a, x) => a + x.masuk, 0), b)}
        >
          <Sparkline nilai={tren.map((x) => x.masuk)} warna="var(--c-seri-masuk)" className="h-7 w-[calc(100%-6px)]" />
        </KartuStat>
        <KartuStat
          label={t("Dibalas AI hari ini", "AI replies today")}
          nilai={angka(kini.dibalas, b)}
          ikon={<Bot className="size-4" aria-hidden />}
          keterangan={rasio === null ? t("Belum ada pesan masuk", "No incoming messages yet") : t(`${rasio}% dari pesan masuk`, `${rasio}% of incoming messages`)}
        >
          {rasio !== null && <Meter persen={rasio} label={t("Persentase pesan yang dibalas AI hari ini", "Share of messages AI replied to today")} />}
        </KartuStat>
        <KartuStat
          label={t("Pelanggan", "Customers")}
          nilai={angka(ringkasanChat.total_percakapan, b)}
          ikon={<Users className="size-4" aria-hidden />}
          keterangan={t(
            `${angka(ringkasanChat.total_masuk)} pesan masuk sepanjang waktu`,
            `${angka(ringkasanChat.total_masuk, b)} incoming ${ringkasanChat.total_masuk === 1 ? "message" : "messages"} all time`,
          )}
        />
        <KartuStat
          label={t("Dokumen knowledge", "Knowledge documents")}
          nilai={angka(dokumen.length, b)}
          ikon={<FileText className="size-4" aria-hidden />}
          keterangan={total === 0 ? t("Belum ada isi", "Empty so far") : t(`${angka(total)} karakter`, `${angka(total, b)} characters`)}
        />
      </section>

      <TurOtomatis nama="nomor" langkah={TUR_NOMOR} sudah={tur.includes("nomor")} />

      {/* Satu bagian per tab, berurutan sesuai alur: sambungkan -> isi pengetahuan -> uji -> pantau -> atur. */}
      <TabNomor
        tab={[
          {
            id: "koneksi",
            label: { id: "Koneksi", en: "Connection" },
            ikon: (
              <IkonKoneksi id={nomor.id}>
                <Smartphone aria-hidden />
              </IkonKoneksi>
            ),
            tur: ["koneksi"],
            isi: (
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0" data-tur="koneksi">
                  <ConnectionCard id={nomor.id} />
                </div>
                <LangkahMulai id={nomor.id} adaKnowledge={total > 0} botAktif={!!nomor.bot_aktif && total > 0} />
              </div>
            ),
          },
          {
            id: "knowledge",
            label: { id: "Knowledge", en: "Knowledge" },
            ikon: <BookOpenText aria-hidden />,
            hitung: dokumen.length,
            tur: ["knowledge"],
            isi: (
              <div className="space-y-6">
                {admin ? (
                  <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0" data-tur="knowledge">
                      {knowledge}
                    </div>
                    {kartuSinkron}
                  </div>
                ) : (
                  <div data-tur="knowledge">{knowledge}</div>
                )}
                <PanelPelajaran
                  key={`${totalPelajaran}-${pelajaran.daftar[0]?.id ?? 0}-${nomor.belajar}`}
                  numberId={nomor.id}
                  aktif={nomor.belajar}
                  total={totalPelajaran}
                  daftarAwal={pelajaran.daftar}
                  adaLagiAwal={pelajaran.adaLagi}
                  kini={sekarang()}
                />
              </div>
            ),
          },
          {
            id: "uji-bot",
            label: { id: "Uji bot", en: "Test bot" },
            ikon: <FlaskConical aria-hidden />,
            tur: ["uji"],
            isi: (
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0" data-tur="uji">
                  <TestChat numberId={nomor.id} />
                </div>
                <aside className="card p-5">
                  <h2 className="flex items-center gap-2 text-[14px] font-bold">
                    <Lightbulb className="size-4 text-accent" aria-hidden /> {t("Cara menguji", "How to test")}
                  </h2>
                  <ul className="mt-3 list-disc space-y-2.5 pl-4 text-[13px] text-muted marker:text-faint">
                    <li>{t("Tanyakan seperti pelanggan sungguhan, mis. “harganya berapa?” atau “buka jam berapa?”.", "Ask like a real customer, e.g. “how much is it?” or “what time do you open?”.")}</li>
                    <li>{t("Coba juga hal yang tidak ada di knowledge: AI harus menjawab tidak tahu, bukan mengarang.", "Also ask about something that isn’t in your knowledge: the AI should say it doesn’t know, not make things up.")}</li>
                    <li>{t("Jawaban kurang pas? Perbaiki di tab Knowledge, lalu tanya lagi.", "Answer not quite right? Fix it in the Knowledge tab, then ask again.")}</li>
                  </ul>
                  <p className="mt-4 rounded-lg bg-subtle px-3 py-2 text-[12px] text-muted">{t("Uji bot tidak mengirim pesan ke WhatsApp mana pun.", "Test bot never sends a message to any WhatsApp.")}</p>
                </aside>
              </div>
            ),
          },
          {
            id: "percakapan",
            label: { id: "Percakapan", en: "Conversations" },
            ikon: <MessagesSquare aria-hidden />,
            hitung: ringkasanChat.total_percakapan,
            tur: ["histori"],
            isi: (
              <div data-tur="histori">
                <HistoriPercakapan
                  numberId={nomor.id}
                  ringkasanAwal={ringkasanChat}
                  daftarAwal={daftarChat.daftar}
                  adaLagiAwal={daftarChat.adaLagi}
                  pesanAwal={chatPertama?.pesan ?? []}
                  adaSebelumnyaAwal={chatPertama?.adaSebelumnya ?? false}
                  kiniAwal={sekarang()}
                />
              </div>
            ),
          },
          {
            id: "katalog",
            label: { id: "Katalog", en: "Catalog" },
            ikon: <Package aria-hidden />,
            hitung: produk.length,
            isi: <PanelKatalog numberId={nomor.id} produk={produk} boleh={katalogAktif} />,
          },
          {
            id: "pengaturan",
            label: { id: "Pengaturan", en: "Settings" },
            ikon: <Settings2 aria-hidden />,
            tur: ["pengaturan"],
            isi: (
              <div className="mx-auto max-w-3xl space-y-6">
                <div data-tur="pengaturan">
                  <NumberSettings
                    id={nomor.id}
                    label={nomor.label}
                    instruksi={nomor.instruksi}
                    tungguDetik={nomor.tunggu_detik}
                    tungguBacaDetik={nomor.tunggu_baca_detik}
                    jedaDetik={nomor.jeda_detik}
                    saringSpam={nomor.saring_spam}
                    saringProspek={nomor.saring_prospek}
                    ml={ml}
                  />
                </div>
                <HapusNomor id={nomor.id} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function Kerangka() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="card flex items-center gap-4 p-5">
        <div className="size-14 animate-denyut rounded-2xl bg-ink/90" />
        <div className="space-y-2">
          <div className="h-7 w-56 animate-denyut rounded-lg bg-subtle" />
          <div className="h-4 w-36 animate-denyut rounded bg-subtle" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-32 animate-denyut" />
        ))}
      </div>
      <div className="h-12 animate-denyut rounded-xl bg-subtle" />
      <div className="card h-[420px] animate-denyut" />
    </div>
  );
}

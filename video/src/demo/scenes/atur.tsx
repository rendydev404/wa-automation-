import { ChevronDown } from "lucide-react";
import { ketik, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { type Script, Stage } from "../kit/stage";
import { Isi, Main, Saklar, Sidebar } from "../kit/ui";
import { HASIL_RAPI, NOMOR_BISNIS, USAHA } from "../data";
import { NomorFrame } from "../pages/nomor-frame";

/** Durasi scene (detik). */
export const DUR = 31;

const INSTRUKSI = "Sapa pelanggan dengan ramah, panggil Kak, jawab singkat. Untuk pesanan catering, tanyakan dulu tanggal dan jumlah porsi.";

const T = { n1: 1.8, n2: 3.6, n3: 5.4, instruksi: 17.8, ketik: 18.15, simpan: 22.8, saklar: 27.5 };

function Angka({ nilai, cur, fokus, satuan }: { nilai: string; cur: string; fokus: boolean; satuan?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
      <span data-cur={cur} className={`field w-20 px-2 py-1.5 text-center tabular-nums ${fokus ? "field-fokus" : ""}`}>{nilai}</span>
      {satuan}
    </span>
  );
}

function RingkasMl() {
  const butir = [
    { label: "Tahap", nilai: "Magang" },
    { label: "Pengalaman", nilai: "0" },
    { label: "AI dihemat", nilai: "0" },
    { label: "Akurasi", nilai: "–" },
  ];
  return (
    <dl className="grid grid-cols-4 gap-2">
      {butir.map((b) => (
        <div key={b.label} className="rounded-lg bg-surface px-3 py-2">
          <dt className="text-[11px] text-muted">{b.label}</dt>
          <dd className="text-[13.5px] font-bold tabular-nums">{b.nilai}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Kartu "Pengaturan nomor" — markup disalin dari components/number-settings.tsx. */
function PengaturanNomor({ t }: { t: number }) {
  const fokus = t >= T.n3 + 0.1 && t < 8.2 ? 3 : t >= T.n2 + 0.1 && t < T.n3 + 0.1 ? 2 : t >= T.n1 + 0.1 && t < T.n2 + 0.1 ? 1 : 0;
  const instrFokus = t >= T.instruksi + 0.1 && t < T.simpan + 0.1;
  const teks = ketik(INSTRUKSI, t, T.ketik, 32);
  const simpan = t >= T.simpan + 0.15;
  const caret = Math.floor(t * 2.4) % 2 === 0;
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-bold tracking-tight">Pengaturan nomor</h2>
      </div>
      <div className="space-y-5 px-5 py-5">
        <Isi label="Nama" nilai={NOMOR_BISNIS.label} t={t} />

        <fieldset data-cur="atur-serah" className="space-y-3 rounded-xl bg-subtle/70 p-4">
          <legend className="float-left mb-1 w-full text-[13px] font-bold">Serah-terima manusia ↔ AI</legend>
          <div className="clear-both flex items-center justify-between gap-3">
            <label className="text-[13px] text-fg">AI menjawab bila pesan belum dibuka manusia dalam</label>
            <Angka nilai="5" cur="atur-n1" fokus={fokus === 1} satuan="detik" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-[13px] text-fg">Chat sudah dibuka di HP tapi tidak dibalas: AI ambil alih setelah</label>
            <Angka nilai="5" cur="atur-n2" fokus={fokus === 2} satuan="detik" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-[13px] text-fg">Setelah manusia membalas, AI diam di chat itu selama</label>
            <span className="flex shrink-0 items-center gap-1.5">
              <span data-cur="atur-n3" className={`field w-20 px-2 py-1.5 text-center tabular-nums ${fokus === 3 ? "field-fokus" : ""}`}>5</span>
              <span className="field flex w-auto items-center gap-1 py-1.5 pr-2 pl-2.5">
                detik <ChevronDown className="size-3.5 text-faint" />
              </span>
            </span>
          </div>
          <p className="hint">
            Begitu chat dibuka di HP, AI langsung menahan diri; tidak jadi dibalas, AI mengambil alih. WhatsApp tidak memberi tahu saat Anda mengetik, jadi tandanya adalah pesan
            terbaca di HP — &quot;Laporan dibaca&quot; di WhatsApp nomor ini harus aktif. Lama AI diam bisa diisi dalam detik atau menit (maks 24 jam); isi 0 bila AI hanya perlu mundur
            untuk pesan itu saja. Pesan pelanggan yang masuk selagi AI diam dan tidak Anda balas tetap dijawab AI begitu waktunya habis.
          </p>
        </fieldset>

        <div data-cur="atur-prospek" className="space-y-3 rounded-xl bg-subtle/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-bold">Saring yang bukan prospek</p>
              <p className="mt-0.5 text-[12.5px] text-muted">Chat iseng & bot tidak dilayani terus-menerus</p>
            </div>
            <Saklar p={1} cur="atur-saklar-prospek" />
          </div>
          <RingkasMl />
          <p className="hint">
            AI menilai setiap pesan. Pelanggan yang bertanya, memesan, atau komplain dilayani tanpa batas. Setelah 3 pesan beruntun yang jelas di luar urusan usaha, chat dibisukan;
            chat bot/auto-reply dibisukan 6 jam. Machine learning di server belajar sendiri dari setiap penilaian dan hasilnya. Selama tahap magang ia hanya mengamati. Setelah lolos
            ujian malam, ia mulai menghemat panggilan AI. Chat yang pernah Anda balas sendiri tidak pernah disaring, dan chat yang dibisukan tetap tercatat di histori.
          </p>
        </div>

        <div data-cur="atur-spam" className="space-y-2 rounded-xl bg-subtle/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-bold">Abaikan spam & promosi judi</p>
              <p className="mt-0.5 text-[12.5px] text-muted">AI tidak membalas spam yang jelas</p>
            </div>
            <Saklar p={1} cur="atur-saklar-spam" />
          </div>
          <p className="hint">
            Promosi judi online dikenali dari pola katanya; spam lain (promosi yang tidak diminta, penipuan, ajakan asusila) dinilai AI. Bila ragu, AI tetap membalas. Chat yang pernah
            Anda balas sendiri tidak pernah disaring. Pesan spam tetap tercatat di histori dengan tanda &quot;Spam&quot;, dan bisa Anda tandai &quot;Bukan spam&quot;.
          </p>
        </div>

        <div>
          <span className="label">
            Instruksi khusus <span className="font-normal text-faint">(opsional)</span>
          </span>
          <div data-cur="atur-instruksi" className={`field leading-relaxed whitespace-pre-wrap ${instrFokus ? "field-fokus" : ""}`} style={{ minHeight: 112 }}>
            {teks ? (
              <>
                {teks}
                {instrFokus && <span className="ml-px inline-block h-[1.1em] w-px translate-y-0.5 bg-fg" style={{ opacity: caret ? 1 : 0 }} />}
              </>
            ) : (
              <>
                {instrFokus && <span className="inline-block h-[1.1em] w-px translate-y-0.5 bg-fg" style={{ opacity: caret ? 1 : 0 }} />}
                <span className="text-faint">Contoh: Sapa pelanggan dengan ramah dan jawab singkat. Untuk permintaan penawaran, tanyakan dulu kebutuhannya.</span>
              </>
            )}
          </div>
          <p className="hint mt-1.5">Gaya bicara dan alur khusus nomor ini. Siapa pemilik nomor dan faktanya (layanan, harga, jadwal) taruh di base knowledge.</p>
        </div>
        <div className="flex items-center gap-3">
          <span data-cur="atur-simpan" className="btn btn-primary">Simpan</span>
          {simpan && <p className="text-[13px] text-success">Tersimpan.</p>}
        </div>
      </div>
    </section>
  );
}

/** Scene 7: pengaturan nomor (serah-terima manusia ↔ AI, penyaring, instruksi) lalu menyalakan balasan otomatis. */
export function Atur() {
  const t = useT();

  const script: Script = {
    cursor: [
      { at: 0, to: [1180, 360] },
      { at: T.n1, to: "atur-n1", click: true },
      { at: T.n2, to: "atur-n2", click: true },
      { at: T.n3, to: "atur-n3", click: true },
      { at: 8.5, to: [1210, 520] },
      { at: 10.6, to: "atur-saklar-prospek" },
      { at: 12.6, to: "atur-saklar-spam" },
      { at: 16.0, to: [1210, 540] },
      { at: T.instruksi, to: "atur-instruksi", click: true, kind: "text", dy: -28 },
      { at: T.simpan, to: "atur-simpan", click: true },
      { at: 25.0, to: [1150, 420] },
      { at: T.saklar, to: "saklar-bot-tombol" },
    ],
    scroll: [
      { at: 0, to: "sec-pengaturan", align: 56 },
      { at: 9.35, to: "atur-prospek", align: 70, dur: 1.3 },
      { at: 17.2, to: "atur-instruksi", align: 150, dur: 1.3 },
      { at: 26.2, to: 0, dur: 1.5 },
    ],
    camera: [
      { at: 0, zoom: 1 },
      { at: 1.4, zoom: 1.45, focus: "cursor", dur: 1.2 },
      { at: 24.6, zoom: 1.45, focus: "cursor" },
      { at: 26.9, zoom: 1.3, focus: "saklar-bot", dur: 1.2 },
      { at: 30.7, zoom: 1, dur: 1.0 },
    ],
  };

  const c = (from: number, to: number, title: string, sub?: string): Cap => ({ from, to, label: "7 · ATUR", title, sub });
  const caps: Cap[] = [
    c(0.5, 8.2, "Serah-terima manusia ↔ AI: semuanya 5 detik", "AI menjawab bila pesan belum dibuka dalam 5 detik · mengambil alih 5 detik setelah chat dibuka · diam 5 detik setelah Anda membalas"),
    c(9.4, 15.6, "Saring spam & yang bukan prospek", "3 pesan beruntun di luar urusan usaha → chat dibisukan. Yang bertanya, memesan, atau komplain tetap dilayani"),
    c(17.0, 22.6, "Instruksi khusus: gaya bicara & alur nomor ini", "Fakta usaha (harga, jadwal) tetap ditaruh di base knowledge"),
    c(22.9, 24.8, "Klik Simpan untuk menerapkan"),
    c(26.9, 30.4, "Balasan otomatis langsung aktif begitu nomor tersambung", "Matikan kapan saja dengan satu klik: semua chat Anda balas sendiri"),
  ];

  return (
    <Stage
      url="/nomor/1#pengaturan"
      script={script}
      captions={caps}
      judulTab={NOMOR_BISNIS.label}
      fixed={<Sidebar aktif={1} nomor={[{ label: NOMOR_BISNIS.label, wa: NOMOR_BISNIS.wa, status: "WORKING" }]} pengguna={USAHA.pemilik} />}
    >
      <Main>
        <NomorFrame
          label={NOMOR_BISNIS.label}
          wa={NOMOR_BISNIS.wa}
          status="WORKING"
          saklar={1}
          navAktif={t < 25.2 ? "pengaturan" : "koneksi"}
          stat={{ masuk: 0, total7: 0, dibalas: 0, tren: [0, 0, 0, 0, 0, 0, 0], pelanggan: 0, masukTotal: 0, dok: 1, karakter: HASIL_RAPI.length }}
          slot={{ pengaturan: <PengaturanNomor t={t} /> }}
        />
      </Main>
    </Stage>
  );
}

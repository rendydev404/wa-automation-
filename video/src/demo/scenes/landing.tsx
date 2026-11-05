import { ArrowRight, BookOpenText, Camera, Check, GraduationCap, Hand, History, MessageSquareOff, Ban, Unplug, QrCode, Bot, Upload, Share2, Smartphone, Sparkles, TriangleAlert, Coffee, ShoppingBag, Stethoscope } from "lucide-react";
import { E, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { type Gel, Phone, WaScreen } from "../kit/phone";
import { type Script, Stage } from "../kit/stage";
import { Logo } from "../kit/ui";

const T = { tab: 4.75, cara2: 18.35, cara3: 20.1 };

const FITUR = [
  { ikon: BookOpenText, judul: "Jawab dari base knowledge", teks: "Unggah PDF, menu, harga, atau FAQ. AI hanya menyampaikan fakta yang Anda berikan dan tidak mengarang." },
  { ikon: Hand, judul: "Anda tetap pegang kendali", teks: "Membalas sendiri dari HP? AI otomatis diam di chat itu, lalu melanjutkan setelah jeda yang Anda atur." },
  { ikon: GraduationCap, judul: "Belajar dari balasan Anda", teks: "Cara Anda menjawab pelanggan dipelajari, jadi balasan AI makin mirip gaya usaha Anda." },
  { ikon: Camera, judul: "Mengerti foto pelanggan", teks: "Pelanggan kirim foto produk atau bukti transfer? AI bisa melihat dan menanggapinya." },
  { ikon: History, judul: "Histori percakapan", teks: "Chat 30 hari terakhir tercatat rapi: siapa yang membalas (AI atau Anda), dan bisa dicari kapan saja." },
  { ikon: Smartphone, judul: "Tanpa ganti nomor", teks: "Pakai nomor WhatsApp yang sudah ada. Tersambung sebagai perangkat tertaut, HP tetap bisa dipakai." },
];
/** Jendela sorot (detik) kartu fitur yang sedang dihampiri kursor. */
const SOROT_FITUR: [number, number][] = [[10.2, 11.5], [11.5, 12.7], [12.7, 13.9], [0, 0], [0, 0], [0, 0]];

const PAKET = [
  { nama: "Starter", desk: "Untuk usaha yang baru mulai.", harga: "99.000", nomor: 1, balasan: "1.000", unggul: false },
  { nama: "Bisnis", desk: "Paling banyak dipilih untuk toko dan jasa.", harga: "249.000", nomor: 3, balasan: "3.500", unggul: true },
  { nama: "Pro", desk: "Untuk tim, banyak nomor, dan volume chat tinggi.", harga: "599.000", nomor: 10, balasan: "10.000", unggul: false },
];

const SYARAT = [
  { ikon: MessageSquareOff, judul: "Matikan balasan otomatis WhatsApp Business", teks: "Nonaktifkan Pesan salam dan Pesan tidak di tempat (menu Alat bisnis) di nomor yang akan disambungkan." },
  { ikon: Unplug, judul: "Lepas layanan balas otomatis lain", teks: "Putuskan chatbot, aplikasi auto-reply, atau perangkat tertaut lain yang ikut membalas chat dari nomor ini." },
  { ikon: Ban, judul: "Bukan nomor WhatsApp Business API", teks: "Nomor yang terdaftar di WhatsApp Business API (Cloud API atau penyedia resminya) tidak bisa ditautkan lewat QR." },
];

const SKENARIO = [
  {
    nama: "Dapur Bu Rini", inisial: "DR",
    pesan: [
      { dari: "kita", teks: "Kak masih buka? Ada paket hemat?", at: 1.0 },
      { dari: "lawan", teks: "Halo Kak! Kami buka sampai 22.00 ✨ Paket Hemat (nasi + ayam bakar + es teh) Rp25.000. Mau diantar atau ambil sendiri?", at: 3.1 },
      { dari: "kita", teks: "Diantar ya ke Jl. Melati 5", at: 5.4 },
      { dari: "lawan", teks: "Siap! Ongkir ke Jl. Melati Rp8.000, estimasi 30 menit. Admin kami konfirmasi pesanannya di chat ini ya 🙏", at: 7.4 },
    ],
  },
  {
    nama: "Langkah Shoes", inisial: "LS",
    pesan: [
      { dari: "kita", teks: "Sepatu Runner ukuran 42 ready?", at: 0.6 },
      { dari: "lawan", teks: "Ready Kak! Runner ukuran 42 tersedia warna hitam & abu, harga Rp389.000. Gratis ongkir se-Jawa minggu ini 🚚", at: 2.4 },
      { dari: "kita", teks: "Bisa COD?", at: 4.2 },
      { dari: "lawan", teks: "Bisa Kak, COD tersedia untuk wilayah Jabodetabek. Boleh kirim nama & alamat lengkapnya?", at: 5.6 },
    ],
  },
] as const;

function PonselHero({ t }: { t: number }) {
  const tab = t >= T.tab ? 1 : 0;
  const s = SKENARIO[tab];
  const tt = tab === 0 ? t : t - T.tab;
  const pesan: Gel[] = s.pesan.map((p) => ({ dari: p.dari, teks: p.teks, jam: "09:41", baca: tt > p.at + 1.2, muncul: tw(tt, p.at, p.at + 0.4, 0, 1, E.out) }));
  // Gelembung "mengetik" AI sebelum tiap jawaban
  const ketik = s.pesan.reduce((a, p) => (p.dari === "lawan" ? Math.max(a, tw(tt, p.at - 1.3, p.at - 1.0, 0, 1) * (1 - tw(tt, p.at - 0.05, p.at, 0, 1))) : a), 0);
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="mb-5 flex justify-center gap-1.5 rounded-2xl border border-ink-line bg-white/[0.04] p-1.5">
        {[{ l: "Kuliner", i: Coffee }, { l: "Toko online", i: ShoppingBag }, { l: "Klinik & jasa", i: Stethoscope }].map((x, i) => (
          <div key={x.l} data-cur={`hero-tab-${i}`} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold ${tab === i ? "bg-ink-signal text-ink" : "text-ink-muted"}`}>
            <x.i className="size-3.5" /> {x.l}
          </div>
        ))}
      </div>
      <div className="mx-auto" style={{ width: 290 }}>
        <Phone scale={0.7}>
          <WaScreen nama={s.nama} inisial={s.inisial} status={ketik > 0.5 ? "sedang mengetik…" : "online"} pesan={pesan} mengetik={ketik} t={t} />
        </Phone>
      </div>
    </div>
  );
}

function PanelAlur({ langkah, t }: { langkah: number; t: number }) {
  const JUDUL = ["Scan QR, tersambung", "Beri pengetahuan", "AI membalas"];
  const SUB = ["Seperti WhatsApp Web. Tanpa aplikasi tambahan.", "Unggah PDF atau tulis teks. AI hanya menjawab dari sini.", "Pelanggan dijawab 24/7. Begitu Anda membalas, AI diam."];
  return (
    <div className="relative aspect-[1200/700] w-full overflow-hidden rounded-[28px] bg-ink-raised">
      <div aria-hidden className="kisi-tinta absolute inset-0 opacity-70" />
      <div className="absolute top-10 left-12">
        <p className="text-[13px] font-extrabold tracking-[0.2em] text-ink-signal">LANGKAH {langkah + 1}</p>
        <p className="mt-2 text-[40px] leading-tight font-extrabold tracking-tight text-white">{JUDUL[langkah]}</p>
        <p className="mt-2 text-[16px] text-ink-muted">{SUB[langkah]}</p>
      </div>
      <div className="absolute bottom-10 left-12 flex items-end gap-6">
        {langkah === 0 && (
          <div className="relative size-48 rounded-2xl bg-white p-3.5">
            <div className="grid size-full grid-cols-[repeat(13,1fr)] gap-px">
              {Array.from({ length: 169 }, (_, i) => {
                const x = i % 13;
                const y = Math.floor(i / 13);
                const ang = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8);
                return <span key={i} className="rounded-[1px]" style={{ background: ang || (x * 5 + y * 7 + x * y) % 3 === 0 ? "#0b1813" : "transparent" }} />;
              })}
            </div>
            <span className="absolute inset-x-3 h-1 rounded-full bg-ink-signal" style={{ top: 14 + tw(t % 3, 0, 3, 0, 150, E.io), boxShadow: "0 0 18px 4px #3ddc97" }} />
          </div>
        )}
        {langkah === 1 && (
          <div className="grid grid-cols-2 gap-3">
            {["Menu & harga.pdf", "Jam buka.txt", "FAQ pelanggan.md", "Cara bayar.pdf"].map((d, i) => (
              <div key={d} className="rounded-xl border border-ink-line bg-white/[0.06] px-4 py-3 text-[14px] font-semibold text-ink-fg" style={{ opacity: tw(t, 0.1 + i * 0.15, 0.5 + i * 0.15) }}>{d}</div>
            ))}
          </div>
        )}
        {langkah === 2 && (
          <div className="space-y-2.5">
            <div className="max-w-[340px] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5 text-[14px] text-ink-fg">Kak masih buka? Ada paket hemat?</div>
            <div className="ml-10 max-w-[360px] rounded-2xl rounded-br-md bg-ink-signal px-4 py-2.5 text-[14px] font-medium text-ink">Halo Kak! Paket Hemat Rp25.000 ✨ Mau diantar atau ambil sendiri?</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Landing() {
  const t = useT();
  const hoverFitur = (i: number) => t >= SOROT_FITUR[i][0] && t < SOROT_FITUR[i][1];
  const hoverHarga = t > 27.9 && t < 30.2;
  const caraAktif = t >= T.cara3 ? 2 : t >= T.cara2 ? 1 : 0;

  const script: Script = {
    cursor: [
      { at: 0, to: [1180, 520] },
      { at: 3.4, to: [1060, 330], kind: "arrow" },
      { at: 4.65, to: "hero-tab-1", click: true },
      { at: 6.6, to: [780, 330] },
      { at: 7.4, to: [820, 400] },
      { at: 10.15, to: "fitur-1" },
      { at: 11.45, to: "fitur-2" },
      { at: 12.65, to: "fitur-3" },
      { at: 14.4, to: [760, 330] },
      { at: 17.2, to: [760, 330] },
      { at: T.cara2 - 0.05, to: "cara-2", click: true },
      { at: T.cara3 - 0.05, to: "cara-3", click: true },
      { at: 22.2, to: [980, 420] },
      { at: 24.2, to: [900, 440] },
      { at: 27.8, to: "harga-2" },
      { at: 30.0, to: [860, 400] },
      { at: 31.2, to: [1100, 300] },
      { at: 32.5, to: "hdr-daftar", click: true },
    ],
    scroll: [
      { at: 0, to: 0 },
      { at: 3.0, to: 112, dur: 1.2 },
      { at: 9.6, to: "sec-fitur", align: -64, dur: 2.2 },
      { at: 16.1, to: "sec-cara", align: -64, dur: 1.7 },
      { at: 21.5, to: "sec-syarat", align: -70, dur: 1.5 },
      { at: 26.0, to: "sec-harga", align: -64, dur: 1.8 },
      { at: 31.0, to: 0, dur: 1.6 },
    ],
    camera: [
      { at: 0, zoom: 1 },
      { at: 4.4, zoom: 1.3, focus: [1140, 330], dur: 1.4 },
      { at: 7.4, zoom: 1, dur: 1.1 },
      { at: 27.6, zoom: 1.14, focus: "harga-2", dur: 1.2 },
      { at: 30.2, zoom: 1, dur: 1.0 },
      { at: 31.9, zoom: 1.3, focus: "hdr-daftar", dur: 1.0 },
    ],
  };

  const caps: Cap[] = [
    { from: 0.9, to: 4.6, label: "1 · KENALI", title: "ChatGerCep membalas chat WhatsApp pelanggan otomatis", sub: "24 jam, murni dari pengetahuan usaha Anda sendiri" },
    { from: 5.2, to: 8.4, label: "1 · KENALI", title: "Cocok untuk kuliner, toko online, klinik & jasa", sub: "Contoh percakapan nyata ada di halaman depan" },
    { from: 9.9, to: 13.0, label: "1 · KENALI", title: "Jawab hanya dari base knowledge, tidak mengarang", sub: "Unggah PDF, menu, harga, atau FAQ usaha Anda" },
    { from: 13.1, to: 15.8, label: "1 · KENALI", title: "Anda tetap pegang kendali", sub: "Balas dari HP? AI otomatis diam di chat itu" },
    { from: 16.6, to: 21.2, label: "1 · KENALI", title: "Tiga langkah, langsung jalan", sub: "Scan QR → isi pengetahuan → AI membalas pelanggan" },
    { from: 21.8, to: 24.3, label: "1 · KENALI", title: "Syarat nomor: tanpa balasan otomatis lain", sub: "Matikan auto-reply WhatsApp Business & bot lain agar tidak ada balasan ganda" },
    { from: 26.5, to: 30.6, label: "1 · KENALI", title: "Mulai Rp99.000 / 30 hari, paket Bisnis paling dipilih", sub: "Akun baru gratis: 5 balasan AI selama 7 hari, tanpa kartu kredit" },
    { from: 31.6, to: 33.8, label: "1 · KENALI", title: "Saatnya mencoba: Daftar gratis" },
  ];

  return (
    <Stage url="/" script={script} captions={caps} judulTab="ChatGerCep">
      <div className="bg-canvas">
        {/* ---------- Hero ---------- */}
        <div className="relative overflow-hidden bg-ink text-ink-fg">
          <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
          <div aria-hidden className="absolute -top-40 left-1/2 size-[720px] -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(61,220,151,0.20), transparent)" }} />
          <header className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-5">
            <Logo ukuran="md" gelap />
            <nav className="flex items-center gap-7 text-[13.5px] font-semibold text-ink-muted">
              <span>Fitur</span>
              <span>Cara kerja</span>
              <span>Harga</span>
              <span>Keamanan</span>
              <span>FAQ</span>
              <span className="inline-flex items-center gap-1.5 text-ink-signal"><Share2 className="size-3.5" /> Afiliasi</span>
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-xl px-3.5 py-2 text-[13.5px] font-semibold whitespace-nowrap text-ink-fg">Masuk</span>
              <span data-cur="hdr-daftar" className="rounded-xl bg-ink-signal px-4 py-2 text-[13.5px] font-bold whitespace-nowrap text-ink">Daftar gratis</span>
            </div>
          </header>
          <section className="relative mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-center gap-12 px-6 pt-12 pb-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-ink-signal/30 bg-ink-signal/10 px-3 py-1.5 text-[12.5px] font-semibold text-ink-signal">
                <span className="relative flex size-2"><span className="relative size-2 rounded-full bg-ink-signal" /></span>
                AI membalas 24 jam, termasuk saat Anda tidur
              </p>
              <h1 className="mt-6 text-[64px] leading-[1.05] font-extrabold tracking-tight text-white">
                Pelanggan dibalas
                <br />
                <span className="bg-gradient-to-r from-ink-signal to-[#a7f3d0] bg-clip-text text-transparent">dalam hitungan detik.</span>
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted">
                Sambungkan WhatsApp usaha Anda dengan scan QR, isi pengetahuan tentang produk dan layanan, lalu biarkan AI menjawab pertanyaan pelanggan secara sopan dan akurat.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span data-cur="hero-cta" className="inline-flex items-center gap-2 rounded-2xl bg-ink-signal px-6 py-3.5 text-[15px] font-bold text-ink shadow-[0_12px_40px_-12px_rgba(61,220,151,0.7)]">
                  Mulai gratis <ArrowRight className="size-4" />
                </span>
                <span className="inline-flex items-center gap-2 rounded-2xl border border-ink-signal/40 bg-ink-signal/10 px-5 py-3.5 text-[15px] font-bold text-ink-signal">
                  <Smartphone className="size-4" /> Coba Tes WA (+62 895-3548-73838)
                </span>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted">
                {["Tanpa kartu kredit", "1 nomor gratis", "Putuskan kapan saja"].map((x) => (
                  <li key={x} className="flex items-center gap-1.5"><Check className="size-4 text-ink-signal" /> {x}</li>
                ))}
              </ul>
            </div>
            <PonselHero t={t} />
          </section>
        </div>

        {/* ---------- Angka ---------- */}
        <section className="border-b border-line bg-surface">
          <dl className="mx-auto grid max-w-[1200px] grid-cols-4 gap-6 px-6 py-10">
            {[["< 10 dtk", "rata-rata waktu balas"], ["24/7", "tanpa jam kerja"], ["2 menit", "dari daftar sampai tersambung"], ["0", "aplikasi tambahan di HP"]].map(([a, b]) => (
              <div key={b}>
                <dd className="text-3xl font-extrabold tracking-tight text-fg">{a}</dd>
                <dd className="mt-1 text-[13px] text-muted">{b}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---------- Fitur ---------- */}
        <section data-cur="sec-fitur" className="mx-auto max-w-[1200px] px-6 py-28">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">Fitur</p>
            <h2 className="mt-2 text-[40px] font-extrabold tracking-tight">Seperti punya CS yang tidak pernah lelah.</h2>
            <p className="mt-3 text-[16px] text-muted">Semua yang dibutuhkan untuk membalas pelanggan dengan cepat, tanpa kehilangan sentuhan pribadi usaha Anda.</p>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-4">
            {FITUR.map((f, i) => {
              const h = hoverFitur(i);
              return (
                <article key={f.judul} data-cur={`fitur-${i + 1}`} className={`rounded-3xl border bg-surface p-6 shadow-card ${h ? "border-accent/30 shadow-pop" : "border-line"}`} style={{ transform: h ? "translateY(-4px)" : undefined }}>
                  <span className={`grid size-11 place-items-center rounded-2xl ${h ? "bg-accent text-on-accent" : "bg-accent-soft text-accent"}`}>
                    <f.ikon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-[16px] font-bold">{f.judul}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.teks}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* ---------- Cara kerja ---------- */}
        <section data-cur="sec-cara" className="bg-ink py-28 text-ink-fg">
          <div className="mx-auto max-w-[1200px] px-6">
            <div className="max-w-2xl">
              <p className="text-[12px] font-bold tracking-[0.1em] text-ink-signal uppercase">Cara kerja</p>
              <h2 className="mt-2 text-[40px] font-extrabold tracking-tight text-white">Tiga langkah, langsung jalan.</h2>
              <p className="mt-3 text-[16px] text-ink-muted">Klik tiap langkah untuk melihat animasinya.</p>
            </div>
            <div className="mt-12 grid grid-cols-[360px_minmax(0,1fr)] items-center gap-12">
              <ol className="space-y-3">
                {[
                  { i: QrCode, j: "Scan QR", x: "Buka WhatsApp di HP → Perangkat tertaut → scan. Nomor Anda tersambung dalam detik." },
                  { i: Upload, j: "Isi pengetahuan", x: "Unggah menu, harga, FAQ, atau kebijakan. AI hanya menjawab dari yang Anda berikan." },
                  { i: Bot, j: "AI membalas", x: "Pelanggan dijawab 24/7. Begitu Anda membalas sendiri, AI otomatis diam di chat itu." },
                ].map((l, i) => (
                  <li key={l.j}>
                    <div data-cur={`cara-${i + 1}`} className={`flex w-full gap-4 rounded-2xl border p-4 text-left ${caraAktif === i ? "border-ink-signal/50 bg-ink-signal/[0.08]" : "border-ink-line"}`}>
                      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${caraAktif === i ? "bg-ink-signal text-ink" : "bg-white/[0.06] text-ink-muted"}`}><l.i className="size-5" /></span>
                      <span>
                        <span className="block text-[15px] font-bold text-ink-fg">{i + 1}. {l.j}</span>
                        <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-muted">{l.x}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <PanelAlur langkah={caraAktif} t={t - (caraAktif === 0 ? 17 : caraAktif === 1 ? T.cara2 : T.cara3)} />
            </div>
          </div>
        </section>

        {/* ---------- Syarat nomor ---------- */}
        <section data-cur="sec-syarat" className="mx-auto max-w-[1200px] px-6 pt-28">
          <div className="rounded-[28px] border border-warning/30 bg-warning-soft/50 p-10">
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-8">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-[12px] font-bold tracking-[0.06em] text-warning uppercase">
                  <TriangleAlert className="size-3.5" /> Syarat nomor
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight">Nomor tidak boleh terhubung ke balasan otomatis lain</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">Bila dua sistem membalas bersamaan, pelanggan menerima balasan ganda yang saling bertabrakan dan nomor berisiko dibatasi WhatsApp.</p>
              </div>
              <ul className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                {SYARAT.map((x, i) => (
                  <li key={x.judul} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                    <div className="flex items-center justify-between">
                      <x.ikon className="size-5 text-warning" />
                      <span className="text-[12px] font-bold text-faint tabular-nums">0{i + 1}</span>
                    </div>
                    <p className="mt-3 text-[14.5px] font-bold">{x.judul}</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{x.teks}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- Harga ---------- */}
        <section data-cur="sec-harga" className="mx-auto max-w-[1200px] px-6 pt-28 pb-28">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">Harga</p>
            <h2 className="mt-2 text-[40px] font-extrabold tracking-tight">Pilih paket sesuai kebutuhan.</h2>
            <p className="mt-3 text-[16px] text-muted">Tanpa kontrak. Perpanjang kapan saja, kuota balasan AI langsung bertambah.</p>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-4">
            {PAKET.map((p, i) => (
              <article key={p.nama} data-cur={`harga-${i + 1}`} className={`relative flex flex-col rounded-3xl border bg-surface p-7 shadow-card ${p.unggul ? "border-accent ring-2 ring-accent" : "border-line"}`} style={{ transform: p.unggul && hoverHarga ? "translateY(-6px)" : undefined, boxShadow: p.unggul && hoverHarga ? "var(--shadow-pop)" : undefined }}>
                {p.unggul && (
                  <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11.5px] font-bold text-on-accent"><Sparkles className="size-3" /> Paling banyak dipilih</span>
                )}
                <h3 className="text-xl font-bold">{p.nama}</h3>
                <p className="mt-1 text-[14px] text-muted">{p.desk}</p>
                <p className="mt-5 text-4xl font-extrabold tracking-tight tabular-nums">Rp{p.harga}<span className="text-[14px] font-semibold text-muted"> / 30 hari</span></p>
                <ul className="mt-5 flex-1 space-y-2.5 text-[14px]">
                  {[`${p.nomor} nomor WhatsApp`, `${p.balasan} balasan AI`, "Base knowledge & belajar dari balasanmu", "Histori percakapan 30 hari & statistik"].map((x) => (
                    <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent" /> {x}</li>
                  ))}
                </ul>
                <span className={`btn mt-6 w-full justify-center ${p.unggul ? "btn-primary" : "btn-ghost"}`}>Mulai sekarang</span>
              </article>
            ))}
            <p className="col-span-3 text-[13px] text-muted">Coba gratis dulu: setiap akun baru mendapat 5 balasan AI percobaan selama 7 hari tanpa kartu kredit. Bayar lewat QRIS, transfer bank, e-wallet, atau kartu.</p>
          </div>
        </section>
        <div className="h-20" />
      </div>
    </Stage>
  );
}

/** Durasi scene (detik). */
export const DUR = 34.2;

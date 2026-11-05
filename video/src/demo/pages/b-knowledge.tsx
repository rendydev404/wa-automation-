import { ArrowLeft, Check, ChevronDown, Circle, Download, FileText, PencilLine, RotateCcw, Sparkles, Trash2, Type, UploadCloud } from "lucide-react";
import { E, angka, kedip, tw } from "../kit/anim";
import { Spin } from "../kit/phone";

/* Panel "Base knowledge" — markup disalin dari knowledge-panel.tsx, editor-knowledge.tsx, loading-ai.tsx. */

export const KERANGKA_KULINER = [
  "Nama usaha: ",
  "Tentang usaha: (contoh: apa yang dijual atau dikerjakan, sejak kapan, keunggulan)",
  'Gaya bahasa: santai dan ramah, panggil pelanggan "Kak"/"Kakak" (menyesuaikan pelanggan)',
  "",
  "Menu & harga (satu per baris, dengan harga):",
  "- (contoh: nama, harga, varian atau keterangan)",
  "- ",
  "",
  "Jam buka: (contoh: hari dan jam layanan)",
  "Alamat: ",
  "Area layanan / pengiriman: ",
  "Cara pesanan: ",
  "Cara bayar: (contoh: transfer bank, QRIS, tunai)",
  "Pengiriman: ",
  "Kebijakan (pembatalan, penukaran, garansi): ",
  "Promo yang sedang berlaku: ",
  "",
  "Saat pelanggan memesan, tanyakan: nama, pilihan beserta jumlahnya, alamat atau lokasi bila perlu, waktu yang diinginkan, cara bayar",
  "",
  "Pertanyaan yang sering ditanya:",
  "T: ",
  "J: ",
  "",
  "Serahkan ke pemilik bila: pertanyaan yang tidak ada di catatan ini, pelanggan minta bicara dengan pemilik, permintaan khusus atau keluhan",
].join("\n");

const JENIS = [
  ["🍜", "Kuliner"],
  ["🛍️", "Toko online"],
  ["🛠️", "Jasa"],
  ["💇", "Salon, barbershop"],
  ["📚", "Kursus"],
  ["🏪", "Usaha lainnya"],
] as const;

/** Lima hal yang paling sering ditanya pelanggan (KELENGKAPAN di templat-usaha.ts). */
const KELENGKAPAN = [
  { kunci: "nama", label: "Nama usaha", pola: /dapur bu rini/i },
  { kunci: "harga", label: "Produk & harga", pola: /(?:rp\.?\s*\d|\d+\s*(?:rb|ribu|k|jt|juta)\b|\d{1,3}(?:[.,]\d{3})+|\b\d{4,}\b)/i },
  { kunci: "jam", label: "Jam buka", pola: /\b(?:jam|buka|tutup|setiap hari|tiap hari|senin|selasa|rabu|kamis|jumat|sabtu|minggu|24 jam)\b|\b\d{1,2}[.:]\d{2}\b/i },
  { kunci: "lokasi", label: "Alamat / area", pola: /\b(?:jl\.?|jalan|alamat|kota|kab(?:upaten)?|kec(?:amatan)?|maps|area|lokasi|seluruh indonesia|online)\b/i },
  { kunci: "bayar", label: "Cara pesan & bayar", pola: /\b(?:bayar|transfer|qris|cod|rekening|tunai|cash|dana|ovo|gopay|shopeepay|e-?wallet)\b/i },
] as const;

const CONTOH_BEBAS = "Tulis seperti chat biasa: nama usaha, apa yang dijual beserta harganya, jam buka, alamat atau area layanan, cara pesan, dan cara bayar.";

export interface DokS {
  judul: string;
  sumber: "pdf" | "berkas" | "teks";
  ukuran?: string;
  karakter: number;
  tanggal: string;
  /** Baris disorot (kursor di atasnya). */
  sorot?: boolean;
}

export interface KnowledgeS {
  t: number;
  tab: "tulis" | "unggah";
  tahap: "tulis" | "proses" | "hasil" | "tersimpan";
  jenisPilih: boolean;
  /** Teks yang tampil di editor (yang diketik). */
  teks: string;
  /** Tampilkan kerangka isian (setelah chip jenis usaha diklik) alih-alih `teks`. */
  kerangka: boolean;
  pilihSemua: boolean;
  fokus: boolean;
  /** Detik sejak AI mulai merapikan (di-skala jadi "detik" asli di tampilan). */
  proses: number;
  judul: string;
  hasil: string;
  hasilGulir: number;
  docs: DokS[];
  total: number;
  /** Area unggah: sorot saat berkas diseret; ghost = berkas yang sedang diseret (dx,dy relatif pusat area). */
  seret: boolean;
  ghost: { dx: number; dy: number; op: number } | null;
  unggah: { nama: string; status: "proses" | "ok"; pesan?: string } | null;
}

export const BATAS_UTUH = 14_000;

function LoadingAi({ judul, t }: { judul: string; t: number }) {
  const LANGKAH = [
    { dari: 0, teks: "Membaca tulisan Anda" },
    { dari: 4, teks: "Menyusun menu, harga, dan jam buka" },
    { dari: 11, teks: "Memeriksa angka, alamat, dan nomor" },
    { dari: 19, teks: "Menyusun jadi dokumen yang rapi" },
  ];
  const BARIS = [100, 88, 94, 62, 100, 80, 46];
  // Dipercepat: 1 detik video = 3,8 detik asli.
  const detik = Math.floor(t * 3.8);
  const aktif = LANGKAH.reduce((n, l, i) => (detik >= l.dari ? i : n), 0);
  const sapu = E.io((t % 2.2) / 2.2);
  const geser = -120 + sapu * 340;
  const masuk = (t0: number) => tw(t, t0, t0 + 0.7, 0, 1, (x) => 1 - Math.pow(1 - x, 3));
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div aria-hidden className="relative h-0.5 overflow-hidden bg-accent-soft">
        <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent" style={{ transform: `translateX(${geser}%)` }} />
      </div>
      <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
        <div aria-hidden className="relative w-52 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-pop">
          <span className="block h-2.5 w-2/5 rounded-full bg-accent" style={{ transformOrigin: "left", transform: `scaleX(${masuk(0)})`, opacity: masuk(0) }} />
          <div className="mt-4 space-y-2.5">
            {BARIS.map((l, i) => (
              <span key={i} className="block h-1.5 rounded-full bg-line-strong/60" style={{ width: `${l}%`, transformOrigin: "left", transform: `scaleX(${masuk(0.25 + i * 0.3)})`, opacity: masuk(0.25 + i * 0.3) }} />
            ))}
          </div>
          <span className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent" style={{ transform: `translateX(${geser}%)` }} />
        </div>
        <p className="mt-6 text-[15px] font-bold tracking-tight">{judul}</p>
        <p className="mt-1 text-[13.5px] text-muted">{LANGKAH[aktif].teks}…</p>
        <ol className="mt-5 flex w-52 gap-1.5">
          {LANGKAH.map((l, i) => (
            <li key={l.teks} className={`h-1 flex-1 rounded-full ${i <= aktif ? "bg-accent" : "bg-line"}`} />
          ))}
        </ol>
        <p className="mt-4 max-w-xs text-[12px] text-faint">Harga, jam, dan alamat tetap persis seperti yang Anda tulis.</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-[12px] text-faint tabular-nums">Biasanya 10–40 detik · {detik} dtk</span>
        <span className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-muted">Batal</span>
      </div>
    </div>
  );
}

function Tulis({ s }: { s: KnowledgeS }) {
  const { teks, kerangka, t } = s;
  const isi = kerangka ? "" : teks;
  const kosong = isi.length < 20;
  const lengkap = Object.fromEntries(KELENGKAPAN.map((k) => [k.kunci, !kerangka && k.pola.test(isi)])) as Record<string, boolean>;
  const tampil = kerangka ? KERANGKA_KULINER : teks;
  const nonaktif = { opacity: 0.55 };
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <span className="grid size-6 place-items-center rounded-full bg-accent text-[12px] text-on-accent">1</span>
        Ceritakan usaha Anda dengan bahasa sendiri
      </p>

      {kosong ? (
        <div>
          <p className="text-[12.5px] text-muted">Bingung mulai dari mana? Pilih jenis usaha untuk mendapat kerangka isian:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {JENIS.map(([ikon, label], i) => {
              const aktif = i === 0 && s.jenisPilih;
              return (
                <span
                  key={label}
                  data-cur={i === 0 ? "chip-kuliner" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${aktif ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted"}`}
                >
                  <span aria-hidden>{ikon}</span>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        s.jenisPilih && (
          <p className="text-[12.5px] text-muted">
            Kerangka: <b className="text-fg">🍜 Kuliner / makanan &amp; minuman</b>. Isi setelah tanda titik dua; tulisan &quot;(contoh: …)&quot; boleh dibiarkan, tidak ikut disimpan.
          </p>
        )
      )}

      <div data-cur="area-info" className={`field overflow-hidden leading-relaxed ${s.fokus ? "field-fokus" : ""}`} style={{ height: 340, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {tampil === "" && !s.fokus ? (
          <span className="text-faint">{CONTOH_BEBAS + "\n\nTidak perlu rapi atau lengkap: AI yang merapikan. Sudah punya daftar harga? Tempel saja di sini."}</span>
        ) : tampil === "" ? (
          <>
            <span className="inline-block h-[1.15em] w-px translate-y-[3px] bg-fg" style={{ opacity: kedip(t) ? 1 : 0 }} />
            <span className="text-faint">{CONTOH_BEBAS + "\n\nTidak perlu rapi atau lengkap: AI yang merapikan. Sudah punya daftar harga? Tempel saja di sini."}</span>
          </>
        ) : (
          <>
            <span style={s.pilihSemua ? { background: "#b3d4fc" } : undefined}>{tampil}</span>
            {s.fokus && !s.pilihSemua && <span className="inline-block h-[1.15em] w-px translate-y-[3px] bg-fg" style={{ opacity: kedip(t) ? 1 : 0 }} />}
          </>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-muted">Yang paling sering ditanya pelanggan:</p>
        <ul className="flex flex-wrap gap-1.5">
          {KELENGKAPAN.map((k) => (
            <li key={k.kunci} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${lengkap[k.kunci] ? "bg-success-soft text-success" : "bg-subtle text-faint"}`}>
              {lengkap[k.kunci] ? <Check className="size-3.5" /> : <Circle className="size-3" />}
              {k.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span data-cur="btn-rapikan" className="btn btn-primary" style={kosong ? nonaktif : undefined}>
          <Sparkles className="size-4" /> Rapikan dengan AI
        </span>
        <span className="btn btn-ghost" style={kosong ? nonaktif : undefined}>Simpan tanpa dirapikan</span>
        <span className="ml-auto text-[11.5px] text-faint tabular-nums">{angka(isi.length)} karakter</span>
      </div>
    </div>
  );
}

function Hasil({ s }: { s: KnowledgeS }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[14px] font-bold">
          <span className="grid size-6 place-items-center rounded-full bg-accent text-[12px] text-on-accent">2</span>
          Periksa hasilnya, lalu simpan
        </p>
      </div>
      <div className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-3 text-[13px]">
        <p className="font-semibold text-warning">Supaya AI bisa menjawab lebih banyak, lengkapi juga:</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-fg">
          <li>Kebijakan (pembatalan, penukaran, garansi)</li>
          <li>Promo yang sedang berlaku</li>
        </ul>
        <span className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent">
          <PencilLine className="size-3.5" /> Lengkapi lalu rapikan lagi
        </span>
      </div>
      <div>
        <span className="label">Judul dokumen</span>
        <div className="field">{s.judul}</div>
      </div>
      <div>
        <span className="label">
          Isi yang dibaca AI <span className="font-normal text-faint">(boleh diedit langsung)</span>
        </span>
        <div data-cur="area-hasil" className="field overflow-hidden text-[13px] leading-relaxed" style={{ height: 358, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          <div style={{ transform: `translateY(${-s.hasilGulir}px)` }}>{s.hasil}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-cur="btn-simpan" className="btn btn-primary">
          <Check className="size-4" /> Simpan ke base knowledge
        </span>
        <span className="btn btn-ghost border border-line">
          <ArrowLeft className="size-4" /> Ubah tulisan saya
        </span>
        <span className="btn btn-ghost">
          <RotateCcw className="size-4" /> Rapikan ulang
        </span>
      </div>
    </div>
  );
}

function Unggah({ s }: { s: KnowledgeS }) {
  return (
    <div>
      <div data-cur="dropzone" className={`relative grid w-full place-items-center rounded-xl border-2 border-dashed px-4 py-9 text-center ${s.seret ? "border-accent bg-accent-soft" : "border-line-strong"}`}>
        <UploadCloud className="mb-2 size-7 text-accent" />
        <span className="text-[14px] font-semibold">Seret berkas ke sini atau klik untuk memilih</span>
        <span className="hint mt-1">PDF atau teks (.txt, .md, .csv) · maks 10 MB per berkas</span>
        {s.ghost && (
          <span
            className="absolute z-[70] flex items-center gap-2 rounded-lg border border-line-strong bg-white px-3 py-2 text-[12.5px] font-semibold text-fg"
            style={{ left: `calc(50% + ${s.ghost.dx}px)`, top: `calc(50% + ${s.ghost.dy}px)`, opacity: s.ghost.op, transform: "rotate(-3deg)", boxShadow: "0 14px 30px -10px rgba(21,32,27,0.4)" }}
          >
            <span className="grid size-6 place-items-center rounded bg-danger-soft text-[9px] font-extrabold text-danger">PDF</span>
            Daftar-Harga-Catering.pdf
          </span>
        )}
      </div>
      {s.unggah && (
        <ul className="mt-3 space-y-1.5">
          <li className="flex items-center gap-2 text-[13px]">
            {s.unggah.status === "proses" ? <Spin t={s.t} className="size-4 shrink-0 text-muted" /> : <Check className="size-4 shrink-0 text-success" />}
            <span className="truncate font-medium">{s.unggah.nama}</span>
            <span className="text-muted">{s.unggah.status === "proses" ? "membaca…" : s.unggah.pesan}</span>
          </li>
        </ul>
      )}
    </div>
  );
}

function Baris({ d, i }: { d: DokS; i: number }) {
  const Ikon = d.sumber === "teks" ? Type : FileText;
  return (
    <li>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
          <Ikon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13.5px] font-semibold">{d.judul}</p>
          <p className="hint">
            {d.sumber === "pdf" ? "PDF" : d.sumber === "berkas" ? "Berkas teks" : "Teks"}
            {d.ukuran && ` · ${d.ukuran}`} · {angka(d.karakter)} karakter · {d.tanggal}
          </p>
        </div>
        <span data-cur={`btn-sempurnakan-${i + 1}`} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-accent ${d.sorot ? "bg-accent-soft" : ""}`}>
          <Sparkles className="size-4" /> Sempurnakan
        </span>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg text-faint">
          <ChevronDown className="size-4" />
        </span>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg text-faint">
          <Download className="size-4" />
        </span>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg text-faint">
          <Trash2 className="size-4" />
        </span>
      </div>
    </li>
  );
}

export function KnowledgePanelS({ s }: { s: KnowledgeS }) {
  return (
    <section className="card">
      <div className="border-b border-line px-6 py-4">
        <h2 className="text-[15px] font-bold tracking-tight">Base knowledge</h2>
        <p className="hint mt-0.5">
          {s.total === 0
            ? "Catatan yang dipakai AI untuk menjawab pelanggan: produk, harga, jam buka, alamat, cara pesan. Yang tidak tertulis tidak akan dikarang AI."
            : s.total <= BATAS_UTUH
              ? `${angka(s.total)} karakter · seluruh isi dibaca AI di setiap pesan.`
              : `${angka(s.total)} karakter · AI membaca bagian yang paling relevan dengan pertanyaan pelanggan.`}
        </p>
      </div>

      <div className="px-6 pt-5">
        <div data-cur="tabs" className="inline-grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1">
          {(
            [
              ["tulis", "Tulis", " dengan bantuan AI", Sparkles],
              ["unggah", "Unggah", " berkas", UploadCloud],
            ] as const
          ).map(([k, label, ekor, Ikon]) => (
            <span
              key={k}
              data-cur={`tab-${k}`}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold ${s.tab === k ? "bg-surface text-fg shadow-card" : "text-muted"}`}
            >
              <Ikon className="size-4" /> {label}
              <span>{ekor}</span>
            </span>
          ))}
        </div>
        <div data-cur="editor" className="mt-4">
          {s.tab === "unggah" ? (
            <Unggah s={s} />
          ) : s.tahap === "tulis" ? (
            <Tulis s={s} />
          ) : s.tahap === "proses" ? (
            <LoadingAi judul="AI sedang merapikan tulisan Anda…" t={s.proses} />
          ) : s.tahap === "hasil" ? (
            <Hasil s={s} />
          ) : (
            <div className="rounded-2xl border border-success/30 bg-success-soft/50 p-5">
              <p className="flex items-center gap-2 text-[14px] font-bold text-success">
                <Check className="size-4" /> Tersimpan ke base knowledge
              </p>
              <p className="mt-1 text-[13px] text-muted">Coba di Uji bot: tanyakan harga, jam buka, atau coba pesan sesuatu seperti pelanggan.</p>
              <span className="btn btn-ghost mt-3 border border-line">Tulis info lain</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pt-6 pb-5">
        <p className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">Tersimpan ({s.docs.length})</p>
        {s.docs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">Belum ada. Tulis info usaha Anda di atas, atau unggah daftar harga/menu dalam PDF.</p>
        ) : (
          <ul data-cur="daftar-dok" className="divide-y divide-line rounded-xl border border-line">
            {s.docs.map((d, i) => (
              <Baris key={d.judul} d={d} i={i} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

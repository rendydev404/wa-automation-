import { ArrowLeft, ArrowRight, Ban, Check, MessageSquareOff, QrCode, TriangleAlert, Unplug, X } from "lucide-react";
import React, { type ReactNode } from "react";

void React;
import { USAHA } from "../data";
import { E, ketik, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { Spin } from "../kit/phone";
import { type Script, Stage } from "../kit/stage";
import { Isi, LatarDialog, Main, Sidebar } from "../kit/ui";
import { Ringkasan } from "../pages/dashboard";

/** Durasi scene (detik). */
export const DUR = 34.6;

/** Waktu klik "Lanjut"/"Mengerti" pada tiap langkah panduan, lalu tahap dialog Tambah nomor. */
const C = [4.7, 8.6, 12.4, 16.2, 20.0, 23.7];
/** Posisi tombol Lanjut/Mengerti tiap langkah (px logis di viewport). Pakai koordinat, bukan nama: tombolnya hilang saat langkah berganti. */
const TUR_BTN: [number, number][] = [[833, 464], [1358, 356], [590, 400], [309, 626], [309, 486], [300, 551]];
const T = { tambah: 26.2, nama: 27.5, cek: 30.5, buat: 32.0 };
const NAMA_NOMOR = "CS Utama";

/** Isi panduan: sama persis dengan TUR_DASHBOARD (src/components/isi-tur.tsx). */
const TUR: { judul: string; isi: ReactNode }[] = [
  {
    judul: "Selamat datang 👋",
    isi: (
      <>
        <p>Di sini kamu punya asisten AI yang membalas chat WhatsApp pelanggan secara otomatis, 24 jam.</p>
        <p>Cukup 3 langkah: sambungkan nomor WhatsApp, isi pengetahuan tentang usahamu, lalu biarkan AI bekerja.</p>
      </>
    ),
  },
  { judul: "1. Tambahkan nomor WhatsApp", isi: <p>Klik di sini, beri nama (mis. &quot;CS Toko&quot;), lalu scan kode QR yang muncul dari HP kamu, sama seperti membuka WhatsApp Web. Nomor tetap bisa kamu pakai seperti biasa di HP.</p> },
  { judul: "Pantau dari sini", isi: <p>Jumlah pesan masuk, berapa yang sudah dibalas AI, dan nomor yang tersambung terlihat di halaman ini setiap hari.</p> },
  { judul: "2. Atur tiap nomor", isi: <p>Klik nama nomor di daftar ini untuk mengisi pengetahuan AI, mencoba AI, dan mengatur kapan AI membalas.</p> },
  { judul: "Paket & kuota", isi: <p>Lihat sisa kuota balasan AI dan pilih paket bila butuh lebih banyak nomor atau balasan. Pembayaran lewat QRIS, transfer bank, atau e-wallet.</p> },
  { judul: "Butuh penjelasan lagi?", isi: <p>Klik &quot;Panduan&quot; kapan saja untuk melihat penjelasan ini lagi.</p> },
];

/** Kartu panduan (tur.tsx). Posisinya diatur Stage lewat atribut data-tour-card. */
function KartuTur({ i, opacity }: { i: number; opacity: number }) {
  const l = TUR[i];
  const terakhir = i === TUR.length - 1;
  return (
    <div data-tour-card className="absolute z-[101] w-[360px] rounded-2xl bg-surface p-5 text-fg shadow-pop" style={{ opacity }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">
          Panduan {i + 1}/{TUR.length}
        </p>
        <span className="-mt-1 -mr-1 grid size-7 place-items-center rounded-lg text-muted">
          <X className="size-4" />
        </span>
      </div>
      <h2 className="mt-1.5 text-[16px] font-bold tracking-tight">{l.judul}</h2>
      <div className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-muted">{l.isi}</div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {TUR.map((_, k) => (
            <span key={k} className={`h-1.5 rounded-full ${k === i ? "w-5 bg-accent" : "w-1.5 bg-line-strong"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {i > 0 && (
            <span className="btn btn-ghost border border-line">
              <ArrowLeft className="size-4" /> Kembali
            </span>
          )}
          <span data-cur={`tur-btn-${i}`} className="btn btn-primary">
            {terakhir ? (
              <>
                <Check className="size-4" /> Mengerti
              </>
            ) : (
              <>
                Lanjut <ArrowRight className="size-4" />
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

const SYARAT = [
  { ikon: MessageSquareOff, judul: "Matikan balasan otomatis WhatsApp Business", teks: "Nonaktifkan Pesan salam dan Pesan tidak di tempat (menu Alat bisnis) di nomor yang akan disambungkan." },
  { ikon: Unplug, judul: "Lepas layanan balas otomatis lain", teks: "Putuskan chatbot, aplikasi auto-reply, atau perangkat tertaut lain yang ikut membalas chat dari nomor ini." },
  { ikon: Ban, judul: "Bukan nomor WhatsApp Business API", teks: "Nomor yang terdaftar di WhatsApp Business API (Cloud API atau penyedia resminya) tidak bisa ditautkan lewat QR." },
];

/** Dialog "Tambah nomor WhatsApp" (tambah-nomor.tsx). */
function DialogTambah({ nama, fokusNama, cek, kirim, t }: { nama: string; fokusNama: boolean; cek: boolean; kirim: boolean; t: number }) {
  return (
    <div className="w-[440px] rounded-2xl bg-surface p-0 text-fg shadow-pop">
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <QrCode className="size-5" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold tracking-tight">Tambah nomor WhatsApp</h2>
              <p className="hint mt-0.5">Beri nama, lalu kode QR langsung muncul untuk dipindai dari HP nomor tersebut.</p>
            </div>
          </div>
          <span className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-faint">
            <X className="size-4" />
          </span>
        </div>
        <Isi label="Nama nomor" nilai={nama} placeholder="mis. CS Utama" fokus={fokusNama} t={t} cur="d-nama" />
        <div className="mt-4">
          <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3.5">
            <p className="flex items-center gap-2 text-[13px] font-bold text-fg">
              <TriangleAlert className="size-4 shrink-0 text-warning" /> Nomor tidak boleh terhubung ke balasan otomatis lain
            </p>
            <ul className="mt-2.5 space-y-2">
              {SYARAT.map((s) => (
                <li key={s.judul} className="flex gap-2.5 text-[12.5px] leading-snug text-muted">
                  <s.ikon className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span>
                    <span className="font-semibold text-fg">{s.judul}.</span> {s.teks}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2.5 text-[13px]">
          <span data-cur="d-cek" className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px]" style={{ background: cek ? "var(--c-accent)" : "#fff", border: cek ? "1px solid var(--c-accent)" : "1px solid #767676" }}>
            {cek && <Check className="size-3 text-white" strokeWidth={3.5} />}
          </span>
          <span>Saya sudah memastikan nomor ini tidak memakai balasan otomatis lain.</span>
        </div>
        <div className="mt-2 min-h-5" />
        <div className="mt-3 flex justify-end gap-2">
          <span className="btn btn-ghost">Batal</span>
          <span data-cur="d-buat" className="btn btn-primary" style={{ opacity: kirim ? 0.55 : 1 }}>
            {kirim && <Spin t={t} />}
            <QrCode className="size-4" /> Buat &amp; tampilkan QR
          </span>
        </div>
      </div>
    </div>
  );
}

export function Mulai() {
  const t = useT();
  const sudah = C.filter((c) => t >= c + 0.1).length;
  const langkah = Math.min(TUR.length - 1, sudah);
  const turAktif = t >= 0.9 && t < C[5] + 0.3;
  // Kartu muncul pelan, redup sebentar tiap ganti langkah (kartu berpindah tempat).
  const mulaiKartu = sudah > 0 ? C[sudah - 1] + 0.1 : 0.9;
  const opTur = tw(t, mulaiKartu, mulaiKartu + 0.3, 0, 1, E.out) * (1 - tw(t, C[5] + 0.12, C[5] + 0.3));

  const dlgP = tw(t, T.tambah + 0.12, T.tambah + 0.4, 0, 1, E.out);
  const nama = ketik(NAMA_NOMOR, t, T.nama + 0.3, 9);
  const cek = t >= T.cek + 0.12;
  const kirim = t >= T.buat + 0.15;

  const nol = [0, 0, 0, 0, 0, 0, 0];
  const script: Script = {
    cursor: [
      { at: 0, to: [1010, 440] },
      ...C.map((c, i) => ({ at: c - 0.05, to: TUR_BTN[i], click: true })),
      { at: T.tambah - 0.05, to: "btn-tambah-nomor", click: true },
      { at: T.nama - 0.05, to: "d-nama", click: true, kind: "text" as const },
      { at: T.cek - 0.05, to: "d-cek", click: true },
      { at: T.buat - 0.05, to: "d-buat", click: true },
      { at: T.buat + 1.4, to: [900, 520] },
    ],
    spot: [
      { at: 0.5, to: null, off: true },
      { at: 1.2, to: null },
      { at: C[0] + 0.55, to: "btn-tambah-nomor", pad: 6, dur: 0.45 },
      { at: C[1] + 0.55, to: "ringkasan-stat", pad: 8, dur: 0.45 },
      { at: C[2] + 0.55, to: "nav-nomor", pad: 6, dur: 0.45 },
      { at: C[3] + 0.55, to: "nav-langganan", pad: 6, dur: 0.45 },
      { at: C[4] + 0.55, to: "nav-panduan", pad: 6, dur: 0.45 },
      { at: C[5] + 0.5, to: "nav-panduan", off: true, dur: 0.4 },
    ],
  };

  const caps: Cap[] = [
    { from: 1.4, to: 4.5, label: "3 · MULAI", title: "Panduan otomatis di kunjungan pertama", sub: "Enam langkah singkat, bisa diputar ulang kapan saja lewat menu Panduan" },
    { from: 5.2, to: 8.4, label: "3 · MULAI", title: "Langkah 1: tambah nomor WhatsApp", sub: "Beri nama, scan QR dari HP, seperti membuka WhatsApp Web" },
    { from: 9.2, to: 12.2, label: "3 · MULAI", title: "Pantau semua dari satu layar", sub: "Pesan masuk, balasan AI, dan nomor tersambung, diperbarui tiap hari" },
    { from: 13.0, to: 16.0, label: "3 · MULAI", title: "Langkah 2: tiap nomor punya pengaturan sendiri", sub: "Knowledge, uji AI, dan kapan AI membalas diatur per nomor" },
    { from: 16.8, to: 19.8, label: "3 · MULAI", title: "Paket & kuota: coba gratis dulu", sub: "5 balasan AI percobaan selama 7 hari, lalu pilih paket kapan saja" },
    { from: 20.6, to: 23.5, label: "3 · MULAI", title: "Lupa penjelasannya? Klik Panduan", sub: "Penjelasan ini bisa dibuka lagi kapan saja" },
    { from: 26.6, to: 31.4, label: "3 · MULAI", title: "Syarat nomor: tanpa balasan otomatis lain", sub: "Matikan auto-reply WhatsApp Business & bot lain, agar pelanggan tak menerima balasan ganda", pos: "atas" },
    { from: 31.6, to: 34.2, label: "3 · MULAI", title: "Buat nomor, QR langsung muncul", sub: "Lanjut ke halaman nomor untuk menautkan WhatsApp", pos: "atas" },
  ];

  return (
    <Stage
      url="/dashboard"
      script={script}
      captions={caps}
      judulTab="Ringkasan · ChatGerCep"
      fixed={
        <>
          <Sidebar aktif="ringkasan" nomor={[]} pengguna={USAHA.pemilik} />
          {turAktif && <KartuTur i={langkah} opacity={opTur} />}
          {dlgP > 0.001 && (
            <LatarDialog p={dlgP}>
              <DialogTambah nama={nama} fokusNama={t >= T.nama && t < T.cek} cek={cek} kirim={kirim} t={t} />
            </LatarDialog>
          )}
        </>
      }
    >
      <Main>
        <Ringkasan
          nomor={[]}
          langganan={{ paket: "Gratis", info: "Masa percobaan sampai 10 Nov 2026", balasanLabel: "Balasan AI percobaan", terpakai: 0, kuota: 5, nomor: 0, nomorMaks: 1, tombol: "Pilih paket" }}
          stat={{ masuk: 0, kemarin: 0, total7: 0, dibalas: 0, tren: nol, pelanggan: 0 }}
          seri={{ masuk: nol, dibalas: nol }}
        />
      </Main>
    </Stage>
  );
}

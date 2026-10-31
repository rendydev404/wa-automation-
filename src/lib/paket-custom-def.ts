import { angka } from "./format";
import { MEREK } from "./merek";
import { type AcuanHarga, type HasilHarga, MAKS_HARGA_PAKET, METODE_BAYAR, type MetodeBayar, TAMBAHAN_BIAYA_BALASAN, hitungHarga, kuotaDariHarga, nomorDariKuota } from "./harga";

/**
 * Paket "Custom": satu paket di daftar harga yang seluruh isinya diatur admin (Paket & harga → Paket Custom).
 * Admin mengisi kuota balasan AI, durasi, dan jumlah nomor; harga dihitung otomatis dari modal nyata (tarif resmi
 * Anthropic × kurs pasar, biaya server, biaya pembayaran) + margin pilihannya, dibulatkan sesuai selera, dan tetap bisa
 * ditimpa dengan harga sendiri. Kartunya bisa membuka chat WhatsApp ke admin atau langsung dibayar lewat Midtrans.
 *
 * Modul ini murni (tanpa I/O): rumus yang sama dipakai pratinjau langsung di browser dan server saat menyimpan, jadi
 * angka yang dilihat admin = angka yang tersimpan. Penyimpanan & sinkron ke tabel paket ada di paket-custom.ts.
 */

export type TampilHarga = "angka" | "teks";
export type AksiCustom = "wa" | "bayar";

export interface PaketCustom {
  // ---- Kartu di daftar harga ----
  aktif: boolean; // tampil di landing page & halaman Langganan
  nama: string;
  deskripsi: string;
  fitur: string[]; // keunggulan tambahan, satu per baris
  tampil_harga: TampilHarga; // angka = harga jual di kartu; teks = teks bebas (mis. "Hubungi kami")
  teks_harga: string;
  tampil_kuota: boolean; // jumlah balasan & nomor ikut tampil sebagai poin pertama
  aksi: AksiCustom; // wa = chat WhatsApp ke admin; bayar = langsung bayar lewat Midtrans
  wa: string; // nomor WhatsApp admin (digit berawalan kode negara)
  pesan: string; // teks pembuka chat WhatsApp
  tombol: string;
  // ---- Isi paket ----
  kuota_balasan: number; // balasan AI per masa langganan
  nomor_otomatis: boolean; // jumlah nomor dihitung dari pemakaian nyata (kuota balasan ÷ balasan per nomor)
  kuota_nomor: number; // hasil akhir (otomatis atau diisi admin)
  durasi_hari: number;
  // ---- Harga ----
  margin: number; // margin keuntungan target, persen 0..90
  pembulatan: number; // harga otomatis dibulatkan ke atas ke kelipatan ini (Rp)
  cantik: boolean; // harga otomatis berakhiran ...9.000 (mis. Rp1.249.000)
  harga_manual: boolean; // harga jual diketik admin, bukan hasil hitungan
  harga: number; // harga jual yang berlaku (Rp)
  ikut_kurs: boolean; // harga otomatis dihitung ulang sendiri saat kurs USD bergeser >= AMBANG_KURS_CUSTOM
  // ---- Asumsi biaya (bawaan: sama dengan acuan simulasi paket) ----
  model: string; // model Claude acuan biaya per balasan
  pemakaian: number; // persen kuota yang dihitung terpakai, 10..100
  metode: MetodeBayar; // metode bayar acuan biaya Midtrans
  biaya_server: number; // Rp per nomor per bulan
  // ---- Jejak hitungan terakhir (diisi server) ----
  kurs: number; // kurs USD saat harga terakhir dihitung; 0 = belum pernah disimpan dengan rumus ini
  dihitung: number; // detik epoch
}

/** Kode baris paket Custom di tabel paket. Garis bawah tidak bisa dibuat dari formulir paket biasa (hanya a-z, 0-9, -). */
export const KODE_CUSTOM = "_custom";

export const PEMBULATAN = [1_000, 5_000, 10_000, 50_000, 100_000] as const;
export const DURASI_CEPAT = [
  { hari: 30, label: "1 bulan" },
  { hari: 90, label: "3 bulan" },
  { hari: 180, label: "6 bulan" },
  { hari: 365, label: "1 tahun" },
] as const;
export const KUOTA_CEPAT = [5_000, 10_000, 25_000, 50_000, 100_000] as const;

export const BATAS_CUSTOM = {
  nama: 40,
  deskripsi: 200,
  teksHarga: 40,
  fitur: 8,
  panjangFitur: 80,
  pesan: 300,
  tombol: 30,
  kuotaBalasan: 10_000_000,
  kuotaNomor: 1000,
  durasi: 3660,
  biayaServer: 1_000_000,
} as const;

/** Harga otomatis mengikuti kurs (bila `ikut_kurs`) begitu kurs bergeser sekian dari kurs saat terakhir dihitung. */
export const AMBANG_KURS_CUSTOM = 0.01;

export const BAWAAN_CUSTOM: PaketCustom = {
  aktif: false,
  nama: "Custom",
  deskripsi: "Kuota & harga menyesuaikan kebutuhan: banyak cabang, volume chat besar, atau durasi panjang.",
  fitur: ["Base knowledge & belajar dari balasanmu", "Bantuan penyiapan base knowledge", "Dukungan prioritas lewat WhatsApp"],
  tampil_harga: "angka",
  teks_harga: "Hubungi kami",
  tampil_kuota: true,
  aksi: "wa",
  wa: "",
  pesan: `Halo, saya tertarik dengan paket Custom ${MEREK}.`,
  tombol: "Hubungi kami",
  kuota_balasan: 25_000,
  nomor_otomatis: true,
  kuota_nomor: 10,
  durasi_hari: 30,
  margin: 60,
  pembulatan: 50_000,
  cantik: true,
  harga_manual: false,
  harga: 0,
  ikut_kurs: true,
  model: "claude-haiku-5-5", // sama dengan MODEL_BAWAAN (ai.ts)
  pemakaian: 100,
  metode: "kartu",
  biaya_server: 0,
  kurs: 0,
  dihitung: 0,
};

const bulatSah = (v: unknown, min: number, maks: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= maks;

/**
 * JSON tersimpan → PaketCustom lengkap dengan tipe yang benar; isian rusak/kosong diganti bawaan. Versi pertama kartu
 * (harga berupa teks bebas, tanpa kuota) tetap tampil seperti dulu: harganya jadi teks_harga dan kuota tidak ditampilkan.
 */
export function rapikanCustom(d: unknown): PaketCustom {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const B = BAWAAN_CUSTOM;
  const L = BATAS_CUSTOM;
  const lama = typeof o.harga === "string";
  const teks = (v: unknown, bawaan: string, maks: number) => (typeof v === "string" ? v.trim().slice(0, maks) : bawaan);
  const bool = (v: unknown, bawaan: boolean) => (typeof v === "boolean" ? v : bawaan);
  const bulat = (v: unknown, bawaan: number, min: number, maks: number) => (bulatSah(v, min, maks) ? v : bawaan);
  return {
    aktif: bool(o.aktif, B.aktif),
    nama: teks(o.nama, B.nama, L.nama) || B.nama,
    deskripsi: teks(o.deskripsi, B.deskripsi, L.deskripsi),
    fitur: Array.isArray(o.fitur)
      ? o.fitur
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().slice(0, L.panjangFitur))
          .filter(Boolean)
          .slice(0, L.fitur)
      : B.fitur,
    tampil_harga: o.tampil_harga === "angka" || o.tampil_harga === "teks" ? o.tampil_harga : lama ? "teks" : B.tampil_harga,
    teks_harga: teks(o.teks_harga, lama ? teks(o.harga, B.teks_harga, L.teksHarga) : B.teks_harga, L.teksHarga),
    tampil_kuota: bool(o.tampil_kuota, lama ? false : B.tampil_kuota),
    aksi: o.aksi === "wa" || o.aksi === "bayar" ? o.aksi : B.aksi,
    wa: typeof o.wa === "string" && /^[1-9]\d{7,14}$/.test(o.wa) ? o.wa : "",
    pesan: teks(o.pesan, B.pesan, L.pesan),
    tombol: teks(o.tombol, B.tombol, L.tombol) || B.tombol,
    kuota_balasan: bulat(o.kuota_balasan, B.kuota_balasan, 1, L.kuotaBalasan),
    nomor_otomatis: bool(o.nomor_otomatis, B.nomor_otomatis),
    kuota_nomor: bulat(o.kuota_nomor, B.kuota_nomor, 1, L.kuotaNomor),
    durasi_hari: bulat(o.durasi_hari, B.durasi_hari, 1, L.durasi),
    margin: bulat(o.margin, B.margin, 0, 90),
    pembulatan: (PEMBULATAN as readonly unknown[]).includes(o.pembulatan) ? (o.pembulatan as number) : B.pembulatan,
    cantik: bool(o.cantik, B.cantik),
    harga_manual: bool(o.harga_manual, B.harga_manual),
    harga: bulat(o.harga, B.harga, 0, MAKS_HARGA_PAKET),
    ikut_kurs: bool(o.ikut_kurs, B.ikut_kurs),
    model: typeof o.model === "string" && /^[a-z0-9.-]{1,80}$/.test(o.model) ? o.model : B.model,
    pemakaian: bulat(o.pemakaian, B.pemakaian, 10, 100),
    metode: typeof o.metode === "string" && o.metode in METODE_BAYAR ? (o.metode as MetodeBayar) : B.metode,
    biaya_server: bulat(o.biaya_server, B.biaya_server, 0, L.biayaServer),
    kurs: typeof o.kurs === "number" && Number.isFinite(o.kurs) && o.kurs > 0 ? o.kurs : 0,
    dihitung: bulat(o.dihitung, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

/**
 * Isian admin dari browser → PaketCustom, atau pesan galat. Angka isi paket & harga diperiksa ketat (tidak diam-diam
 * diganti bawaan); teks dirapikan seperti rapikanCustom. Nomor WhatsApp sudah dirapikan pemanggil (digit saja).
 */
export function periksaCustom(d: unknown): PaketCustom | string {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const L = BATAS_CUSTOM;
  if (typeof o.nama !== "string" || o.nama.trim().length < 2) return "Nama paket wajib diisi.";
  if (!bulatSah(o.kuota_balasan, 1, L.kuotaBalasan)) return `Kuota balasan AI 1–${angka(L.kuotaBalasan)}.`;
  if (!bulatSah(o.durasi_hari, 1, L.durasi)) return `Durasi 1–${angka(L.durasi)} hari.`;
  if (o.nomor_otomatis !== true && !bulatSah(o.kuota_nomor, 1, L.kuotaNomor)) return `Jumlah nomor 1–${angka(L.kuotaNomor)}.`;
  if (!bulatSah(o.margin, 0, 90)) return "Margin keuntungan 0–90%.";
  if (!bulatSah(o.pemakaian, 10, 100)) return "Kuota terpakai 10–100%.";
  if (!bulatSah(o.biaya_server, 0, L.biayaServer)) return "Biaya server per nomor tidak valid.";
  if (typeof o.metode !== "string" || !(o.metode in METODE_BAYAR)) return "Metode bayar tidak dikenal.";
  if (!(PEMBULATAN as readonly unknown[]).includes(o.pembulatan)) return "Pilihan pembulatan tidak dikenal.";
  if (o.harga_manual === true && !bulatSah(o.harga, 1, MAKS_HARGA_PAKET)) return `Harga sendiri Rp1–Rp${angka(MAKS_HARGA_PAKET)}.`;
  const p = rapikanCustom({ ...o, kurs: 0, dihitung: 0 });
  if (p.aktif && p.aksi === "wa" && !p.wa) return "Isi nomor WhatsApp admin dulu sebelum menampilkan paket Custom dengan tombol chat.";
  if (p.aktif && p.tampil_harga === "teks" && !p.teks_harga) return 'Teks harga wajib diisi, mis. "Hubungi kami".';
  return p;
}

/** Bulatkan ke atas ke kelipatan `langkah`; `cantik`: berakhiran ...9.000 (Rp1.249.000), tetap tidak di bawah `pas`. */
export function bulatkanHarga(pas: number, langkah: number, cantik: boolean): number {
  const l = (PEMBULATAN as readonly number[]).includes(langkah) ? langkah : 1_000;
  if (cantik && l > 1_000) return Math.ceil((pas + 1_000) / l) * l - 1_000;
  return Math.max(l, Math.ceil(pas / l) * l);
}

export type SpekCustom = Pick<
  PaketCustom,
  "kuota_balasan" | "nomor_otomatis" | "kuota_nomor" | "durasi_hari" | "margin" | "pembulatan" | "cantik" | "harga_manual" | "harga" | "pemakaian" | "metode" | "biaya_server"
>;

export interface KonteksHarga {
  /** Biaya dasar satu balasan (USD) model acuan, dari tarif resmi; null = tarif model itu belum diketahui. */
  usd: number | null;
  kurs: number;
  /** Rata-rata balasan AI per nomor per bulan (pemakaian nyata 30 hari). */
  balasanPerNomorBulan: number;
}

/** sehat = margin target tercapai; tipis = untung tapi di bawah target; rugi = harga di bawah modal + biaya bayar. */
export type StatusHarga = "sehat" | "tipis" | "rugi" | "kosong";

export interface HasilCustom {
  kuotaNomor: number;
  /** Harga tepat di margin target sebelum dibulatkan; null = mustahil atau tarif belum diketahui (seperti hargaOtomatis). */
  hargaPas: number | null;
  /** Harga di margin target setelah dibulatkan; null = mustahil (margin + biaya bayar >= 100%) atau tarif belum diketahui. */
  hargaOtomatis: number | null;
  /** Harga jual yang berlaku: ketikan admin bila harga manual, selain itu harga otomatis. */
  harga: number;
  /** Modal, biaya bayar, untung, dan margin pada harga jual. */
  rincian: HasilHarga;
  /** Harga jual per balasan AI (Rp). */
  perBalasan: number | null;
  /** Harga jual setara 30 hari. */
  per30Hari: number;
  status: StatusHarga;
}

export function acuanCustom(c: Pick<SpekCustom, "margin" | "pemakaian" | "metode" | "biaya_server">, k: KonteksHarga): AcuanHarga {
  return { biayaBalasanUsd: k.usd ?? 0, kurs: k.kurs, margin: c.margin / 100, pemakaian: c.pemakaian / 100, metode: c.metode, biayaServerNomor: c.biaya_server };
}

/** Isi paket + asumsi → jumlah nomor, harga otomatis, harga jual, dan rincian untung-ruginya. */
export function hitungCustom(c: SpekCustom, k: KonteksHarga): HasilCustom {
  const kuotaNomor = c.nomor_otomatis ? nomorDariKuota(c.kuota_balasan, c.durasi_hari, k.balasanPerNomorBulan) : c.kuota_nomor;
  const a = acuanCustom(c, k);
  const spek = { durasi_hari: c.durasi_hari, kuota_nomor: kuotaNomor, kuota_balasan: c.kuota_balasan };
  const pasMentah = hitungHarga({ ...spek, harga: 0 }, a).hargaPas;
  const pas = k.usd === null ? null : pasMentah;
  const hargaOtomatis = pas === null ? null : bulatkanHarga(pas, c.pembulatan, c.cantik);
  const harga = c.harga_manual ? c.harga : (hargaOtomatis ?? c.harga);
  const rincian = hitungHarga({ ...spek, harga }, a);
  const status: StatusHarga = harga <= 0 ? "kosong" : rincian.untung < 0 ? "rugi" : (rincian.margin ?? 0) < a.margin - 0.005 ? "tipis" : "sehat";
  return {
    kuotaNomor,
    hargaPas: pas,
    hargaOtomatis,
    harga,
    rincian,
    perBalasan: harga > 0 && c.kuota_balasan > 0 ? harga / c.kuota_balasan : null,
    per30Hari: (harga * 30) / c.durasi_hari,
    status,
  };
}

/**
 * Kebalikannya, untuk negosiasi: anggaran pelanggan (Rp per masa paket) → kuota balasan terbanyak yang masih memberi
 * margin target (kelipatan 50). Nomor otomatis: biaya server ikut bertambah sebanding kuota; nomor tetap: biaya tetap.
 */
export function kuotaDariAnggaran(anggaran: number, c: SpekCustom, k: KonteksHarga): number {
  const a = acuanCustom(c, k);
  if (c.nomor_otomatis) return kuotaDariHarga(anggaran, c.durasi_hari, a, k.balasanPerNomorBulan).kuotaBalasan;
  const m = METODE_BAYAR[a.metode] ?? METODE_BAYAR.kartu;
  const bersih = anggaran * (1 - a.margin - m.persen) - m.tetap - c.kuota_nomor * a.biayaServerNomor * (c.durasi_hari / 30);
  const perBalasan = a.biayaBalasanUsd * a.kurs * (1 + TAMBAHAN_BIAYA_BALASAN) * a.pemakaian;
  return bersih > 0 && perBalasan > 0 ? Math.floor(bersih / perBalasan / 50) * 50 : 0;
}

/** Bisa dibeli langsung lewat Midtrans (baris paketnya aktif). */
export const customBisaDibeli = (p: PaketCustom): boolean => p.aktif && p.aksi === "bayar" && p.harga > 0;

/** Kartu tampil hanya bila dinyalakan admin dan tombolnya punya tujuan (nomor WhatsApp, atau harga untuk dibayar). */
export function customTampil(p: PaketCustom): boolean {
  if (!p.aktif) return false;
  if (p.aksi === "wa" ? !p.wa : p.harga < 1) return false;
  return p.tampil_harga === "teks" ? !!p.teks_harga : p.harga > 0;
}

/** Harga di kartu berupa angka (bukan teks bebas). */
export const hargaAngka = (p: PaketCustom): boolean => p.tampil_harga === "angka" && p.harga > 0;

/** Ringkasan paket seperti yang dilihat pelanggan, untuk pesan WhatsApp ke admin. */
export function ringkasCustom(p: PaketCustom): string {
  const bagian = [
    ...(p.tampil_kuota ? [`${angka(p.kuota_balasan)} balasan AI`, `${angka(p.kuota_nomor)} nomor WhatsApp`] : []),
    hargaAngka(p) ? `Rp${angka(p.harga)} / ${p.durasi_hari} hari` : p.tampil_kuota ? `${p.durasi_hari} hari` : "",
  ].filter(Boolean);
  return bagian.length ? `${p.nama} (${bagian.join(", ")})` : p.nama;
}

/** Tautan chat WhatsApp ke admin: pesan pembuka, rincian paket di kartu, lalu `tambahan` (mis. email akun). */
export function tautanCustom(p: PaketCustom, tambahan?: string): string {
  const rincian = p.tampil_kuota || hargaAngka(p) ? `Paket: ${ringkasCustom(p)}` : "";
  const teks = [p.pesan.trim(), [rincian, tambahan?.trim()].filter(Boolean).join("\n")].filter(Boolean).join("\n\n");
  return `https://wa.me/${p.wa}${teks ? `?text=${encodeURIComponent(teks)}` : ""}`;
}

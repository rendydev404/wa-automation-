import type { Bahasa } from "./bahasa";

/**
 * Rumus harga paket dari modal nyata + margin keuntungan yang ditentukan admin. Fungsi murni (tanpa I/O), dipakai
 * bersama oleh simulasi di browser dan oleh server saat harga saran diterapkan, jadi hasilnya selalu sama.
 *
 *   modal AI     = kuota balasan x pemakaian x biaya per balasan (tarif resmi Anthropic x kurs x (1 + tambahan))
 *   modal server = kuota nomor x biaya server per nomor per bulan x (durasi / 30)
 *   biaya bayar  = (persen x harga + tetap) x (1 + PPN)   (tarif payment gateway + PPN atas biaya itu)
 *   untung       = harga - biaya bayar - modal;      margin = untung / harga
 *   harga saran  = (modal + tetap') / (1 - margin target - persen'), dibulatkan ke atas ke Rp1.000
 *                  (tetap' & persen' sudah termasuk PPN)
 *
 * Biaya payment gateway ditanggung penjual (dimasukkan ke harga paket), BUKAN ditambahkan ke tagihan pembeli:
 * PBI No. 23/6/PBI/2021 Pasal 52 melarang surcharge ke pembeli. Mode acuan "otomatis" menghitung, di setiap harga,
 * kanal termahal yang bisa dipilih pembeli, jadi margin target tercapai apa pun kanal yang dipakai.
 */

/**
 * Tambahan di atas biaya dasar per balasan, diukur di produksi (29 Okt 2026): penjaga anti-halu menulis ulang
 * ±2,8% jawaban (1 dari 36 pada uji jebakan + percakapan asli) dan 7,7% pesan pelanggan berisi foto yang menambah
 * ±19% biaya balasan itu (≈1,5%). Total ±4,3%, dibulatkan ke atas.
 */
export const TAMBAHAN_BIAYA_BALASAN = 0.05;

/** Batas atas harga paket: batas kolom integer di database. Selain itu harga bebas diatur admin (0 = tidak dijual). */
export const MAKS_HARGA_PAKET = 2_000_000_000;

/**
 * Tarif umum Midtrans per transaksi, belum termasuk PPN (sesuaikan bila kontrak merchant berbeda).
 * `otomatis` bukan kanal: acuan harga = kanal termahal di antara GOLONGAN_PEMBELI pada harga itu.
 */
export const METODE_BAYAR = {
  otomatis: { label: "Otomatis (termahal)", label_en: "Auto (most expensive)", persen: 0, tetap: 0 },
  qris: { label: "QRIS", label_en: "QRIS", persen: 0.007, tetap: 0 },
  va: { label: "Transfer bank (VA)", label_en: "Bank transfer (VA)", persen: 0, tetap: 4_000 },
  ewallet: { label: "GoPay / ShopeePay", label_en: "GoPay / ShopeePay", persen: 0.02, tetap: 0 },
  kartu: { label: "Kartu kredit", label_en: "Credit card", persen: 0.029, tetap: 2_000 },
} as const;
export type MetodeBayar = keyof typeof METODE_BAYAR;

/** PPN atas biaya layanan payment gateway (tarif efektif 11%: 12% x DPP 11/12). */
export const PPN_BIAYA_BAYAR = 0.11;

/** Golongan tarif yang bisa dipilih pembeli di halaman bayar (kartu kredit hanya dicatat manual oleh admin). */
export const GOLONGAN_PEMBELI = ["qris", "ewallet", "va"] as const satisfies readonly MetodeBayar[];

export interface ProfilBiaya {
  persen: number;
  tetap: number;
}

/** Profil biaya metode acuan, sudah termasuk PPN. "otomatis" = semua golongan yang bisa dipilih pembeli. */
export function profilBiaya(metode: MetodeBayar): ProfilBiaya[] {
  const daftar: readonly MetodeBayar[] = metode === "otomatis" ? GOLONGAN_PEMBELI : [metode in METODE_BAYAR ? metode : "kartu"];
  return daftar.map((m) => ({ persen: METODE_BAYAR[m].persen * (1 + PPN_BIAYA_BAYAR), tetap: METODE_BAYAR[m].tetap * (1 + PPN_BIAYA_BAYAR) }));
}

/** Biaya bayar (termasuk PPN) pada `harga`: kanal termahal di profil. 0 bila harga 0. */
export function biayaBayar(harga: number, metode: MetodeBayar): number {
  if (harga <= 0) return 0;
  return Math.max(...profilBiaya(metode).map((b) => harga * b.persen + b.tetap));
}

/**
 * Harga terkecil H yang memenuhi H x (1 - potongPersen) - biayaBayar(H) >= dasar untuk SETIAP kanal di profil:
 * max per kanal dari (dasar + tetap) / (1 - potongPersen - persen). null bila mustahil (penyebut <= 0).
 */
export function hargaMinimal(dasar: number, potongPersen: number, metode: MetodeBayar): number | null {
  let h = 0;
  for (const b of profilBiaya(metode)) {
    const penyebut = 1 - potongPersen - b.persen;
    if (penyebut <= 0) return null;
    h = Math.max(h, (dasar + b.tetap) / penyebut);
  }
  return h;
}

/** Sisa dari `harga` setelah potongan persen & biaya bayar kanal termahal: harga x (1 - potongPersen) - biayaBayar. */
export const sisaBersih = (harga: number, potongPersen: number, metode: MetodeBayar): number => harga * (1 - potongPersen) - biayaBayar(harga, metode);

/** Teks tarif untuk admin, mis. "2% + Rp2.000 + PPN 11%" atau rincian kanal untuk mode otomatis. */
export function teksTarif(metode: MetodeBayar): string {
  const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
  const satu = (m: MetodeBayar) => [METODE_BAYAR[m].persen ? `${(METODE_BAYAR[m].persen * 100).toLocaleString("id-ID")}%` : "", METODE_BAYAR[m].tetap ? rp(METODE_BAYAR[m].tetap) : ""].filter(Boolean).join(" + ");
  const ppn = ` + PPN ${(PPN_BIAYA_BAYAR * 100).toLocaleString("id-ID")}%`;
  const singkat: Record<string, string> = { qris: "QRIS", ewallet: "e-wallet", va: "VA" };
  if (metode === "otomatis") return `${GOLONGAN_PEMBELI.map((m) => `${singkat[m]} ${satu(m)}`).join(" / ")}${ppn}`;
  return `${satu(metode)}${ppn}`;
}

/**
 * Kanal Midtrans Core API yang bisa dipilih pelanggan di halaman bayar kita sendiri. `metode` = golongan tarifnya di
 * METODE_BAYAR. `menit` = umur tagihan sebelum kedaluwarsa. Kartu kredit tidak ada di sini: Core API mewajibkan
 * tokenisasi kartu di browser (client key + 3DS), jadi kartu hanya bisa dicatat admin secara manual.
 */
export const KANAL_BAYAR = {
  qris: { label: "QRIS", info: "Scan dari aplikasi e-wallet atau m-banking apa pun", metode: "qris", grup: "QRIS", menit: 15,
    label_en: "QRIS", info_en: "Scan with any e-wallet or mobile banking app", grup_en: "QRIS" },
  gopay: { label: "GoPay", info: "Buka aplikasi Gojek / GoPay", metode: "ewallet", grup: "E-wallet", menit: 15,
    label_en: "GoPay", info_en: "Open the Gojek / GoPay app", grup_en: "E-wallet" },
  shopeepay: { label: "ShopeePay", info: "Buka aplikasi Shopee di HP ini", metode: "ewallet", grup: "E-wallet", menit: 15,
    label_en: "ShopeePay", info_en: "Open the Shopee app on this phone", grup_en: "E-wallet" },
  bca: { label: "BCA Virtual Account", info: "BCA mobile, KlikBCA, atau ATM BCA", metode: "va", grup: "Virtual account", menit: 1440,
    label_en: "BCA Virtual Account", info_en: "BCA mobile, KlikBCA, or a BCA ATM", grup_en: "Virtual account" },
  bni: { label: "BNI Virtual Account", info: "BNI Mobile Banking atau ATM", metode: "va", grup: "Virtual account", menit: 1440,
    label_en: "BNI Virtual Account", info_en: "BNI Mobile Banking or an ATM", grup_en: "Virtual account" },
  bri: { label: "BRI Virtual Account", info: "BRImo atau ATM BRI", metode: "va", grup: "Virtual account", menit: 1440,
    label_en: "BRI Virtual Account", info_en: "BRImo or a BRI ATM", grup_en: "Virtual account" },
  bsi: { label: "BSI Virtual Account", info: "BSI Mobile atau ATM BSI", metode: "va", grup: "Virtual account", menit: 1440,
    label_en: "BSI Virtual Account", info_en: "BSI Mobile or a BSI ATM", grup_en: "Virtual account" },
  cimb: { label: "CIMB Niaga Virtual Account", info: "OCTO Mobile atau ATM CIMB Niaga", metode: "va", grup: "Virtual account", menit: 1440,
    label_en: "CIMB Niaga Virtual Account", info_en: "OCTO Mobile or a CIMB Niaga ATM", grup_en: "Virtual account" },
  mandiri: { label: "Mandiri Bill Payment", info: "Livin' by Mandiri atau ATM Mandiri", metode: "va", grup: "Virtual account", menit: 1440,
    label_en: "Mandiri Bill Payment", info_en: "Livin' by Mandiri or a Mandiri ATM", grup_en: "Virtual account" },
  permata: { label: "Permata Virtual Account", info: "PermataMobile X atau ATM", metode: "va", grup: "Virtual account", menit: 1440,
    label_en: "Permata Virtual Account", info_en: "PermataMobile X or an ATM", grup_en: "Virtual account" },
} as const satisfies Record<string, { label: string; info: string; metode: MetodeBayar; grup: string; menit: number; label_en: string; info_en: string; grup_en: string }>;
export type KanalBayar = keyof typeof KANAL_BAYAR;
export const kanalSah = (x: unknown): x is KanalBayar => typeof x === "string" && Object.hasOwn(KANAL_BAYAR, x);

/** Nama kanal untuk pelanggan sesuai bahasa tampilan. */
export const labelKanal = (k: KanalBayar, b: Bahasa = "id"): string => (b === "en" ? KANAL_BAYAR[k].label_en : KANAL_BAYAR[k].label);
/** Keterangan singkat kanal (aplikasi yang dipakai) sesuai bahasa. */
export const infoKanal = (k: KanalBayar, b: Bahasa = "id"): string => (b === "en" ? KANAL_BAYAR[k].info_en : KANAL_BAYAR[k].info);
/** Golongan kanal (QRIS, E-wallet, Virtual account) sesuai bahasa. */
export const grupKanal = (k: KanalBayar, b: Bahasa = "id"): string => (b === "en" ? KANAL_BAYAR[k].grup_en : KANAL_BAYAR[k].grup);
/** Nama golongan tarif (METODE_BAYAR) sesuai bahasa. */
export const labelMetodeBayar = (m: MetodeBayar, b: Bahasa = "id"): string => (b === "en" ? METODE_BAYAR[m].label_en : METODE_BAYAR[m].label);

/**
 * Kanal aktif dalam satu kalimat, mis. "QRIS, GoPay, atau virtual account (BNI, BRI)"
 * (en: "QRIS, GoPay, or virtual account (BNI, BRI)"); tanpa kanal = "".
 */
export function ringkasKanal(kanal: readonly KanalBayar[], b: Bahasa = "id"): string {
  const atau = b === "en" ? "or" : "atau";
  const va = kanal.filter((k) => KANAL_BAYAR[k].metode === "va").map((k) => labelKanal(k, b).split(" ")[0]);
  const bagian = [...kanal.filter((k) => KANAL_BAYAR[k].metode !== "va").map((k) => labelKanal(k, b)), ...(va.length ? [`virtual account (${va.join(", ")})`] : [])];
  if (bagian.length <= 2) return bagian.join(` ${atau} `);
  return `${bagian.slice(0, -1).join(", ")}, ${atau} ${bagian.at(-1)}`;
}

export interface AcuanHarga {
  /** Biaya dasar satu balasan AI dalam USD (tarif resmi model x profil token nyata). */
  biayaBalasanUsd: number;
  kurs: number;
  /** Margin keuntungan target, 0..0,9. */
  margin: number;
  /** Bagian kuota balasan yang dihitung terpakai, 0..1 (1 = kuota habis: perhitungan paling aman). */
  pemakaian: number;
  metode: MetodeBayar;
  /** Biaya server per nomor per bulan (Rp). */
  biayaServerNomor: number;
}

export interface PaketHarga {
  harga: number;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
}

export interface HasilHarga {
  biayaPerBalasan: number; // Rp, termasuk tambahan
  modalAi: number;
  modalServer: number;
  modal: number;
  biayaBayar: number; // pada harga sekarang
  untung: number; // pada harga sekarang
  margin: number | null; // pada harga sekarang; null bila harga 0
  hargaPas: number | null; // harga tepat di margin target sebelum dibulatkan; null bila margin + biaya bayar >= 100%
  hargaSaran: number | null; // hargaPas dibulatkan ke atas ke Rp1.000
}

export function hitungHarga(p: PaketHarga, a: AcuanHarga): HasilHarga {
  const biayaPerBalasan = a.biayaBalasanUsd * a.kurs * (1 + TAMBAHAN_BIAYA_BALASAN);
  const modalAi = p.kuota_balasan * a.pemakaian * biayaPerBalasan;
  const modalServer = p.kuota_nomor * a.biayaServerNomor * (p.durasi_hari / 30);
  const modal = modalAi + modalServer;
  const bayar = biayaBayar(p.harga, a.metode);
  const untung = p.harga - bayar - modal;
  const hargaPas = hargaMinimal(modal, a.margin, a.metode);
  return {
    biayaPerBalasan,
    modalAi,
    modalServer,
    modal,
    biayaBayar: bayar,
    untung,
    margin: p.harga > 0 ? untung / p.harga : null,
    hargaPas,
    hargaSaran: hargaPas === null ? null : Math.max(1_000, Math.ceil(hargaPas / 1_000) * 1_000),
  };
}

/** Nomor yang muat dalam kuota balasan bila tiap nomor seramai rata-rata nyata (minimal 1). */
export function nomorDariKuota(kuotaBalasan: number, durasiHari: number, balasanPerNomorBulan: number): number {
  const perNomor = balasanPerNomorBulan * (durasiHari / 30);
  return perNomor > 0 ? Math.max(1, Math.round(kuotaBalasan / perNomor)) : 1;
}

/**
 * Kebalikan hitungHarga: harga dikunci, berapa kuota balasan (dan nomor) yang masih memberi margin target.
 * Biaya server ditanggung per balasan (biaya server per nomor / balasan per nomor per bulan). Kuota dibulatkan
 * ke bawah ke kelipatan 50 supaya margin tidak pernah di bawah target.
 */
export function kuotaDariHarga(harga: number, durasiHari: number, a: AcuanHarga, balasanPerNomorBulan: number): { kuotaBalasan: number; kuotaNomor: number } {
  const bersih = sisaBersih(harga, a.margin, a.metode);
  const perBalasan = a.biayaBalasanUsd * a.kurs * (1 + TAMBAHAN_BIAYA_BALASAN) * a.pemakaian + (balasanPerNomorBulan > 0 ? a.biayaServerNomor / balasanPerNomorBulan : 0);
  const kuotaBalasan = bersih > 0 && perBalasan > 0 ? Math.floor(bersih / perBalasan / 50) * 50 : 0;
  return { kuotaBalasan, kuotaNomor: nomorDariKuota(kuotaBalasan, durasiHari, balasanPerNomorBulan) };
}

/**
 * Rumus harga paket dari modal nyata + margin keuntungan yang ditentukan admin. Fungsi murni (tanpa I/O), dipakai
 * bersama oleh simulasi di browser dan oleh server saat harga saran diterapkan, jadi hasilnya selalu sama.
 *
 *   modal AI     = kuota balasan x pemakaian x biaya per balasan (tarif resmi Anthropic x kurs x (1 + tambahan))
 *   modal server = kuota nomor x biaya server per nomor per bulan x (durasi / 30)
 *   biaya bayar  = persen x harga + tetap            (tarif payment gateway, tergantung metode)
 *   untung       = harga - biaya bayar - modal;      margin = untung / harga
 *   harga saran  = (modal + tetap) / (1 - margin target - persen), dibulatkan ke atas ke Rp1.000
 */

/**
 * Tambahan di atas biaya dasar per balasan, diukur di produksi (29 Okt 2026): penjaga anti-halu menulis ulang
 * ±2,8% jawaban (1 dari 36 pada uji jebakan + percakapan asli) dan 7,7% pesan pelanggan berisi foto yang menambah
 * ±19% biaya balasan itu (≈1,5%). Total ±4,3%, dibulatkan ke atas.
 */
export const TAMBAHAN_BIAYA_BALASAN = 0.05;

/** Tarif umum Midtrans per transaksi (sesuaikan bila kontrak merchant berbeda). */
export const METODE_BAYAR = {
  qris: { label: "QRIS", persen: 0.007, tetap: 0 },
  va: { label: "Transfer bank (VA)", persen: 0, tetap: 4_000 },
  ewallet: { label: "GoPay / ShopeePay", persen: 0.02, tetap: 0 },
  kartu: { label: "Kartu kredit", persen: 0.029, tetap: 2_000 },
} as const;
export type MetodeBayar = keyof typeof METODE_BAYAR;

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
  hargaSaran: number | null; // null bila margin + biaya bayar >= 100%
}

export function hitungHarga(p: PaketHarga, a: AcuanHarga): HasilHarga {
  const m = METODE_BAYAR[a.metode] ?? METODE_BAYAR.kartu;
  const biayaPerBalasan = a.biayaBalasanUsd * a.kurs * (1 + TAMBAHAN_BIAYA_BALASAN);
  const modalAi = p.kuota_balasan * a.pemakaian * biayaPerBalasan;
  const modalServer = p.kuota_nomor * a.biayaServerNomor * (p.durasi_hari / 30);
  const modal = modalAi + modalServer;
  const biayaBayar = p.harga > 0 ? p.harga * m.persen + m.tetap : 0;
  const untung = p.harga - biayaBayar - modal;
  const penyebut = 1 - a.margin - m.persen;
  return {
    biayaPerBalasan,
    modalAi,
    modalServer,
    modal,
    biayaBayar,
    untung,
    margin: p.harga > 0 ? untung / p.harga : null,
    hargaSaran: penyebut > 0 ? Math.max(1_000, Math.ceil((modal + m.tetap) / penyebut / 1_000) * 1_000) : null,
  };
}

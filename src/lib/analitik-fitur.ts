/**
 * Kamus kode fitur server (analitik jenis 2) -> nama ramah untuk halaman admin /admin/analitik. Aman untuk klien
 * (tanpa "server-only", tanpa impor): murni data + fungsi kecil.
 *
 * Kode dicatat lewat `catatFitur(user.id, "<grup>.<aksi>")` (src/lib/analitik.ts) setelah server action di
 * src/app/actions.ts atau route handler src/app/api/** berhasil. Setiap kode WAJIB cocok dengan KODE_FITUR
 * (analitik-def.ts) dan terdaftar di sini; kode baru = tambah barisnya di NAMA_FITUR. Awalan sebelum titik pertama
 * adalah grupnya (GRUP_FITUR).
 */

const DAFTAR_FITUR = {
  // ---------- Akun & login ----------
  "akun.masuk": "Masuk dengan email",
  "akun.masuk_google": "Masuk dengan Google",
  "akun.daftar": "Daftar akun dengan email",
  "akun.daftar_google": "Daftar akun dengan Google",
  "akun.reset_password": "Atur ulang password (lupa password)",
  "akun.ubah_profil": "Ubah nama profil",
  "akun.ganti_password": "Ganti / pasang password",
  "akun.keluar_semua": "Keluarkan semua perangkat lain",

  // ---------- Koneksi WhatsApp & nomor ----------
  "wa.hubungkan": "Hubungkan WhatsApp",
  "wa.kode_pairing": "Minta kode pairing WhatsApp",
  "wa.putuskan": "Putuskan WhatsApp",
  "nomor.tambah": "Tambah nomor WhatsApp",
  "nomor.ubah": "Ubah pengaturan nomor",
  "nomor.hapus": "Hapus nomor",

  // ---------- Balasan AI, penyaring, belajar ----------
  "bot.nyalakan": "Nyalakan balasan AI",
  "bot.matikan": "Matikan balasan AI",
  "penyaring.prospek_nyalakan": "Nyalakan penyaring prospek",
  "penyaring.prospek_matikan": "Matikan penyaring prospek",
  "penyaring.spam_nyalakan": "Nyalakan penyaring spam",
  "penyaring.spam_matikan": "Matikan penyaring spam",
  "belajar.nyalakan": "Nyalakan belajar dari balasan manusia",
  "belajar.matikan": "Matikan belajar dari balasan manusia",
  "belajar.hapus": "Hapus satu pelajaran",
  "belajar.hapus_semua": "Hapus semua pelajaran",

  // ---------- Product knowledge ----------
  "knowledge.tulis": "Tulis teks Informasi Usaha",
  "knowledge.perbarui": "Perbarui dokumen Informasi Usaha",
  "knowledge.unggah_pdf": "Unggah PDF ke product knowledge",
  "knowledge.unggah_berkas": "Unggah berkas teks ke product knowledge",
  "knowledge.rapikan_ai": "Rapikan tulisan dengan AI",
  "knowledge.sempurnakan_ai": "Sempurnakan dokumen dengan AI",
  "knowledge.pratinjau": "Lihat isi dokumen Informasi Usaha",
  "knowledge.unduh": "Unduh dokumen knowledge (.txt)",
  "knowledge.hapus": "Hapus dokumen knowledge",

  // ---------- Katalog produk ----------
  "katalog.tambah": "Tambah produk katalog",
  "katalog.ubah": "Ubah produk katalog",
  "katalog.hapus": "Hapus produk katalog",
  "katalog.tersedia": "Tandai produk tersedia",
  "katalog.habis": "Tandai produk habis",
  "katalog.urutkan": "Ubah urutan produk",

  // ---------- Histori percakapan & Uji bot ----------
  "percakapan.hapus": "Hapus satu percakapan",
  "percakapan.hapus_semua": "Hapus semua histori percakapan",
  "percakapan.bukan_spam": "Tandai chat bukan spam",
  "percakapan.bangunkan": "Layani lagi chat yang dibisukan",
  "uji.kirim": "Uji bot: kirim pesan",
  "uji.kirim_foto": "Uji bot: kirim foto",

  // ---------- Tur panduan ----------
  "tur.selesai_dashboard": "Selesaikan tur panduan dashboard",
  "tur.selesai_nomor": "Selesaikan tur panduan halaman nomor",

  // ---------- Langganan & afiliasi ----------
  "langganan.buat_tagihan": "Buat tagihan langganan",
  "langganan.batal_tagihan": "Batalkan tagihan langganan",
  "langganan.jaminan": "Minta uang kembali (jaminan)",
  "afiliasi.daftar": "Daftar program afiliasi",
  "afiliasi.ubah_profil": "Ubah profil & rekening afiliasi",
  "afiliasi.tarik_komisi": "Ajukan penarikan komisi",

  // ---------- Notifikasi ----------
  "notifikasi.baca": "Buka notifikasi",
  "notifikasi.baca_semua": "Tandai semua notifikasi dibaca",
  "push.daftarkan_perangkat": "Daftarkan perangkat notifikasi push",
  "push.uji": "Kirim notifikasi push uji",
  "push.matikan": "Matikan notifikasi push di perangkat",

  // ---------- Sinkron data otomatis (khusus admin) ----------
  "sinkron.kasir_nyalakan": "Nyalakan sinkron data kasir",
  "sinkron.kasir_matikan": "Matikan sinkron data kasir",
  "sinkron.cg_nyalakan": "Nyalakan Informasi Usaha otomatis ChatGerCep",
  "sinkron.cg_matikan": "Matikan Informasi Usaha otomatis ChatGerCep",

  // ---------- Panel admin ----------
  "admin.ubah_kuota": "Ubah kuota nomor pengguna",
  "admin.bonus_kuota": "Beri bonus balasan AI",
  "admin.ai_akun": "Atur mesin AI per akun",
  "admin.ubah_peran": "Ubah peran pengguna",
  "admin.blokir": "Blokir akun pengguna",
  "admin.buka_blokir": "Buka blokir akun pengguna",
  "admin.reset_password": "Reset password pengguna",
  "admin.cabut_sesi": "Cabut sesi login pengguna",
  "admin.putuskan_wa": "Putuskan WhatsApp pengguna",
  "admin.hapus_pengguna": "Hapus pengguna",
  "admin.buat_akun": "Buat akun pengguna",
  "admin.pengaturan": "Ubah pendaftaran & kuota gratis",
  "admin.aturan": "Ubah aturan sistem",
  "admin.mesin_ai": "Ubah mesin AI",
  "admin.tampilkan_metode_bayar": "Tampilkan metode bayar",
  "admin.sembunyikan_metode_bayar": "Sembunyikan metode bayar",
  "admin.buat_paket": "Buat paket",
  "admin.ubah_paket": "Ubah paket",
  "admin.hapus_paket": "Hapus paket",
  "admin.paket_custom": "Simpan Paket Custom",
  "admin.berikan_paket": "Berikan paket manual",
  "admin.hentikan_langganan": "Hentikan langganan pengguna",
  "admin.ulangi_pengembalian": "Coba ulang pengembalian dana",
  "admin.selesai_pengembalian": "Tandai uang kembali sudah ditransfer",
  "admin.tolak_pengembalian": "Tolak pengajuan uang kembali",
  "admin.mode_refund": "Ubah cara pengembalian dana",
  "admin.acuan_harga": "Simpan acuan harga",
  "admin.terapkan_harga": "Terapkan simulasi harga paket",
  "admin.terapkan_komisi": "Terapkan komisi paket",
  "admin.perbarui_kurs": "Perbarui kurs USD",
  "admin.perbarui_tarif": "Perbarui tarif model AI",
  "admin.ekspor_transaksi": "Ekspor transaksi (CSV)",
  "admin.aturan_afiliasi": "Ubah aturan afiliasi",
  "admin.status_afiliator": "Ubah status afiliator",
  "admin.proses_penarikan": "Proses penarikan komisi",
  "admin.meta_pixel": "Simpan pengaturan Meta Pixel",
  "admin.uji_meta_pixel": "Kirim event uji Meta Pixel",
  "admin.followup_setelan": "Ubah setelan follow-up",
  "admin.followup_lepas_rem": "Lepas rem follow-up",
  "admin.followup_tautkan": "Tautkan chat CS ke akun",
  "admin.followup_antre_ulang": "Antrekan ulang follow-up",
  "admin.followup_tulis_ulang": "Tulis ulang pesan follow-up",
  "admin.followup_ubah_pesan": "Ubah pesan follow-up",
  "admin.followup_prospek_setelan": "Ubah setelan follow-up prospek",
  "admin.followup_prospek_tulis_ulang": "Tulis ulang pesan follow-up prospek",
  "admin.followup_prospek_ubah_pesan": "Ubah pesan follow-up prospek",
  "admin.followup_prospek_hentikan": "Hentikan follow-up prospek",
  "developer.ajukan": "Ajukan aplikasi Developer API",
  "developer.buat_key": "Buat API key",
  "developer.ganti_key": "Ganti API key",
  "developer.buat_tagihan": "Buat tagihan Developer API",
  "developer.buat_sandbox": "Buat key sandbox Developer API",
  "developer.ganti_key_sandbox": "Ganti key sandbox Developer API",
  "developer.unduh_starter": "Unduh SDK & contoh aplikasi starter",
  "admin.developer_setujui": "Setujui aplikasi Developer API",
  "admin.developer_ubah": "Ubah aplikasi Developer API",
  "admin.developer_tolak": "Tolak aplikasi Developer API",
  "admin.developer_tangguhkan": "Tangguhkan aplikasi Developer API",
  "admin.developer_aktifkan": "Aktifkan lagi aplikasi Developer API",
  "admin.developer_cabut": "Cabut aplikasi Developer API",
  "admin.developer_pengaturan": "Ubah pengaturan Developer API",
  "admin.developer_sandbox": "Ubah pengaturan sandbox Developer API",
} as const;

/** Semua kode fitur yang dicatat server. */
export type KodeFitur = keyof typeof DAFTAR_FITUR;

/** Kode fitur -> nama ramah berbahasa Indonesia. */
export const NAMA_FITUR: Record<string, string> = DAFTAR_FITUR;

/** Awalan grup (sebelum titik pertama kode) -> nama grup. */
export const GRUP_FITUR: Record<string, string> = {
  akun: "Akun & login",
  wa: "Koneksi WhatsApp",
  nomor: "Nomor",
  bot: "Balasan AI",
  penyaring: "Penyaring chat",
  belajar: "Belajar dari balasan manusia",
  knowledge: "Informasi Usaha",
  katalog: "Katalog produk",
  percakapan: "Histori percakapan",
  uji: "Uji bot",
  tur: "Tur panduan",
  langganan: "Langganan & pembayaran",
  afiliasi: "Afiliasi",
  notifikasi: "Notifikasi",
  push: "Notifikasi push",
  sinkron: "Sinkron data otomatis",
  developer: "Developer API",
  admin: "Panel admin",
};

const punya = (o: Record<string, string>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Nama ramah sebuah kode fitur; kode yang tidak dikenal dikembalikan apa adanya. */
export function namaFitur(kode: string): string {
  return punya(NAMA_FITUR, kode) ? NAMA_FITUR[kode] : kode;
}

/** Nama grup sebuah kode fitur ("knowledge.unduh" -> "Product knowledge"); grup tak dikenal = awalannya apa adanya. */
export function grupFitur(kode: string): string {
  const awalan = kode.split(".", 1)[0];
  return punya(GRUP_FITUR, awalan) ? GRUP_FITUR[awalan] : awalan;
}

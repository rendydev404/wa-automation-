import "server-only";
import { createHash } from "node:crypto";
import { db, getSetting, sekarang, setSetting } from "./db";
import { angka, UMUR_HISTORI_HARI } from "./format";
import { KANAL_BAYAR, type KanalBayar } from "./harga";
import { BATAS_DOKUMEN_KARAKTER, BATAS_NOMOR_KARAKTER, DOKUMEN_CHATGERCEP, rapikanTeks } from "./knowledge";
import { BATAS_KATALOG } from "./katalog-def";
import { type AturanPercobaan, type Paket, aturanPercobaan, daftarPaket, kuotaNomorGratis } from "./langganan";
import { JAMINAN_MAKS_PAKAI_PERSEN, type ModeRefund, MASA_ID } from "./jaminan-def";
import { modeRefund } from "./jaminan";
import { kanalAktif, pembayaranAktif } from "./gateway";
import { MEREK } from "./merek";
import { type PaketCustom, customTampil, hargaAngka, paketCustom } from "./paket-custom";
import { DAFTAR_BANK, type PengaturanAfiliasi, UMUR_COOKIE_REF, hitungKomisiPaket, pengaturanAfiliasi } from "./afiliasi";
import { perbaruiDokumenOtomatis } from "./sinkron";

/**
 * Data sistem ChatGerCep sendiri (paket & harga, kuota, free trial, metode bayar yang aktif, aturan & komisi afiliasi,
 * fitur) sebagai base knowledge otomatis untuk nomor CS ChatGerCep. Fitur internal: hanya admin yang menyalakannya per
 * nomor, dan dokumennya tidak terlihat/terhapus lewat akun pengguna biasa (AWALAN_OTOMATIS di knowledge.ts).
 *
 * Sumbernya database app ini sendiri, jadi tanpa jaringan: aksi admin yang mengubah paket/harga/afiliasi/metode bayar
 * memanggil mintaSinkronCg() (perubahan beruntun dalam JEDA_MS = satu susunan), ditambah satu pemeriksaan tiap JAGA_MS
 * (harga paket Custom bisa ikut kurs). Dokumen hanya ditulis ulang bila isinya berubah (hash). Tanpa nomor yang ikut,
 * tidak ada query apa pun.
 */

const PENANDA = DOKUMEN_CHATGERCEP; // didahulukan di konteks AI (knowledge.ts)
const JUDUL = `Data resmi ${MEREK} terbaru: paket, harga, pembayaran, afiliasi & fitur (otomatis)`;
const KUNCI_NOMOR = "sinkron_cg_nomor";
const KUNCI_STATUS = "sinkron_cg_status";
const KUNCI_HASH = "sinkron_cg_hash:";
const JEDA_MS = 2_000;
const JAGA_MS = 3600_000;
const MAKS_KARTU = 1_100;

export interface StatusCg {
  waktu: number | null; // detik epoch susunan terakhir yang berhasil
  karakter: number;
  galat: string | null;
}

interface Keadaan {
  jeda: ReturnType<typeof setTimeout> | null;
  jaga: ReturnType<typeof setInterval> | null;
  jalan: Promise<void> | null;
  ulang: boolean;
}
const g = globalThis as unknown as { __waSinkronCg?: Keadaan };
const st = (g.__waSinkronCg ??= { jeda: null, jaga: null, jalan: null, ulang: false });

// ---------- Nomor yang ikut ----------

export async function nomorSinkronCg(): Promise<number[]> {
  try {
    const v = JSON.parse((await getSetting(KUNCI_NOMOR)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/** Nyalakan/matikan untuk satu nomor. Menyala: dokumen langsung ditulis. Mati: dokumennya dihapus. */
export async function setNomorSinkronCg(numberId: number, aktif: boolean): Promise<void> {
  const ids = new Set(await nomorSinkronCg());
  if (aktif) ids.add(numberId);
  else ids.delete(numberId);
  await setSetting(KUNCI_NOMOR, JSON.stringify([...ids].sort((a, b) => a - b)));
  if (aktif) await jalankanCg();
  else {
    const sql = await db();
    await sql`DELETE FROM documents WHERE number_id = ${numberId} AND nama_berkas = ${PENANDA}`;
  }
}

export async function statusSinkronCg(): Promise<StatusCg> {
  try {
    return JSON.parse((await getSetting(KUNCI_STATUS)) ?? "null") ?? { waktu: null, karakter: 0, galat: null };
  } catch {
    return { waktu: null, karakter: 0, galat: null };
  }
}

// ---------- Penjadwalan ----------

/** Minta susun ulang; perubahan beruntun dalam JEDA_MS digabung jadi satu. */
export function mintaSinkronCg(): void {
  if (st.jeda) clearTimeout(st.jeda);
  st.jeda = setTimeout(() => {
    st.jeda = null;
    void jalankanCg();
  }, JEDA_MS);
  st.jeda.unref?.();
}

/** Dipanggil sekali saat server mulai. */
export function mulaiSinkronCg(): void {
  if (st.jaga) return;
  mintaSinkronCg();
  st.jaga = setInterval(mintaSinkronCg, JAGA_MS);
  st.jaga.unref?.();
}

/** Satu susunan pada satu waktu; permintaan yang datang saat berjalan diulang sekali sesudahnya. */
export function jalankanCg(): Promise<void> {
  if (st.jalan) {
    st.ulang = true;
    return st.jalan;
  }
  st.jalan = susun()
    .catch(async (e) => {
      const s = await statusSinkronCg();
      await setSetting(KUNCI_STATUS, JSON.stringify({ ...s, galat: e instanceof Error ? e.message : String(e) })).catch(() => {});
      console.error("[sinkron-cg] gagal:", e instanceof Error ? e.message : e);
    })
    .finally(() => {
      st.jalan = null;
      if (st.ulang) {
        st.ulang = false;
        mintaSinkronCg();
      }
    });
  return st.jalan;
}

// ---------- Ambil & tulis ----------

export interface DataCg {
  paket: Paket[];
  custom: PaketCustom;
  percobaan: AturanPercobaan;
  nomorGratis: number;
  pendaftaran: boolean;
  /** null = pembayaran online belum dipasang di server. */
  kanal: KanalBayar[] | null;
  afiliasi: PengaturanAfiliasi;
  /** Cara pengembalian dana jaminan yang dipilih admin; tidak diisi (uji lama) = manual. */
  refund?: ModeRefund;
}

async function ambilData(): Promise<DataCg> {
  const [paket, custom, percobaan, nomorGratis, pendaftaran, midtrans, kanal, afiliasi, refund] = await Promise.all([
    daftarPaket(),
    paketCustom(),
    aturanPercobaan(),
    kuotaNomorGratis(),
    getSetting("pendaftaran"),
    pembayaranAktif(),
    kanalAktif(),
    pengaturanAfiliasi(),
    modeRefund(),
  ]);
  return { paket: paket.filter((p) => p.harga > 0), custom, percobaan, nomorGratis, pendaftaran: pendaftaran !== "tutup", kanal: midtrans ? kanal : null, afiliasi, refund };
}

async function susun(): Promise<void> {
  const ids = await nomorSinkronCg();
  if (!ids.length) return;
  const data = await ambilData();
  const teks = rapikanTeks(susunTeksCg(data, waktuWib(sekarang())));
  const hash = createHash("sha256").update(rapikanTeks(susunTeksCg(data, "-"))).digest("hex");
  await perbaruiDokumenOtomatis({ penanda: PENANDA, judul: JUDUL, kunciHash: KUNCI_HASH, ids, teks, hash });
  await setSetting(KUNCI_STATUS, JSON.stringify({ waktu: sekarang(), karakter: teks.length, galat: null } satisfies StatusCg));
}

// ---------- Susun teks knowledge ----------

const rp = (n: number): string => `Rp${angka(Math.round(n))}`;
const waktuWib = (detik: number): string =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(detik * 1000)) + " WIB";

/** Kelompokkan baris jadi kartu <= MAKS_KARTU karakter; tiap kartu berdiri sendiri (judul + kata kunci diulang). */
function kartu(judul: string, pembuka: string[], baris: string[], kunci: string): string[] {
  const hasil: string[] = [];
  let kini: string[] = [];
  const buat = (isi: string[], ke: number) => [`${judul}${ke > 1 ? ` (lanjutan ${ke})` : ""}`, ...(ke === 1 ? pembuka : []), ...isi, `Kata kunci: ${kunci}`].join("\n");
  for (const b of baris) {
    if (kini.length && buat([...kini, b], hasil.length + 1).length > MAKS_KARTU) {
      hasil.push(buat(kini, hasil.length + 1));
      kini = [];
    }
    kini.push(b);
  }
  if (kini.length || !hasil.length) hasil.push(buat(kini, hasil.length + 1));
  return hasil;
}

function teksKomisi(jenis: Paket["komisi_jenis"], nilai: number, harga: number | null): string {
  if (nilai <= 0) return "tanpa komisi";
  if (jenis === "persen") return `${nilai}% dari harga yang dibayar${harga ? ` (${rp(hitungKomisiPaket(harga, "persen", nilai))} untuk harga ${rp(harga)})` : ""}`;
  return `${rp(nilai)} per pembayaran`;
}

function teksPercobaan(d: DataCg): string {
  const p = d.percobaan;
  if (p.balasan === 0)
    return `- *Tanpa free trial*: daftar akun gratis, bisa menyambungkan ${angka(d.nomorGratis)} nomor WhatsApp, mengisi product knowledge, dan mencoba bot di menu Uji bot, tetapi AI baru membalas pelanggan sungguhan setelah berlangganan paket berbayar. Sebagai gantinya ada jaminan uang kembali ${MASA_ID}.`;
  const masa = p.ulang === "bulanan" ? "per bulan, diperbarui tiap awal bulan" : p.hari > 0 ? `sekali pakai, berlaku ${p.hari} hari sejak akun dibuat` : "sekali pakai, tanpa batas waktu";
  return `- *Gratis (percobaan)*: Rp0, ${angka(d.nomorGratis)} nomor WhatsApp, ${angka(p.balasan)} balasan AI (${masa}). Tanpa kartu kredit; cukup daftar akun.`;
}

/** Kartu jaminan uang kembali (aturannya di jaminan-def.ts; VA bank tidak bisa di-refund Midtrans). */
function teksJaminan(mode: ModeRefund): string[] {
  return [
    `- Pembayaran PERTAMA akun bisa diminta kembali penuh dalam ${MASA_ID} sejak dibayar, selama balasan AI yang terpakai paling banyak ${JAMINAN_MAKS_PAKAI_PERSEN}% dari kuota paket.`,
    "- Hanya untuk pembayaran lewat GoPay, ShopeePay, atau QRIS. Pembayaran lewat virtual account (VA) bank tidak termasuk jaminan.",
    mode === "otomatis"
      ? "- Cara: login, buka menu Langganan, tekan \"Minta uang kembali\" dan tulis alasannya (wajib). Diproses otomatis tanpa menunggu admin: dana kembali ke metode bayar asal (GoPay biasanya 1×24 jam; QRIS dari aplikasi lain bisa sampai 15–20 hari kerja) dan paketnya langsung dihentikan."
      : "- Cara: login, buka menu Langganan, tekan \"Minta uang kembali\", lalu isi alasannya (wajib) dan rekening bank atau e-wallet tujuan. Admin mentransfer dananya ke tujuan itu dalam 3–7 hari kerja dan pemilik akun dapat notifikasi; begitu dana ditransfer, paketnya dihentikan.",
    "- Berlaku sekali per orang: nomor WhatsApp atau email yang sudah pernah memakai jaminan tidak bisa memakainya lagi lewat akun baru. Perpanjangan dan pembelian kedua tidak termasuk.",
  ];
}

/** Susun data jadi kartu-kartu teks yang ramah pencarian (satu topik per kartu, kata kunci pelanggan di tiap kartu). */
export function susunTeksCg(d: DataCg, per: string): string {
  const semua: string[] = [];
  const catatan = `(Data resmi per ${per}, otomatis dari sistem ${MEREK}. Bila berbeda dengan dokumen lain, yang benar adalah data ini.)`;
  const custom = customTampil(d.custom) ? d.custom : null;

  // Paket & harga
  const barisPaket = [
    teksPercobaan(d),
    ...d.paket.map((p) => {
      let s = `- *${p.nama}*${p.unggulan ? " (paling populer)" : ""}: ${rp(p.harga)} per ${p.durasi_hari} hari, ${angka(p.kuota_nomor)} nomor WhatsApp, ${angka(p.kuota_balasan)} balasan AI.`;
      if (p.deskripsi.trim()) s += ` ${p.deskripsi.trim().replace(/\s+/g, " ").replace(/\.?$/, ".")}`;
      return s;
    }),
  ];
  if (custom) {
    const harga = hargaAngka(custom) ? `${rp(custom.harga)} per ${custom.durasi_hari} hari` : custom.teks_harga.trim();
    const kuota = custom.tampil_kuota ? `, ${angka(custom.kuota_nomor)} nomor WhatsApp, ${angka(custom.kuota_balasan)} balasan AI` : "";
    const cara = custom.aksi === "wa" ? "Detail dan pemesanannya lewat chat WhatsApp admin dari tombol di halaman Langganan." : "Bisa langsung dibayar dari menu Langganan.";
    barisPaket.push(`- *${custom.nama}*: ${harga}${kuota}. ${custom.deskripsi.trim() ? `${custom.deskripsi.trim().replace(/\.?$/, ".")} ` : ""}${cara}`);
    if (custom.fitur.length) barisPaket.push(`  Kelebihan ${custom.nama}: ${custom.fitur.join("; ")}.`);
  }
  semua.push(
    ...kartu(
      `Daftar paket & harga ${MEREK}`,
      [catatan, "Semua paket berbayar dihitung per masa aktif; balasan AI = jumlah pesan yang dibalas AI di semua nomor akun selama masa aktif."],
      [
        ...barisPaket,
        `Semua paket menyimpan histori percakapan ${UMUR_HISTORI_HARI} hari. Katalog produk berfoto hanya untuk paket berbayar.`,
        ...(d.pendaftaran ? [] : ["Pendaftaran akun baru sedang ditutup sementara oleh admin."]),
        "Paket yang tidak ada di daftar ini sedang tidak dijual.",
      ],
      "harga, harganya, berapa, biaya, tarif, price list, pricelist, daftar harga, paket, langganan, per bulan, bulanan, murah, kuota, balasan, gratis, free trial, percobaan, coba, starter, bisnis, pro, custom"
    )
  );

  // Jaminan uang kembali
  semua.push(
    ...kartu(
      `Jaminan uang kembali ${MEREK}`,
      [catatan],
      teksJaminan(d.refund ?? "manual"),
      "uang kembali, refund, garansi, jaminan, money back, balikin uang, kembalikan dana, tidak cocok, kecewa, batal langganan, coba dulu, trial, free trial, percobaan, gratis"
    )
  );

  // Berlangganan
  semua.push(
    ...kartu(
      "Cara berlangganan, perpanjang, dan pindah paket",
      [catatan],
      [
        "- Berlangganan: login ke dashboard, buka menu Langganan, pilih paket, pilih metode pembayaran, lalu bayar. Paket aktif otomatis begitu pembayaran diterima, tanpa konfirmasi manual.",
        "- Perpanjang paket yang sama sebelum masa aktif habis: masa aktif dan kuota balasan ditambahkan ke paket yang sedang berjalan.",
        "- Pindah ke paket lain: paket baru mulai hari itu dan menggantikan paket yang sedang aktif.",
        "- Masa aktif habis atau kuota balasan habis: AI berhenti membalas sampai paket diperpanjang atau dinaikkan. Sisa kuota tidak bisa dipakai setelah masa aktif habis.",
        "- Tanpa kontrak; langganan tidak diperpanjang otomatis, jadi tidak ada tagihan diam-diam.",
      ],
      "cara langganan, cara berlangganan, beli paket, upgrade, naik paket, ganti paket, pindah paket, perpanjang, perpanjangan, habis, expired, kedaluwarsa, kuota habis, kontrak, otomatis diperpanjang, berhenti langganan"
    )
  );

  // Pembayaran
  const kanal = d.kanal ?? [];
  const va = kanal.filter((k) => KANAL_BAYAR[k].metode === "va");
  const cepat = kanal.filter((k) => KANAL_BAYAR[k].metode !== "va");
  semua.push(
    ...kartu(
      `Metode pembayaran ${MEREK}`,
      [catatan],
      !kanal.length
        ? ["Pembayaran online sedang belum tersedia. Arahkan pelanggan untuk menghubungi admin."]
        : [
            `- Metode yang tersedia saat ini: ${kanal.map((k) => KANAL_BAYAR[k].label).join(", ")}.`,
            ...(va.length ? [`- ${va.map((k) => KANAL_BAYAR[k].label).join(", ")}: nomor tagihan berlaku ${Math.round(KANAL_BAYAR[va[0]].menit / 60)} jam.`] : []),
            ...(cepat.length ? [`- ${cepat.map((k) => KANAL_BAYAR[k].label).join(", ")}: harus dibayar dalam ${KANAL_BAYAR[cepat[0]].menit} menit.`] : []),
            "- Metode di luar daftar ini (misalnya kartu kredit atau metode yang tidak disebut di atas) sedang tidak tersedia; jangan menjanjikannya.",
            "- Tagihan dibuat di halaman pembayaran dashboard dan diproses aman oleh Midtrans, tanpa biaya tambahan. Paket aktif otomatis begitu pembayaran diterima.",
          ],
      "bayar, pembayaran, cara bayar, metode bayar, transfer, virtual account, va, qris, gopay, shopeepay, e-wallet, ewallet, kartu kredit, debit, bca, bni, bri, mandiri, permata, midtrans, bukti transfer"
    )
  );

  // Afiliasi
  const a = d.afiliasi;
  const komisi = [
    ...d.paket.map((p) => `- *${p.nama}* (${rp(p.harga)}): komisi ${teksKomisi(p.komisi_jenis, p.komisi_nilai, p.harga)}.`),
    ...(custom ? [`- *${custom.nama}*: komisi ${teksKomisi(custom.komisi_jenis, custom.komisi_nilai, hargaAngka(custom) ? custom.harga : null)}.`] : []),
  ];
  if (!a.aktif) {
    semua.push(
      ...kartu(
        `Program afiliasi ${MEREK}`,
        [catatan],
        ["Program afiliasi sedang tidak dibuka. Jangan menjanjikan komisi atau pendaftaran afiliasi."],
        "afiliasi, affiliate, komisi, referral, reseller, mitra, bagi hasil, persen"
      )
    );
  } else {
    semua.push(
      ...kartu(
        `Program afiliasi ${MEREK}: cara kerja`,
        [catatan],
        [
          `- Siapa saja yang punya akun ${MEREK} bisa bergabung gratis dari menu Afiliasi di dashboard, tanpa harus membeli paket. ${a.persetujuan === "otomatis" ? "Akun afiliasi langsung aktif." : "Pendaftaran afiliasi ditinjau dan diaktifkan admin dulu."}`,
          `- Afiliator membagikan link referral (berakhiran ?ref=kode-afiliator). Orang yang membuka link itu lalu mendaftar akun (email atau Google) dalam ${Math.round(UMUR_COOKIE_REF / 86400)} hari tercatat sebagai referralnya.`,
          `- Komisi masuk ke saldo otomatis begitu pembayaran paket pelanggan referral lunas, dan bisa ditarik ${MASA_ID} kemudian (masa jaminan uang kembali; bila pembelinya minta uang kembali, komisinya batal). ${a.siklus === "berulang" ? "Komisi didapat dari setiap pembayaran pelanggan referral, termasuk perpanjangan." : "Komisi hanya dari pembelian pertama tiap pelanggan referral; perpanjangan berikutnya tidak memberi komisi lagi."}`,
          `- Pencairan: minimal saldo ${rp(a.minTarik)}, ajukan dari menu Afiliasi ke rekening bank atau e-wallet (${DAFTAR_BANK.map((b) => b.nama.replace(/ \(.*\)$/, "")).join(", ")}). Satu pengajuan diproses admin sebelum bisa mengajukan lagi; bila ditolak, saldonya kembali.`,
          "- Statistik klik link, pendaftar, komisi, dan status pencairan bisa dipantau langsung di menu Afiliasi.",
        ],
        "afiliasi, affiliate, cara gabung afiliasi, daftar afiliasi, referral, link referral, ref, reseller, mitra, bagi hasil, pencairan, cairkan, tarik saldo, withdraw, minimal penarikan, rekening"
      ),
      ...kartu(
        `Besar komisi afiliasi ${MEREK} per paket`,
        [catatan, `Komisi dihitung dari harga yang dibayar pelanggan referral, ${a.siklus === "berulang" ? "untuk setiap pembayaran (termasuk perpanjangan)" : "hanya untuk pembelian pertamanya"}:`],
        komisi.length ? komisi : ["- Belum ada paket berbayar yang dijual."],
        "komisi, berapa komisi, komisinya berapa, persen, berapa persen, persentase, komisi afiliasi, komisi referral, bagi hasil, dapat berapa, fee, komisi starter, komisi bisnis, komisi pro"
      )
    );
  }

  // Fitur
  semua.push(
    ...kartu(
      `Fitur ${MEREK}`,
      [catatan, `${MEREK} adalah asisten AI yang membalas chat WhatsApp bisnis otomatis 24 jam berdasarkan informasi usaha yang diisi pemilik akun.`],
      [
        "- Nomor WhatsApp disambungkan dengan scan QR (perangkat tertaut); nomor tetap bisa dipakai seperti biasa di HP. Satu akun bisa mengelola beberapa nomor sesuai paket, masing-masing dengan knowledge sendiri.",
        `- Base knowledge: ketik teks atau unggah PDF/teks (maks 10 MB per berkas, ${angka(BATAS_DOKUMEN_KARAKTER)} karakter per dokumen, ${angka(BATAS_NOMOR_KARAKTER)} karakter per nomor). Perubahan langsung berlaku.`,
        "- Setiap jawaban AI diperiksa otomatis sebelum dikirim; angka, tautan, atau janji yang tidak ada di knowledge ditolak supaya AI tidak mengarang.",
        "- Bila pemilik membalas sendiri dari HP, AI otomatis diam sementara di chat itu (lama jedanya bisa diatur per nomor). AI juga belajar dari balasan manusia.",
        `- Katalog produk berfoto (maks ${angka(BATAS_KATALOG.produk)} produk, paket berbayar): AI mengirim foto, nama, dan harga produk saat diminta.`,
        "- AI hanya membalas chat yang masuk dan tidak pernah mengirim pesan duluan ke nomor lain. Untuk pesanan, bukti bayar, atau keluhan, AI merapikan datanya di chat itu lalu pemilik membalas langsung dari HP.",
        "- AI bisa melihat foto dari pelanggan dan menyaring spam (spam tidak memotong kuota). Ada juga penyaring prospek yang bisa dinyalakan per nomor supaya kuota tidak habis untuk chat iseng.",
        `- Histori percakapan tampil di dashboard dan disimpan ${UMUR_HISTORI_HARI} hari. Ada menu Uji bot untuk mencoba jawaban AI sebelum dipakai.`,
        "- Data tiap akun terpisah: nomor, knowledge, katalog, dan histori tidak bisa dilihat akun lain.",
      ],
      "fitur, bisa apa, kelebihan, cara kerja, scan qr, sambung nomor, banyak nomor, knowledge, pdf, upload, katalog, foto produk, pesanan, notifikasi, histori, riwayat chat, uji bot, spam, belajar, 24 jam, keamanan, data aman"
    )
  );

  return semua.join("\n\n");
}

export const DOKUMEN_CG = PENANDA;

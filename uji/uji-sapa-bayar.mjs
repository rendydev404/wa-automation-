// Uji sapaan pembayaran paket yang tidak selesai (src/lib/sapa-bayar.ts): kapan tahap 1 & 2 terkirim, tidak dobel,
// batas satu rangkaian per 7 hari, siapa yang dilewati (masih menunggu, sudah dapat paket, berhenti, staf, Developer
// API, kejadian lama), isi email (metode yang dicoba, tombol bayar ulang, tautan berhenti), notifikasi akun & admin,
// banner dashboard, dan token berhenti. TIDAK ADA kiriman WhatsApp. PostgreSQL 15 sungguhan + SMTP tiruan.
// Pakai: node --import ./uji/loader.mjs uji/uji-sapa-bayar.mjs
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";
import { mulaiSmtpTiruan } from "./smtp-tiruan.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-sapa-bayar");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const smtp = await mulaiSmtpTiruan();
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "s".repeat(48);
process.env.GMAIL_USER = smtp.user;
process.env.GMAIL_APP_PASSWORD = smtp.pass;
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(smtp.port);
process.env.APP_URL = "https://app.uji";
// Tidak boleh ada panggilan jaringan keluar (provider bayar, WhatsApp): semuanya dicatat dan dijawab 404.
const keluar = [];
globalThis.fetch = async (url) => {
  keluar.push(String(url));
  return new Response("{}", { status: 404 });
};
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, sekarang } = await lib("src/lib/db.ts");
const S = await lib("src/lib/sapa-bayar.ts");
const L = await lib("src/lib/langganan.ts");
const P = await lib("src/lib/pengguna.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

const KINI = sekarang();
const starter = (await L.daftarPaket()).find((p) => p.kode === "starter");
const akun = (email, peran = "user") => P.buatAkun({ email, nama: email.split("@")[0], password: "rahasia-uji-01", peran });
let urut = 0;
/** Tagihan paket Starter: `lalu` = berapa detik lalu dibuat; batas bayar 15 menit setelah dibuat (kanal e-wallet). */
async function tagihan(user, { status = "kedaluwarsa", kanal = "gopay", lalu = 3600, awalan = "WA", api = false } = {}) {
  const dibuat = KINI - lalu;
  const orderId = `${awalan}-${user.id}-${dibuat}-${(urut++).toString(16).padStart(6, "0")}`;
  await sql`
    INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, kedaluwarsa, dibuat)
    VALUES (${orderId}, ${user.id}, ${starter.id}, ${starter.nama}, ${starter.harga}, ${status}, ${kanal}, ${dibuat + 900}, ${dibuat})`;
  if (api) {
    // Tagihan Developer API: tanpa paket, terkait aplikasi. Cukup tandai lewat kolomnya (baris aplikasi palsu tidak perlu FK nyata).
    await sql`UPDATE transaksi SET paket_id = NULL WHERE order_id = ${orderId}`;
  }
  return orderId;
}
const tungguEmail = async (n) => {
  for (let i = 0; i < 300 && smtp.masuk.length < n; i++) await new Promise((r) => setTimeout(r, 10));
};
const html = (e) => e.mentah.replace(/=\r?\n/g, "").replace(/=3D/g, "=");

const admin = await akun("admin@uji.test", "admin");
const ani = await akun("ani@uji.test");

await cek("fungsi murni: tahap jatuh tempo, saran metode golongan lain, token berhenti", async () => {
  assert.equal(S.tahapJatuhTempo({ akhir: KINI - 1000, tahap1: null, tahap2: null }, KINI), 1);
  assert.equal(S.tahapJatuhTempo({ akhir: KINI - 4 * 86400, tahap1: null, tahap2: null }, KINI), null, "kejadian > 3 hari tidak memulai rangkaian");
  assert.equal(S.tahapJatuhTempo({ akhir: KINI - 9e4, tahap1: KINI - 3600, tahap2: null }, KINI), null, "tahap 2 menunggu 24 jam");
  assert.equal(S.tahapJatuhTempo({ akhir: KINI - 9e4, tahap1: KINI - 86401, tahap2: null }, KINI), 2);
  assert.equal(S.tahapJatuhTempo({ akhir: KINI - 9e4, tahap1: KINI - 90000, tahap2: KINI - 100 }, KINI), null, "tahap 2 sekali saja");
  assert.deepEqual(S.saranKanal(["qris", "gopay", "dana", "bca", "bri"], ["dana", "gopay"]), ["qris", "bca", "bri"], "e-wallet gagal -> QRIS / virtual account");
  assert.deepEqual(S.saranKanal(["qris", "gopay", "bca"], ["bca"]), ["qris", "gopay"], "VA gagal -> QRIS / e-wallet");
  assert.deepEqual(S.saranKanal(["gopay"], ["gopay"]), [], "tidak ada sisa");
  assert.equal(S.tokenBerhentiSah(ani.id, S.tokenBerhenti(ani.id)), true);
  assert.equal(S.tokenBerhentiSah(ani.id, S.tokenBerhenti(ani.id + 1)), false);
  assert.equal(S.tokenBerhentiSah(ani.id, "pendek"), false);
});

await cek("tahap 1: 3 percobaan e-wallet berdekatan = SATU email (menyebut semua metode) + notifikasi akun & admin", async () => {
  await tagihan(ani, { kanal: "dana", status: "dibatalkan", lalu: 2000 });
  await tagihan(ani, { kanal: "shopeepay", status: "dibatalkan", lalu: 1980 });
  const order = await tagihan(ani, { kanal: "gopay", lalu: 1960 });
  assert.equal(await S.putaranSapaBayar(KINI), 1);
  await tungguEmail(1);
  assert.equal(smtp.masuk.length, 1);
  const e = smtp.masuk[0];
  assert.deepEqual(e.ke, ["ani@uji.test"]);
  assert.match(e.judul, /Pembayaran paket Starter belum masuk/);
  const h = html(e);
  const kepala = e.mentah.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
  assert.ok(kepala.includes(`List-Unsubscribe: <https://app.uji/api/sapa-bayar/berhenti?u=${ani.id}&t=${S.tokenBerhenti(ani.id)}>`), "header berhenti satu klik");
  assert.match(kepala, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(h, /DANA, ShopeePay, GoPay/, "metode yang dicoba urut waktu");
  assert.ok(h.includes(`href="https://app.uji/langganan/bayar/${starter.id}"`), "tombol bayar ulang ke paket yang sama");
  assert.ok(h.includes(`https://app.uji/api/sapa-bayar/berhenti?u=${ani.id}&amp;t=${S.tokenBerhenti(ani.id)}`), "tautan berhenti bertanda tangan");
  assert.match(h, /jaminan uang kembali/, "belum pernah bayar -> jaminan disebut");
  const [s] = await sql`SELECT order_id, tahap FROM sapa_bayar WHERE user_id = ${ani.id}`;
  assert.deepEqual([s.order_id, s.tahap], [order, 1]);
  const [n] = await sql`SELECT judul, tautan FROM notifikasi WHERE user_id = ${ani.id} AND jenis = 'pembayaran'`;
  assert.deepEqual([n.judul, n.tautan], ["Pembayaran paket Starter belum berhasil", `/langganan/bayar/${starter.id}`]);
  const [na] = await sql`SELECT judul, isi, tautan FROM notifikasi WHERE user_id = ${admin.id} AND jenis = 'admin_bayar'`;
  assert.equal(na.judul, "Gagal bayar: ani@uji.test");
  assert.match(na.isi, /3 metode dicoba \(DANA, ShopeePay, GoPay\) · belum menyambungkan WA/);
  assert.equal(na.tautan, `/admin/pengguna/${ani.id}`);
});

await cek("putaran berikutnya tidak mengirim ulang; banner dashboard tampil untuk tagihan itu", async () => {
  assert.equal(await S.putaranSapaBayar(KINI + 300), 0);
  assert.equal(await S.putaranSapaBayar(KINI + 3600), 0, "tahap 2 belum 24 jam");
  const b = await S.gagalBayarTerakhir(ani.id, KINI);
  assert.deepEqual([b.nama_paket, b.jumlah, b.paket_id, b.paket_aktif], ["Starter", starter.harga, starter.id, true]);
});

await cek("tahap 2: 24 jam setelah tahap 1, sekali saja; lalu rangkaian selesai walau gagal bayar lagi dalam 7 hari", async () => {
  assert.equal(await S.putaranSapaBayar(KINI + 86400 + 60), 1);
  await tungguEmail(2);
  assert.match(smtp.masuk[1].judul, /tinggal satu langkah lagi/);
  assert.ok(html(smtp.masuk[1]).includes(`href="https://app.uji/langganan/bayar/${starter.id}"`));
  assert.equal(await S.putaranSapaBayar(KINI + 2 * 86400), 0, "tahap 2 tidak diulang");
  // Gagal bayar lagi 3 hari kemudian: masih dalam 7 hari sejak tahap 1 -> tidak ada rangkaian baru.
  await sql`INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, kedaluwarsa, dibuat)
            VALUES (${`WA-${ani.id}-${KINI + 3 * 86400}-aa0001`}, ${ani.id}, ${starter.id}, 'Starter', ${starter.harga}, 'kedaluwarsa', 'qris', ${KINI + 3 * 86400 + 900}, ${KINI + 3 * 86400})`;
  assert.equal(await S.putaranSapaBayar(KINI + 3 * 86400 + 3600), 0);
  assert.equal(smtp.masuk.length, 2);
});

await cek("dilewati: baru gagal < 15 menit, kejadian > 3 hari, masih menunggu, sudah dapat paket, staf, Developer API, voucher", async () => {
  const baru = await akun("baru@uji.test");
  await tagihan(baru, { lalu: 1000 }); // berakhir 100 dtk lalu
  const lama = await akun("lama@uji.test");
  await tagihan(lama, { lalu: 5 * 86400 });
  const tunggu = await akun("tunggu@uji.test");
  await tagihan(tunggu, { status: "dibatalkan", lalu: 5000 });
  await sql`INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, kedaluwarsa, dibuat)
            VALUES (${`WA-${tunggu.id}-${KINI - 100}-bb0001`}, ${tunggu.id}, ${starter.id}, 'Starter', ${starter.harga}, 'menunggu', 'bca', ${KINI + 86000}, ${KINI - 100})`;
  const diberi = await akun("diberi@uji.test");
  await tagihan(diberi, { lalu: 7200 });
  await sql`INSERT INTO langganan(user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber)
            VALUES (${diberi.id}, ${starter.id}, 'Starter', ${KINI - 3600}, ${KINI + 30 * 86400}, 1, 1000, 'admin')`;
  const staf = await akun("staf@uji.test", "admin");
  await tagihan(staf, { lalu: 7200 });
  const dev = await akun("dev@uji.test");
  await tagihan(dev, { lalu: 7200, api: true });
  const vcr = await akun("vcr@uji.test");
  await tagihan(vcr, { lalu: 7200, awalan: "VCR" });
  const sebelum = smtp.masuk.length;
  assert.equal(await S.putaranSapaBayar(KINI), 0);
  assert.equal(smtp.masuk.length, sebelum);
  for (const u of [baru, tunggu, diberi, staf, dev, vcr]) {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM sapa_bayar WHERE user_id = ${u.id}`;
    assert.equal(n, 0, u.email);
  }
  assert.equal(await S.gagalBayarTerakhir(lama.id, KINI), null, "banner hilang setelah 3 hari");
  assert.equal(await S.gagalBayarTerakhir(tunggu.id, KINI), null, "tagihan baru masih berjalan");
  assert.equal(await S.gagalBayarTerakhir(diberi.id, KINI), null, "sudah dapat paket");
  // Yang baru gagal ikut disapa begitu lewat 15 menit.
  assert.equal(await S.putaranSapaBayar(KINI + 900), 1);
});

await cek("tagihan 'menunggu' yang lewat batas: status ditanyakan ke provider dulu, tidak langsung disapa", async () => {
  const lupa = await akun("lupa@uji.test");
  await tagihan(lupa, { status: "menunggu", lalu: 7200 });
  assert.equal(await S.putaranSapaBayar(KINI), 0);
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM sapa_bayar WHERE user_id = ${lupa.id}`;
  assert.equal(n, 0);
  assert.ok((await S.gagalBayarTerakhir(lupa.id, KINI)) !== null, "banner tetap tampil: batas bayar sudah lewat");
});

await cek("berhenti menerima sapaan: akun ditandai dan tidak disapa lagi", async () => {
  const stop = await akun("stop@uji.test");
  await tagihan(stop, { lalu: 7200 });
  assert.equal(await S.berhentiSapaBayar(stop.id), true);
  assert.equal(await S.berhentiSapaBayar(999999), false);
  const sebelum = smtp.masuk.length;
  assert.equal(await S.putaranSapaBayar(KINI), 0);
  assert.equal(smtp.masuk.length, sebelum);
});

await cek("tidak ada panggilan WhatsApp / jaringan keluar selain provider bayar", async () => {
  assert.ok(keluar.every((u) => !/whatsapp|wa\.me|graph\.facebook/.test(u)), keluar.join(", "));
});

await cek("pengirim domain sendiri (mis. Resend): From = EMAIL_DARI, Reply-To = EMAIL_BALAS_KE, kaki email mengajak membalas", async () => {
  const EM = await lib("src/lib/email.ts");
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  process.env.SMTP_USER = smtp.user;
  process.env.SMTP_PASS = smtp.pass;
  process.env.EMAIL_DARI = "cs@chatgercep.test";
  process.env.EMAIL_BALAS_KE = "balas@uji.test";
  try {
    assert.equal(EM.emailTerkonfigurasi(), true);
    const n = smtp.masuk.length;
    await EM.kirimEmail({ ke: "x@uji.test", judul: "uji domain", teks: "uji", html: EM.htmlEmail({ pratinjau: "p", ikon: "cek", judul: "J", subjudul: "S", paragraf: ["isi"] }) });
    await tungguEmail(n + 1);
    const e = smtp.masuk[n];
    assert.match(e.dari, /cs@chatgercep\.test/);
    assert.match(e.mentah, /^From: .*<cs@chatgercep\.test>/m);
    assert.match(e.mentah, /^Reply-To: balas@uji\.test/m);
    assert.match(html(e), /Balas email ini/);
    // Tanpa alamat pengirim: user SMTP bukan alamat email (mis. "resend") -> dianggap belum dikonfigurasi.
    process.env.SMTP_USER = "resend";
    delete process.env.EMAIL_DARI;
    assert.equal(EM.emailTerkonfigurasi(), false);
  } finally {
    for (const k of ["SMTP_USER", "SMTP_PASS", "EMAIL_DARI", "EMAIL_BALAS_KE"]) delete process.env[k];
  }
});

await sql.end({ timeout: 2 });
await smtp.berhenti();
await pg.berhenti().catch(() => {});
console.log(`\nLOLOS ${lolos} uji sapaan pembayaran`);
process.exit(0);

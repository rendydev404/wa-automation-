// Uji Developer API di server pusat: pengajuan, tinjauan, API key (rotasi), aktivasi mesin dengan tantangan, lisensi
// bertanda tangan (versi naik), pengiriman lisensi lewat webhook + coba ulang, tangguhkan/cabut, penagihan, rencana query.
// PostgreSQL 15 sungguhan (uji/pg-lokal.mjs); "mesin" = server HTTP tiruan di 127.0.0.1.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-developer-api.mjs
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-devapi");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
Object.assign(process.env, {
  // Batas jawaban mesin diperkecil (bawaan 5 dtk) supaya uji "jawaban lambat" tidak menunggu 5 dtk sungguhan.
  LISENSI_BATAS_KIRIM_MS: "1000",
  DATABASE_URL: pg.url,
  DATA_DIR: path.join(tmp, "data"),
  AUTH_SECRET: "x".repeat(40),
  LISENSI_KUNCI_PRIVAT: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  LISENSI_MODE_UJI: "1",
  LISENSI_KUNCI_PUBLIK: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  LISENSI_IZINKAN_HTTP: "1",
});
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, sekarang } = await lib("src/lib/db.ts");
const P = await lib("src/lib/pengguna.ts");
const D = await lib("src/lib/developer-api.ts");
const L = await lib("src/lib/lisensi-def.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};
const galat = (kode) => (e) => e?.kode === kode;

// ---- mesin tiruan ----
const mesin = { key: "", lisensi: [], tolak: false, jawabSalah: false, lambat: false, versi: 0 };
const server = http.createServer((req, res) => {
  let badan = "";
  req.on("data", (c) => (badan += c));
  req.on("end", () => {
    const b = JSON.parse(badan || "{}");
    const kirim = (s, j) => {
      res.writeHead(s, { "content-type": "application/json" });
      res.end(JSON.stringify(j));
    };
    if (mesin.lambat) return setTimeout(() => kirim(200, {}), 2500);
    if (mesin.tolak) return kirim(503, { galat: "mati" });
    if (b.jenis === "tantangan") return kirim(200, { jawaban: mesin.jawabSalah ? "salah" : L.jawabTantangan(mesin.key, b.nonce) });
    if (b.jenis === "lisensi") {
      const isi = L.verifikasiLisensi(b.lisensi);
      if (!isi || isi.versi_urut <= mesin.versi) return kirim(409, { galat: "lisensi lama/palsu" });
      mesin.versi = isi.versi_urut;
      mesin.lisensi.push(isi);
      return kirim(200, { versi_urut_diterima: isi.versi_urut, versi_mesin: "1.0.0-uji", jumlah_nomor: 3 });
    }
    kirim(404, {});
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ALAMAT = `http://127.0.0.1:${server.address().port}`;

const admin = await P.buatAkun({ email: "admin@uji.test", nama: "Admin", password: "rahasia-admin-01", peran: "admin" });
const dev = await P.buatAkun({ email: "dev@uji.test", nama: "Dev", password: "rahasia-dev-0001", peran: "developer" });
const budi = await P.buatAkun({ email: "budi@uji.test", nama: "Budi", password: "rahasia-budi-01" });
const A = { id: admin.id, email: "admin@uji.test", nama: "Admin", peran: "admin" };
const DV = { id: dev.id, email: "dev@uji.test", nama: "Dev", peran: "developer" };
const B = { id: budi.id, email: "budi@uji.test", nama: "Budi", peran: "user" };
const isian = (o = {}) => ({
  nama: "KasirKu",
  kegunaan: "Aplikasi kasir restoran yang mengirim notifikasi pesanan lewat WhatsApp.",
  situs: "kasirku.id",
  pemilik: "PT Kasir Maju",
  kontak_wa: "081234567890",
  perkiraan_nomor: "20",
  alamat_mesin: "kasirku.id",
  fitur: ["nomor", "pesan.kirim", "ai"],
  setuju: true,
  ...o,
});

console.log("== pengajuan & tinjauan ==");
let appId;
await cek("pengajuan divalidasi (nama, kegunaan, kontak, fitur, setuju, domain aplikasi wajib, https) lalu masuk antrean", async () => {
  await assert.rejects(D.ajukan(B, isian({ nama: "X" })), galat("isian_tidak_sah"));
  await assert.rejects(D.ajukan(B, isian({ kegunaan: "pendek" })), galat("isian_tidak_sah"));
  await assert.rejects(D.ajukan(B, isian({ kontak_wa: "12" })), galat("isian_tidak_sah"));
  await assert.rejects(D.ajukan(B, isian({ fitur: ["tidak-ada"] })), galat("isian_tidak_sah"));
  await assert.rejects(D.ajukan(B, isian({ setuju: false })), galat("isian_tidak_sah"));
  delete process.env.LISENSI_IZINKAN_HTTP;
  await assert.rejects(D.ajukan(B, isian({ alamat_mesin: "http://wa.contoh.test" })), galat("alamat_tidak_sah"));
  await assert.rejects(D.ajukan(B, isian({ alamat_mesin: "" })), galat("alamat_tidak_sah")); // domain aplikasi wajib
  await assert.rejects(D.ajukan(B, isian({ alamat_mesin: "203.0.113.7" })), galat("alamat_tidak_sah")); // IP bukan domain
  assert.equal(D.rapikanAlamatMesin("Wa.KasirKu.id/", "Domain aplikasi", true), "https://wa.kasirku.id");
  assert.equal(D.rapikanAlamatMesin("https://kasirku.id/app/", "Domain aplikasi", true), "https://kasirku.id/app");
  process.env.LISENSI_IZINKAN_HTTP = "1";
  appId = await D.ajukan(B, isian());
  const a = await D.aplikasiMilikById(budi.id, appId);
  assert.equal(a.status, "menunggu");
  assert.equal(a.kontak_wa, "6281234567890");
  assert.deepEqual(a.fitur_diminta, ["nomor", "pesan.kirim", "ai"]);
  assert.equal(await D.aplikasiMilikById(admin.id, appId), undefined); // milik orang lain tidak terlihat
  assert.equal(await D.jumlahMenunggu(), 1);
  const [n] = await sql`SELECT COUNT(*)::int AS n FROM notifikasi WHERE jenis = 'admin_developer_api'`;
  assert.equal(n.n, 1); // hanya developer internal (admin tidak menerima: fitur belum dibuka umum)
});

await cek("maks 3 pengajuan menunggu per akun", async () => {
  await D.ajukan(B, isian({ nama: "App 2" }));
  await D.ajukan(B, isian({ nama: "App 3" }));
  await assert.rejects(D.ajukan(B, isian({ nama: "App 4" })), galat("terlalu_sering"));
});

await cek("tolak wajib alasan; setujui hanya fitur yang diizinkan global; biaya berbayar wajib harga", async () => {
  const [, a2] = (await D.daftarAplikasi({ filter: "menunggu" })).daftar;
  await assert.rejects(D.tolak(DV, a2.id, "x"), galat("isian_tidak_sah"));
  await D.tolak(DV, a2.id, "Kegunaan belum jelas");
  assert.equal((await D.aplikasiById(a2.id)).status, "ditolak");
  await assert.rejects(D.setujui(DV, appId, { fitur: [], biaya: "gratis", harga_bulan: null, batas: {} }), galat("isian_tidak_sah"));
  await assert.rejects(D.setujui(DV, appId, { fitur: ["nomor"], biaya: "berbayar", harga_bulan: null, batas: {} }), galat("isian_tidak_sah"));
  await D.simpanPengaturanApi(A, { biaya: "gratis", harga: 50000, fitur: ["nomor", "pesan.kirim", "pesan.terima", "ai"] });
  await D.setujui(DV, appId, { fitur: ["nomor", "pesan.kirim", "knowledge", "ai"], biaya: "ikut_umum", harga_bulan: null, batas: { nomor: 5, instalasi: 1, pesan_menit: 999 } });
  const a = await D.aplikasiById(appId);
  assert.equal(a.status, "disetujui");
  assert.deepEqual(a.fitur, ["nomor", "pesan.kirim", "ai"]); // knowledge tidak diizinkan global -> dibuang
  assert.equal(a.batas.nomor, 5);
  assert.equal(a.batas.pesan_menit, 60); // dipotong ke rentang
  assert.equal(D.statusLisensi(a, await D.pengaturanApi()), "aktif");
  const c = await D.hitungAplikasi();
  assert.deepEqual([c.menunggu, c.aktif, c.ditolak, c.semua], [1, 1, 1, 3]);
});

console.log("== API key ==");
let key1;
let key2;
await cek("key tampil sekali (hanya hash tersimpan), milik orang lain ditolak, rotasi: key lama berlaku 24 jam", async () => {
  await assert.rejects(D.buatKunci(A, appId), galat("tidak_ditemukan"));
  const k = await D.buatKunci(B, appId);
  key1 = k.key;
  assert.match(key1, /^cg_live_[0-9A-Za-z]{8}_[0-9A-Za-z]{32}$/);
  assert.equal(k.rotasi, false);
  const [baris] = await sql`SELECT hash FROM api_kunci WHERE aplikasi_id = ${appId}`;
  assert.ok(!JSON.stringify(baris).includes(key1.slice(17)));
  const k2 = await D.buatKunci(B, appId);
  key2 = k2.key;
  assert.equal(k2.rotasi, true);
  const daftar = await D.daftarKunci(appId);
  const lama = daftar.find((x) => key1.includes(x.awalan));
  assert.ok(lama.berlaku_sampai > sekarang() + 23 * 3600 && lama.berlaku_sampai <= sekarang() + 24 * 3600);
});

console.log("== aktivasi & lisensi ==");
const idMesin = randomUUID();
await cek("aktivasi: key salah 401, tantangan dijawab salah ditolak, sukses -> lisensi Ed25519 sah berisi fitur, batas & daftar key", async () => {
  await assert.rejects(D.aktivasi({ key: "cg_live_salah", id_instalasi: idMesin, alamat: ALAMAT, versi: "1" }), galat("key_tidak_sah"));
  mesin.key = key2;
  mesin.jawabSalah = true;
  await assert.rejects(D.aktivasi({ key: key2, id_instalasi: idMesin, alamat: ALAMAT, versi: "1" }), galat("tantangan_gagal"));
  mesin.jawabSalah = false;
  const token = await D.aktivasi({ key: key2, id_instalasi: idMesin, alamat: ALAMAT, versi: "1.0.0-uji" });
  const isi = L.verifikasiLisensi(token);
  assert.ok(isi);
  assert.equal(isi.status, "aktif");
  assert.equal(isi.id_instalasi, idMesin);
  assert.deepEqual(isi.fitur, ["nomor", "pesan.kirim", "ai"]);
  assert.ok(L.kunciCocok(key1, isi.kunci) && L.kunciCocok(key2, isi.kunci));
  assert.equal(L.kunciCocok(key2.replace(/.$/, (c) => (c === "0" ? "1" : "0")), isi.kunci), false); // huruf terakhir pasti berbeda
  assert.ok(isi.berlaku_sampai - isi.diterbitkan === 7 * 86400);
  // Tanda tangan dipalsukan / isi diubah = ditolak.
  const [kepala, tanda] = token.split(".");
  const ubah = Buffer.from(JSON.stringify({ ...isi, status: "aktif", fitur: ["knowledge"] })).toString("base64url");
  assert.equal(L.verifikasiLisensi(`${ubah}.${tanda}`), null);
  assert.equal(L.verifikasiLisensi(`${kepala}.${tanda}x`), null);
  // Tanpa LISENSI_MODE_UJI (seperti image produksi), kunci uji di .env diabaikan walau NODE_ENV diubah:
  // hanya kunci publik pusat yang tertanam di kode yang berlaku.
  const simpanEnv = process.env.NODE_ENV;
  delete process.env.LISENSI_MODE_UJI;
  process.env.NODE_ENV = "development";
  try {
    assert.equal(L.kunciPublikAktif(), L.KUNCI_PUBLIK_PUSAT);
    assert.equal(L.verifikasiLisensi(token), null);
  } finally {
    process.env.LISENSI_MODE_UJI = "1";
    if (simpanEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = simpanEnv;
  }
  assert.ok(L.verifikasiLisensi(token));
});

await cek("batas instalasi: mesin kedua ditolak (instalasi_penuh); aktivasi ulang mesin yang sama boleh", async () => {
  await assert.rejects(D.aktivasi({ key: key2, id_instalasi: randomUUID(), alamat: ALAMAT, versi: "1" }), galat("instalasi_penuh"));
  assert.ok(L.verifikasiLisensi(await D.aktivasi({ key: key2, id_instalasi: idMesin, alamat: ALAMAT, versi: "1" })));
});

await cek("kondisi saat menyala: lisensi terbaru, versi_urut selalu naik; instalasi tak dikenal = tidak_ditemukan", async () => {
  const v1 = L.verifikasiLisensi(await D.kondisi({ key: key2, id_instalasi: idMesin, versi: "1" })).versi_urut;
  const v2 = L.verifikasiLisensi(await D.kondisi({ key: key2, id_instalasi: idMesin, versi: "1" })).versi_urut;
  assert.ok(v2 > v1);
  await assert.rejects(D.kondisi({ key: key2, id_instalasi: randomUUID(), versi: "1" }), galat("tidak_ditemukan"));
});

console.log("== webhook lisensi ==");
await cek("ubah fitur -> lisensi baru langsung sampai ke mesin (tanpa polling), instalasi tercatat sukses", async () => {
  mesin.versi = 0;
  mesin.lisensi = [];
  await D.ubahAplikasi(DV, appId, { fitur: ["nomor", "ai"], biaya: "ikut_umum", harga_bulan: null, batas: { nomor: 5 } });
  await D.putaranKirim();
  assert.equal(mesin.lisensi.length, 1);
  assert.deepEqual(mesin.lisensi[0].fitur, ["nomor", "ai"]);
  const [i] = await D.daftarInstalasi(appId);
  assert.equal(i.versi_mesin, "1.0.0-uji");
  assert.equal(i.jumlah_nomor, 3);
  assert.equal(i.gagal_sejak, null);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM api_kirim_lisensi`;
  assert.equal(n, 0);
});

await cek("mesin mati: dicoba ulang dengan jeda bertambah, galat tercatat; satu baris antrean per instalasi", async () => {
  mesin.tolak = true;
  await D.ubahStatus(DV, appId, "tangguhkan", "Laporan spam");
  await D.putaranKirim();
  let [r] = await sql`SELECT coba, berikut_pada, galat FROM api_kirim_lisensi`;
  assert.equal(r.coba, 1);
  assert.ok(r.berikut_pada >= sekarang() + 9);
  assert.match(r.galat, /HTTP 503/);
  await D.jadwalkanAplikasi(appId); // perubahan lain: tetap satu baris, dikirim segera
  [r] = await sql`SELECT COUNT(*)::int AS n FROM api_kirim_lisensi`;
  assert.equal(r.n, 1);
  mesin.tolak = false;
  await D.putaranKirim();
  assert.equal(mesin.lisensi.at(-1).status, "ditangguhkan");
});

await cek("jawaban lambat (> batas waktu) dianggap gagal, tidak menggantung putaran", async () => {
  mesin.lambat = true;
  await D.jadwalkanAplikasi(appId);
  const t0 = performance.now();
  await D.putaranKirim();
  const ms = performance.now() - t0;
  mesin.lambat = false;
  assert.ok(ms < 2000, `${ms} ms`);
  const [r] = await sql`SELECT galat FROM api_kirim_lisensi`;
  assert.match(r.galat, /batas waktu/);
  await sql`UPDATE api_kirim_lisensi SET berikut_pada = 0`;
  await D.putaranKirim();
});

await cek("perpanjangan: putaran jam menjadwalkan instalasi yang terakhir sukses > 3 hari lalu", async () => {
  await sql`UPDATE api_instalasi SET terakhir_sukses = ${sekarang() - 4 * 86400}`;
  const sebelum = mesin.lisensi.length;
  await D.putaranJam();
  assert.equal(mesin.lisensi.length, sebelum + 1);
});

console.log("== status & penagihan ==");
await cek("aktifkan lagi lalu jadikan berbayar: belum bayar -> status lisensi belum_bayar; dibayar 30 hari -> aktif", async () => {
  await D.ubahStatus(DV, appId, "aktifkan");
  await D.ubahAplikasi(A, appId, { fitur: ["nomor", "ai"], biaya: "berbayar", harga_bulan: 75000, batas: {} });
  await D.putaranKirim();
  assert.equal(mesin.lisensi.at(-1).status, "belum_bayar");
  await sql.begin((tx) => D.perpanjangDibayar(tx, appId));
  await D.setelahDibayar(appId);
  await D.putaranKirim();
  const l = mesin.lisensi.at(-1);
  assert.equal(l.status, "aktif");
  assert.equal(l.biaya, "berbayar");
  assert.ok(l.dibayar_sampai > sekarang() + 29 * 86400);
});

await cek("pengingat bayar H-3 / H-1 / habis dikirim sekali per tahap", async () => {
  const kini = sekarang();
  await sql`UPDATE api_aplikasi SET dibayar_sampai = ${kini + 2 * 86400} WHERE id = ${appId}`;
  await D.putaranJam(kini);
  await D.putaranJam(kini);
  await sql`UPDATE api_aplikasi SET dibayar_sampai = ${kini - 60} WHERE id = ${appId}`;
  await D.putaranJam(kini);
  const n = await sql`SELECT judul FROM notifikasi WHERE user_id = ${budi.id} AND judul LIKE '%Masa bayar%' ORDER BY id`;
  assert.deepEqual(n.map((x) => x.judul), ['Masa bayar "KasirKu" berakhir dalam 3 hari', 'Masa bayar "KasirKu" habis']);
  assert.equal(mesin.lisensi.at(-1).status, "belum_bayar");
});

await cek("cabut: final, semua key dicabut, aktivasi berikutnya ditolak, lisensi 'dicabut' dikirim", async () => {
  await assert.rejects(D.ubahStatus(DV, appId, "cabut"), galat("isian_tidak_sah")); // alasan wajib
  await D.ubahStatus(DV, appId, "cabut", "Melanggar syarat");
  await D.putaranKirim();
  assert.equal(mesin.lisensi.at(-1).status, "dicabut");
  assert.deepEqual(mesin.lisensi.at(-1).kunci, []);
  await assert.rejects(D.aktivasi({ key: key2, id_instalasi: idMesin, alamat: ALAMAT, versi: "1" }), galat("key_tidak_sah"));
  await assert.rejects(D.ubahStatus(DV, appId, "aktifkan"), galat("isian_tidak_sah"));
});

console.log("== rencana query & kecepatan ==");
await cek("antrean, daftar, dan antrean kirim memakai indeks pada 20 rb aplikasi / 20 rb instalasi", async () => {
  const kini = sekarang();
  await sql`
    INSERT INTO api_aplikasi (user_id, nama, kegunaan, pemilik, kontak_wa, status, created_at)
    SELECT ${budi.id}, 'App ' || g, 'kegunaan uji yang cukup panjang', 'P', '628123', CASE WHEN g % 10 = 0 THEN 'menunggu' ELSE 'disetujui' END, ${kini} - g
      FROM generate_series(1, 20000) g`;
  await sql`
    INSERT INTO api_instalasi (id, aplikasi_id, alamat, dibuat, terakhir_sukses)
    SELECT gen_random_uuid(), a.id, 'https://x.test', ${kini}, ${kini} FROM api_aplikasi a WHERE a.status = 'disetujui' LIMIT 20000`;
  await sql`INSERT INTO api_kirim_lisensi (instalasi_id, berikut_pada) SELECT id, ${kini + 3600} FROM api_instalasi LIMIT 15000`;
  await sql`ANALYZE`;
  const rencana = async (q) => (await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS) ${q}`)).map((r) => r["QUERY PLAN"]).join("\n");
  const r1 = await rencana(`SELECT id FROM api_aplikasi WHERE status = 'menunggu' ORDER BY id ASC LIMIT 26`);
  const r2 = await rencana(`SELECT instalasi_id FROM api_kirim_lisensi WHERE berikut_pada <= ${kini} ORDER BY berikut_pada LIMIT 50`);
  const r3 = await rencana(`SELECT COUNT(*) FROM api_aplikasi WHERE status = 'menunggu'`);
  for (const r of [r1, r2]) assert.doesNotMatch(r, /Seq Scan on api_(aplikasi|kirim_lisensi)/, r);
  const waktu = (r) => Number(/Execution Time: ([\d.]+)/.exec(r)[1]);
  console.log(`      antrean pengajuan: ${waktu(r1)} ms · ambil antrean kirim: ${waktu(r2)} ms · hitung menunggu: ${waktu(r3)} ms`);
  const t0 = performance.now();
  await D.daftarAplikasi({ filter: "aktif" });
  await D.hitungAplikasi();
  console.log(`      daftarAplikasi + hitungAplikasi (20 rb): ${(performance.now() - t0).toFixed(1)} ms`);
});

await cek("verifikasi lisensi & cek key di mesin: < 1 ms per panggilan", async () => {
  const isi = { v: 1, versi_urut: 1, aplikasi_id: 1, nama_aplikasi: "x", id_instalasi: idMesin, status: "aktif", fitur: [], batas: {}, biaya: "gratis", dibayar_sampai: null, kunci: [{ awalan: key2.slice(8, 16), hash: L.hashRahasia(key2.slice(17)), sampai: null }], diterbitkan: 0, berlaku_sampai: 9e9 };
  const token = L.tandatanganiLisensi(isi, process.env.LISENSI_KUNCI_PRIVAT);
  let t0 = performance.now();
  for (let i = 0; i < 1000; i++) L.kunciCocok(key2, isi.kunci);
  const msKunci = (performance.now() - t0) / 1000;
  t0 = performance.now();
  for (let i = 0; i < 200; i++) L.verifikasiLisensi(token);
  const msVerif = (performance.now() - t0) / 200;
  console.log(`      kunciCocok: ${(msKunci * 1000).toFixed(1)} µs · verifikasiLisensi: ${(msVerif * 1000).toFixed(1)} µs`);
  assert.ok(msKunci < 1 && msVerif < 1);
});

await cek("akses portal: bawaan kosong (admin pun tidak), developer menyalakan/mematikan per akun, cari langsung", async () => {
  const Dv = { id: dev.id, email: "dev@uji.test", nama: "Dev", peran: "developer" };
  await sql`UPDATE users SET akses_api = false`;
  let h = await D.cariAkunAkses({ hanyaAkses: true });
  assert.deepEqual(h, { daftar: [], jumlahAkses: 0 });
  assert.equal(await D.aturAksesApi(Dv, budi.id, true), "budi@uji.test");
  assert.equal(await D.aturAksesApi(Dv, budi.id, true), "budi@uji.test"); // idempoten, tidak dobel log
  h = await D.cariAkunAkses();
  assert.equal(h.jumlahAkses, 1);
  assert.equal(h.daftar[0].email, "budi@uji.test", "yang punya akses di atas");
  assert.deepEqual((await D.cariAkunAkses({ cari: "BUD" })).daftar.map((u) => u.email), ["budi@uji.test"]);
  assert.deepEqual((await D.cariAkunAkses({ cari: "%" })).daftar, [], "wildcard LIKE di-escape");
  assert.deepEqual((await D.cariAkunAkses({ cari: "admin", hanyaAkses: true })).daftar, []);
  await assert.rejects(D.aturAksesApi(Dv, 999999, true), galat("isian_tidak_sah"));
  await D.aturAksesApi(Dv, budi.id, false);
  assert.equal((await D.cariAkunAkses()).jumlahAkses, 0);
  const log = await sql`SELECT aksi FROM admin_log WHERE aksi LIKE 'developer_api.%akses' ORDER BY id`;
  assert.deepEqual(log.map((r) => r.aksi), ["developer_api.beri_akses", "developer_api.cabut_akses"]);
  // Kecepatan pada 20 rb akun: cari langsung & daftar awal.
  await sql`INSERT INTO users (email, password_hash, peran, nama, created_at) SELECT 'u' || g || '@banyak.test', 'x', 'user', 'Pengguna ' || g, 0 FROM generate_series(1, 20000) g`;
  await sql`UPDATE users SET akses_api = true WHERE email IN ('u5@banyak.test', 'u777@banyak.test')`;
  await sql`ANALYZE users`;
  const ukur = async (o) => {
    await D.cariAkunAkses(o);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) await D.cariAkunAkses(o);
    return ((performance.now() - t0) / 20).toFixed(2);
  };
  console.log(`      cariAkunAkses (20 rb akun): awal ${await ukur({})} ms · "pengguna 1999" ${await ukur({ cari: "pengguna 1999" })} ms · "zzz" ${await ukur({ cari: "zzz" })} ms · punya akses ${await ukur({ hanyaAkses: true })} ms`);
  await sql`DELETE FROM users WHERE email LIKE '%@banyak.test'`;
});

console.log("== rolling release ==");
await cek("aturan versi: semver dibanding per angka, tag non-semver diabaikan, 'dev' tidak pernah diblokir; lisensi membawa info rilis", async () => {
  const R = await lib("src/lib/rilis-def.ts");
  assert.equal(R.bandingVersi("1.0.9", "1.0.10"), -1);
  assert.equal(R.bandingVersi("1.2.0", "1.10.0"), -1);
  assert.equal(R.bandingVersi("v1.0.3", "1.0.3"), 0);
  assert.equal(R.bandingVersi("dev", "1.0.3"), null);
  assert.equal(R.versiTertinggi(["stable", "1.0", "1.0.2", "1.0.10", "1.0.9", "uji-abc"]), "1.0.10");
  const kini = sekarang();
  const r = { terbaru: "1.0.3", minimal: "1.0.2", wajib_sampai: kini - 1, catatan: null };
  assert.equal(R.statusUpdate("1.0.1", r, kini).terblokir, true);
  assert.equal(R.statusUpdate("1.0.2", r, kini).terblokir, false);
  assert.equal(R.statusUpdate("1.0.2", r, kini).tersedia, true);
  assert.equal(R.statusUpdate("dev", r, kini).terblokir, false);
  assert.equal(R.statusUpdate("1.0.1", { ...r, wajib_sampai: null }, kini).terblokir, false); // wajib tanpa tenggat = peringatan saja
  // Pusat menumpangkan info rilis (uji: tanpa GHCR, dari env) ke lisensi yang diterbitkan.
  process.env.MESIN_RILIS_TERBARU = "1.0.7";
  process.env.MESIN_VERSI_MINIMAL = "1.0.5";
  process.env.MESIN_WAJIB_SAMPAI = "2030-01-31";
  try {
    const RM = await lib("src/lib/rilis-mesin.ts");
    const info = await RM.infoRilis();
    assert.deepEqual(info, { terbaru: "1.0.7", minimal: "1.0.5", wajib_sampai: Math.floor(Date.parse("2030-01-31T23:59:59+07:00") / 1000), catatan: null });
  } finally {
    delete process.env.MESIN_RILIS_TERBARU;
    delete process.env.MESIN_VERSI_MINIMAL;
    delete process.env.MESIN_WAJIB_SAMPAI;
  }
});

console.log("== katalog fitur ==");
await cek("katalog: kode unik & tiap fitur punya grup + endpoint terdokumentasi", async () => {
  const def = await lib("src/lib/api-def.ts");
  const dok = await lib("src/lib/api-dok.ts");
  assert.equal(new Set(def.KODE_FITUR).size, def.KODE_FITUR.length);
  assert.ok(def.KODE_FITUR.length >= 15, `katalog baru ${def.KODE_FITUR.length} fitur`);
  for (const f of def.FITUR_API) {
    assert.ok(def.GRUP_FITUR.some((g) => g.kode === f.grup), `grup ${f.grup} tidak dikenal`);
    if (!def.FITUR_TANPA_ENDPOINT.includes(f.kode)) assert.ok(dok.ENDPOINT_DOK.some((e) => e.fitur === f.kode), `fitur ${f.kode} belum punya endpoint di api-dok`);
  }
  assert.equal(def.fiturPerGrup().flatMap((g) => g.fitur).length, def.KODE_FITUR.length);
  assert.deepEqual(def.fiturPerGrup(["katalog"]).map((g) => g.kode), ["data"]);
});

await cek("fitur dibagikan: hanya yang dicentang bisa diajukan & dibuka; pemakaian dihitung agregat (20 rb aplikasi)", async () => {
  const [c] = await sql`INSERT INTO users (email, password_hash, peran, nama, created_at, akses_api) VALUES ('citra@uji.test', 'x', 'user', 'Citra', 0, true) RETURNING id`;
  const C = { id: c.id, email: "citra@uji.test", nama: "Citra", peran: "user" };
  const hasil = await D.simpanFiturGlobal(DV, ["nomor", "katalog", "tidak-ada", "ai"]);
  assert.deepEqual(hasil, ["nomor", "ai", "katalog"]); // urut katalog, kode asing dibuang
  assert.deepEqual((await D.pengaturanApi()).fitur, ["nomor", "ai", "katalog"]);
  await assert.rejects(D.ajukan(C, isian({ fitur: ["statistik", "profil"] })), galat("isian_tidak_sah")); // tidak ada yang dibagikan
  const id = await D.ajukan(C, isian({ fitur: ["katalog", "statistik", "nomor"] }));
  const [a] = await sql`SELECT fitur_diminta FROM api_aplikasi WHERE id = ${id}`;
  assert.deepEqual(a.fitur_diminta, ["nomor", "katalog"]);
  // Simpan biaya tanpa `fitur` tidak menyentuh katalog.
  await D.simpanPengaturanApi(DV, { biaya: "gratis", harga: 0 });
  assert.deepEqual((await D.pengaturanApi()).fitur, ["nomor", "ai", "katalog"]);
  await sql`UPDATE api_aplikasi SET fitur = CASE WHEN id % 3 = 0 THEN '{nomor,ai,katalog}'::text[] ELSE '{nomor}'::text[] END WHERE nama LIKE 'App %'`;
  await sql`ANALYZE api_aplikasi`;
  const t0 = performance.now();
  const pakai = await D.pemakaianFitur();
  const ms = performance.now() - t0;
  const [n] = await sql`SELECT COUNT(*)::int AS n FROM api_aplikasi WHERE nama LIKE 'App %' AND status IN ('disetujui','ditangguhkan')`;
  assert.ok(pakai.nomor >= n.n && pakai.katalog > 0 && !pakai.statistik);
  console.log(`      pemakaianFitur (20 rb aplikasi): ${ms.toFixed(1)} ms`);
  await D.simpanFiturGlobal(DV, (await lib("src/lib/api-def.ts")).KODE_FITUR);
});

server.close();
await sql.end();
await pg.berhenti();
console.log(`\n${lolos} uji lolos.`);
process.exit(0);

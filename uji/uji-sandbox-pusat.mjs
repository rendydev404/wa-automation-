// Uji mode sandbox Developer API di server pusat: key cg_test_ (1 per akun, tanpa peninjauan), aktivasi tanpa alamat
// publik & tantangan, lisensi v2 (mode sandbox, 1 nomor, berlaku = masa sandbox), nomor penguji tunggal lewat kode,
// sakelar umum, port dashboard, kedaluwarsa & perpanjang, pemisahan dari aplikasi production, dan rencana query.
// PostgreSQL 15 sungguhan (uji/pg-lokal.mjs). Rencana: docs/plans/2026-11-10-sandbox-developer-api.md.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-sandbox-pusat.mjs
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-sandbox-pusat");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
Object.assign(process.env, {
  DATABASE_URL: pg.url,
  DATA_DIR: path.join(tmp, "data"),
  AUTH_SECRET: "x".repeat(40),
  LISENSI_KUNCI_PRIVAT: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  LISENSI_MODE_UJI: "1",
  LISENSI_KUNCI_PUBLIK: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  LISENSI_IZINKAN_HTTP: "1",
});
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, sekarang, setSetting } = await lib("src/lib/db.ts");
const P = await lib("src/lib/pengguna.ts");
const D = await lib("src/lib/developer-api.ts");
const L = await lib("src/lib/lisensi-def.ts");
const API = await lib("src/lib/api-def.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};
const galat = (kode) => (e) => {
  if (e?.kode !== kode) throw new Error(`diharapkan galat ${kode}, dapat ${e?.kode ?? e}: ${e?.message}`);
  return true;
};
const ms = async (fn, n = 20) => {
  await fn();
  const t = performance.now();
  for (let i = 0; i < n; i++) await fn();
  return (performance.now() - t) / n;
};

const dev = await P.buatAkun({ email: "dev@uji.test", nama: "Dev", password: "rahasia-dev-0001", peran: "developer" });
const budi = await P.buatAkun({ email: "budi@uji.test", nama: "Budi", password: "rahasia-budi-01" });
const sari = await P.buatAkun({ email: "sari@uji.test", nama: "Sari", password: "rahasia-sari-01" });
const DV = { id: dev.id, email: "dev@uji.test", nama: "Dev", peran: "developer" };
const B = { id: budi.id, email: "budi@uji.test", nama: "Budi", peran: "user" };
const S = { id: sari.id, email: "sari@uji.test", nama: "Sari", peran: "user" };

console.log("== key sandbox ==");
let sb;
let keyB;
await cek("buat sandbox: key cg_test_ tampil sekali, langsung aktif tanpa peninjauan, berlaku 30 hari", async () => {
  const r = await D.buatSandbox(B);
  assert.equal(r.baru, true);
  assert.match(r.key, /^cg_test_[0-9A-Za-z]{8}_[0-9A-Za-z]{32}$/);
  keyB = r.key;
  sb = await D.sandboxMilik(budi.id);
  assert.equal(sb.mode, "sandbox");
  assert.equal(sb.status, "disetujui");
  assert.ok(Math.abs(sb.sandbox_sampai - (sekarang() + 30 * 86400)) < 5);
  const [k] = await sql`SELECT hash FROM api_kunci WHERE aplikasi_id = ${sb.id}`;
  assert.notEqual(k.hash, keyB); // hanya hash yang disimpan
  assert.equal(L.uraiKunciApi(keyB).mode, "sandbox");
});

await cek("sandbox terpisah dari production: tidak masuk antrean, hitungan, daftar aplikasi, atau notifikasi tinjau", async () => {
  assert.equal((await D.aplikasiMilik(budi.id)).length, 0);
  assert.equal(await D.jumlahMenunggu(), 0);
  const h = await D.hitungAplikasi();
  assert.equal(h.semua, 0);
  assert.equal((await D.daftarAplikasi({ filter: "semua" })).daftar.length, 0);
  const [n] = await sql`SELECT COUNT(*)::int AS n FROM notifikasi WHERE jenis = 'admin_developer_api'`;
  assert.equal(n.n, 0);
  // Tindakan tinjau production tidak berlaku untuk sandbox.
  await assert.rejects(D.setujui(DV, sb.id, { fitur: ["nomor"], biaya: "gratis", harga_bulan: null, batas: {} }), galat("tidak_ditemukan"));
});

await cek("maks 1 sandbox per akun: klik lagi = ganti key (lama langsung mati, tanpa rotasi 24 jam)", async () => {
  const r = await D.buatSandbox(B);
  assert.equal(r.baru, false);
  assert.equal(r.id, sb.id);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM api_aplikasi WHERE user_id = ${budi.id} AND mode = 'sandbox'`;
  assert.equal(n, 1);
  await assert.rejects(D.aktivasi({ key: keyB, id_instalasi: randomUUID(), alamat: "", versi: "1.0.0" }), galat("key_tidak_sah"));
  keyB = r.key;
  // Unique index menjaga juga dari dua permintaan serentak.
  const hasil = await Promise.allSettled([D.buatSandbox(S), D.buatSandbox(S)]);
  assert.ok(hasil.every((x) => x.status === "fulfilled"));
  const [{ m }] = await sql`SELECT COUNT(*)::int AS m FROM api_aplikasi WHERE user_id = ${sari.id} AND mode = 'sandbox'`;
  assert.equal(m, 1);
});

console.log("== aktivasi & lisensi v2 ==");
let idA;
let isiA;
await cek("aktivasi sandbox tanpa alamat publik & tanpa tantangan -> lisensi v2: mode sandbox, 1 nomor, tanpa limit AI, berlaku = masa sandbox", async () => {
  idA = randomUUID();
  const t = await D.aktivasi({ key: keyB, id_instalasi: idA, alamat: "", versi: "1.0.0" });
  isiA = L.verifikasiLisensi(t);
  assert.equal(isiA.v, 2);
  assert.equal(isiA.mode, "sandbox");
  assert.equal(isiA.uji, null);
  assert.equal(isiA.batas.nomor, 1);
  assert.equal(isiA.batas.instalasi, 1);
  assert.equal(isiA.batas.ai_hari, undefined); // tanpa limit AI
  assert.equal(isiA.biaya, "gratis");
  assert.equal(isiA.berlaku_sampai, (await D.sandboxMilik(budi.id)).sandbox_sampai);
  assert.deepEqual(isiA.fitur, (await D.pengaturanApi()).fitur); // semua fitur yang dibagikan
  assert.ok(L.kunciCocok(keyB, isiA.kunci, undefined, "sandbox"));
  assert.ok(!L.kunciCocok(keyB, isiA.kunci, undefined, "produksi"));
  const [i] = await sql`SELECT alamat FROM api_instalasi WHERE id = ${idA}::uuid`;
  assert.equal(i.alamat, null);
});

await cek("laporan nomor bot dari mesin tersimpan di instalasi (tampil di portal); nilai tak sah diabaikan", async () => {
  await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1.0.0", nomor_bot: "628999000999" });
  assert.equal((await D.daftarInstalasi(sb.id))[0].nomor_bot, "628999000999");
  await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1.0.0" }); // tanpa laporan = nilai lama tetap
  assert.equal((await D.daftarInstalasi(sb.id))[0].nomor_bot, "628999000999");
  await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1.0.0", nomor_bot: null }); // nomor dilepas
  assert.equal((await D.daftarInstalasi(sb.id))[0].nomor_bot, null);
});

await cek("mesin versi lama (hanya menerima v1) menolak token sandbox: isinya v2, bukan v1", async () => {
  const [kepala] = (await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1.0.0" })).split(".");
  const isi = JSON.parse(Buffer.from(kepala, "base64url").toString());
  assert.equal(isi.v, 2);
  // Token v2 tanpa mode sandbox ditolak verifikasi (tidak bisa dipakai menyelundupkan format baru).
  const palsu = L.tandatanganiLisensi({ ...isi, mode: undefined }, process.env.LISENSI_KUNCI_PRIVAT);
  assert.equal(L.verifikasiLisensi(palsu), null);
});

await cek("awalan key harus sesuai jenisnya: bagian rahasia sandbox dengan awalan cg_live_ ditolak", async () => {
  const tukar = keyB.replace("cg_test_", "cg_live_");
  await assert.rejects(D.kondisi({ key: tukar, id_instalasi: idA, versi: "1.0.0" }), galat("key_tidak_sah"));
});

await cek("sandbox tanpa webhook lisensi: tidak pernah masuk antrean kirim (perubahan, putaran jam, semua)", async () => {
  await D.jadwalkanAplikasi(sb.id);
  await D.putaranJam();
  await D.simpanPengaturanApi(DV, { biaya: "gratis", harga: 0 });
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM api_kirim_lisensi`;
  assert.equal(n, 0);
});

await cek("1 instalasi: mesin sandbox baru melepas yang lama otomatis (pindah laptop -> server uji)", async () => {
  const idB = randomUUID();
  await D.aktivasi({ key: keyB, id_instalasi: idB, alamat: "", versi: "1.0.1" });
  const baris = await sql`SELECT id::text, dilepas_pada FROM api_instalasi WHERE aplikasi_id = ${sb.id} ORDER BY dibuat`;
  assert.equal(baris.filter((x) => !x.dilepas_pada).length, 1);
  assert.equal(baris.find((x) => !x.dilepas_pada).id, idB);
  await assert.rejects(D.kondisi({ key: keyB, id_instalasi: idA, versi: "1.0.0" }), galat("tidak_ditemukan"));
  idA = idB;
});

console.log("== nomor penguji ==");
const uji = (kode, o = {}) => D.verifikasiNomorUji({ key: keyB, id_instalasi: idA, kode, telepon: "628111222333", alamat: "628111222333@s.whatsapp.net", versi: "1.0.1", ...o });
await cek("kode 6 angka berlaku 10 menit (hanya hash disimpan); kode benar -> lisensi baru berisi nomor penguji", async () => {
  const { kode, sampai } = await D.mulaiNomorUji(B);
  assert.match(kode, /^\d{6}$/);
  assert.ok(Math.abs(sampai - (sekarang() + 600)) < 3);
  const [r] = await sql`SELECT uji_kode_hash FROM api_aplikasi WHERE id = ${sb.id}`;
  assert.notEqual(r.uji_kode_hash, kode);
  const isi = L.verifikasiLisensi(await uji(kode));
  assert.deepEqual(isi.uji, { telepon: "628111222333", alamat: "628111222333@s.whatsapp.net" });
  assert.ok(isi.versi_urut > isiA.versi_urut);
  await assert.rejects(uji(kode), galat("isian_tidak_sah")); // sekali pakai
});

await cek("kode salah dihitung; 5 kali salah = kode hangus walau yang benar dikirim; kode habis waktu ditolak", async () => {
  const { kode } = await D.mulaiNomorUji(B);
  const salah = kode === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await assert.rejects(uji(salah), galat("isian_tidak_sah"));
  await assert.rejects(uji(kode), galat("isian_tidak_sah"));
  const k2 = await D.mulaiNomorUji(B);
  await sql`UPDATE api_aplikasi SET uji_kode_sampai = ${sekarang() - 1} WHERE id = ${sb.id}`;
  await assert.rejects(uji(k2.kode), galat("isian_tidak_sah"));
  await assert.rejects(uji("12"), galat("isian_tidak_sah"));
  await assert.rejects(uji("123456", { telepon: "abc", alamat: "x" }), galat("isian_tidak_sah"));
});

await cek("ganti nomor penguji = kode baru dari HP lain; nomor lama langsung digantikan (tidak pernah dua); LID tanpa telepon diterima", async () => {
  const { kode } = await D.mulaiNomorUji(B);
  const isi = L.verifikasiLisensi(await uji(kode, { telepon: null, alamat: "123456789012345@lid" }));
  assert.deepEqual(isi.uji, { telepon: null, alamat: "123456789012345@lid" });
  const a = await D.sandboxMilik(budi.id);
  assert.equal(a.uji_telepon, null);
  assert.equal(a.uji_alamat, "123456789012345@lid");
  const k2 = await D.mulaiNomorUji(B);
  await uji(k2.kode);
  assert.equal((await D.sandboxMilik(budi.id)).uji_telepon, "628111222333");
});

await cek("nomor penguji hanya untuk instalasi sandbox milik key itu", async () => {
  const { kode } = await D.mulaiNomorUji(B);
  await assert.rejects(uji(kode, { id_instalasi: randomUUID() }), galat("tidak_ditemukan"));
});

console.log("== pengaturan, masa berlaku, status ==");
await cek("sakelar umum mati: tidak bisa buat/perpanjang, aktivasi ditolak, lisensi yang diterbitkan berstatus ditangguhkan", async () => {
  assert.equal((await D.pengaturanSandbox()).port, 1975); // bawaan
  await D.simpanPengaturanSandbox(DV, { aktif: false, hari: 30, port: 1975 });
  await assert.rejects(D.buatSandbox(B), galat("sandbox_nonaktif"));
  await assert.rejects(D.perpanjangSandbox(B), galat("sandbox_nonaktif"));
  await assert.rejects(D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" }), galat("sandbox_nonaktif"));
  await D.simpanPengaturanSandbox(DV, { aktif: true, hari: 14, port: 4321 });
  const u = await D.pengaturanSandbox();
  assert.deepEqual(u, { aktif: true, hari: 14, port: 4321 });
  await assert.rejects(D.simpanPengaturanSandbox(DV, { aktif: true, hari: 0, port: 1975 }), galat("isian_tidak_sah"));
  await assert.rejects(D.simpanPengaturanSandbox(DV, { aktif: true, hari: 30, port: 80 }), galat("isian_tidak_sah"));
  const { envMesin } = await lib("src/lib/templat-mesin.ts");
  assert.match(envMesin({ namaAplikasi: "Sandbox", alamat: null, sandbox: true, port: 4321 }), /^PORT_MESIN=4321$/m);
  assert.doesNotMatch(envMesin({ namaAplikasi: "X", alamat: null }), /^PORT_MESIN=/m);
});

await cek("kedaluwarsa -> sandbox_kedaluwarsa; perpanjang -> kini + masa umum (14 hari) dan berlaku lagi", async () => {
  await sql`UPDATE api_aplikasi SET sandbox_sampai = ${sekarang() - 10} WHERE id = ${sb.id}`;
  await assert.rejects(D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" }), galat("sandbox_kedaluwarsa"));
  const sampai = await D.perpanjangSandbox(B);
  assert.ok(Math.abs(sampai - (sekarang() + 14 * 86400)) < 5);
  const isi = L.verifikasiLisensi(await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" }));
  assert.equal(isi.berlaku_sampai, sampai);
});

await cek("developer internal bisa perpanjang sandbox satu akun", async () => {
  await sql`UPDATE api_aplikasi SET sandbox_sampai = ${sekarang() + 60} WHERE id = ${sb.id}`;
  await D.ubahSandbox(DV, sb.id, { perpanjang: true });
  assert.ok((await D.sandboxMilik(budi.id)).sandbox_sampai > sekarang() + 13 * 86400);
  const [log] = await sql`SELECT COUNT(*)::int AS n FROM admin_log WHERE aksi = 'ubah sandbox API'`;
  assert.equal(log.n, 1);
});

await cek("fitur per pengguna: sandbox diatur khusus hanya mendapat fitur pilihannya (tetap dibatasi global); kembali ikut global", async () => {
  const fiturLisensi = async () => L.verifikasiLisensi(await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" })).fitur;
  const global = (await D.pengaturanApi()).fitur;
  assert.ok(global.includes("nomor") && global.includes("spam"));
  assert.equal(L.verifikasiLisensi(await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" })).fitur_v, 3);
  assert.deepEqual(await fiturLisensi(), global);
  await D.ubahSandbox(DV, sb.id, { fitur: ["nomor", "spam", "tidak-ada"] });
  assert.deepEqual(await fiturLisensi(), ["nomor", "spam"]);
  // Fitur yang tidak dibagikan global tetap tertutup walau dicentang khusus.
  await D.simpanFiturGlobal(DV, global.filter((f) => f !== "spam"));
  assert.deepEqual(await fiturLisensi(), ["nomor"]);
  await D.simpanFiturGlobal(DV, global);
  await D.ubahSandbox(DV, sb.id, { fitur: null });
  assert.deepEqual(await fiturLisensi(), global);
  const log = await sql`SELECT detail FROM admin_log WHERE aksi = 'ubah fitur sandbox API' ORDER BY id`;
  assert.deepEqual(log.map((r) => r.detail), ["nomor, spam", "ikut daftar global"]);
});

await cek("fitur per pengguna (tab Fitur): daftar khusus akun menggantikan global (boleh di luar global), sandbox khusus dibatasi daftar akun, kembali ikut global", async () => {
  const fiturLisensi = async () => L.verifikasiLisensi(await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" })).fitur;
  const { KODE_FITUR } = await lib("src/lib/api-def.ts");
  const urut = (x) => KODE_FITUR.filter((k) => x.includes(k));
  const global = (await D.pengaturanApi()).fitur;
  await D.simpanFiturGlobal(DV, global.filter((f) => f !== "percakapan"));
  const g2 = (await D.pengaturanApi()).fitur;
  assert.ok(!g2.includes("percakapan"));
  assert.deepEqual(await D.fiturUntuk(budi.id), { fitur: g2, khusus: false });
  const r = await D.simpanFiturPengguna(DV, budi.id, ["percakapan", "nomor", "tidak-ada"]);
  assert.deepEqual(r.fitur, urut(["nomor", "percakapan"]));
  assert.deepEqual(await D.fiturUntuk(budi.id), { fitur: urut(["nomor", "percakapan"]), khusus: true });
  // Fitur di luar global terbuka untuk akun ini, fitur global lain tertutup.
  assert.deepEqual(await fiturLisensi(), urut(["nomor", "percakapan"]));
  // Sandbox yang diatur khusus dibatasi daftar akun (spam tidak ada di daftar akun).
  await D.ubahSandbox(DV, sb.id, { fitur: ["percakapan", "spam"] });
  assert.deepEqual(await fiturLisensi(), ["percakapan"]);
  await D.ubahSandbox(DV, sb.id, { fitur: null });
  const k = await D.daftarFiturKhusus();
  assert.equal(k.jumlah, 1);
  assert.deepEqual(k.daftar.map((x) => [x.id, x.fitur.length]), [[budi.id, 2]]);
  const cari = await D.cariAkunAkses({ cari: "budi@uji" });
  assert.equal(cari.daftar.find((x) => x.id === budi.id).fitur_khusus, 2);
  // Daftar kosong = akun ini tidak mendapat fitur apa pun (beda dengan null = ikut global).
  await D.simpanFiturPengguna(DV, budi.id, []);
  assert.deepEqual(await fiturLisensi(), []);
  await D.simpanFiturPengguna(DV, budi.id, null);
  assert.deepEqual(await fiturLisensi(), g2);
  assert.equal((await D.cariAkunAkses({ cari: "budi@uji" })).daftar.find((x) => x.id === budi.id).fitur_khusus, null);
  await assert.rejects(D.simpanFiturPengguna(DV, 99_999_999, []), galat("isian_tidak_sah"));
  const log = await sql`SELECT detail FROM admin_log WHERE aksi = 'ubah fitur Developer API pengguna' ORDER BY id`;
  assert.equal(log.length, 3);
  assert.equal(log.at(-1).detail, "ikut daftar global");
  await D.simpanFiturGlobal(DV, global);
});

await cek("daftar fitur global lama (sebelum bot dipecah): bot yang dibagikan = spam, belajar, ml ikut dibagikan", async () => {
  await sql`DELETE FROM settings WHERE kunci = 'api_fitur_pecah_bot_kenal'`;
  await sql`INSERT INTO settings (kunci, nilai) VALUES ('api_fitur_global', '["nomor","bot"]') ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai`;
  globalThis.__waPg?.setelan?.clear?.();
  const f = (await D.pengaturanApi()).fitur;
  assert.ok(["nomor", "bot", "spam", "belajar", "ml"].every((k) => f.includes(k)), f.join(","));
  await D.simpanFiturGlobal(DV, ["nomor", "bot"]);
  assert.deepEqual((await D.pengaturanApi()).fitur, ["nomor", "bot"]); // disimpan sesudah dipecah = apa adanya
});

await cek("tangguhkan / aktifkan / cabut sandbox oleh developer internal; dicabut = tidak bisa dibuat lagi", async () => {
  await D.ubahStatus(DV, sb.id, "tangguhkan", "uji penangguhan");
  assert.equal(L.verifikasiLisensi(await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" })).status, "ditangguhkan");
  await assert.rejects(D.mulaiNomorUji(B), galat("tidak_ditemukan"));
  await D.ubahStatus(DV, sb.id, "aktifkan");
  assert.equal(L.verifikasiLisensi(await D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" })).status, "aktif");
  const sid = (await D.sandboxMilik(sari.id)).id;
  await D.ubahStatus(DV, sid, "cabut", "uji pencabutan");
  await assert.rejects(D.buatSandbox(S), galat("aplikasi_dicabut"));
  const [nf] = await sql`SELECT tautan FROM notifikasi WHERE user_id = ${sari.id} ORDER BY id DESC LIMIT 1`;
  assert.equal(nf.tautan, "/developer#sandbox");
});

await cek("samarkan nomor untuk tampilan", async () => {
  assert.equal(API.samarkanNomor("6281234567890"), "62812****890");
  assert.equal("ai_hari" in API.BATAS_BAWAAN, false); // limit AI dihapus: resource & kunci AI milik developer
});

console.log("== skala & rencana query ==");
await cek("daftar sandbox, sandbox milik akun, verifikasi & aktivasi tetap cepat pada 20 rb sandbox", async () => {
  await sql`
    INSERT INTO users (email, nama, password_hash, peran, created_at)
    SELECT 'sb' || g || '@uji.test', 'Pengguna ' || g, 'x', 'user', ${sekarang()} FROM generate_series(1, 20000) g`;
  await sql`
    INSERT INTO api_aplikasi (user_id, mode, nama, kegunaan, pemilik, kontak_wa, status, biaya, batas, sandbox_sampai, created_at)
    SELECT id, 'sandbox', 'Sandbox', 'uji', nama, '', 'disetujui', 'gratis', '{}', ${sekarang() + 86400}, ${sekarang()} FROM users WHERE email LIKE 'sb%@uji.test'`;
  await sql`ANALYZE api_aplikasi`;
  await sql`ANALYZE users`;
  const tDaftar = await ms(() => D.daftarSandbox());
  const tCari = await ms(() => D.daftarSandbox({ cari: "sb19999" }));
  const tMilik = await ms(() => D.sandboxMilik(budi.id));
  const tKondisi = await ms(() => D.kondisi({ key: keyB, id_instalasi: idA, versi: "1" }));
  console.log(`      daftarSandbox: ${tDaftar.toFixed(2)} ms · cari: ${tCari.toFixed(2)} ms · sandboxMilik: ${tMilik.toFixed(2)} ms · kondisi (terbitkan + Ed25519): ${tKondisi.toFixed(2)} ms`);
  assert.ok(tDaftar < 30 && tMilik < 5 && tKondisi < 30);
  const rencana = (await sql`EXPLAIN SELECT a.id FROM api_aplikasi a WHERE a.mode = 'sandbox' ORDER BY a.id DESC LIMIT 51`).map((r) => r["QUERY PLAN"]).join("\n");
  assert.doesNotMatch(rencana, /Seq Scan/); // indeks parsial sandbox atau pkey mundur (bila hampir semua baris sandbox)
  const milik = (await sql`EXPLAIN SELECT id FROM api_aplikasi WHERE user_id = ${budi.id} AND mode = 'sandbox'`).map((r) => r["QUERY PLAN"]).join("\n");
  assert.match(milik, /api_aplikasi_sandbox_user_uniq|api_aplikasi_user_idx/);
  // Antrean production tetap memakai indeks parsialnya walau ada 20 rb baris sandbox.
  const antre = (await sql`EXPLAIN SELECT id FROM api_aplikasi WHERE status = 'menunggu' AND mode = 'produksi' ORDER BY id LIMIT 26`).map((r) => r["QUERY PLAN"]).join("\n");
  assert.doesNotMatch(antre, /Seq Scan/);
  console.log(`      rencana daftar: ${rencana.split("\n")[1]?.trim() ?? rencana}`);
});

console.log(`\n${lolos} uji sandbox pusat lolos.`);
await sql.end({ timeout: 2 });
await pg.berhenti();
process.exit(0);

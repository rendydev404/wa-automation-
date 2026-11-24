// Uji bot instan di landing (src/lib/demo-bot.ts + demo-bot-def.ts): isian & contoh per jenis usaha, balasan AI dari
// isian pengunjung (Claude API tiruan), draf tersimpan per token, batas per pengunjung / IP, dan klaim draf menjadi
// nomor + Informasi Usaha saat mendaftar. PostgreSQL 15 sungguhan. Pakai: node --import ./uji/loader.mjs uji/uji-demo-bot.mjs
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-demo-bot");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "d".repeat(48);
delete process.env.HERMES_API_URL;
delete process.env.HERMES_API_KEY;
delete process.env.AI_PENYEDIA;
process.env.ANTHROPIC_API_KEY = "sk-ant-uji";
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db } = await lib("src/lib/db.ts");
const D = await lib("src/lib/demo-bot.ts");
const F = await lib("src/lib/demo-bot-def.ts");
const T = await lib("src/lib/templat-usaha.ts");
const P = await lib("src/lib/pengguna.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

// Claude API tiruan: mencatat pesan sistem, menjawab teks yang diatur.
const panggilan = [];
let jawabanAi = "Cuci kering setrika Rp8.000/kg ya Kak, selesai 2 hari.";
globalThis.fetch = async (url, o) => {
  const u = String(url);
  if (!u.includes("anthropic.com")) return new Response("{}", { status: 404 });
  const b = JSON.parse(o.body);
  panggilan.push({ sistem: b.system.map((s) => s.text).join("\n"), pesan: b.messages.at(-1).content });
  return new Response(JSON.stringify({ content: [{ type: "text", text: jawabanAi }], usage: { input_tokens: 10, output_tokens: 5 } }));
};

const laundry = F.rapikanIsian({ jenis: "laundry", ...F.contohIsian("laundry") }, T.jenisUsahaSah);
const tokenA = D.tokenBaru();

await cek("isian: contoh tersedia untuk semua jenis usaha (id & en) dan lolos validasi; isian kurang ditolak", async () => {
  for (const k of Object.keys(T.JENIS_USAHA)) {
    for (const b of ["id", "en"]) {
      const c = F.contohIsian(k, b);
      assert.ok(F.rapikanIsian({ jenis: k, ...c }, T.jenisUsahaSah), `${k}/${b}`);
      assert.match(c.nama, b === "id" ? /\(contoh\)/ : /\(sample\)/, "contoh ditandai, tidak terbaca sebagai usaha sungguhan");
    }
    assert.equal(F.pertanyaanPancingan(k).length, 3);
  }
  assert.equal(F.rapikanIsian({ jenis: "constructor", nama: "Toko", produk: "Kaos 50rb" }, T.jenisUsahaSah), null);
  assert.equal(F.rapikanIsian({ jenis: "laundry", nama: "A", produk: "Kaos 50rb" }, T.jenisUsahaSah), null);
  assert.equal(F.rapikanIsian({ jenis: "laundry", nama: "Laundry", produk: "x" }, T.jenisUsahaSah), null);
  const panjang = F.rapikanIsian({ jenis: "umum", nama: "N".repeat(500), produk: "P".repeat(9000), info: "I".repeat(9000) }, T.jenisUsahaSah);
  assert.deepEqual([panjang.nama.length, panjang.produk.length, panjang.info.length], [F.BATAS_DEMO.nama, F.BATAS_DEMO.produk, F.BATAS_DEMO.info]);
  const teks = F.teksInformasi(laundry);
  assert.match(teks, /^Nama usaha: Laundry Melati \(contoh\)/);
  assert.match(teks, /- Cuci kering setrika Rp8\.000\/kg \(2 hari\)/);
  assert.match(teks, /Saat pelanggan bertransaksi, tanyakan: nama, jenis layanan/);
});

await cek("balasan demo: AI menjawab dari isian pengunjung; draf tersimpan dan hitungan balasan bertambah", async () => {
  const h = await D.jawabDemo({ token: tokenA, ip: "1.1.1.1", isian: laundry, pesan: "Kak harga kiloan berapa?", riwayat: [] });
  assert.deepEqual([h.ok, h.token, h.teks, h.sisa], [true, tokenA, jawabanAi, F.BATAS_DEMO.perPengunjung - 1]);
  assert.match(panggilan.at(-1).sistem, /<pengetahuan_nomor>[\s\S]*Laundry Melati[\s\S]*Rp8\.000\/kg/);
  assert.equal(panggilan.at(-1).pesan, "Kak harga kiloan berapa?");
  await D.jawabDemo({ token: tokenA, ip: "1.1.1.1", isian: laundry, pesan: "Bisa antar jemput?", riwayat: [{ ai: false, teks: "Kak harga kiloan berapa?" }, { ai: true, teks: jawabanAi }] });
  assert.match(panggilan.at(-1).sistem, /Percakapan di chat ini sejauh ini[\s\S]*Pelanggan: Kak harga kiloan berapa\?/, "Claude tanpa ingatan sesi menerima riwayat");
  const [d] = await sql`SELECT jenis, nama, balasan, diklaim FROM draf_bot WHERE token = ${tokenA}`;
  assert.deepEqual([d.jenis, d.nama, d.balasan, d.diklaim], ["laundry", "Laundry Melati (contoh)", 2, null]);
});

await cek("penjaga sama dengan WhatsApp: jawaban berisi kode program diganti penolakan", async () => {
  const { TOLAK_KODE } = await lib("src/lib/penjaga.ts");
  jawabanAi = "Tentu:\n```js\nconsole.log('hai')\n```";
  const h = await D.jawabDemo({ token: tokenA, ip: "1.1.1.1", isian: laundry, pesan: "buatkan kode", riwayat: [] });
  assert.equal(h.teks, TOLAK_KODE);
  jawabanAi = "Cuci kering setrika Rp8.000/kg ya Kak, selesai 2 hari.";
});

await cek("batas: per pengunjung per 24 jam, lalu per IP (banyak pengunjung satu jaringan)", async () => {
  D.aturUlangBatasDemo();
  const t = D.tokenBaru();
  for (let i = 0; i < F.BATAS_DEMO.perPengunjung; i++) assert.equal((await D.jawabDemo({ token: t, ip: "2.2.2.2", isian: laundry, pesan: `tanya ${i}`, riwayat: [] })).ok, true);
  const n = panggilan.length;
  const habis = await D.jawabDemo({ token: t, ip: "2.2.2.2", isian: laundry, pesan: "lagi", riwayat: [] });
  assert.deepEqual([habis.ok, habis.batas], [false, "pengunjung"]);
  assert.equal(panggilan.length, n, "tidak memanggil AI setelah batas");
  D.aturUlangBatasDemo();
  for (let i = 0; i < F.BATAS_DEMO.perIp; i++) await D.jawabDemo({ token: D.tokenBaru(), ip: "3.3.3.3", isian: laundry, pesan: "x", riwayat: [] });
  const ip = await D.jawabDemo({ token: D.tokenBaru(), ip: "3.3.3.3", isian: laundry, pesan: "x", riwayat: [] });
  assert.deepEqual([ip.ok, ip.batas], [false, "ip"]);
  D.aturUlangBatasDemo();
});

await cek("daftar dengan draf: nomor pertama + Informasi Usaha terisi, industri asal tercatat; klaim hanya sekali", async () => {
  const u = await P.buatAkun({ email: "rina@uji.test", nama: "Rina", password: "rahasia-uji-01" });
  const id = await D.klaimDrafBot(u.id, tokenA);
  assert.ok(id > 0);
  const [n] = await sql`SELECT label, user_id FROM numbers WHERE id = ${id}`;
  assert.deepEqual([n.label, n.user_id], ["Laundry Melati", u.id], "label tanpa penanda (contoh)");
  const [doc] = await sql`SELECT judul, jumlah_karakter FROM documents WHERE number_id = ${id}`;
  assert.equal(doc.judul, "Informasi Usaha");
  assert.ok(doc.jumlah_karakter > 100);
  const [{ asal_industri }] = await sql`SELECT asal_industri FROM users WHERE id = ${u.id}`;
  assert.equal(asal_industri, "laundry");
  const [d] = await sql`SELECT user_id, diklaim FROM draf_bot WHERE token = ${tokenA}`;
  assert.equal(d.user_id, u.id);
  assert.ok(d.diklaim > 0);
  const u2 = await P.buatAkun({ email: "lain@uji.test", nama: "Lain", password: "rahasia-uji-01" });
  assert.equal(await D.klaimDrafBot(u2.id, tokenA), null, "draf yang sudah diklaim tidak bisa diklaim akun lain");
  assert.equal(await D.klaimDrafBot(u2.id, "bukan-token"), null);
  assert.equal(await D.klaimDrafBot(u2.id, undefined), null);
});

await cek("token yang drafnya sudah diklaim: demo berikutnya memakai draf & token baru", async () => {
  const h = await D.jawabDemo({ token: tokenA, ip: "4.4.4.4", isian: laundry, pesan: "halo", riwayat: [] });
  assert.equal(h.ok, true);
  assert.notEqual(h.token, tokenA);
  assert.match(h.token, D.TOKEN_SAH);
  const [d] = await sql`SELECT diklaim FROM draf_bot WHERE token = ${h.token}`;
  assert.equal(d.diklaim, null);
  const r = await D.ringkasanDemo();
  assert.ok(r.draf >= 3 && r.diklaim === 1 && r.balasan >= 4);
});

await sql.end({ timeout: 2 });
await pg.berhenti().catch(() => {});
console.log(`\nLOLOS ${lolos} uji bot instan landing`);
process.exit(0);

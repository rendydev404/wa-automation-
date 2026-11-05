// Uji sinkron data Suka Shawarma: susun teks, tanda tangan sinyal, saklar per nomor, gabungan sinyal
// beruntun, tulis-hanya-bila-berubah, galat database, dan pencarian knowledge sesudahnya.
// Yang asli: src/lib (sinkron.ts, knowledge.ts, numbers.ts, db.ts) dan PostgreSQL 15 sementara.
// Yang tiruan: server database kasir (Supabase) yang menyajikan uji/data-sinkron-contoh.json
// (ringkasan asli per 14 Okt 2026).
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-sinkron.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-sinkron");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Database kasir tiruan ----------
const contoh = JSON.parse(readFileSync(path.join(akar, "uji", "data-sinkron-contoh.json"), "utf8"));
const kasir = { data: structuredClone(contoh), panggilan: 0, kunciDiterima: [], tolak: false };
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    kasir.panggilan++;
    kasir.kunciDiterima.push(JSON.parse(b).p_kunci);
    res.setHeader("content-type", "application/json");
    res.end(kasir.tolak ? "null" : JSON.stringify(kasir.data));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const RAHASIA = "rahasia-uji-0123456789";
Object.assign(process.env, {
  SINKRON_SS_URL: `http://127.0.0.1:${server.address().port}`,
  SINKRON_SS_APIKEY: "kunci-publik-uji",
  SINKRON_SS_KUNCI: "kunci-tarik-uji",
  SINKRON_SS_RAHASIA: RAHASIA,
});

const { db } = await lib("src/lib/db.ts");
const { tambahNomor } = await lib("src/lib/numbers.ts");
const knowledge = await lib("src/lib/knowledge.ts");
const S = await lib("src/lib/sinkron.ts");
const sql = await db();

let lolos = 0;
async function uji(nama, fn) {
  const t = performance.now();
  await fn();
  lolos++;
  console.log(`OK  ${nama} (${(performance.now() - t).toFixed(0)} ms)`);
}
const dokOtomatis = async (id) => (await sql`SELECT id, created_at, jumlah_karakter FROM documents WHERE number_id = ${id} AND nama_berkas = 'sinkron:suka-shawarma'`)[0];
const isiNomor = async (id) => (await sql`SELECT string_agg(isi, E'\n\n' ORDER BY urutan) AS t FROM chunks WHERE number_id = ${id}`)[0].t ?? "";

try {
  await uji("susun teks: harga, isi combo, outlet, dan ukuran kartu", async () => {
    const teks = S.susunTeks(contoh);
    assert.match(teks, /\*Original Sapi Jumbo\*: Rp44\.000 di outlet, Rp54\.000 di GoFood, GrabFood, ShopeeFood\./);
    assert.match(teks, /\*Combo #1\*: Rp34\.000 di outlet, .*Isi: 1x Ice Tea atau Orange Juice \+ 1x Original Sapi Sedang\./);
    assert.match(teks, /\*Ice Tea\*: Rp8\.000 di outlet\./);
    assert.match(teks, /tidak ada promo outlet yang sedang berjalan/);
    assert.equal((teks.match(/^Outlet Suka Shawarma /gm) ?? []).length, 21);
    assert.match(teks, /Outlet Suka Shawarma Cileudug, Kota Tangerang\n[^]*?belum tercatat melayani GoFood/);
    assert.match(teks, /Outlet Suka Shawarma Cileungsi, [^\n]*\n[^]*?tersedia di GoFood, ShopeeFood\./);
    for (const k of teks.split("\n\n")) assert.ok(k.length <= 1200, `kartu ${k.length} karakter: ${k.slice(0, 60)}`);
    for (const k of teks.split("\n\n")) assert.match(k, /\nKata kunci: /);
    // Satu kartu = satu potongan pencarian (tidak terbelah).
    const pot = knowledge.potong(knowledge.rapikanTeks(teks));
    assert.ok(pot.every((p) => p.split("\n\n").every((bagian) => /\nKata kunci: /.test(bagian))));
  });

  await uji("nama & wilayah outlet dari data mentah", async () => {
    assert.equal(S.namaOutlet("SUKA SHAWARMA DEPOK SUKMAJAYA"), "Depok Sukmajaya");
    assert.equal(S.namaOutlet("MITRA SAWANGAN DTC"), "Sawangan DTC");
    assert.equal(S.namaOutlet("SUKA SHAWARMA BNR"), "BNR");
    assert.equal(S.wilayahOutlet({ wilayah: null, alamat: "Jl. Siliwangi, Cicurug, Kec. Cicurug, Kabupaten Sukabumi, Jawa Barat 43359" }), "Kabupaten Sukabumi");
    assert.equal(S.wilayahOutlet({ wilayah: "TANGERANG", alamat: "Jl. Suryakencana No.54, Pamulang Bar., Kec. Pamulang, Kota Tangerang Selatan, Banten" }), "Kota Tangerang Selatan");
    assert.equal(S.wilayahOutlet({ wilayah: null, alamat: "CILEUNGSI" }), "Lainnya");
  });

  await uji("tanda tangan sinyal: sah, dirusak, kedaluwarsa, rahasia salah", async () => {
    // Persis teks yang dikirim pg_net: jsonb -> text.
    const badan = '{"tabel": "menu_items", "versi": 7}';
    const kini = Math.floor(Date.now() / 1000);
    const tanda = (w, b = badan, r = RAHASIA) => createHmac("sha256", r).update(`${w}.${b}`).digest("hex");
    assert.equal(S.tandaSah(badan, String(kini), tanda(kini), RAHASIA), true);
    assert.equal(S.tandaSah(badan.replace("7", "8"), String(kini), tanda(kini), RAHASIA), false);
    assert.equal(S.tandaSah(badan, String(kini - 600), tanda(kini - 600), RAHASIA), false);
    assert.equal(S.tandaSah(badan, String(kini), tanda(kini, badan, "lain"), RAHASIA), false);
    assert.equal(S.tandaSah(badan, null, null, RAHASIA), false);
    assert.equal(S.tandaSah(badan, String(kini), "zz", RAHASIA), false);
  });

  const cs = await tambahNomor("CS pusat");
  const lain = await tambahNomor("Asisten pribadi");
  await knowledge.tambahDokumen({ numberId: lain.id, judul: "Catatan pribadi", sumber: "teks", teks: "Jadwal rapat Senin pukul 09.00 di kantor." });

  await uji("saklar nyala: hanya nomor CS yang mendapat data, kunci tarik terkirim", async () => {
    await S.setNomorSinkron(cs.id, true);
    assert.equal(kasir.panggilan, 1);
    assert.deepEqual(kasir.kunciDiterima, ["kunci-tarik-uji"]);
    assert.ok(await dokOtomatis(cs.id));
    assert.equal(await dokOtomatis(lain.id), undefined);
    assert.match(await isiNomor(cs.id), /Original Sapi Jumbo/);
    assert.doesNotMatch(await isiNomor(lain.id), /Rp44\.000|Original Sapi/);
    const k = await knowledge.konteksPengetahuan(lain.id, "harga shawarma sapi jumbo berapa");
    assert.doesNotMatch(k.teks, /Rp44\.000/);
  });

  await uji("data tidak berubah: dokumen tidak ditulis ulang", async () => {
    const a = await dokOtomatis(cs.id);
    await S.jalankan();
    const b = await dokOtomatis(cs.id);
    assert.equal(b.id, a.id);
    assert.equal(kasir.panggilan, 2);
  });

  await uji("harga berubah + 5 sinyal beruntun -> satu tarikan, harga baru dipakai AI", async () => {
    const m = kasir.data.menu.find((x) => x.nama === "Original Sapi Jumbo");
    m.harga = 46000;
    m.gofood = m.grabfood = m.shopeefood = "56000";
    const sebelum = kasir.panggilan;
    for (let i = 0; i < 5; i++) {
      S.minta();
      await tidur(200);
    }
    await tidur(6000);
    assert.equal(kasir.panggilan - sebelum, 1);
    const k = await knowledge.konteksPengetahuan(cs.id, "kak harga shawarma sapi jumbo berapa ya");
    assert.match(k.teks, /Original Sapi Jumbo\*?: Rp46\.000 di outlet, Rp56\.000/);
    assert.doesNotMatch(k.teks, /Rp44\.000 di outlet, Rp54\.000/);
  });

  await uji("data otomatis Suka Shawarma: urutan biasa, tanpa aturan prioritas (khusus ChatGerCep)", async () => {
    const isian = Array.from({ length: 60 }, (_, i) => `Bagian ${i + 1}: harga shawarma sapi jumbo dulu Rp44.000 di outlet, cerita menu, jam buka, dan penjelasan umum lainnya.`).join("\n\n");
    const lama = await knowledge.tambahDokumen({ numberId: cs.id, judul: "PDF harga lama", sumber: "teks", teks: isian });
    try {
      const k = await knowledge.konteksPengetahuan(cs.id, "kak harga shawarma sapi jumbo berapa ya");
      assert.equal(k.prioritas, false);
      assert.doesNotMatch(k.teks, /DATA OTOMATIS TERBARU/);
      const { sistem } = await knowledge.susunSistem({ id: cs.id, instruksi: "", belajar: false }, "kak harga shawarma sapi jumbo berapa ya");
      assert.doesNotMatch(sistem, /dokumen lain itu sudah usang/);
    } finally {
      await knowledge.hapusDokumen(lama.id, cs.id, true);
    }
  });

  await uji("promo baru muncul dengan periode dan outlet", async () => {
    kasir.data.promo = [
      {
        promo_name: "BOGO Sabtu", scope: "item", discount_type: "buy_one_get_one", discount_value: 0, min_purchase: null, buy_quantity: 1, get_quantity: 1,
        apply_to_food_apps: false, start_date: "2026-10-17T09:00:00+00:00", end_date: "2026-10-17T13:00:00+00:00", daily_start_time: null, daily_end_time: null,
        daily_schedule: [], usage_limit: 100, menu: "Original Mix Besar", hadiah: "Original Sapi Sedang", outlet: ["SUKA SHAWARMA EMPANG", "MITRA CIBINONG"], semua_outlet: false,
      },
    ];
    await S.jalankan();
    const t = await isiNomor(cs.id);
    assert.match(t, /\*BOGO Sabtu\*: beli 1 gratis 1 Original Sapi Sedang untuk Original Mix Besar\. Berlaku 17 Oktober 2026 pukul 16\.00 WIB sampai 17 Oktober 2026 pukul 20\.00 WIB\./);
    assert.match(t, /Berlaku di outlet: Empang, Cibinong\. Kuotanya terbatas/);
    assert.match(t, /tidak untuk GoFood, GrabFood, dan ShopeeFood/);
  });

  await uji("database menolak kunci: galat dicatat, dokumen lama tetap", async () => {
    kasir.tolak = true;
    const a = await dokOtomatis(cs.id);
    await S.jalankan();
    const s = await S.statusSinkron();
    assert.match(s.galat ?? "", /kunci sinkron ditolak/);
    assert.equal((await dokOtomatis(cs.id)).id, a.id);
    kasir.tolak = false;
    await S.jalankan();
    assert.equal((await S.statusSinkron()).galat, null);
  });

  await uji("dokumen otomatis dihapus manual -> dibuat lagi pada tarikan berikutnya", async () => {
    await sql`DELETE FROM documents WHERE number_id = ${cs.id} AND nama_berkas = 'sinkron:suka-shawarma'`;
    await S.jalankan();
    assert.ok(await dokOtomatis(cs.id));
  });

  await uji("saklar mati: dokumen otomatis hilang, dokumen lain tidak tersentuh", async () => {
    await knowledge.tambahDokumen({ numberId: cs.id, judul: "PDF base knowledge", sumber: "teks", teks: "Kamu adalah CS Suka Shawarma. Tagline Besar dan Nikmat." });
    await S.setNomorSinkron(cs.id, false);
    assert.equal(await dokOtomatis(cs.id), undefined);
    assert.match(await isiNomor(cs.id), /Besar dan Nikmat/);
    assert.deepEqual(await S.nomorSinkron(), []);
  });

  console.log(`\nLOLOS ${lolos} uji sinkron`);
} finally {
  await sql.end({ timeout: 2 }).catch(() => {});
  server.close();
  await pg.berhenti();
}
process.exit(0);

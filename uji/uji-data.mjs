// Uji data: (1) pindahan dari database lama (SQLite) ke PostgreSQL, (2) pencarian knowledge,
// (3) rencana & kecepatan query pada data seukuran maksimal (30 nomor x 1 juta karakter knowledge).
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-data.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-data");
rmSync(tmp, { recursive: true, force: true });
const dataDir = path.join(tmp, "data");
mkdirSync(dataDir, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = dataDir;
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const kini = Math.floor(Date.now() / 1000);

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

// ---------- database lama: skema SQLite v5 persis seperti yang dipakai app sebelum pindah ----------
const SKEMA_LAMA = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE numbers (id INTEGER PRIMARY KEY, sesi TEXT NOT NULL UNIQUE, wa_id TEXT UNIQUE, label TEXT NOT NULL, nama_wa TEXT,
    bot_aktif INTEGER NOT NULL DEFAULT 1, instruksi TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_connected_at INTEGER,
    tunggu_detik INTEGER NOT NULL DEFAULT 5, jeda_menit INTEGER NOT NULL DEFAULT 30, tunggu_baca_detik INTEGER NOT NULL DEFAULT 45);
  CREATE TABLE documents (id INTEGER PRIMARY KEY, number_id INTEGER NOT NULL REFERENCES numbers(id) ON DELETE CASCADE, judul TEXT NOT NULL,
    sumber TEXT NOT NULL, nama_berkas TEXT, ukuran_byte INTEGER NOT NULL DEFAULT 0, jumlah_karakter INTEGER NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE chunks (id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL, number_id INTEGER NOT NULL, urutan INTEGER NOT NULL, isi TEXT NOT NULL);
  CREATE TABLE chat_state (kunci TEXT PRIMARY KEY, sesi_ke INTEGER NOT NULL DEFAULT 1, last_at INTEGER NOT NULL, jeda_sampai INTEGER NOT NULL DEFAULT 0,
    jendela_awal INTEGER NOT NULL DEFAULT 0, jendela_n INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
  CREATE TABLE stats (number_id INTEGER NOT NULL, tanggal TEXT NOT NULL, masuk INTEGER NOT NULL DEFAULT 0, dibalas INTEGER NOT NULL DEFAULT 0,
    gagal INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (number_id, tanggal)) WITHOUT ROWID;
  CREATE TABLE settings (kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL) WITHOUT ROWID;
`;
const SESI_BINER = randomBytes(1700);
const KREDENSIAL = JSON.stringify({ me: { id: "6281234500001:3@s.whatsapp.net", name: "Toko Lama" }, noiseKey: { private: { type: "Buffer", data: "AAECAw==" } } });
const ISI_PANJANG = Array.from({ length: 30 }, (_, i) => `Paragraf ${i}: ${"lorem ipsum dolor sit amet ".repeat(22)}`);
ISI_PANJANG[17] = "Ongkos kirim ke Depok Rp 12.000 dan ke Bogor Rp 18.000. Voucher GRATISONGKIR berlaku tiap hari Jumat.";

function buatLama({ versi, denganAuth }) {
  rmSync(path.join(dataDir, "wa.db"), { force: true });
  const d = new DatabaseSync(path.join(dataDir, "wa.db"));
  d.exec(SKEMA_LAMA);
  if (denganAuth) d.exec("CREATE TABLE wa_auth (sesi TEXT NOT NULL, kunci TEXT NOT NULL, nilai BLOB NOT NULL, PRIMARY KEY (sesi, kunci))");
  d.exec(`PRAGMA user_version = ${versi}`);
  const r = (q, ...p) => d.prepare(q).run(...p);
  r("INSERT INTO users VALUES (1, 'admin@contoh.test', 'scrypt:16384:8:1:garam:hash', ?)", kini - 9000);
  r("INSERT INTO users VALUES (4, 'kedua@contoh.test', 'scrypt:x', ?)", kini - 100);
  r("INSERT INTO numbers(id, sesi, wa_id, label, nama_wa, bot_aktif, instruksi, created_at, last_connected_at, tunggu_detik, jeda_menit, tunggu_baca_detik) VALUES (2, 'n2xdcae0179', '6281234500001', 'tes', 'Toko Lama', 1, 'Jawab singkat.', ?, ?, 7, 15, 60)", kini - 8000, kini - 50);
  r("INSERT INTO numbers(id, sesi, wa_id, label, bot_aktif, created_at) VALUES (5, 'n5xaaaa1111', NULL, 'Belum scan', 0, ?)", kini - 700);
  r("INSERT INTO numbers(id, sesi, wa_id, label, bot_aktif, created_at) VALUES (9, 'n9xbbbb2222', '6289900000009', 'Outlet ''B''', 1, ?)", kini - 600);
  r("INSERT INTO documents VALUES (3, 2, 'Menu & Harga', 'teks', NULL, 0, 61, ?)", kini - 5000);
  r("INSERT INTO chunks VALUES (10, 3, 2, 0, 'Kamu asisten Toko Lama. Shawarma ayam Rp 25.000, sapi Rp 30.000.')");
  r("INSERT INTO documents VALUES (8, 9, 'SOP Pengiriman', 'pdf', 'sop.pdf', 123456, ?, ?)", ISI_PANJANG.join("\n\n").length, kini - 4000);
  ISI_PANJANG.forEach((isi, i) => r("INSERT INTO chunks VALUES (?, 8, 9, ?, ?)", 100 + i, i, isi));
  r("INSERT INTO chunks VALUES (999, 77, 2, 0, 'potongan yatim: dokumennya sudah tidak ada')");
  r("INSERT INTO chat_state VALUES ('aaaabbbbccccddddeeeeffff00001111', 3, ?, ?, ?, 2)", kini - 30, kini + 900, kini - 60);
  r("INSERT INTO chat_state VALUES ('11112222333344445555666677778888', 1, ?, 0, 0, 0)", kini - 86400);
  r("INSERT INTO stats VALUES (2, '2026-10-13', 14, 9, 1)");
  r("INSERT INTO stats VALUES (2, '2026-10-14', 3, 3, 0)");
  r("INSERT INTO stats VALUES (77, '2026-10-01', 5, 5, 0)"); // nomor yang sudah dihapus
  r("INSERT INTO settings VALUES ('galat_terakhir', ?)", JSON.stringify({ at: kini - 10, pesan: "Hermes membalas HTTP 502" }));
  if (denganAuth) {
    r("INSERT INTO wa_auth VALUES ('n2xdcae0179', 'creds', ?)", KREDENSIAL);
    r("INSERT INTO wa_auth VALUES ('n2xdcae0179', 'session:628555.0', ?)", SESI_BINER);
    r("INSERT INTO wa_auth VALUES ('n2xdcae0179', 'pre-key:7', ?)", JSON.stringify({ private: { type: "Buffer", data: "AQID" }, public: { type: "Buffer", data: "BAUG" } }));
  }
  d.close();
}

console.log("== pindahan dari SQLite (otomatis saat app pertama kali menyambung ke PostgreSQL yang kosong) ==");
buatLama({ versi: 5, denganAuth: true });
const info = console.info;
const catatan = [];
console.info = (...a) => catatan.push(a.join(" "));
const { db, getSetting } = await lib("src/lib/db.ts");
const sql = await db(); // <- migrasi skema + impor terjadi di sini
console.info = info;
const { imporDariSqlite } = await lib("src/lib/impor-sqlite.ts");
const { semuaNomor, nomorById, tambahNomor, daftarNomor, hapusNomor } = await lib("src/lib/numbers.ts");
const K = await lib("src/lib/knowledge.ts");
const B = await lib("node_modules/baileys/lib/index.js");
const { bukaAuth, sesiTerpasang } = await lib("src/lib/wa-auth.ts");
const hitung = async (t) => (await sql.unsafe(`SELECT COUNT(*) AS n FROM ${t}`))[0].n;
const semuaHitung = async () => Object.fromEntries(await Promise.all(["users", "numbers", "documents", "chunks", "chat_state", "stats", "settings", "wa_auth"].map(async (t) => [t, await hitung(t)])));

await cek("semua tabel terimpor dengan jumlah yang benar; sisa yatim tidak ikut", async () => {
  assert.match(catatan.join("\n"), /data lama diimpor/);
  assert.deepEqual(await semuaHitung(), { users: 2, numbers: 3, documents: 2, chunks: 31, chat_state: 2, stats: 2, settings: 2, wa_auth: 3 });
  assert.match(await getSetting("impor_sqlite"), /dari SQLite v5: users 2, numbers 3, documents 2, chunks 31/);
});

await cek("isi dan tipe kolom utuh: id, boolean, pengaturan per nomor, tanda kutip, tanggal statistik", async () => {
  const n = await semuaNomor();
  assert.deepEqual(n.map((x) => x.id), [2, 5, 9]);
  assert.deepEqual({ ...n[0] }, { id: 2, user_id: 1, pemilik_aktif: true, sesi: "n2xdcae0179", wa_id: "6281234500001", label: "tes", nama_wa: "Toko Lama", bot_aktif: true, instruksi: "Jawab singkat.", tunggu_detik: 7, tunggu_baca_detik: 60, jeda_detik: 900, belajar: true, saring_spam: true, saring_prospek: true, jalur: "baileys", created_at: kini - 8000, last_connected_at: kini - 50 });
  assert.equal(n[1].bot_aktif, false);
  assert.equal(n[1].wa_id, null);
  assert.equal(n[2].label, "Outlet 'B'");
  const [u] = await sql`SELECT id, email, password_hash, created_at, peran, status FROM users WHERE id = 1`;
  assert.deepEqual({ ...u }, { id: 1, email: "admin@contoh.test", password_hash: "scrypt:16384:8:1:garam:hash", created_at: kini - 9000, peran: "admin", status: "aktif" });
  assert.deepEqual(n.map((x) => x.user_id), [1, 1, 1]); // semua nomor lama milik admin pertama
  const st = await sql`SELECT number_id, tanggal::text AS tanggal, masuk, dibalas, gagal FROM stats ORDER BY tanggal`;
  assert.deepEqual(st.map((r) => ({ ...r })), [{ number_id: 2, tanggal: "2026-10-13", masuk: 14, dibalas: 9, gagal: 1 }, { number_id: 2, tanggal: "2026-10-14", masuk: 3, dibalas: 3, gagal: 0 }]);
  const [c] = await sql`SELECT * FROM chat_state WHERE kunci = 'aaaabbbbccccddddeeeeffff00001111'`;
  assert.deepEqual({ ...c }, { kunci: "aaaabbbbccccddddeeeeffff00001111", sesi_ke: 3, last_at: kini - 30, jeda_sampai: kini + 900, jendela_awal: kini - 60, jendela_n: 2, prospek: 0, strike: 0, bisu_sampai: 0 });
  assert.match(JSON.parse(await getSetting("galat_terakhir")).pesan, /HTTP 502/);
});

await cek("sesi login WhatsApp ikut pindah dan bisa langsung dipakai (tanpa scan ulang)", async () => {
  assert.deepEqual(await sesiTerpasang(), ["n2xdcae0179"]);
  const a = await bukaAuth(B, "n2xdcae0179");
  assert.equal(a.creds.me.id, "6281234500001:3@s.whatsapp.net");
  assert.deepEqual([...a.creds.noiseKey.private], [0, 1, 2, 3]);
  const s = await a.keys.get("session", ["628555.0"]);
  assert.deepEqual(Buffer.from(s["628555.0"]), SESI_BINER);
  const p = await a.keys.get("pre-key", ["7"]);
  assert.deepEqual([...p["7"].public], [4, 5, 6]);
});

await cek("knowledge lama langsung bisa dicari (indeks dibuat PostgreSQL saat impor)", async () => {
  const kecil = await K.konteksPengetahuan(2, "berapa harga shawarma?");
  assert.equal(kecil.mode, "utuh");
  assert.match(kecil.teks, /^## Menu & Harga\n\nKamu asisten Toko Lama/);
  const besar = await K.konteksPengetahuan(9, "ongkirnya ke depok berapa kak?");
  assert.equal(besar.mode, "relevan");
  assert.match(besar.teks, /^## SOP Pengiriman\n\nOngkos kirim ke Depok Rp 12\.000/);
});

await cek("id baru melanjutkan dari id lama terbesar (tidak bentrok)", async () => {
  const n = await tambahNomor("Nomor baru setelah pindah");
  assert.equal(n.id, 10);
  const d = await K.tambahDokumen({ numberId: n.id, judul: "Baru", sumber: "teks", teks: "Dokumen pertama setelah pindah ke PostgreSQL." });
  assert.equal(d.id, 9);
  assert.equal((await sql`SELECT MIN(id) AS a FROM chunks WHERE document_id = ${d.id}`)[0].a, 130);
  await hapusNomor(n.id);
});

await cek("impor tidak terulang: dipanggil lagi maupun app dimulai ulang, datanya tetap", async () => {
  const sebelum = await semuaHitung();
  await imporDariSqlite(sql);
  assert.deepEqual(await semuaHitung(), sebelum);
});

const kosongkan = async () => {
  await sql`TRUNCATE users, numbers, documents, chunks, chat_state, stats, settings, wa_auth RESTART IDENTITY CASCADE`;
  globalThis.__waPg.setelan.clear();
  globalThis.__waNomor.janji = null;
};

await cek("database lama versi WAHA (v4, belum ada tabel sesi WhatsApp) juga terimpor", async () => {
  await kosongkan();
  buatLama({ versi: 4, denganAuth: false });
  await imporDariSqlite(sql);
  assert.deepEqual(await semuaHitung(), { users: 2, numbers: 3, documents: 2, chunks: 31, chat_state: 2, stats: 2, settings: 2, wa_auth: 0 });
  assert.deepEqual(await sesiTerpasang(), []); // semua nomor perlu scan QR (sesi WAHA memang tidak bisa dipindah)
  assert.equal((await nomorById(2)).wa_id, "6281234500001");
});

await cek("PostgreSQL yang sudah berisi data tidak pernah ditimpa oleh berkas lama", async () => {
  await kosongkan();
  await sql`INSERT INTO users(email, password_hash, created_at) VALUES ('sudah@ada.test', 'x', ${kini})`;
  await imporDariSqlite(sql);
  assert.deepEqual(await semuaHitung(), { users: 1, numbers: 0, documents: 0, chunks: 0, chat_state: 0, stats: 0, settings: 1, wa_auth: 0 });
  assert.match((await sql`SELECT nilai FROM settings WHERE kunci = 'impor_sqlite'`)[0].nilai, /dilewati/);
});

await cek("impor gagal di tengah jalan = tidak ada yang masuk sama sekali (satu transaksi)", async () => {
  await kosongkan();
  buatLama({ versi: 5, denganAuth: true });
  const d = new DatabaseSync(path.join(dataDir, "wa.db"));
  d.exec("INSERT INTO documents VALUES (50, 2, 'Rusak', 'jenis-tidak-sah', NULL, 0, 5, 1)"); // melanggar CHECK di PostgreSQL
  d.close();
  await assert.rejects(imporDariSqlite(sql), /documents_sumber_check/);
  assert.deepEqual(await semuaHitung(), { users: 0, numbers: 0, documents: 0, chunks: 0, chat_state: 0, stats: 0, settings: 0, wa_auth: 0 });
});

// ---------------------------------------------------------------------------------------------
console.log("\n== pencarian knowledge ==");
await kosongkan();
rmSync(path.join(dataDir, "wa.db"), { force: true });
const N1 = await tambahNomor("Toko Satu");
const N2 = await tambahNomor("Toko Dua");
const isian = (kata, n) => Array.from({ length: n }, (_, i) => `Bagian ${kata} ke-${i}: ${`${kata}${i} keterangan umum tentang layanan kami yang tidak memuat jawaban khusus. `.repeat(9)}`).join("\n\n");
await K.tambahDokumen({ numberId: N1.id, judul: "Profil", sumber: "teks", teks: `${isian("profil", 14)}\n\nJam buka outlet: Senin sampai Sabtu pukul 10.00-22.00. Minggu libur.\n\n${isian("penutup", 4)}` });
await K.tambahDokumen({ numberId: N1.id, judul: "Promo", sumber: "teks", teks: `Voucher diskon 20% berlaku untuk pembelian paket keluarga. Voucher hanya bisa dipakai sekali per pelanggan. Kode voucher: HEMAT20.\n\n${isian("promo", 6)}\n\nPembayaran bisa lewat QRIS, transfer bank, atau tunai di kasir. Café kami juga menerima kartu débit.` });
await K.tambahDokumen({ numberId: N2.id, judul: "Rahasia Toko Dua", sumber: "teks", teks: `Voucher toko dua bernilai Rp 5.000 saja. ${isian("lain", 20)}` });

await cek("knowledge besar: yang dikirim hanya potongan relevan, yang paling cocok di urutan pertama", async () => {
  assert.ok((await K.totalKarakter(N1.id)) > K.BATAS_UTUH);
  const k = await K.konteksPengetahuan(N1.id, "kak vouchernya bisa dipakai berapa kali?");
  assert.equal(k.mode, "relevan");
  assert.match(k.teks, /^## Promo\n\nVoucher diskon 20%/); // "vouchernya" -> awalan "voucher", 3x muncul di potongan ini
  assert.ok(k.karakter <= 9_200, `anggaran potongan relevan (${k.karakter})`);
  const jam = await K.konteksPengetahuan(N1.id, "hari minggu buka jam berapa ya?");
  assert.match(jam.teks.slice(0, 1300), /Jam buka outlet: Senin sampai Sabtu/); // potongan teratas (paragraf pendek digabung per potongan)
});

await cek("knowledge nomor lain tidak pernah ikut", async () => {
  const k = await K.konteksPengetahuan(N1.id, "voucher");
  assert.doesNotMatch(k.teks, /toko dua|Rahasia/i);
  const k2 = await K.konteksPengetahuan(N2.id, "voucher");
  assert.match(k2.teks, /^## Rahasia Toko Dua\n\nVoucher toko dua/);
  assert.doesNotMatch(k2.teks, /HEMAT20/);
});

await cek("sapaan / tanpa kata penting / tidak ada yang cocok: bagian awal tiap dokumen", async () => {
  for (const q of ["halo kak", "apa itu yang ini?", "xyzzy plugh"]) {
    const k = await K.konteksPengetahuan(N1.id, q);
    assert.equal(k.mode, "relevan", q);
    assert.match(k.teks, /^## Profil\n\nBagian profil ke-0/, q);
    assert.match(k.teks, /## Promo\n\nVoucher diskon/, q);
  }
});

await cek("pesan dengan tanda baca / simbol / emoji tidak merusak kueri", async () => {
  for (const q of ["harga? (promo) & 50% 'off' :* | ! <-> \\ voucher", "voucher!!! 😀😀 ---- ;DROP TABLE chunks;--", "'); SELECT 1; --", ":* & | !", "pembayaran: qris/transfer?"]) {
    const k = await K.konteksPengetahuan(N1.id, q);
    assert.equal(k.mode, "relevan", q);
    assert.ok(k.teks.length > 100, q);
  }
  assert.match((await K.konteksPengetahuan(N1.id, "pembayaran: qris/transfer?")).teks, /Pembayaran bisa lewat QRIS/);
  assert.equal(await hitung("chunks") > 0, true);
});

await cek("kata berhuruf Unicode dicocokkan apa adanya", async () => {
  assert.match((await K.konteksPengetahuan(N1.id, "terima kartu débit?")).teks, /^## Promo\n\n[\s\S]*kartu débit/);
  assert.equal(K.kueriCari("Apakah vouchernya bisa dipakai di Café?"), "apa:* | voucher:* | dipakai:* | café:*"); // akhiran -kah/-nya dibuang
  assert.equal(K.kueriCari("ya kak"), null);
});

await cek("unduh dokumen: teks utuh dari semua potongannya; dokumen nomor lain tidak bisa diunduh", async () => {
  const teks = `${isian("unduh", 30)}

Baris terakhir: rekening BCA 0954786095.`;
  const d = await K.tambahDokumen({ numberId: N1.id, judul: "Unduh/Uji", sumber: "teks", teks });
  assert.ok(d.potongan > 1, "dokumen uji harus terdiri dari beberapa potongan");
  const u = await K.teksDokumen(d.id, N1.id, false);
  assert.equal(u.judul, "Unduh/Uji");
  assert.equal(u.teks.replace(/\s+/g, " "), K.rapikanTeks(teks).replace(/\s+/g, " "));
  assert.equal(await K.teksDokumen(d.id, N2.id, false), null);
  await K.hapusDokumen(d.id, N1.id, false);
});

await cek("hapus dokumen / hapus nomor: potongan dan statistiknya ikut terhapus", async () => {
  const d = await K.tambahDokumen({ numberId: N2.id, judul: "Sementara", sumber: "teks", teks: "Dokumen sementara untuk dihapus lagi segera." });
  const c0 = await hitung("chunks");
  await K.hapusDokumen(d.id, N1.id, false); // nomor salah: tidak boleh terhapus
  assert.equal(await hitung("chunks"), c0);
  await K.hapusDokumen(d.id, N2.id, false);
  assert.equal(await hitung("chunks"), c0 - 1);
  await hapusNomor(N2.id);
  assert.equal((await sql`SELECT COUNT(*) AS n FROM chunks WHERE number_id = ${N2.id}`)[0].n, 0);
  assert.equal((await sql`SELECT COUNT(*) AS n FROM documents WHERE number_id = ${N2.id}`)[0].n, 0);
});

// ---------------------------------------------------------------------------------------------
console.log("\n== ukuran maksimal: 30 nomor x 1 juta karakter knowledge (33 ribu potongan) ==");
await kosongkan();
const KATA = "harga promo voucher ongkir kirim bayar qris transfer menu paket keluarga ayam sapi nasi minum buka tutup jam hari outlet cabang alamat pesan antar ambil diskon gratis member poin tukar saldo refund komplain garansi".split(" ");
const acak = (i) => KATA[(i * 7919 + 13) % KATA.length];
const [pemilik] = await sql`INSERT INTO users(email, password_hash, created_at) VALUES ('pemilik@uji.test', 'x', ${kini}) RETURNING id`;
const nomorBanyak = [];
for (let n = 0; n < 30; n++) nomorBanyak.push(await tambahNomor(`Nomor ${n + 1}`, pemilik.id));
const t0 = performance.now();
for (const n of nomorBanyak) {
  const docs = await sql`INSERT INTO documents ${sql(Array.from({ length: 4 }, (_, d) => ({ number_id: n.id, judul: `Dokumen ${d + 1}`, sumber: "teks", jumlah_karakter: 250_000, created_at: kini + d })), "number_id", "judul", "sumber", "jumlah_karakter", "created_at")} RETURNING id`;
  const baris = [];
  docs.forEach((doc, d) => {
    for (let u = 0; u < 278; u++) {
      const benih = n.id * 100000 + d * 1000 + u;
      baris.push({ document_id: doc.id, number_id: n.id, urutan: u, isi: Array.from({ length: 140 }, (_, i) => acak(benih + i * 31) + (i % 9 === 0 ? benih + i : "")).join(" ") });
    }
  });
  for (let i = 0; i < baris.length; i += 600) await sql`INSERT INTO chunks ${sql(baris.slice(i, i + 600), "document_id", "number_id", "urutan", "isi")}`;
}
const tIsi = performance.now() - t0;
const { default: postgres } = await lib("node_modules/postgres/src/index.js");
const admin = postgres(pg.urlAdmin, { max: 1, onnotice() {} });
await admin.unsafe("VACUUM ANALYZE");
await admin.end();
const [uk] = await sql`SELECT (SELECT COUNT(*) FROM chunks) AS n, pg_size_pretty(pg_total_relation_size('chunks')) AS total, pg_size_pretty(pg_database_size(current_database())) AS db`;
console.log(`  ${uk.n} potongan dimuat dalam ${(tIsi / 1000).toFixed(1)} dtk (termasuk membangun indeks pencarian); tabel chunks ${uk.total}; seluruh database ${uk.db}`);

async function rencana(nama, q, params = []) {
  const baris = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${q}`, params);
  const teks = baris.map((r) => r["QUERY PLAN"]).join("\n");
  const node = teks.split("\n").filter((l) => /Scan|Nested|Hash Join|Sort |Limit|Aggregate/.test(l)).map((l) => l.trim().replace(/^->\s*/, "").replace(/ \(actual.*$/, "")).slice(0, 5).join("  >  ");
  console.log(`  ${nama.padEnd(30)} ${String(/Execution Time: ([\d.]+) ms/.exec(teks)?.[1]).padStart(7)} ms | ${(/Buffers: ([^\n]+)/.exec(teks)?.[1] ?? "-").padEnd(18)} | ${node}`);
  return teks;
}
const nTengah = nomorBanyak[14].id;
const rCari = await rencana("cari knowledge (1 nomor)", `SELECT d.judul, c.isi FROM to_tsquery('simple', $1) q, chunks c JOIN documents d ON d.id = c.document_id WHERE c.number_id = $2 AND c.cari @@ q ORDER BY ts_rank(c.cari, q, 1) DESC, c.id LIMIT 14`, ["voucher:* | ongkir:* | depok:*", nTengah]);
const rTotal = await rencana("total karakter (1 nomor)", "SELECT COALESCE(SUM(jumlah_karakter), 0) AS n FROM documents WHERE number_id = $1", [nTengah]);
const rAwal = await rencana("bagian awal dokumen (sapaan)", "SELECT d.judul, c.isi FROM chunks c JOIN documents d ON d.id = c.document_id WHERE c.number_id = $1 AND c.urutan < 2 ORDER BY d.created_at, d.id, c.urutan LIMIT 8", [nTengah]);
const rDaftar = await rencana("daftar nomor (beranda)", `SELECT n.id, COALESCE(d.jumlah, 0), COALESCE(d.karakter, 0), COALESCE(s.dibalas, 0) FROM numbers n LEFT JOIN (SELECT number_id, COUNT(*) AS jumlah, SUM(jumlah_karakter) AS karakter FROM documents GROUP BY number_id) d ON d.number_id = n.id LEFT JOIN stats s ON s.number_id = n.id AND s.tanggal = $1 ORDER BY n.id`, ["2026-10-14"]);
const rDok = await rencana("daftar dokumen (1 nomor)", "SELECT id, judul FROM documents WHERE number_id = $1 ORDER BY created_at DESC, id DESC", [nTengah]);

if (process.env.RENCANA) console.log(rCari); // RENCANA=1: tampilkan rencana lengkap pencarian
await cek("pencarian tidak pernah memindai seluruh tabel potongan", () => {
  assert.doesNotMatch(rCari, /Seq Scan on chunks/);
  assert.doesNotMatch(rAwal, /Seq Scan on chunks/);
  assert.match(rCari, /chunks_number_idx/);
  assert.match(rAwal, /chunks_number_idx/);
  void rTotal;
  void rDaftar;
  void rDok;
});

const ukur = async (n, fn) => {
  const ms = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn(i);
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  return { p50: ms[Math.floor(n / 2)], p95: ms[Math.floor(n * 0.95)], maks: ms[n - 1] };
};
const tampil = (nama, u) => console.log(`  ${nama.padEnd(52)} p50 ${u.p50.toFixed(2).padStart(6)} ms | p95 ${u.p95.toFixed(2).padStart(6)} ms | maks ${u.maks.toFixed(1).padStart(6)} ms`);
const tanya = ["vouchernya masih berlaku?", "ongkir ke cabang berapa", "bisa bayar pakai qris", "jam buka outlet hari minggu", "ada paket keluarga ayam?", "cara refund saldo member"];
await ukur(20, (i) => K.konteksPengetahuan(nomorBanyak[i % 30].id, tanya[i % tanya.length])); // pemanasan
const uCari = await ukur(300, (i) => K.konteksPengetahuan(nomorBanyak[i % 30].id, tanya[i % tanya.length]));
tampil("konteksPengetahuan (2 query: total + cari)", uCari);
const uSistem = await ukur(200, (i) => K.susunSistem({ id: nomorBanyak[i % 30].id, instruksi: "" }, tanya[i % tanya.length]));
tampil("susunSistem (seluruh konteks untuk satu balasan AI)", uSistem);
const uDaftar = await ukur(200, () => daftarNomor(pemilik.id, false));
tampil("daftarNomor (beranda, 30 nomor)", uDaftar);
const uCache = await ukur(2000, (i) => nomorById(nomorBanyak[i % 30].id));
tampil("nomorById (dari cache memori, tiap pesan WhatsApp)", uCache);
await cek("penyusunan konteks AI tetap jauh di bawah 20 ms pada ukuran maksimal", () => {
  assert.ok(uSistem.p95 < 20, `p95 ${uSistem.p95.toFixed(1)} ms`);
  assert.ok(uCache.p50 < 0.05);
});

// ---------------------------------------------------------------------------------------------
console.log("\n== histori percakapan: paginasi kursor & rencana query (EXPLAIN ANALYZE) ==");
const P = await lib("src/lib/percakapan.ts");
// Isi data histori lintas 30 nomor (1.460 percakapan, ~14.000 pesan) + 40 percakapan lewat catatPesan pada nTengah.
const barisPercakapan = [];
for (const n of nomorBanyak) {
  if (n.id === nTengah) continue;
  for (let c = 0; c < 50; c++) {
    barisPercakapan.push({
      number_id: n.id,
      kunci: `kunci-${n.id}-${c}`,
      telepon: `62811${String(n.id).padStart(2, "0")}${String(c).padStart(4, "0")}`,
      nama: `Pelanggan ${n.id}-${c}`,
      cuplikan: `Cuplikan pesan terakhir nomor ${n.id} ke-${c}`,
      pengirim_akhir: 1,
      masuk_n: 5,
      bot_n: 5,
      manusia_n: 0,
      terakhir_pada: kini + c,
    });
  }
}
for (let i = 0; i < barisPercakapan.length; i += 500) {
  const ins = await sql`INSERT INTO percakapan ${sql(barisPercakapan.slice(i, i + 500), "number_id", "kunci", "telepon", "nama", "cuplikan", "pengirim_akhir", "masuk_n", "bot_n", "manusia_n", "terakhir_pada")} RETURNING id`;
  const pesanMassal = [];
  for (const { id: pid } of ins) {
    for (let m = 0; m < 10; m++) {
      pesanMassal.push({ percakapan_id: pid, peran: m % 2, teks: `Isi pesan percakapan ${pid} urutan ke-${m}`, waktu: kini + m });
    }
  }
  for (let j = 0; j < pesanMassal.length; j += 1000) {
    await sql`INSERT INTO pesan_chat ${sql(pesanMassal.slice(j, j + 1000), "percakapan_id", "peran", "teks", "waktu")}`;
  }
}
for (let c = 0; c < 40; c++) {
  const k = `kunci-${nTengah}-${c}`;
  await P.catatPesan({ numberId: nTengah, kunci: k, peran: 0, teks: `Halo kak pesan ke-${c}`, waktu: kini + c * 10, telepon: `628120000${String(c).padStart(4, "0")}`, nama: `Pelanggan ${c}` });
  await P.catatPesan({ numberId: nTengah, kunci: k, peran: c % 3 === 0 ? 2 : 1, teks: `Siap kak balasan ke-${c}`, waktu: kini + c * 10 + 2 });
}
const admin2 = postgres(pg.urlAdmin, { max: 1, onnotice() {} });
await admin2.unsafe("ANALYZE percakapan, pesan_chat");
await admin2.end();

const halaman1 = await P.daftarPercakapan(nTengah, { batas: 15 });
const halaman2 = await P.daftarPercakapan(nTengah, {
  batas: 15,
  sebelumWaktu: halaman1.daftar.at(-1).terakhir_pada,
  sebelumId: halaman1.daftar.at(-1).id,
});
const rChatDaftar = await rencana(
  "daftar percakapan (1 nomor)",
  "SELECT p.id, p.telepon, p.nama, p.cuplikan, p.pengirim_akhir, p.masuk_n, p.bot_n, p.manusia_n, p.terakhir_pada, COALESCE(cs.jeda_sampai, 0) AS jeda_sampai FROM percakapan p LEFT JOIN chat_state cs ON cs.kunci = p.kunci WHERE p.number_id = $1 ORDER BY p.terakhir_pada DESC, p.id DESC LIMIT 26",
  [nTengah]
);
const rChatPesan = await rencana(
  "isi pesan (1 percakapan)",
  "SELECT id, peran, teks, waktu FROM pesan_chat WHERE percakapan_id = $1 ORDER BY id DESC LIMIT 51",
  [halaman1.daftar[0].id]
);

await cek("histori percakapan: terstruktur per nomor, paginasi kursor akurat, dan lewat indeks komposit", async () => {
  const ringkas = await P.ringkasanPercakapan(nTengah);
  assert.deepEqual(ringkas, { total_percakapan: 40, total_masuk: 40, total_bot: 26, total_manusia: 14 });
  assert.equal(halaman1.daftar.length, 15);
  assert.equal(halaman1.adaLagi, true);
  assert.equal(halaman1.daftar[0].nama, "Pelanggan 39");
  assert.equal(halaman2.daftar.length, 15);
  assert.equal(halaman2.daftar[0].nama, "Pelanggan 24");
  const hanyaManusia = await P.daftarPercakapan(nTengah, { filter: "manusia", batas: 50 });
  assert.equal(hanyaManusia.daftar.length, 14);
  const hasilCari = await P.daftarPercakapan(nTengah, { cari: "Pelanggan 39" });
  assert.equal(hasilCari.daftar.length, 1);
  const detail = await P.ambilPesanPercakapan(nTengah, halaman1.daftar[0].id);
  assert.equal(detail.pesan.length, 2);
  assert.deepEqual(detail.pesan.map((m) => m.peran), [0, 2]);
  assert.equal(await P.ambilPesanPercakapan(nomorBanyak[0].id, halaman1.daftar[0].id), null); // beda nomor ditolak
  assert.doesNotMatch(rChatDaftar, /Seq Scan on percakapan/);
  assert.doesNotMatch(rChatPesan, /Seq Scan on pesan_chat/);
  assert.match(rChatDaftar, /percakapan_nomor_waktu_idx/);
  assert.match(rChatPesan, /pesan_chat_percakapan_idx/);
});

await cek("hapus histori: satu percakapan atau semua milik satu nomor; isi pesan ikut, nomor lain utuh", async () => {
  const lain = nomorBanyak.find((n) => n.id !== nTengah).id;
  const hitung = async (nid) =>
    ({ ...(await sql`SELECT count(*)::int AS p, (SELECT count(*)::int FROM pesan_chat m JOIN percakapan q ON q.id = m.percakapan_id WHERE q.number_id = ${nid}) AS m FROM percakapan WHERE number_id = ${nid}`)[0] });
  const lainSebelum = await hitung(lain);
  assert.deepEqual(lainSebelum, { p: 50, m: 500 });
  const target = halaman1.daftar[0].id;
  assert.equal(await P.hapusPercakapan(lain, target), 0); // percakapan nomor lain tidak bisa dihapus lewat nomor yang salah
  assert.equal(await P.hapusPercakapan(nTengah, target), 1);
  assert.equal(await P.ambilPesanPercakapan(nTengah, target), null);
  assert.equal((await sql`SELECT count(*)::int AS n FROM pesan_chat WHERE percakapan_id = ${target}`)[0].n, 0);
  assert.equal(await P.hapusPercakapan(nTengah), 39);
  assert.deepEqual(await P.ringkasanPercakapan(nTengah), { total_percakapan: 0, total_masuk: 0, total_bot: 0, total_manusia: 0 });
  assert.deepEqual(await hitung(nTengah), { p: 0, m: 0 });
  assert.deepEqual(await hitung(lain), lainSebelum);
});

await cek("histori lebih dari 30 hari terhapus otomatis: percakapan basi utuh, pesan lama di percakapan aktif + penghitungnya", async () => {
  const hari = 86400;
  const tulis = (k, peran, teks, waktu) => P.catatPesan({ numberId: nTengah, kunci: k, peran, teks, waktu });
  await tulis("basi", 0, "halo dulu sekali", kini - 40 * hari);
  await tulis("basi", 1, "siap kak", kini - 40 * hari + 5);
  await tulis("aktif", 0, "tanya lama", kini - 31 * hari);
  await tulis("aktif", 2, "jawab lama", kini - 31 * hari + 5);
  await tulis("aktif", 0, "tanya baru", kini - 2 * hari);
  await tulis("aktif", 1, "jawab baru", kini - 2 * hari + 5);
  const lain = nomorBanyak.find((n) => n.id !== nTengah).id;
  const lainSebelum = (await sql`SELECT count(*)::int AS n FROM pesan_chat m JOIN percakapan q ON q.id = m.percakapan_id WHERE q.number_id = ${lain}`)[0].n;

  assert.deepEqual(await P.hapusHistoriKedaluwarsa(kini), { percakapan: 1, pesan: 2 });
  assert.deepEqual(await P.ringkasanPercakapan(nTengah), { total_percakapan: 1, total_masuk: 1, total_bot: 1, total_manusia: 0 });
  const { daftar } = await P.daftarPercakapan(nTengah);
  assert.equal(daftar[0].cuplikan, "jawab baru");
  assert.deepEqual((await P.ambilPesanPercakapan(nTengah, daftar[0].id)).pesan.map((m) => m.teks), ["tanya baru", "jawab baru"]);
  assert.equal((await sql`SELECT count(*)::int AS n FROM pesan_chat m JOIN percakapan q ON q.id = m.percakapan_id WHERE q.number_id = ${lain}`)[0].n, lainSebelum);
  assert.deepEqual(await P.hapusHistoriKedaluwarsa(kini), { percakapan: 0, pesan: 0 }); // kedua kali: tidak ada yang tersisa
  const r = await rencana("pesan kedaluwarsa", "SELECT id FROM pesan_chat WHERE waktu < $1 LIMIT 5000", [kini - 30 * hari]);
  assert.match(r, /pesan_chat_waktu_idx/);
});

console.log(`\nLOLOS ${lolos} pemeriksaan`);
await sql.end({ timeout: 2 });
await pg.berhenti();
process.exit(0);

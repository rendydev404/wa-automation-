// Profil fungsi data halaman (dashboard, nomor, panel admin) pada PostgreSQL sementara berisi data seukuran produksi
// (data-ukur.mjs). Mencetak median waktu per fungsi; EXPLAIN=1 juga mencetak rencana query pilihan.
// Pakai dari akar proyek: node --import ./uji/loader.mjs docs/serah-terima-skrip/profil-query.mjs
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const { mulaiPg } = await import(pathToFileURL(path.join(akar, "uji/pg-lokal.mjs")).href);
const pg = await mulaiPg({ dir: path.join(os.tmpdir(), "wa-profil-query-pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(os.tmpdir(), "wa-profil-query-data");
process.env.AUTH_SECRET = "p".repeat(48);
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const { db, sekarang } = await lib("src/lib/db.ts");
const P = await lib("src/lib/pengguna.ts");
const { isiData } = await lib("docs/serah-terima-skrip/data-ukur.mjs");
const sql = await db();
const admin = await P.buatAkun({ email: "admin@contoh.test", nama: "Admin", password: "Rahasia-uji-2026", peran: "admin" });
const user = await P.buatAkun({ email: "budi@contoh.test", nama: "Budi", password: "Rahasia-uji-2026" });
const kini = sekarang();
await isiData(sql, { admin, user, kini });
// TANPA_BRIN=1: ukur keadaan sebelum migrasi v35 (indeks waktu ai_pakai dibuang).
if (process.env.TANPA_BRIN) await sql`DROP INDEX IF EXISTS ai_pakai_waktu_brin`;
await sql`VACUUM ANALYZE ai_pakai`;
const nomor = (await sql`SELECT id FROM numbers WHERE user_id = ${user.id} ORDER BY id LIMIT 1`)[0].id;

const { kpiAdmin } = await lib("src/lib/kpi.ts");
const { ringkasPakai } = await lib("src/lib/ai.ts");
const { ringkasanAnalitik } = await lib("src/lib/analitik.ts");
const { daftarNomor, statHarian, tanggalWib } = await lib("src/lib/numbers.ts");
const { hariTerakhir } = await lib("src/lib/tren.ts");
const { cariTransaksi, hitungTransaksi, ringkasanTransaksi } = await lib("src/lib/transaksi-admin.ts");
const L = await lib("src/lib/langganan.ts");
const { daftarPercakapan, ringkasanPercakapan } = await lib("src/lib/percakapan.ts");
const { daftarNotif } = await lib("src/lib/notifikasi.ts");

const u = { id: user.id, peran: "user" };
const hari7 = hariTerakhir(tanggalWib(), 7);
const fungsi = {
  "kpiAdmin (/admin)": () => kpiAdmin(),
  "ringkasPakai 7 hr (/admin/ai)": () => ringkasPakai(kini - 7 * 86400),
  "ringkasanAnalitik 30 hr": () => ringkasanAnalitik({ hari: 30, userId: null, sertakanAdmin: false }),
  "pemakaianNyata (/admin/paket)": () => L.pemakaianNyata(),
  "daftarPengguna (/admin/pengguna)": () => P.daftarPengguna({}),
  "hitungPengguna": () => P.hitungPengguna({}),
  "hitungPaketPengguna": () => P.hitungPaketPengguna({}),
  "cariTransaksi": () => cariTransaksi({}),
  "hitungTransaksi": () => hitungTransaksi({}),
  "ringkasanTransaksi": () => ringkasanTransaksi(),
  "daftarNomor (/dashboard)": () => daftarNomor(user.id, false),
  "statHarian akun 7 hr": () => statHarian(hari7[0], { userId: user.id }),
  "hakAkun": () => L.hakAkun(u),
  "sisaKuotaAi": () => L.sisaKuotaAi(user.id),
  "ringkasanPercakapan (/nomor)": () => ringkasanPercakapan(nomor),
  "daftarPercakapan (/nomor)": () => daftarPercakapan(nomor),
  "daftarNotif": () => daftarNotif(user.id, { batas: 30 }),
};
console.log(`\n== median 15x (setelah 3x pemanasan), data: ${(await sql`SELECT (SELECT COUNT(*) FROM ai_pakai) a, (SELECT COUNT(*) FROM stats) s, (SELECT COUNT(*) FROM pesan_chat) p`).map((r) => `ai_pakai ${r.a}, stats ${r.s}, pesan_chat ${r.p}`)[0]} ==`);
for (const [nama, f] of Object.entries(fungsi)) {
  for (let i = 0; i < 3; i++) await f();
  const ms = [];
  for (let i = 0; i < 15; i++) {
    const t = performance.now();
    await f();
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  console.log(`  ${nama.padEnd(36)} ${ms[7].toFixed(1).padStart(7)} ms (maks ${ms[14].toFixed(1)})`);
}

if (process.env.EXPLAIN) {
  const awal = kini - 30 * 86400;
  const rencana = {
    "biaya AI 60 hari (kpi)": sql`EXPLAIN (ANALYZE, BUFFERS) SELECT COALESCE(SUM(biaya_usd) FILTER (WHERE waktu >= ${awal}), 0)::float8 AS kini FROM ai_pakai WHERE waktu >= ${kini - 60 * 86400}`,
    "ringkasPakai 7 hari": sql`EXPLAIN (ANALYZE, BUFFERS) SELECT penyedia, model, COUNT(*) FROM ai_pakai WHERE waktu >= ${kini - 7 * 86400} GROUP BY 1, 2`,
    "kuota menipis (kpi)": sql`EXPLAIN (ANALYZE, BUFFERS) SELECT l.user_id, p.terpakai FROM langganan l JOIN users u ON u.id = l.user_id AND u.peran = 'user'
        CROSS JOIN LATERAL (SELECT COUNT(*)::int AS terpakai FROM numbers n JOIN ai_pakai a ON a.number_id = n.id AND a.waktu >= l.mulai AND NOT a.abaikan WHERE n.user_id = l.user_id) p
       WHERE l.mulai <= ${kini} AND l.sampai > ${kini} AND l.kuota_balasan > 0 AND p.terpakai >= l.kuota_balasan * 0.8 ORDER BY p.terpakai::float8 / l.kuota_balasan DESC LIMIT 6`,
    "stats 60 hari (kpi)": sql`EXPLAIN (ANALYZE, BUFFERS) SELECT SUM(dibalas) FROM stats WHERE tanggal >= (now() - interval '60 days')::date`,
  };
  for (const [nama, q] of Object.entries(rencana)) {
    console.log(`\n-- ${nama}`);
    for (const r of await q) console.log("  " + r["QUERY PLAN"]);
  }
}
await sql.end({ timeout: 2 });
await pg.berhenti();
process.exit(0);

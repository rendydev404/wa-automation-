/* eslint-disable */
// Uji knowledge lewat jalur yang sama dengan dashboard versi PostgreSQL:
// unpdf -> rapikanTeks -> potong -> tsvector('simple') + GIN -> to_tsquery awalan-cocok ATAU -> ts_rank(…, 1) -> 14 teratas -> anggaran 9.000.
// rapikanTeks, potong, kueriCari disalin dari src/lib/knowledge.ts; skema kolom `cari` dari src/lib/db.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SINI = path.dirname(fileURLToPath(import.meta.url));
const REPO = "D:/PROJECT-WEB-SS/WA_AUTOMATION";
const TARGET_POTONGAN = 900, MAKS_POTONGAN = 1200, BATAS_RELEVAN = 9000, BATAS_TANPA_KUERI = 4000;

const rapikanTeks = (m) => m.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t\f\v]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
function potong(teks) {
  const bagian = [];
  for (const paragraf of teks.split(/\n\n+/)) {
    let sisa = paragraf.trim();
    while (sisa.length > MAKS_POTONGAN) {
      const jendela = sisa.slice(0, MAKS_POTONGAN);
      const titik = Math.max(jendela.lastIndexOf(". "), jendela.lastIndexOf("\n"), jendela.lastIndexOf("; "));
      const batas = titik > TARGET_POTONGAN / 2 ? titik + 1 : (jendela.lastIndexOf(" ") > 0 ? jendela.lastIndexOf(" ") : MAKS_POTONGAN);
      bagian.push(sisa.slice(0, batas).trim());
      sisa = sisa.slice(batas).trim();
    }
    if (sisa) bagian.push(sisa);
  }
  const potongan = [];
  let kini = "";
  for (const b of bagian) {
    if (kini && kini.length + b.length + 2 > TARGET_POTONGAN) { potongan.push(kini); kini = b; }
    else kini = kini ? `${kini}\n\n${b}` : b;
  }
  if (kini) potongan.push(kini);
  return potongan;
}
const STOP = new Set("yang dan di ke dari untuk ini itu ada apa ya kak kakak saya aku kamu mau bisa berapa gimana bagaimana dong sih nih deh aja saja juga atau dengan pada adalah tidak nggak gak ga enggak sudah udah belum akan lagi kalau kalo jadi tapi the and for you are how what".split(" "));
const akar = (k) => { const d = k.replace(/(nya|lah|kah|pun|ku|mu)$/, ""); return d.length >= 3 ? d : k; };
function kueriCari(pesan) {
  const kata = [...new Set(pesan.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((k) => k.length >= 3 && !STOP.has(k)).map(akar))].slice(0, 12);
  return kata.length ? kata.map((k) => `${k}:*`).join(" | ") : null;
}

async function teksPdf(berkas) {
  const { extractText, getDocumentProxy } = await import(pathToFileURL(`${REPO}/node_modules/unpdf/dist/index.mjs`).href);
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(berkas)));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { teks: text.join("\n\n"), halaman: totalPages };
}

const dokumen = [];
for (const a of process.argv.slice(2).filter((x) => !x.startsWith("--") && !x.endsWith(".json"))) {
  const judul = path.basename(a).replace(/\.[^.]+$/, "");
  let teks, halaman = null;
  if (a.endsWith(".pdf")) ({ teks, halaman } = await teksPdf(a));
  else teks = readFileSync(a, "utf8");
  teks = rapikanTeks(teks);
  const pot = potong(teks);
  const pj = pot.map((p) => p.length);
  console.log(`${judul}: ${halaman ? halaman + " halaman, " : ""}${teks.length} karakter, ${pot.length} potongan (min ${Math.min(...pj)}, maks ${Math.max(...pj)}), gabungan >1 kartu: ${pot.filter((p) => p.includes("\n\n")).length}`);
  dokumen.push({ judul, pot });
}

const { mulaiPg } = await import(pathToFileURL(`${REPO}/uji/pg-lokal.mjs`).href);
const { default: postgres } = await import(pathToFileURL(`${REPO}/node_modules/postgres/src/index.js`).href);
const pg = await mulaiPg({ dir: path.join(SINI, "pg-uji"), sementara: true });
const sql = postgres(pg.url, { max: 1, onnotice: () => {} });
let kode = 0;
try {
  await sql.unsafe(`CREATE TABLE documents (id serial PRIMARY KEY, judul text NOT NULL);
    CREATE TABLE chunks (id serial PRIMARY KEY, document_id integer NOT NULL REFERENCES documents(id), number_id integer NOT NULL, urutan integer NOT NULL, isi text NOT NULL,
      cari tsvector GENERATED ALWAYS AS (to_tsvector('simple', isi)) STORED);
    CREATE INDEX chunks_number_idx ON chunks (number_id, document_id, urutan);
    CREATE INDEX chunks_cari_idx ON chunks USING gin (cari);`);
  for (const d of dokumen) {
    const [{ id }] = await sql`INSERT INTO documents(judul) VALUES (${d.judul}) RETURNING id`;
    for (let i = 0; i < d.pot.length; i++) await sql`INSERT INTO chunks(document_id, number_id, urutan, isi) VALUES (${id}, 1, ${i}, ${d.pot[i]})`;
  }
  await sql`ANALYZE chunks`;

  const ambil = async (pesan) => {
    const cari = kueriCari(pesan);
    let kena = [];
    if (cari) kena = await sql`
      SELECT d.judul, c.isi FROM to_tsquery('simple', ${cari}) q, chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.number_id = 1 AND c.cari @@ q ORDER BY ts_rank(c.cari, q, 1) DESC, c.id LIMIT 14`;
    let anggaran = BATAS_RELEVAN;
    if (!kena.length) {
      kena = await sql`SELECT d.judul, c.isi FROM chunks c JOIN documents d ON d.id = c.document_id WHERE c.number_id = 1 AND c.urutan < 2 ORDER BY d.id, c.urutan LIMIT 8`;
      anggaran = BATAS_TANPA_KUERI;
    }
    const masuk = []; let terpakai = 0;
    for (const k of kena) { if (terpakai + k.isi.length > anggaran && masuk.length) break; masuk.push(k.isi); terpakai += k.isi.length; }
    return { masuk, terpakai, cari };
  };
  const judul = (p) => p.split("\n").slice(0, 2).join(" › ").replace(/^\[|\]/g, "").slice(0, 86);

  const berkasUji = process.argv.slice(2).find((x) => x.endsWith(".json"));
  const uji = berkasUji ? JSON.parse(readFileSync(berkasUji, "utf8")) : [];
  let lolos = 0; const waktu = [];
  for (const u of uji) {
    const t0 = performance.now();
    const { masuk, terpakai } = await ambil(u.q);
    waktu.push(performance.now() - t0);
    // Baris yang membungkus di PDF terekstrak sebagai ganti baris; samakan dulu sebelum membandingkan.
    const rata = (t) => t.replace(/\s+/g, " ").toLowerCase();
    const semua = rata(masuk.join("\n"));
    const ok = (u.harus ?? []).every((h) => semua.includes(h.toLowerCase()));
    const pos = u.harus?.length ? masuk.findIndex((m) => u.harus.every((h) => rata(m).includes(h.toLowerCase()))) + 1 : 0;
    if (ok) lolos++; else kode = 1;
    console.log(`${ok ? "OK   " : "GAGAL"} [${String(masuk.length).padStart(2)} pot, ${String(terpakai).padStart(4)} kar, posisi ${pos || "-"}] ${u.q}`);
    if (!ok || process.argv.includes("--rinci")) masuk.slice(0, 4).forEach((m, i) => console.log(`        ${i + 1}. ${judul(m)}`));
  }
  if (uji.length) {
    waktu.sort((a, b) => a - b);
    console.log(`\nLOLOS ${lolos}/${uji.length} | kueri: median ${waktu[Math.floor(waktu.length / 2)].toFixed(1)} ms, terlama ${waktu.at(-1).toFixed(1)} ms`);
  }
} finally {
  await sql.end();
  await pg.berhenti();
}
process.exit(kode);

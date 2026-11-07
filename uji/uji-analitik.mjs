// Uji analitik perilaku pengguna (src/lib/analitik-def.ts, analitik.ts, analitik-fitur.ts): pemetaan jalur -> pola
// halaman & label aman, kecocokan POLA_HALAMAN dengan berkas page.tsx, kamus kode fitur, buffer catat + tulis
// berkelompok, penerimaan kiriman browser (ukuran, bentuk, laju, batas kunci baru), ringkasan halaman admin, retensi,
// dan kinerja di ~200 ribu baris. PostgreSQL 15 sungguhan (uji/pg-lokal.mjs). Waktu memakai detik epoch tetap supaya
// hasilnya sama setiap kali (kecuali satu pemeriksaan "tanpa waktu = sekarang").
// Pakai (dari akar proyek): node --no-warnings --import ./uji/loader.mjs uji/uji-analitik.mjs
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
// Folder per proses: dua jalannya uji ini bersamaan (sesi/agen lain) tidak saling menghapus folder PostgreSQL-nya.
const tmp = path.join(os.tmpdir(), `wa-uji-analitik-${process.pid}`);
rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(tmp, { recursive: true });
// PostgreSQL dinyalakan sekarang dan baru ditunggu setelah uji murni (bagian 1-3): keduanya berjalan bersamaan.
const pgJanji = mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
pgJanji.catch(() => {}); // galatnya dilaporkan saat ditunggu
process.env.DATA_DIR = path.join(tmp, "data-kosong");
process.env.AUTH_SECRET = "x".repeat(40);
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const mulaiUji = performance.now();
const dtk = () => ((performance.now() - mulaiUji) / 1000).toFixed(1);
const bagian = (judul) => console.log(`== ${judul} == (+${dtk()} dtk)`);
let no = 0;
let lolos = 0;
const gagal = [];
/** Satu pemeriksaan bernomor. Gagal = dicatat lalu lanjut, supaya satu laporan memuat semua yang belum cocok. */
const cek = async (nama, fn) => {
  no += 1;
  try {
    await fn();
    lolos += 1;
    console.log(`  ok  ${no}. ${nama}`);
  } catch (e) {
    gagal.push(`${no}. ${nama}`);
    const isi = String(e?.stack ?? e).split("\n").slice(0, 10).map((s) => `        ${s}`).join("\n");
    console.log(`  GAGAL  ${no}. ${nama}\n${isi}`);
  }
};

// ---------- Waktu (oracle sendiri: aritmetika UTC+7, bukan kode aplikasi) ----------
/** Detik epoch dari tanggal + jam WIB. */
const detikWib = (tgl, jam = "12:00:00") => Date.parse(`${tgl}T${jam}+07:00`) / 1000;
/** Detik epoch -> tanggal WIB "YYYY-MM-DD". */
const tglWib = (detik) => new Date((detik + 7 * 3600) * 1000).toISOString().slice(0, 10);
/** Tanggal "YYYY-MM-DD" digeser n hari. */
const geser = (tgl, n) => new Date(Date.parse(`${tgl}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const deretHari = (akhir, n) => Array.from({ length: n }, (_, i) => geser(akhir, i - n + 1));
const baris = (tanggal, jenis, kunci, label, user_id, n, terakhir) => ({ tanggal, jenis, kunci, label, user_id, n, terakhir });

let pg = null;
let sql = null;
try {
  const D = await lib("src/lib/analitik-def.ts");
  const { polaJalur, labelAman, polaDinamis, POLA_HALAMAN, HALAMAN_PUBLIK, KODE_FITUR, MAKS_PANJANG_LABEL, MAKS_BYTE_KIRIM, MAKS_EVENT_PER_KIRIM, RETENSI_HARI, ANONIM } = D;

  // =====================================================================================================
  bagian("1. polaJalur & labelAman");
  await cek("polaJalur: id dinamis, awalan /eng, ?query & #hash, URL absolut, garis miring di akhir", async () => {
    const kasus = [
      ["/", "/"],
      ["/eng", "/"],
      ["/eng/", "/"],
      ["/eng?ref=iklan", "/"],
      ["/?a=/nomor/1", "/"],
      ["/dashboard", "/dashboard"],
      ["/dashboard/", "/dashboard"],
      ["/eng/dashboard", "/dashboard"],
      ["/nomor/12", "/nomor/[id]"],
      ["/nomor/abc-DEF_9", "/nomor/[id]"],
      ["/nomor/12/", "/nomor/[id]"],
      ["/eng/nomor/12?x=1", "/nomor/[id]"], // contoh di dokumentasi polaJalur
      ["/langganan/bayar/pro-bulanan", "/langganan/bayar/[paket]"],
      ["/langganan/tagihan/WA-6-1793", "/langganan/tagihan/[order]"],
      ["/admin/pengguna", "/admin/pengguna"],
      ["/admin/pengguna/7", "/admin/pengguna/[id]"],
      ["/eng/admin/transaksi/ADM-12", "/admin/transaksi/[order]"],
      ["/login?lanjut=%2Fdashboard", "/login"],
      ["/daftar#form", "/daftar"],
      ["/akun?tab=1#x", "/akun"],
      ["https://chatgercep.com/eng/nomor/5?tab=ai#log", "/nomor/[id]"],
      ["https://chatgercep.com", "/"],
      ["http://localhost:3000/admin", "/admin"],
      [`/dashboard?${"x".repeat(150)}`, "/dashboard"],
    ];
    for (const [j, harap] of kasus) assert.equal(polaJalur(j), harap, `polaJalur(${JSON.stringify(j).slice(0, 60)})`);
    assert.equal(polaDinamis("/nomor/[id]"), true);
    assert.equal(polaDinamis("/dashboard"), false);
  });

  await cek("polaJalur: jalur asing / tak sah -> null (ruang kunci tetap terbatas walau klien mengirim sembarang)", async () => {
    const asing = [
      "", null, undefined, 42, {}, "dashboard", "nomor/12", "/tidak-ada", "/nomor", "/nomor/12/ubah", "/langganan/bayar",
      "/api/analitik", "/_next/static/chunks/app.js", "/wp-login.php", "/favicon.ico", "/engx/dashboard", "/english",
      "/nomor/../admin", "/a/b/c/d/e/f", `/dashboard?${"x".repeat(5000)}`, "https://penipu.test/../../etc/passwd",
    ];
    for (const j of asing) assert.equal(polaJalur(j), null, `polaJalur(${JSON.stringify(j)?.slice(0, 60)})`);
  });

  const kasusLabel = [
    [null, ""],
    [undefined, ""],
    [123, ""],
    ["", ""],
    [" \n\t ", ""],
    ["  Simpan   perubahan \n", "Simpan perubahan"],
    ["Simpan\u0000", "Simpan"],
    ["budi@contoh.com", "[email]"],
    ["Kirim ke Budi.S@mail.co.id sekarang", "Kirim ke [email] sekarang"],
    ["0812-3456-7890", "[nomor]"],
    ["+62 812 3456 7890", "[nomor]"],
    ["Hubungi 6281234567890", "Hubungi [nomor]"],
    ["Telp 021 5551 2345", "Telp [nomor]"],
    ["Pesanan 123456", "Pesanan #"],
    ["ID 98765 dan 1234", "ID # dan 1234"],
    ["Rp249.000", "Rp249.000"],
    ["30 hari", "30 hari"],
    ["Paket 3 bulan Rp 1.499.000", "Paket 3 bulan Rp 1.499.000"],
  ];
  await cek("labelAman: spasi dirapikan, email -> [email], telepon (>= 8 digit) -> [nomor], angka >= 5 digit -> #, angka pendek dibiarkan", async () => {
    for (const [teks, harap] of kasusLabel) assert.equal(labelAman(teks), harap, `labelAman(${JSON.stringify(teks)})`);
  });

  await cek("labelAman: tanpa karakter kendali/<>, maksimal MAKS_PANJANG_LABEL huruf (bukan unit UTF-16), idempoten", async () => {
    const pas = "x".repeat(MAKS_PANJANG_LABEL);
    assert.equal(labelAman(pas), pas, "tepat di batas: utuh");
    const potong = labelAman("x".repeat(MAKS_PANJANG_LABEL + 1));
    assert.equal(Array.from(potong).length, MAKS_PANJANG_LABEL);
    assert.ok(potong.endsWith("…"), "dipotong dengan elipsis");
    const sulit = [
      "a\u0000b\u001fc\u007fd",
      "<b>Tebal</b><script>alert(1)</script>",
      "kata ".repeat(30),
      "😀".repeat(70),
      `Chat 081234567890 / budi@contoh.id ${"a".repeat(100)}`,
      ...kasusLabel.map(([t]) => t),
    ];
    for (const s of sulit) {
      const o = labelAman(s);
      const k = JSON.stringify(s)?.slice(0, 40);
      assert.ok(Array.from(o).length <= MAKS_PANJANG_LABEL, `terlalu panjang: ${k}`);
      assert.doesNotMatch(o, /[\u0000-\u001f\u007f<>]/, `karakter kendali/<> tersisa: ${k}`);
      assert.doesNotMatch(o, /\d{5,}|@/, `angka panjang/email tersisa: ${k}`);
      assert.doesNotMatch(o, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/, `emoji terpotong di tengah: ${k}`);
      assert.equal(labelAman(o), o, `tidak idempoten (server menyaring ulang label dari browser): ${k}`);
    }
  });

  // =====================================================================================================
  bagian("2. POLA_HALAMAN <-> page.tsx");
  /** Pola rute dari folder src/app/[lang]: (grup) & @slot tidak masuk URL, _privat bukan rute. */
  function polaDariPage() {
    const hasil = new Map();
    (function jalan(dir, seg) {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) {
          if (ent.name.startsWith("_")) continue;
          const lewati = /^\(.*\)$/.test(ent.name) || ent.name.startsWith("@");
          jalan(path.join(dir, ent.name), lewati ? seg : [...seg, ent.name]);
        } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(ent.name)) {
          hasil.set(seg.length ? `/${seg.join("/")}` : "/", path.relative(akar, path.join(dir, ent.name)).replaceAll("\\", "/"));
        }
      }
    })(path.join(akar, "src", "app", "[lang]"), []);
    return hasil;
  }
  const halamanBerkas = polaDariPage();

  await cek("setiap page.tsx di src/app/[lang] punya pola di POLA_HALAMAN dan sebaliknya; tiap pola dipetakan ke dirinya sendiri", async () => {
    assert.ok(halamanBerkas.size >= 20, `hanya ${halamanBerkas.size} page.tsx ditemukan: folder salah?`);
    assert.equal(new Set(POLA_HALAMAN).size, POLA_HALAMAN.length, "POLA_HALAMAN berisi duplikat");
    const belum = [...halamanBerkas].filter(([p]) => !POLA_HALAMAN.includes(p)).map(([p, f]) => `${p} (${f})`);
    assert.deepEqual(belum, [], `halaman baru belum didaftarkan di POLA_HALAMAN (src/lib/analitik-def.ts): ${belum.join(", ")}`);
    const yatim = POLA_HALAMAN.filter((p) => !halamanBerkas.has(p));
    assert.deepEqual(yatim, [], `POLA_HALAMAN memuat pola tanpa page.tsx: ${yatim.join(", ")}`);
    for (const pola of POLA_HALAMAN) {
      const contoh = pola.replace(/\[[^\]]+\]/g, "contoh-12");
      assert.equal(polaJalur(pola), pola, `pola literal ${pola}`);
      assert.equal(polaJalur(contoh), pola, `jalur ${contoh} (pola lain menutupinya?)`);
      assert.equal(polaJalur(`/eng${contoh === "/" ? "" : contoh}?q=1`), pola, `jalur /eng${contoh}`);
    }
  });

  await cek("HALAMAN_PUBLIK bagian dari POLA_HALAMAN dan bukan halaman ber-login ((app)/(admin))", async () => {
    assert.ok(HALAMAN_PUBLIK.length > 0);
    for (const p of HALAMAN_PUBLIK) {
      assert.ok(halamanBerkas.has(p), `${p} tidak punya page.tsx`);
      assert.doesNotMatch(halamanBerkas.get(p), /\/\((app|admin)\)\//, `${p} ada di grup ber-login: ${halamanBerkas.get(p)}`);
    }
  });

  // =====================================================================================================
  bagian("3. kode fitur (catatFitur)");
  /**
   * Semua kode yang bisa sampai ke catatFitur(userId, kode) di src/**: literal langsung, ternary dua literal, konstanta,
   * dan lewat fungsi pembungkus (mis. catatBila(h, id, "nomor.tambah")) yang meneruskan parameternya. Dibaca lewat AST
   * TypeScript, bukan regex, supaya tanda kurung/string bersarang tidak mengecoh.
   */
  function kodeFiturDiSrc() {
    const ts = createRequire(import.meta.url)("typescript");
    const temuan = [];
    const masalah = [];
    const berkasPakai = new Set();
    for (const relOs of readdirSync(path.join(akar, "src"), { recursive: true })) {
      if (!/\.(ts|tsx)$/.test(relOs)) continue;
      const berkas = path.join(akar, "src", relOs);
      const teks = readFileSync(berkas, "utf8");
      if (!teks.includes("catatFitur")) continue;
      const sf = ts.createSourceFile(berkas, teks, ts.ScriptTarget.Latest, true, berkas.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const rel = path.relative(akar, berkas).replaceAll("\\", "/");
      const letak = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
      const panggilan = [];
      const konstanta = new Map();
      (function jalan(n) {
        if (ts.isCallExpression(n)) panggilan.push(n);
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) konstanta.set(n.name.text, n.initializer);
        ts.forEachChild(n, jalan);
      })(sf);
      const namaPanggil = (c) => (ts.isIdentifier(c.expression) ? c.expression.text : ts.isPropertyAccessExpression(c.expression) ? c.expression.name.text : null);
      const namaFungsi = (fn) =>
        fn.name && ts.isIdentifier(fn.name) ? fn.name.text : fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : null;
      const ringkas = (n) => `${letak(n)}: ${n.getText(sf).replace(/\s+/g, " ").slice(0, 90)}`;
      /**
       * Ekspresi asal yang mungkin untuk e: parameter fungsi -> argumen di setiap pemanggilan fungsi itu (dalam berkas
       * yang sama), konstanta -> nilai awalnya. null = tidak bisa dilacak.
       */
      const asal = (e, dalam) => {
        if (dalam > 8) return null;
        if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || (ts.isSatisfiesExpression?.(e) ?? false)) return asal(e.expression, dalam + 1);
        if (!ts.isIdentifier(e)) return [e];
        for (let p = e.parent; p; p = p.parent) {
          if (!ts.isFunctionLike(p) || !p.parameters) continue;
          const i = p.parameters.findIndex((q) => ts.isIdentifier(q.name) && q.name.text === e.text);
          if (i < 0) continue;
          const nama = namaFungsi(p);
          if (!nama) return null;
          const hasil = [];
          for (const c of panggilan) {
            if (namaPanggil(c) !== nama) continue;
            const a = c.arguments[i] ? asal(c.arguments[i], dalam + 1) : null;
            if (a) hasil.push(...a);
            else masalah.push(ringkas(c));
          }
          return hasil;
        }
        const awal = konstanta.get(e.text);
        return awal ? asal(awal, dalam + 1) : null;
      };
      /** Kode literal yang mungkin dihasilkan ekspresi (string, ternary, elemen tuple [id, "kode"]); null = tidak pasti. */
      const literal = (e, dalam) => {
        const daftar = asal(e, dalam);
        if (!daftar) return null;
        const hasil = [];
        for (const x of daftar) {
          if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) hasil.push({ kode: x.text, letak: letak(x) });
          else if (ts.isConditionalExpression(x)) {
            const a = literal(x.whenTrue, dalam + 1);
            const b = literal(x.whenFalse, dalam + 1);
            if (!a || !b) return null;
            hasil.push(...a, ...b);
          } else if (ts.isElementAccessExpression(x) && ts.isNumericLiteral(x.argumentExpression)) {
            const wadah = asal(x.expression, dalam + 1);
            if (!wadah) return null;
            for (const w of wadah) {
              const el = ts.isArrayLiteralExpression(w) ? w.elements[Number(x.argumentExpression.text)] : null;
              const l = el ? literal(el, dalam + 1) : null;
              if (!l) {
                masalah.push(ringkas(w));
                continue;
              }
              hasil.push(...l);
            }
          } else return null;
        }
        return hasil;
      };
      for (const c of panggilan) {
        if (namaPanggil(c) !== "catatFitur") continue;
        berkasPakai.add(rel);
        const l = c.arguments[1] ? literal(c.arguments[1], 0) : null;
        if (l) temuan.push(...l);
        else masalah.push(ringkas(c));
      }
    }
    return { temuan, masalah, berkas: [...berkasPakai] };
  }

  let F = null;
  await cek("setiap kode catatFitur(…, \"kode\") di src/ (langsung atau lewat pembungkus) sah KODE_FITUR dan ada di NAMA_FITUR", async () => {
    F = await lib("src/lib/analitik-fitur.ts");
    const { temuan, masalah, berkas } = kodeFiturDiSrc();
    assert.deepEqual(masalah, [], `kode fitur tidak bisa diperiksa statis (pakai literal string):\n  ${masalah.join("\n  ")}`);
    const kode = new Set(temuan.map((t) => t.kode));
    assert.ok(kode.has("akun.masuk") && kode.has("akun.daftar"), "login (akun.masuk) & daftar (akun.daftar) wajib dicatat");
    const salah = temuan.filter((t) => !KODE_FITUR.test(t.kode)).map((t) => `${t.kode} (${t.letak})`);
    assert.deepEqual(salah, [], `kode tidak cocok KODE_FITUR: ${salah.join(", ")}`);
    const takTerdaftar = temuan.filter((t) => !Object.hasOwn(F.NAMA_FITUR, t.kode)).map((t) => `${t.kode} (${t.letak})`);
    assert.deepEqual(takTerdaftar, [], `kode belum ada di NAMA_FITUR (src/lib/analitik-fitur.ts): ${takTerdaftar.join(", ")}`);
    console.log(`      ${kode.size} kode fitur dari ${temuan.length} pemanggilan di ${berkas.length} berkas: ${berkas.join(", ")}`);
  });

  await cek("NAMA_FITUR: kunci sah KODE_FITUR & bernama; namaFitur(kode tak dikenal) = kode apa adanya; GRUP_FITUR (bila ada) mencakup semua grup", async () => {
    F ??= await lib("src/lib/analitik-fitur.ts");
    const entri = Object.entries(F.NAMA_FITUR);
    assert.ok(entri.length > 0);
    for (const [k, v] of entri) {
      assert.match(k, KODE_FITUR, `kunci NAMA_FITUR tak sah: ${k}`);
      assert.ok(typeof v === "string" && v.trim() && v !== k, `nama ramah kosong untuk ${k}`);
      assert.equal(F.namaFitur(k), v);
    }
    assert.equal(F.namaFitur("tidak.ada_di_kamus"), "tidak.ada_di_kamus");
    if (F.GRUP_FITUR) {
      const grupHilang = [...new Set(entri.map(([k]) => k.split(".")[0]))].filter((g) => !Object.hasOwn(F.GRUP_FITUR, g));
      assert.deepEqual(grupHilang, [], `grup tanpa nama di GRUP_FITUR: ${grupHilang.join(", ")}`);
    }
  });

  // =====================================================================================================
  pg = await pgJanji;
  process.env.DATABASE_URL = pg.url;
  const { db } = await lib("src/lib/db.ts");
  sql = await db();
  console.log(`   (PostgreSQL + migrasi siap pada +${dtk()} dtk)`);

  let A = null;
  await cek("src/lib/analitik.ts bisa diimpor (API kontrak lengkap) & tabel analitik_harian (migrasi v29) sesuai skema", async () => {
    A = await lib("src/lib/analitik.ts");
    for (const f of ["catat", "catatFitur", "tulisTuntasAnalitik", "mulaiAnalitik", "hapusAnalitikKedaluwarsa", "terimaKiriman", "ringkasanAnalitik"]) {
      assert.equal(typeof A[f], "function", `ekspor ${f} tidak ada`);
    }
    const kolom = await sql`
      SELECT column_name AS nama, data_type AS tipe, is_nullable AS boleh_null FROM information_schema.columns
      WHERE table_name = 'analitik_harian' ORDER BY ordinal_position`;
    assert.deepEqual(kolom.map((k) => [k.nama, k.tipe, k.boleh_null]), [
      ["tanggal", "date", "NO"],
      ["jenis", "smallint", "NO"],
      ["kunci", "text", "NO"],
      ["label", "text", "NO"],
      ["user_id", "integer", "NO"],
      ["n", "integer", "NO"],
      ["terakhir", "bigint", "NO"],
    ]);
  });

  if (!A) {
    console.log("  -- bagian 4-8 dilewati: src/lib/analitik.ts / tabel analitik_harian belum siap");
    gagal.push("bagian 4-8 dilewati");
  } else {
    const isi = async () =>
      (await sql`SELECT tanggal::text AS tanggal, jenis, kunci, label, user_id, n, terakhir FROM analitik_harian ORDER BY user_id, jenis, kunci, label, tanggal`).map((r) => ({ ...r }));
    /** Tuntaskan sisa buffer pemeriksaan sebelumnya lalu kosongkan tabel: tiap pemeriksaan berdiri sendiri. */
    const kosongkan = async () => {
      await A.tulisTuntasAnalitik();
      await sql`TRUNCATE analitik_harian`;
    };
    /** Rekam teks + parameter setiap query yang dikirim postgres.js selama fn berjalan (opsi `debug` dibaca per query). */
    const rekam = async (fn) => {
      const q = [];
      const lama = sql.options.debug;
      sql.options.debug = (_id, teks, param) => q.push({ teks, param: [...param] });
      try {
        await fn();
      } finally {
        sql.options.debug = lama;
      }
      return q;
    };
    /** Rata-rata ms `ulang` kali; `panaskan` = satu putaran awal tak dihitung (rencana query & koneksi siap). */
    const ukur = async (nama, fn, ulang, panaskan = true) => {
      if (panaskan) await fn(-1);
      const t0 = performance.now();
      for (let i = 0; i < ulang; i++) await fn(i);
      const ms = (performance.now() - t0) / ulang;
      console.log(`      ${nama}: ${ms.toFixed(2)} ms (rata-rata ${ulang}x)`);
      return ms;
    };

    // ===================================================================================================
    bagian("4. catat + tulisTuntasAnalitik");
    const T = detikWib("2026-11-05", "10:00:00");

    await cek("n dijumlahkan per (tanggal, jenis, kunci, label, akun); terakhir = waktu terbesar, bukan yang terakhir datang", async () => {
      await kosongkan();
      A.catat(501, 0, "/dashboard", undefined, T + 50);
      A.catat(501, 0, "/dashboard", undefined, T + 90);
      A.catat(501, 0, "/dashboard", undefined, T + 10);
      A.catat(501, 1, "/dashboard", "Tambah nomor", T + 20);
      A.catat(501, 1, "/dashboard", "Tambah nomor", T + 30);
      A.catat(501, 1, "/dashboard", "Hapus", T + 40);
      A.catat(502, 0, "/dashboard", undefined, T + 5);
      A.catat(ANONIM, 0, "/", undefined, T + 7);
      await A.tulisTuntasAnalitik();
      assert.deepEqual(await isi(), [
        baris("2026-11-05", 0, "/", "", 0, 1, T + 7),
        baris("2026-11-05", 0, "/dashboard", "", 501, 3, T + 90),
        baris("2026-11-05", 1, "/dashboard", "Hapus", 501, 1, T + 40),
        baris("2026-11-05", 1, "/dashboard", "Tambah nomor", 501, 2, T + 30),
        baris("2026-11-05", 0, "/dashboard", "", 502, 1, T + 5),
      ]);
    });

    await cek("tulis kedua meng-upsert (n bertambah, terakhir tidak turun oleh event lebih lama); buffer kosong setelah tulis", async () => {
      await kosongkan();
      A.catat(503, 0, "/akun", undefined, T + 90);
      A.catat(503, 1, "/akun", "Simpan", T + 10);
      await A.tulisTuntasAnalitik();
      const awal = await isi();
      await A.tulisTuntasAnalitik(); // buffer sudah kosong: tidak ada yang berubah
      assert.deepEqual(await isi(), awal, "tulis ulang tanpa event baru mengubah tabel (buffer tidak dikosongkan?)");
      A.catat(503, 0, "/akun", undefined, T + 60); // lebih lama dari T+90 yang sudah tersimpan
      A.catat(503, 0, "/akun", undefined, T + 70);
      A.catat(503, 1, "/akun", "Simpan", T + 400);
      await A.tulisTuntasAnalitik();
      const akhir = await isi();
      assert.deepEqual(akhir, [baris("2026-11-05", 0, "/akun", "", 503, 3, T + 90), baris("2026-11-05", 1, "/akun", "Simpan", 503, 2, T + 400)]);
      await A.tulisTuntasAnalitik();
      assert.deepEqual(await isi(), akhir);
    });

    await cek("event yang dicatat saat tulis sedang berjalan tidak hilang; dua tulis serentak tidak menggandakan", async () => {
      await kosongkan();
      for (let i = 0; i < 100; i++) A.catat(504, 0, "/akun", undefined, T);
      const p1 = A.tulisTuntasAnalitik();
      const p2 = A.tulisTuntasAnalitik();
      A.catat(504, 0, "/akun", undefined, T + 1); // masuk ketika p1/p2 belum selesai
      await Promise.all([p1, p2]);
      await A.tulisTuntasAnalitik();
      assert.deepEqual(await isi(), [baris("2026-11-05", 0, "/akun", "", 504, 101, T + 1)]);
    });

    await cek("tanggal WIB di sekitar tengah malam: 23:59:59 WIB masih hari itu, 00:00:00 WIB sudah besok (termasuk ganti tahun)", async () => {
      await kosongkan();
      const tengahMalam = Date.UTC(2026, 10, 6, 17, 0, 0) / 1000; // 2026-11-07 00:00:00 WIB
      A.catat(505, 0, "/akun", undefined, tengahMalam - 1); // 2026-11-06 23:59:59 WIB
      A.catat(505, 0, "/akun", undefined, tengahMalam); //       2026-11-07 00:00:00 WIB
      A.catat(505, 0, "/akun", undefined, Date.UTC(2026, 10, 5, 23, 30) / 1000); // UTC masih 11-05, WIB 11-06 06:30
      A.catat(505, 0, "/akun", undefined, Date.UTC(2026, 10, 6, 0, 0) / 1000); // 2026-11-06 07:00 WIB
      A.catat(505, 0, "/dashboard", undefined, Date.UTC(2026, 11, 31, 16, 59, 59) / 1000); // 2026-12-31 23:59:59 WIB
      A.catat(505, 0, "/dashboard", undefined, Date.UTC(2026, 11, 31, 17, 0, 0) / 1000); // 2027-01-01 00:00:00 WIB
      await A.tulisTuntasAnalitik();
      assert.deepEqual(
        (await isi()).map((r) => [r.kunci, r.tanggal, r.n]),
        [
          ["/akun", "2026-11-06", 3],
          ["/akun", "2026-11-07", 1],
          ["/dashboard", "2026-12-31", 1],
          ["/dashboard", "2027-01-01", 1],
        ],
      );
      // Tanpa waktu = sekarang (tanggal WIB hari ini).
      await sql`TRUNCATE analitik_harian`;
      const sebelum = Math.floor(Date.now() / 1000);
      A.catat(505, 0, "/akun");
      await A.tulisTuntasAnalitik();
      const sesudah = Math.ceil(Date.now() / 1000);
      const [r] = await isi();
      assert.ok([tglWib(sebelum), tglWib(sesudah)].includes(r.tanggal), `tanggal ${r.tanggal}`);
      assert.ok(r.terakhir >= sebelum && r.terakhir <= sesudah, `terakhir ${r.terakhir} bukan detik epoch sekarang`);
    });

    await cek("catat/catatFitur tidak pernah melempar; masukan tak sah dibuang tanpa meracuni tulis berkelompok; catatFitur hanya kode sah", async () => {
      await kosongkan();
      assert.doesNotThrow(() => {
        A.catat(506, 9, "/akun", undefined, T); //             jenis di luar 0/1/2 (CHECK)
        A.catat(506, -1, "/akun", undefined, T);
        A.catat(506, 0, null, undefined, T); //                 kunci NOT NULL
        A.catat(506, 0, undefined, undefined, T);
        A.catat(Number.NaN, 0, "/akun", undefined, T); //       user_id integer
        A.catat(1.5, 0, "/akun", undefined, T);
      });
      A.catat(506, 0, "/akun", undefined, T);
      for (const k of ["", "Nomor.Tambah", "nomor tambah", ".awal", "a", "x".repeat(61), "nomor/tambah", null, undefined, 5]) {
        assert.doesNotThrow(() => A.catatFitur(506, k));
      }
      A.catatFitur(506, "nomor.tambah");
      A.catatFitur(506, "nomor.tambah");
      await A.tulisTuntasAnalitik(); // tidak boleh gagal karena satu event rusak
      const r = await isi();
      assert.deepEqual(
        r.map((x) => [x.jenis, x.kunci, x.label, x.user_id, x.n]),
        [
          [0, "/akun", "", 506, 1],
          [2, "nomor.tambah", "", 506, 2],
        ],
      );
    });

    await cek("tulis berkelompok: 2.000 kunci buffer = paling banyak 2 pernyataan INSERT (bukan satu per baris)", async () => {
      await kosongkan();
      for (let u = 0; u < 20; u++) for (let i = 0; i < 100; i++) A.catat(800 + u, 1, "/dashboard", `Tombol ${i}`, T);
      const t0 = performance.now();
      const q = await rekam(() => A.tulisTuntasAnalitik());
      const ms = performance.now() - t0;
      const insert = q.filter((x) => /\binsert\s+into\s+analitik_harian\b/i.test(x.teks));
      assert.ok(insert.length >= 1 && insert.length <= 2, `${insert.length} pernyataan INSERT untuk 2.000 kunci`);
      const [{ jumlah, total }] = await sql`SELECT COUNT(*)::int AS jumlah, SUM(n)::int AS total FROM analitik_harian`;
      assert.deepEqual([jumlah, total], [2000, 2000]);
      console.log(`      tulis 2.000 kunci: ${ms.toFixed(1)} ms, ${insert.length} INSERT, ${q.length} query total`);
    });

    // ===================================================================================================
    bagian("5. terimaKiriman (POST /api/analitik)");
    const KK = detikWib("2026-11-05", "10:00:00");
    const tglK = tglWib(KK);
    const kirim = (e, { userId = 601, ip = "203.0.113.9", kini = KK } = {}) => {
      const h = A.terimaKiriman({ teks: typeof e === "string" ? e : JSON.stringify({ e }), userId, ip, kini });
      return { status: h.status, diterima: h.diterima };
    };

    await cek("204: jalur -> pola, label hanya untuk klik, terakhir = kini, diterima = jumlah event tercatat", async () => {
      await kosongkan();
      const h = kirim([[0, "/eng/nomor/12?tab=ai"], [1, "/nomor/12", "Simpan"], [0, "/dashboard", "label halaman diabaikan"], [1, "/dashboard#x", "Simpan"]]);
      assert.deepEqual(h, { status: 204, diterima: 4 });
      await A.tulisTuntasAnalitik();
      assert.deepEqual(await isi(), [
        baris(tglK, 0, "/dashboard", "", 601, 1, KK),
        baris(tglK, 0, "/nomor/[id]", "", 601, 1, KK),
        baris(tglK, 1, "/dashboard", "Simpan", 601, 1, KK),
        baris(tglK, 1, "/nomor/[id]", "Simpan", 601, 1, KK),
      ]);
    });

    await cek("400: JSON rusak / bukan bentuk {e:[...]} / lebih dari MAKS_EVENT_PER_KIRIM event; tepat di batas = 204", async () => {
      await kosongkan();
      const rusak = ["", "bukan json", "{", "null", "[]", '"teks"', "123", "{}", '{"e":"x"}', '{"e":{}}', '{"x":[]}', JSON.stringify({ e: Array(MAKS_EVENT_PER_KIRIM + 1).fill([0, "/dashboard"]) })];
      for (const t of rusak) assert.deepEqual(kirim(t, { userId: 611 }), { status: 400, diterima: 0 }, `teks ${t.slice(0, 40)}`);
      assert.deepEqual(kirim(Array(MAKS_EVENT_PER_KIRIM).fill([0, "/dashboard"]), { userId: 611 }), { status: 204, diterima: MAKS_EVENT_PER_KIRIM });
      await A.tulisTuntasAnalitik();
      assert.deepEqual((await isi()).map((r) => [r.kunci, r.user_id, r.n]), [["/dashboard", 611, MAKS_EVENT_PER_KIRIM]], "kiriman 400 ikut tercatat");
    });

    await cek("413: lebih dari MAKS_BYTE_KIRIM byte UTF-8 (bukan jumlah huruf) ditolak utuh; tepat di batas diterima", async () => {
      await kosongkan();
      const dasar = JSON.stringify({ e: [[0, "/"]] });
      const pas = dasar + " ".repeat(MAKS_BYTE_KIRIM - Buffer.byteLength(dasar)); // spasi di akhir tetap JSON sah
      assert.equal(Buffer.byteLength(pas), MAKS_BYTE_KIRIM);
      assert.deepEqual(kirim(pas, { userId: 621 }), { status: 204, diterima: 1 });
      assert.deepEqual(kirim(`${pas} `, { userId: 621 }), { status: 413, diterima: 0 });
      const multibyte = JSON.stringify({ e: [[1, "/dashboard", "€".repeat(2800)]] }); // ±2.830 huruf, ±8.430 byte
      assert.ok(multibyte.length < MAKS_BYTE_KIRIM && Buffer.byteLength(multibyte) > MAKS_BYTE_KIRIM);
      assert.deepEqual(kirim(multibyte, { userId: 621 }), { status: 413, diterima: 0 });
      assert.deepEqual(kirim("x".repeat(100_000), { userId: 621 }), { status: 413, diterima: 0 }, "ukuran diperiksa sebelum JSON");
      await A.tulisTuntasAnalitik();
      assert.deepEqual((await isi()).map((r) => [r.jenis, r.kunci, r.n]), [[0, "/", 1]]);
    });

    await cek("anonim (userId null): hanya event di HALAMAN_PUBLIK yang dicatat, sebagai user_id 0", async () => {
      await kosongkan();
      const h = kirim(
        [
          [0, "/"],
          [0, "/eng/login?lanjut=/dashboard"],
          [1, "/daftar", "Daftar gratis"],
          [0, "/dashboard"],
          [1, "/nomor/3", "Simpan"],
          [0, "/admin"],
          [0, "/program-afiliasi"],
          [1, "https://chatgercep.com/lupa-password", "Kirim kode"],
        ],
        { userId: null, ip: "203.0.113.50" },
      );
      assert.deepEqual(h, { status: 204, diterima: 5 });
      await A.tulisTuntasAnalitik();
      assert.deepEqual(
        (await isi()).map((r) => [r.jenis, r.kunci, r.label, r.user_id]),
        [
          [0, "/", "", 0],
          [0, "/login", "", 0],
          [0, "/program-afiliasi", "", 0],
          [1, "/daftar", "Daftar gratis", 0],
          [1, "/lupa-password", "Kirim kode", 0],
        ],
      );
    });

    await cek("jalur asing dibuang (204, diterima 0, tabel tetap kosong)", async () => {
      await kosongkan();
      const h = kirim([[0, "/wp-login.php"], [0, "/api/analitik"], [1, "/nomor", "x"], [0, "/nomor/1/2"], [0, "/eng/tidak-ada"], [0, "https://penipu.test/../../etc/passwd"]], { userId: 631 });
      assert.deepEqual(h, { status: 204, diterima: 0 });
      await A.tulisTuntasAnalitik();
      assert.deepEqual(await isi(), []);
    });

    await cek("label klik disaring ulang di server dengan labelAman (browser tidak dipercaya)", async () => {
      await kosongkan();
      const mentah = [`Chat 081234567890 / budi@contoh.id <b>x</b>\u0000 ${"a".repeat(100)}`, "Pesanan 1234567", "  Simpan  "];
      assert.equal(kirim(mentah.map((l) => [1, "/dashboard", l]), { userId: 641 }).status, 204);
      await A.tulisTuntasAnalitik();
      const label = (await isi()).map((r) => r.label).sort();
      assert.deepEqual(label, mentah.map((l) => labelAman(l)).sort());
      for (const l of label) {
        assert.ok(Array.from(l).length <= MAKS_PANJANG_LABEL);
        assert.doesNotMatch(l, /\d{5,}|@|[<>\u0000-\u001f]/);
      }
    });

    const KL = detikWib("2026-11-04", "09:00:00");
    await cek("429 akun: 240 event/menit per akun (6 x 40 lolos, ke-7 ditolak & tidak tercatat); akun lain & menit berikutnya tidak terpengaruh", async () => {
      await kosongkan();
      const paket = Array(40).fill([0, "/dashboard"]);
      for (let i = 0; i < 6; i++) assert.deepEqual(kirim(paket, { userId: 651, kini: KL + i }), { status: 204, diterima: 40 }, `kiriman ke-${i + 1}`);
      assert.deepEqual(kirim(paket, { userId: 651, kini: KL + 6 }), { status: 429, diterima: 0 });
      assert.deepEqual(kirim([[0, "/dashboard"]], { userId: 651, kini: KL + 7 }), { status: 429, diterima: 0 });
      assert.equal(kirim(paket, { userId: 652, kini: KL + 7 }).status, 204, "akun lain di menit yang sama");
      assert.equal(kirim([[0, "/dashboard"]], { userId: 651, kini: KL + 120 }).status, 204, "dua menit kemudian");
      await A.tulisTuntasAnalitik();
      assert.deepEqual((await isi()).map((r) => [r.user_id, r.n]), [[651, 241], [652, 40]]);
    });

    await cek("429 anonim: 60 event/menit per IP; IP lain dan akun ber-login dari IP yang sama tidak terpengaruh", async () => {
      await kosongkan();
      const ip = "198.51.100.7";
      assert.equal(kirim(Array(40).fill([0, "/"]), { userId: null, ip, kini: KL }).status, 204);
      assert.equal(kirim(Array(20).fill([0, "/"]), { userId: null, ip, kini: KL + 1 }).status, 204);
      assert.deepEqual(kirim([[0, "/"]], { userId: null, ip, kini: KL + 2 }), { status: 429, diterima: 0 });
      assert.equal(kirim([[0, "/"]], { userId: null, ip: "198.51.100.8", kini: KL + 2 }).status, 204, "IP lain");
      assert.equal(kirim([[0, "/dashboard"]], { userId: 653, ip, kini: KL + 2 }).status, 204, "akun ber-login dari IP yang sama");
      assert.equal(kirim([[0, "/"]], { userId: null, ip, kini: KL + 120 }).status, 204, "dua menit kemudian");
      await A.tulisTuntasAnalitik();
      assert.deepEqual((await isi()).map((r) => [r.user_id, r.kunci, r.n]), [[0, "/", 62], [653, "/dashboard", 1]]);
    });

    await cek("batas kunci baru per akun per hari = 400: kunci lama tetap bertambah, hari berikutnya mulai lagi", async () => {
      await kosongkan();
      const KC = detikWib("2026-11-03", "08:00:00");
      for (let c = 0; c < 12; c++) {
        const e = Array.from({ length: 40 }, (_, i) => [1, "/dashboard", `Tombol ${c * 40 + i + 1}`]);
        const h = kirim(e, { userId: 661, kini: KC + c * 120 }); // 2 menit sekali: di bawah batas laju
        if (c < 10) assert.deepEqual(h, { status: 204, diterima: 40 }, `kiriman ke-${c + 1}`);
      }
      assert.equal(kirim([[1, "/dashboard", "Tombol 1"]], { userId: 661, kini: KC + 13 * 120 }).status, 204);
      assert.equal(kirim([[1, "/dashboard", "Tombol besok"]], { userId: 661, kini: KC + 86_400 }).status, 204);
      await A.tulisTuntasAnalitik();
      const r = await isi();
      const hari1 = r.filter((x) => x.tanggal === "2026-11-03");
      assert.equal(hari1.length, 400, `${hari1.length} kunci berbeda untuk satu akun dalam sehari`);
      assert.deepEqual(new Set(hari1.map((x) => x.label)), new Set(Array.from({ length: 400 }, (_, i) => `Tombol ${i + 1}`)), "yang disimpan = 400 kunci pertama");
      assert.equal(hari1.find((x) => x.label === "Tombol 1").n, 2, "kunci yang sudah ada tetap dihitung setelah batas");
      assert.deepEqual(r.filter((x) => x.tanggal === "2026-11-04").map((x) => x.label), ["Tombol besok"]);
    });

    await cek("batas kunci baru anonim = 2.000 per hari (total semua IP)", async () => {
      await kosongkan();
      const KA = detikWib("2026-11-02", "08:00:00");
      for (let ip = 0; ip < 52; ip++) {
        const e = Array.from({ length: 40 }, (_, i) => [1, "/", `Label ${ip * 40 + i + 1}`]);
        kirim(e, { userId: null, ip: `192.0.2.${ip + 1}`, kini: KA });
      }
      assert.equal(kirim([[1, "/", "Label 1"]], { userId: null, ip: "192.0.2.200", kini: KA }).status, 204);
      await A.tulisTuntasAnalitik();
      const [{ jumlah, n1 }] = await sql`
        SELECT COUNT(*)::int AS jumlah, MAX(n) FILTER (WHERE label = 'Label 1') AS n1 FROM analitik_harian WHERE user_id = 0`;
      assert.equal(jumlah, 2000);
      assert.equal(n1, 2);
    });

    // ===================================================================================================
    bagian("6. ringkasanAnalitik");
    const KR = detikWib("2026-11-07", "12:00:00");
    const H = detikWib;
    const proyeksi = (r) => ({
      total: Object.fromEntries(["halaman", "klik", "fitur", "pengguna", "anonim"].map((k) => [k, [r.total[k].kini, r.total[k].lalu]])),
      harian: r.harian.map((t) => [t.tanggal, t.aktif, t.halaman, t.klik, t.fitur]),
      halaman: r.halaman.map((b) => [b.kunci, b.n]),
      klik: r.klik.map((b) => [b.kunci, b.label, b.n]),
      fitur: r.fitur.map((b) => [b.kunci, b.n]),
      pengguna: r.pengguna.map((p) => [p.userId, p.halaman, p.klik, p.fitur, p.hariAktif]),
    });
    const nol = { halaman: [0, 0], klik: [0, 0], fitur: [0, 0], pengguna: [0, 0], anonim: [0, 0] };

    await cek("tabel kosong: semua angka nol, daftar kosong, harian diisi nol sepanjang `hari` yang berakhir hari ini (WIB)", async () => {
      await kosongkan();
      const r = await A.ringkasanAnalitik({ hari: 7, kini: KR });
      assert.deepEqual(r.hari, deretHari("2026-11-07", 7));
      assert.deepEqual(proyeksi(r), { total: nol, harian: r.hari.map((t) => [t, 0, 0, 0, 0]), halaman: [], klik: [], fitur: [], pengguna: [] });
    });

    const akun = Object.fromEntries(
      (
        await sql`
          INSERT INTO users(email, nama, password_hash, peran, created_at) VALUES
            ('admin@uji.test', 'Admin', 'scrypt:x', 'admin', ${KR}),
            ('budi@uji.test', 'Budi', 'scrypt:x', 'user', ${KR}),
            ('sari@uji.test', 'Sari', 'scrypt:x', 'user', ${KR})
          RETURNING id, email`
      ).map((u) => [u.email.split("@")[0], u.id]),
    );
    const AD = akun.admin;
    const B = akun.budi;
    const S = akun.sari;
    const X = 9999; // akun yang sudah dihapus: barisnya tetap ada (tanpa FK), email/nama/peran null
    const data6 = [
      // budi
      baris("2026-11-07", 0, "/dashboard", "", B, 5, H("2026-11-07", "10:00:00")),
      baris("2026-11-06", 0, "/nomor/[id]", "", B, 3, H("2026-11-06", "09:00:00")),
      baris("2026-11-06", 1, "/nomor/[id]", "Simpan", B, 5, H("2026-11-06", "09:05:00")),
      baris("2026-11-05", 2, "nomor.tambah", "", B, 3, H("2026-11-05", "08:00:00")),
      baris("2026-10-31", 0, "/dashboard", "", B, 8, H("2026-10-31", "20:00:00")), //    periode lalu (hari terakhirnya)
      baris("2026-10-25", 2, "nomor.hapus", "", B, 1, H("2026-10-25", "07:00:00")), //   periode lalu (hari pertamanya)
      baris("2026-10-24", 0, "/dashboard", "", B, 100, H("2026-10-24", "12:00:00")), // di luar kedua periode 7 hari
      baris("2026-11-08", 0, "/dashboard", "", B, 1000, H("2026-11-08", "00:30:00")), // besok: belum terjadi pada `kini`
      // sari
      baris("2026-11-07", 0, "/dashboard", "", S, 2, H("2026-11-07", "11:00:00")),
      baris("2026-11-01", 1, "/dashboard", "Tambah nomor", S, 4, H("2026-11-01", "00:00:30")), // hari pertama periode
      baris("2026-11-01", 2, "nomor.tambah", "", S, 2, H("2026-11-01", "00:01:00")),
      // admin: dikecualikan bawaan
      baris("2026-11-07", 0, "/admin", "", AD, 50, H("2026-11-07", "08:00:00")),
      baris("2026-11-04", 0, "/admin", "", AD, 1, H("2026-11-04", "08:00:00")),
      baris("2026-11-03", 0, "/admin/pengguna", "", AD, 2, H("2026-11-03", "08:00:00")),
      baris("2026-11-02", 0, "/admin", "", AD, 1, H("2026-11-02", "08:00:00")),
      baris("2026-11-07", 1, "/admin", "Pengguna", AD, 30, H("2026-11-07", "08:01:00")),
      baris("2026-11-07", 2, "admin.blokir", "", AD, 7, H("2026-11-07", "08:02:00")),
      baris("2026-10-30", 0, "/admin", "", AD, 20, H("2026-10-30", "08:00:00")),
      // akun terhapus
      baris("2026-11-02", 0, "/akun", "", X, 1, H("2026-11-02", "13:00:00")),
      // anonim
      baris("2026-11-07", 0, "/", "", 0, 10, H("2026-11-07", "11:30:00")),
      baris("2026-11-03", 0, "/login", "", 0, 4, H("2026-11-03", "15:00:00")),
      baris("2026-11-07", 1, "/", "Daftar", 0, 6, H("2026-11-07", "11:31:00")),
      baris("2026-10-25", 0, "/", "", 0, 3, H("2026-10-25", "15:00:00")),
    ];
    let siap6 = false;
    const isiData6 = async () => {
      if (siap6) return;
      await kosongkan();
      await sql`INSERT INTO analitik_harian ${sql(data6, "tanggal", "jenis", "kunci", "label", "user_id", "n", "terakhir")}`;
      siap6 = true;
    };

    // Aturan kontrak: anonim (user_id 0) hanya masuk total.anonim dan daftar halaman/klik teratas; total.halaman/klik/fitur,
    // harian, dan semua hitungan "pengguna" hanya akun. Jadi total.halaman + total.anonim = semua kunjungan halaman.
    await cek("bawaan (tanpa admin): total kini vs lalu (anonim terpisah di total.anonim), pengguna unik tanpa anonim, harian zero-fill", async () => {
      await isiData6();
      const r = await A.ringkasanAnalitik({ hari: 7, kini: KR });
      assert.deepEqual(r.hari, deretHari("2026-11-07", 7));
      const p = proyeksi(r);
      assert.deepEqual(p.total, { halaman: [11, 8], klik: [9, 0], fitur: [5, 1], pengguna: [3, 1], anonim: [14, 3] });
      assert.deepEqual(p.harian, [
        ["2026-11-01", 1, 0, 4, 2],
        ["2026-11-02", 1, 1, 0, 0],
        ["2026-11-03", 0, 0, 0, 0], // hanya anonim
        ["2026-11-04", 0, 0, 0, 0], // hanya admin
        ["2026-11-05", 1, 0, 0, 3],
        ["2026-11-06", 1, 3, 5, 0],
        ["2026-11-07", 2, 7, 0, 0],
      ]);
      for (const k of ["halaman", "klik", "fitur"]) {
        assert.equal(r.harian.reduce((s, t) => s + t[k], 0), r.total[k].kini, `jumlah harian.${k} = total.${k}.kini`);
      }
      const semuaHalaman = r.halaman.reduce((s, b) => s + b.n, 0); // daftar < 15 baris: memuat semuanya
      assert.equal(r.total.halaman.kini + r.total.anonim.kini, semuaHalaman, "total.halaman + total.anonim = semua kunjungan");
    });

    await cek("bawaan: daftar teratas urut n (anonim ikut, admin tidak), pengguna unik & terakhir per baris, label halaman/fitur ''", async () => {
      await isiData6();
      const r = await A.ringkasanAnalitik({ hari: 7, kini: KR });
      const p = proyeksi(r);
      assert.deepEqual(p.halaman, [["/", 10], ["/dashboard", 7], ["/login", 4], ["/nomor/[id]", 3], ["/akun", 1]]);
      assert.deepEqual(p.klik, [["/", "Daftar", 6], ["/nomor/[id]", "Simpan", 5], ["/dashboard", "Tambah nomor", 4]]);
      assert.deepEqual(p.fitur, [["nomor.tambah", 5]]);
      for (const b of [...r.halaman, ...r.fitur]) assert.equal(b.label, "");
      const dash = r.halaman.find((b) => b.kunci === "/dashboard");
      assert.deepEqual([dash.pengguna, dash.terakhir], [2, H("2026-11-07", "11:00:00")], "terakhir = maks dalam periode (bukan baris besok)");
      assert.equal(r.halaman.find((b) => b.kunci === "/nomor/[id]").pengguna, 1);
      assert.equal(r.halaman.find((b) => b.kunci === "/").pengguna, 0, "anonim bukan pengguna unik");
      assert.deepEqual([r.klik[2].pengguna, r.klik[2].terakhir], [1, H("2026-11-01", "00:00:30")]);
      assert.deepEqual([r.fitur[0].pengguna, r.fitur[0].terakhir], [2, H("2026-11-05", "08:00:00")]);
    });

    await cek("bawaan: pengguna paling aktif (tanpa admin & anonim), akun terhapus tetap tampil dengan email/nama/peran null", async () => {
      await isiData6();
      const r = await A.ringkasanAnalitik({ hari: 7, kini: KR });
      assert.deepEqual(proyeksi(r).pengguna, [[B, 8, 5, 3, 3], [S, 2, 4, 2, 2], [X, 1, 0, 0, 1]]);
      const [b, s, x] = r.pengguna;
      assert.deepEqual([b.email, b.nama, b.peran, b.terakhir], ["budi@uji.test", "Budi", "user", H("2026-11-07", "10:00:00")]);
      assert.deepEqual([s.email, s.terakhir], ["sari@uji.test", H("2026-11-07", "11:00:00")]);
      assert.deepEqual([x.email, x.nama, x.peran, x.terakhir], [null, null, null, H("2026-11-02", "13:00:00")]);
    });

    await cek("sertakanAdmin: baris akun admin ikut di total, harian, daftar, dan pengguna paling aktif", async () => {
      await isiData6();
      const r = await A.ringkasanAnalitik({ hari: 7, kini: KR, sertakanAdmin: true });
      const p = proyeksi(r);
      assert.deepEqual(p.total, { halaman: [65, 28], klik: [39, 0], fitur: [12, 1], pengguna: [4, 2], anonim: [14, 3] });
      assert.deepEqual(p.halaman, [["/admin", 52], ["/", 10], ["/dashboard", 7], ["/login", 4], ["/nomor/[id]", 3], ["/admin/pengguna", 2], ["/akun", 1]]);
      assert.deepEqual(p.klik[0], ["/admin", "Pengguna", 30]);
      assert.deepEqual(p.fitur, [["admin.blokir", 7], ["nomor.tambah", 5]]);
      assert.deepEqual(p.pengguna, [[AD, 54, 30, 7, 4], [B, 8, 5, 3, 3], [S, 2, 4, 2, 2], [X, 1, 0, 0, 1]]);
      assert.deepEqual([r.pengguna[0].email, r.pengguna[0].peran], ["admin@uji.test", "admin"]);
      assert.deepEqual(p.harian.find((t) => t[0] === "2026-11-03"), ["2026-11-03", 1, 2, 0, 0]);
      assert.deepEqual(p.harian.find((t) => t[0] === "2026-11-04"), ["2026-11-04", 1, 1, 0, 0]);
      assert.deepEqual(p.harian.find((t) => t[0] === "2026-11-07"), ["2026-11-07", 3, 57, 30, 7]);
    });

    await cek("filter userId: semua angka hanya akun itu, anonim = 0, daftar pengguna kosong", async () => {
      await isiData6();
      const r = await A.ringkasanAnalitik({ hari: 7, kini: KR, userId: B });
      const p = proyeksi(r);
      assert.deepEqual(p.total, { halaman: [8, 8], klik: [5, 0], fitur: [3, 1], pengguna: [1, 1], anonim: [0, 0] });
      assert.deepEqual(p.halaman, [["/dashboard", 5], ["/nomor/[id]", 3]]);
      assert.deepEqual(p.klik, [["/nomor/[id]", "Simpan", 5]]);
      assert.deepEqual(p.fitur, [["nomor.tambah", 3]]);
      assert.deepEqual(p.pengguna, []);
      assert.deepEqual(p.harian.map((t) => t.slice(1)), [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 3], [1, 3, 5, 0], [1, 5, 0, 0]]);
      assert.equal(r.halaman[0].pengguna, 1);
    });

    await cek("periode 30 & 90 hari: panjang `hari`/`harian` = filter.hari, batas awal & periode lalu ikut bergeser", async () => {
      await isiData6();
      const r30 = await A.ringkasanAnalitik({ hari: 30, kini: KR });
      assert.deepEqual(r30.hari, deretHari("2026-11-07", 30));
      assert.equal(r30.hari[0], "2026-10-09");
      assert.deepEqual(r30.harian.map((t) => t.tanggal), r30.hari);
      assert.deepEqual(proyeksi(r30).total, { halaman: [119, 0], klik: [9, 0], fitur: [6, 0], pengguna: [3, 0], anonim: [17, 0] });
      const r90 = await A.ringkasanAnalitik({ hari: 90, kini: KR });
      assert.deepEqual(r90.hari, deretHari("2026-11-07", 90));
      assert.equal(r90.harian.length, 90);
    });

    await cek("`kini` 00:30 WIB (masih 17:30 UTC kemarin): hari ini = tanggal WIB, data hari itu ikut", async () => {
      await isiData6();
      const KM = Date.UTC(2026, 10, 7, 17, 30) / 1000; // 2026-11-08 00:30 WIB
      const r = await A.ringkasanAnalitik({ hari: 7, kini: KM });
      assert.deepEqual(r.hari, deretHari("2026-11-08", 7));
      const p = proyeksi(r);
      assert.deepEqual([p.total.halaman, p.total.pengguna, p.total.anonim], [[1011, 8], [3, 2], [14, 0]]);
    });

    // ===================================================================================================
    bagian("7. hapusAnalitikKedaluwarsa");
    await cek(`hapus baris lebih tua dari RETENSI_HARI (${RETENSI_HARI}) relatif ke tanggal WIB \`kini\`; jumlah terhapus dikembalikan`, async () => {
      await kosongkan();
      const kini = KR;
      const hariIni = tglWib(kini);
      const umur = [-400, -200, -(RETENSI_HARI + 1), -(RETENSI_HARI - 1), -10, 0];
      await sql`INSERT INTO analitik_harian ${sql(
        umur.map((d, i) => baris(geser(hariIni, d), i % 3, `/k${i}`, "", 700 + i, 1, kini)),
        "tanggal", "jenis", "kunci", "label", "user_id", "n", "terakhir",
      )}`;
      assert.equal(await A.hapusAnalitikKedaluwarsa(kini), 3);
      assert.deepEqual((await isi()).map((r) => r.tanggal), [geser(hariIni, -(RETENSI_HARI - 1)), geser(hariIni, -10), hariIni]);
      assert.equal(await A.hapusAnalitikKedaluwarsa(kini), 0, "panggilan kedua tidak menghapus apa pun");
      // Tanpa argumen = sekarang.
      await sql`TRUNCATE analitik_harian`;
      const hariNyata = tglWib(Math.floor(Date.now() / 1000));
      await sql`INSERT INTO analitik_harian ${sql([baris(geser(hariNyata, -400), 0, "/", "", 0, 1, kini), baris(hariNyata, 0, "/", "", 0, 1, kini)], "tanggal", "jenis", "kunci", "label", "user_id", "n", "terakhir")}`;
      assert.equal(await A.hapusAnalitikKedaluwarsa(), 1);
      assert.deepEqual((await isi()).map((r) => r.tanggal), [hariNyata]);
    });

    // ===================================================================================================
    bagian("8. kinerja");
    await cek("jalur panas: catat & terimaKiriman cukup mikrodetik tanpa query; tulis 9 rb kunci", async () => {
      await kosongkan();
      const N = 100_000;
      let t0 = performance.now();
      for (let i = 0; i < N; i++) A.catat(300_000 + (i % 1000), 0, "/dashboard", undefined, T);
      const usCatat = ((performance.now() - t0) * 1000) / N;
      const contoh = {
        e: [
          ...Array.from({ length: 12 }, (_, i) => [0, i % 2 ? "/nomor/12" : "/dashboard"]),
          ...Array.from({ length: 8 }, (_, i) => [1, "/nomor/12", `Tombol aksi ${i}`]),
        ],
      };
      const teks = JSON.stringify(contoh);
      const M = 800; // 1.000 + 800 x 10 kunci: di bawah batas wajar buffer memori

      const q = await rekam(async () => {
        t0 = performance.now();
        for (let i = 0; i < M; i++) {
          const h = A.terimaKiriman({ teks, userId: 310_000 + i, ip: "192.0.2.1", kini: T });
          if (h.status !== 204) throw new Error(`status ${h.status} pada kiriman ke-${i}`);
        }
      });
      const usTerima = ((performance.now() - t0) * 1000) / M;
      // Boleh ada tulis-berkala/tulis-saat-buffer-penuh (INSERT analitik_harian), tapi tidak ada query lain (mis. cek akun).
      const lain = q.filter((x) => !/\binsert\s+into\s+analitik_harian\b/i.test(x.teks) && !/^\s*(begin|commit)\b/i.test(x.teks));
      assert.deepEqual(lain.map((x) => x.teks.slice(0, 60)), [], "terimaKiriman/catat menjalankan query");
      t0 = performance.now();
      await A.tulisTuntasAnalitik();
      const msTulis = performance.now() - t0;
      const [{ jumlah }] = await sql`SELECT COUNT(*)::int AS jumlah FROM analitik_harian`;
      assert.equal(jumlah, 1000 + M * 10);
      console.log(`      catat: ${usCatat.toFixed(2)} µs/panggilan; terimaKiriman (20 event, ${Buffer.byteLength(teks)} byte): ${usTerima.toFixed(1)} µs/panggilan`);
      console.log(`      tulisTuntasAnalitik ${jumlah} kunci: ${msTulis.toFixed(0)} ms`);
      assert.ok(usCatat < 20, `catat terlalu lambat: ${usCatat} µs`);
      assert.ok(usTerima < 500, `terimaKiriman terlalu lambat: ${usTerima} µs`);
    });

    // Data berukuran produksi-besar: 2.000 akun (20 admin) x 90 hari + anonim = ~200 ribu baris.
    await kosongkan();
    const HARI_INI = "2026-11-07";
    await sql`
      INSERT INTO users(id, email, nama, password_hash, peran, created_at)
      SELECT 100000 + g, 'm' || g || '@massal.test', 'Massal ' || g, 'scrypt:x', CASE WHEN g % 100 = 0 THEN 'admin' ELSE 'user' END, ${KR}
      FROM generate_series(1, 2000) g`;
    const tMuat = performance.now();
    // Diurutkan menurut primary key sebelum disisipkan: B-tree terisi berurutan (tanpa pecah halaman acak), muat jauh
    // lebih cepat. Satu transaksi supaya work_mem besar hanya berlaku untuk pengurutan ini.
    await sql.begin(async (tx) => {
      await tx`SET LOCAL work_mem = '64MB'`;
      await tx`
        INSERT INTO analitik_harian(tanggal, jenis, kunci, label, user_id, n, terakhir)
        SELECT * FROM (
          SELECT ${HARI_INI}::date - a.t AS tanggal, b.j AS jenis,
                 CASE WHEN b.j = 2 THEN 'fitur.f' || (a.u % 40) ELSE c.pola[1 + (a.u + a.t) % ${POLA_HALAMAN.length}] END AS kunci,
                 CASE WHEN b.j = 1 THEN 'Tombol ' || (a.u % 15) ELSE '' END AS label,
                 100001 + a.u AS user_id, 1 + g % 7 AS n, ${KR} - a.t * 86400 AS terakhir
          FROM (SELECT ${sql.array([...POLA_HALAMAN])}::text[] AS pola) c,
               generate_series(0, 181999) g,
               LATERAL (SELECT g % 90 AS t, (g / 90) % 2000 AS u, g / 180000 AS r) a,
               LATERAL (SELECT (a.t + a.u + a.r) % 3 AS j) b
          UNION ALL
          SELECT ${HARI_INI}::date - t, 0, p, '', 0, 1 + t % 5, ${KR} - t * 86400
          FROM generate_series(0, 89) t, unnest(${sql.array([...HALAMAN_PUBLIK])}::text[]) p
          UNION ALL
          SELECT ${HARI_INI}::date - t, 1, '/', 'Label ' || k, 0, 1 + k % 3, ${KR} - t * 86400
          FROM generate_series(0, 89) t, generate_series(1, 200) k
        ) x
        ORDER BY jenis, tanggal, kunci, label, user_id`;
    });
    await sql`ANALYZE analitik_harian; ANALYZE users`.simple();
    const [ukuran] = await sql`SELECT COUNT(*)::int AS baris, pg_total_relation_size('analitik_harian')::bigint AS byte FROM analitik_harian`;
    console.log(`      data uji: ${ukuran.baris} baris, tabel + indeks ${(ukuran.byte / 1024 / 1024).toFixed(1)} MB (muat ${(performance.now() - tMuat).toFixed(0)} ms)`);

    await cek("ringkasanAnalitik 30 hari di ~200 rb baris: < 1500 ms, cocok dengan hitungan SQL langsung, daftar 15/20 teratas terurut", async () => {
      const ms30 = await ukur("ringkasanAnalitik({hari:30}) semua akun", (i) => A.ringkasanAnalitik({ hari: 30, kini: KR + i + 1 }), 3);
      await ukur("ringkasanAnalitik({hari:90}) semua akun", (i) => A.ringkasanAnalitik({ hari: 90, kini: KR + i + 20 }), 1, false);
      assert.ok(ms30 < 1500, `terlalu lambat: ${ms30.toFixed(0)} ms`);
      let r;
      const q = (await rekam(async () => (r = await A.ringkasanAnalitik({ hari: 30, kini: KR })))).filter((x) => /^\s*(select|with)\b/i.test(x.teks) && /\banalitik_harian\b/i.test(x.teks));
      for (const { teks, param } of q) {
        // TIMING OFF: tanpa jam per baris (di Windows bisa melipatgandakan waktu); Execution Time tetap nyata.
        const rencana = (await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) ${teks}`, param)).map((b) => b["QUERY PLAN"]).join("\n");
        const pindai = [...new Set(rencana.match(/Seq Scan on analitik_harian\b|Index (?:Only )?Scan(?: Backward)? using \w+ on analitik_harian\b|Bitmap Index Scan on analitik_harian\w*/g) ?? [])].join(", ");
        console.log(`      ${rencana.match(/Execution Time: ([\d.]+) ms/)?.[1]} ms  ${pindai}  <- ${teks.replace(/\s+/g, " ").slice(0, 60)}…`);
      }
      const [o] = await sql`
        SELECT COALESCE(SUM(n) FILTER (WHERE jenis = 0 AND user_id <> 0 AND tanggal > ${HARI_INI}::date - 30), 0)::int AS halaman_kini,
               COALESCE(SUM(n) FILTER (WHERE jenis = 0 AND user_id <> 0 AND tanggal <= ${HARI_INI}::date - 30), 0)::int AS halaman_lalu,
               COALESCE(SUM(n) FILTER (WHERE jenis = 1 AND user_id <> 0 AND tanggal > ${HARI_INI}::date - 30), 0)::int AS klik_kini,
               COALESCE(SUM(n) FILTER (WHERE jenis = 2 AND user_id <> 0 AND tanggal > ${HARI_INI}::date - 30), 0)::int AS fitur_kini,
               COUNT(DISTINCT user_id) FILTER (WHERE user_id <> 0 AND tanggal > ${HARI_INI}::date - 30)::int AS pengguna_kini,
               COALESCE(SUM(n) FILTER (WHERE jenis = 0 AND user_id = 0 AND tanggal > ${HARI_INI}::date - 30), 0)::int AS anonim_kini
        FROM analitik_harian a
        WHERE tanggal > ${HARI_INI}::date - 60 AND tanggal <= ${HARI_INI}::date
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id AND u.peran = 'admin')`;
      assert.deepEqual(
        [r.total.halaman.kini, r.total.halaman.lalu, r.total.klik.kini, r.total.fitur.kini, r.total.pengguna.kini, r.total.anonim.kini],
        [o.halaman_kini, o.halaman_lalu, o.klik_kini, o.fitur_kini, o.pengguna_kini, o.anonim_kini],
      );
      assert.deepEqual([r.halaman.length, r.klik.length, r.fitur.length, r.pengguna.length, r.harian.length], [15, 15, 15, 20, 30]);
      for (const k of ["halaman", "klik", "fitur"]) {
        for (let i = 1; i < r[k].length; i++) assert.ok(r[k][i - 1].n >= r[k][i].n, `${k} tidak urut menurun`);
      }
      assert.ok(r.pengguna.every((u) => u.userId !== 0 && (u.userId - 100000) % 100 !== 0), "anonim/admin masuk daftar pengguna");
    });

    await cek("ringkasan per pengguna: setiap query ke analitik_harian memakai indeks (EXPLAIN ANALYZE, tanpa Seq Scan)", async () => {
      const ms = await ukur("ringkasanAnalitik({hari:30, userId}) satu akun", (i) => A.ringkasanAnalitik({ hari: 30, kini: KR + i + 1, userId: 100_612 + i }), 10);
      assert.ok(ms < 300, `terlalu lambat: ${ms.toFixed(0)} ms`);
      const q = (await rekam(() => A.ringkasanAnalitik({ hari: 30, kini: KR, userId: 100_777 }))).filter(
        (x) => /\banalitik_harian\b/i.test(x.teks) && /^\s*(select|with)\b/i.test(x.teks),
      );
      assert.ok(q.length > 0, "tidak ada query ke analitik_harian yang terekam");
      for (const { teks, param } of q) {
        const rencana = (await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS) ${teks}`, param)).map((r) => r["QUERY PLAN"]).join("\n");
        const waktu = rencana.match(/Execution Time: ([\d.]+) ms/)?.[1];
        const pakai = [...new Set(rencana.match(/(?:Index Scan|Index Only Scan|Bitmap Index Scan)(?: Backward)?(?: using| on) \w+/g) ?? [])].join(", ");
        console.log(`      ${waktu} ms  ${pakai || "(tanpa indeks)"}  <- ${teks.replace(/\s+/g, " ").slice(0, 70)}…`);
        assert.doesNotMatch(rencana, /Seq Scan on analitik_harian/, `Seq Scan untuk satu akun:\n${teks}\n${rencana}`);
        assert.match(rencana, /(Index Scan|Index Only Scan|Bitmap Index Scan).*analitik_harian/);
      }
    });

    await cek("hapusAnalitikKedaluwarsa di ~200 rb baris lewat indeks tanggal (tanpa Seq Scan)", async () => {
      const t0 = performance.now();
      const q = await rekam(async () => assert.equal(await A.hapusAnalitikKedaluwarsa(KR), 0));
      console.log(`      hapusAnalitikKedaluwarsa (tidak ada yang kedaluwarsa): ${(performance.now() - t0).toFixed(2)} ms`);
      const hapus = q.filter((x) => /^\s*(delete|with)\b/i.test(x.teks) && /\banalitik_harian\b/i.test(x.teks));
      assert.ok(hapus.length > 0, "tidak ada DELETE yang terekam");
      for (const { teks, param } of hapus) {
        const rencana = (await sql.unsafe(`EXPLAIN ${teks}`, param)).map((r) => r["QUERY PLAN"]).join("\n");
        assert.doesNotMatch(rencana, /Seq Scan on analitik_harian/, `${teks}\n${rencana}`);
      }
    });
  }
} finally {
  // Selalu dijalankan (juga saat galat tak terduga): koneksi ditutup, proses PostgreSQL dihentikan, folder sementara dihapus.
  const t0 = dtk();
  pg ??= await pgJanji.catch(() => null);
  if (sql) await sql.end({ timeout: 2 }).catch(() => {});
  if (pg) await pg.berhenti().catch((e) => console.error("[uji-analitik] gagal menghentikan PostgreSQL:", e?.message ?? e));
  rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  console.log(`   (uji selesai +${t0} dtk, PostgreSQL berhenti & ${path.basename(tmp)} dihapus +${dtk()} dtk)`);
}

if (gagal.length) {
  console.log(`\nGAGAL ${gagal.length} dari ${no} uji analitik:\n  ${gagal.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nLOLOS ${lolos} uji analitik perilaku pengguna`);
process.exit(0);

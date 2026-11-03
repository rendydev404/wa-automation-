// Latih penyaring prospek: kepala klasifikasi (regresi softmax 384 -> 4 label, gradient descent) + benih kNN, lalu uji
// pada data yang TIDAK ikut dilatih. Pakai (dari akar proyek):
//   node --no-warnings --import ./uji/loader.mjs ml/latih.mjs <folder dataset MASSIVE/SMS>
// Data latih: ml/data/latih-*.txt (kasus chat WA berbagai usaha, ditulis & dilabeli manual) + variasi gaya ketik
// otomatis, dan MASSIVE id-ID train+dev (CC BY 4.0). Data uji (tidak pernah dilatih): ml/data/uji-mandiri.json (ditulis
// penulis lain tanpa melihat data latih), uji/data-spam.json, knowledge-cs/sumber/uji.json, MASSIVE test, SMS Indonesia.
// Keluaran: ml/kepala.json (bobot kepala) dan ml/benih.bin (contoh kNN), keduanya dimuat app saat jalan.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dataset = process.argv[2];
if (!dataset) throw new Error("pakai: node --import ./uji/loader.mjs ml/latih.mjs <folder dataset>");
const lib = (f) => import(pathToFileURL(path.resolve(f)).href);
const { embed } = await lib("src/lib/ml/embed.ts");
const P = await lib("src/lib/prospek-def.ts");
const L = P.LABEL;

// ---------- Data latih ----------
const baca = (f) => readFileSync(f, "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
const kurasi = L.flatMap((label) => baca(`ml/data/latih-${label}.txt`).map((teks) => ({ teks, label })));

// Variasi gaya ketik WhatsApp (singkatan, sapaan, huruf berulang, emoji, huruf besar). Deterministik.
let benihAcak = 7;
const acak = () => ((benihAcak = (benihAcak * 1103515245 + 12345) % 2147483648) / 2147483648);
const SINGKAT = [
  [/\bberapa\b/g, "brp"], [/\byang\b/g, "yg"], [/\bsudah\b/g, "udh"], [/\budah\b/g, "udh"], [/\btidak\b/g, "gak"], [/\bbisa\b/g, "bs"],
  [/\bgimana\b/g, "gmn"], [/\bdimana\b/g, "dmn"], [/\bsaya\b/g, "aku"], [/\bbelum\b/g, "blm"], [/\bkakak\b/g, "kak"], [/\bterima kasih\b/g, "makasih"],
  [/\bmakasih\b/g, "mksh"], [/\bmau\b/g, "mo"], [/\bjuga\b/g, "jg"], [/\bdengan\b/g, "dgn"], [/\bkalau\b/g, "kalo"], [/\bpesan\b/g, "pesen"],
];
const SAPA = ["kak", "ka", "kk", "min", "gan", "sis", "bang", "mas", "mbak", "bund"];
function variasi(t) {
  let v = t;
  for (const [p, g] of SINGKAT) if (acak() < 0.6) v = v.replace(p, g);
  if (acak() < 0.5) v = v.replace(/\bkak\b/g, () => SAPA[Math.floor(acak() * SAPA.length)]);
  if (acak() < 0.3) v = v.replace(/([aiueo])(\b)/, "$1$1$1$2");
  if (acak() < 0.25) v = `${v} ${["🙏", "😊", "👍", "😁", "🙏🙏", "😅"][Math.floor(acak() * 6)]}`;
  if (acak() < 0.15) v = v.toUpperCase();
  if (acak() < 0.3) v = v.replace(/[?.!,]+/g, "");
  return v.trim();
}
const latih = [];
const lihat = new Set();
for (const k of kurasi) {
  for (const t of [k.teks, variasi(k.teks), variasi(k.teks)]) {
    const kunci = `${k.label}|${t.toLowerCase()}`;
    if (!t || lihat.has(kunci)) continue;
    lihat.add(kunci);
    latih.push({ teks: t, label: k.label, bobot: 3, sumber: "kurasi" });
  }
}
const BUKAN = /^(alarm|audio|iot|calendar|play|music|weather|news|general_joke|general_quirky|datetime|qa_maths|qa_definition|qa_factoid|qa_stock|lists|email|social|cooking_recipe|recommendation_movies|recommendation_events|transport_traffic)/;
const PROSPEK = /^(takeaway_order|takeaway_query|transport_ticket|transport_taxi)$/;
const labelMassive = (intent) => (PROSPEK.test(intent) ? "prospek" : intent === "general_greet" ? "netral" : BUKAN.test(intent) ? "bukan" : null);
const massive = readFileSync(path.join(dataset, "1.1/data/id-ID.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const perIntent = new Map();
for (const r of massive) {
  const l = labelMassive(r.intent);
  if (r.partition === "test" || !l) continue;
  const n = perIntent.get(r.intent) ?? 0;
  if (l === "bukan" && n >= 25) continue;
  perIntent.set(r.intent, n + 1);
  latih.push({ teks: r.utt, label: l, bobot: 1, sumber: "massive" });
}

// ---------- Data uji (tidak pernah dilatih) ----------
const uji = [];
const tambahUji = (sumber, teks, label) => uji.push({ sumber, teks, label });
// Uji mandiri dibagi dua: "dev" boleh dilihat kesalahannya untuk memperbaiki data latih; "FINAL" dikunci (isinya tidak
// pernah dicetak) supaya angka akhirnya jujur.
if (existsSync("ml/data/uji-mandiri.json"))
  JSON.parse(readFileSync("ml/data/uji-mandiri.json", "utf8")).forEach((r, i) => tambahUji(i % 2 ? "uji mandiri FINAL (dikunci)" : "uji mandiri dev", r.teks, r.label));
const spam = JSON.parse(readFileSync("uji/data-spam.json", "utf8"));
for (const t of spam.pelanggan) tambahUji("pelanggan berbagai usaha", t, "jangan-lewati");
for (const t of [...spam.judi, ...spam.lain]) tambahUji("spam/judi", t, "bukan");
for (const r of JSON.parse(readFileSync("knowledge-cs/sumber/uji.json", "utf8"))) tambahUji("pertanyaan pelanggan CS", r.q, "jangan-lewati");
massive.filter((r) => r.partition === "test" && labelMassive(r.intent)).filter((_, i) => i % 3 === 0).forEach((r) => tambahUji("MASSIVE test", r.utt, labelMassive(r.intent)));
for (const baris of readFileSync(path.join(dataset, "dataset_sms_spam_v1.csv"), "utf8").split("\n").slice(1)) {
  const m = baris.match(/^"?([\s\S]*?)"?,([012])\s*$/);
  if (m && m[2] !== "0") tambahUji("SMS penipuan/promo (asli)", m[1], "bukan");
}
// Data uji tidak boleh bocor ke data latih.
const teksLatih = new Set(latih.map((x) => x.teks.toLowerCase()));
const bocor = uji.filter((u) => teksLatih.has(u.teks.toLowerCase()));
if (bocor.length) console.log(`(dibuang dari uji karena sama persis dengan data latih: ${bocor.length})`);
const ujiBersih = uji.filter((u) => !teksLatih.has(u.teks.toLowerCase()));

// ---------- Embedding ----------
const t0 = performance.now();
for (const x of [...latih, ...ujiBersih]) x.v = await embed(x.teks);
console.log(`embedding ${latih.length} latih + ${ujiBersih.length} uji: ${((performance.now() - t0) / 1000).toFixed(1)} dtk`);

// ---------- Latih kepala: regresi softmax berbobot, Adam, L2 ----------
const D = P.DIM;
const K = 4;
function latihKepala(data, { epoch = 400, lr = 0.05, l2 = 1e-4 } = {}) {
  const W = new Float64Array(K * D);
  const b = new Float64Array(K);
  // Bobot kelas seimbang: kelas kecil (netral/selesai) tidak tenggelam.
  const jml = new Array(K).fill(0);
  for (const x of data) jml[P.idLabel(x.label)] += x.bobot;
  const total = jml.reduce((a, c) => a + c, 0);
  const wk = jml.map((c) => (c ? total / (K * c) : 0));
  const mW = new Float64Array(K * D), vW = new Float64Array(K * D), mb = new Float64Array(K), vb = new Float64Array(K);
  const gW = new Float64Array(K * D), gb = new Float64Array(K);
  const z = new Float64Array(K);
  for (let e = 1; e <= epoch; e++) {
    gW.fill(0);
    gb.fill(0);
    let sw = 0;
    for (const x of data) {
      const y = P.idLabel(x.label);
      const w = x.bobot * wk[y];
      let maks = -Infinity;
      for (let k = 0; k < K; k++) {
        let s = b[k];
        for (let j = 0; j < D; j++) s += W[k * D + j] * x.v[j];
        z[k] = s;
        if (s > maks) maks = s;
      }
      let jumlah = 0;
      for (let k = 0; k < K; k++) jumlah += (z[k] = Math.exp(z[k] - maks));
      for (let k = 0; k < K; k++) {
        const g = (z[k] / jumlah - (k === y ? 1 : 0)) * w;
        gb[k] += g;
        for (let j = 0; j < D; j++) gW[k * D + j] += g * x.v[j];
      }
      sw += w;
    }
    const b1 = 0.9, b2 = 0.999;
    for (let i = 0; i < K * D; i++) {
      const g = gW[i] / sw + l2 * W[i];
      mW[i] = b1 * mW[i] + (1 - b1) * g;
      vW[i] = b2 * vW[i] + (1 - b2) * g * g;
      W[i] -= (lr * (mW[i] / (1 - b1 ** e))) / (Math.sqrt(vW[i] / (1 - b2 ** e)) + 1e-8);
    }
    for (let k = 0; k < K; k++) {
      const g = gb[k] / sw;
      mb[k] = b1 * mb[k] + (1 - b1) * g;
      vb[k] = b2 * vb[k] + (1 - b2) * g * g;
      b[k] -= (lr * (mb[k] / (1 - b1 ** e))) / (Math.sqrt(vb[k] / (1 - b2 ** e)) + 1e-8);
    }
  }
  return { W: Array.from(W, (x) => +x.toFixed(6)), b: Array.from(b, (x) => +x.toFixed(6)) };
}
const t1 = performance.now();
const kepala = latihKepala(latih);
console.log(`kepala dilatih: ${((performance.now() - t1) / 1000).toFixed(1)} dtk`);

const bank = P.bankKosong(latih.length);
for (const x of latih) P.tambahKeBank(bank, P.kodeVektor(x.v), P.idLabel(x.label), x.bobot);

// ---------- Evaluasi ----------
const metode = {
  kNN: (v) => P.nilaiKnn(v, [bank]).p,
  kepala: (v) => P.nilaiKepala(v, kepala),
  gabungan: (v) => P.gabungPeluang(P.nilaiKepala(v, kepala), P.nilaiKnn(v, [bank]).p, 0.5),
};
const lewatiBenar = (label) => label === "bukan" || label === "selesai";
function ukur(fn, ambang) {
  const per = new Map();
  let jl = 0, salahLewati = 0, harusLewati = 0, lewatiTepat = 0, benar4 = 0, n4 = 0;
  const salah = [];
  for (const u of ujiBersih) {
    const p = fn(u.v);
    const lewati = p[2] + p[3] >= ambang;
    const h = per.get(u.sumber) ?? { n: 0, benar: 0, lewati: 0 };
    h.n += 1;
    h.lewati += lewati ? 1 : 0;
    const boleh = u.label !== "jangan-lewati" && lewatiBenar(u.label);
    if (boleh) {
      harusLewati += 1;
      if (lewati) lewatiTepat += 1;
    } else {
      jl += 1;
      if (lewati) {
        salahLewati += 1;
        salah.push(`[${u.sumber}] ${u.teks}`);
      }
    }
    h.benar += lewati === boleh ? 1 : 0;
    if (u.label !== "jangan-lewati") {
      n4 += 1;
      let t = 0;
      for (let k = 1; k < 4; k++) if (p[k] > p[t]) t = k;
      if (L[t] === u.label) benar4 += 1;
    }
    per.set(u.sumber, h);
  }
  return { per, salahLewati, jl, lewatiTepat, harusLewati, akurasi4: benar4 / n4, salah };
}
const persen = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;
console.log(`\nData latih: ${latih.length} (${kurasi.length} kasus kurasi + variasinya, ${latih.filter((x) => x.sumber === "massive").length} MASSIVE). Data uji: ${ujiBersih.length}.`);
let terbaik = null;
for (const [nama, fn] of Object.entries(metode)) {
  for (const ambang of [0.7, 0.8, 0.9]) {
    const r = ukur(fn, ambang);
    console.log(`${nama.padEnd(9)} ambang ${ambang}: SALAH LEWATI pesan pelanggan ${persen(r.salahLewati, r.jl)} (${r.salahLewati}/${r.jl}) | iseng/spam/penutup terlewati ${persen(r.lewatiTepat, r.harusLewati)} | akurasi 4 label ${(r.akurasi4 * 100).toFixed(1)}%`);
    if (!terbaik || r.salahLewati / r.jl < terbaik.r.salahLewati / terbaik.r.jl - 1e-9 || (Math.abs(r.salahLewati / r.jl - terbaik.r.salahLewati / terbaik.r.jl) < 1e-9 && r.lewatiTepat > terbaik.r.lewatiTepat)) terbaik = { nama, ambang, r };
  }
}
const r = ukur(metode.gabungan, 0.8);
console.log(`\nRincian gabungan @0.8:`);
for (const [s, h] of r.per) console.log(`  ${s.padEnd(30)} ${String(h.n).padStart(5)} pesan  keputusan benar ${persen(h.benar, h.n)}  dilewati ${persen(h.lewati, h.n)}`);
// Isi bagian FINAL tidak pernah dicetak: angka akhirnya tetap jujur.
const tampil = (t) => !t.includes("FINAL");
if (r.salah.length) console.log(`\nPesan pelanggan yang salah dilewati (${r.salah.length}, isi bagian FINAL tidak ditampilkan):\n  - ${r.salah.filter(tampil).slice(0, 40).join("\n  - ")}`);
// Per label untuk uji mandiri: prospek/netral yang dilewati harus ~0, selesai/bukan setinggi mungkin.
for (const bagian of ["uji mandiri dev", "uji mandiri FINAL (dikunci)"]) {
  const baris = L.map((l) => {
    const xs = ujiBersih.filter((u) => u.sumber === bagian && u.label === l);
    const lw = xs.filter((u) => metode.gabungan(u.v).slice(2).reduce((a, c) => a + c) >= 0.8).length;
    return `${l} ${lw}/${xs.length} dilewati`;
  });
  console.log(`  ${bagian}: ${baris.join(", ")}`);
}
const salahBiarkan = ujiBersih.filter((u) => tampil(u.sumber) && lewatiBenar(u.label) && P.gabungPeluang(P.nilaiKepala(u.v, kepala), P.nilaiKnn(u.v, [bank]).p, 0.5).slice(2).reduce((a, c) => a + c) < 0.8);
console.log(`\nIseng/spam/penutup yang tidak terlewati (contoh 25 dari ${salahBiarkan.length}):\n  - ${salahBiarkan.slice(0, 25).map((u) => `[${u.sumber}|${u.label}] ${u.teks.slice(0, 90)}`).join("\n  - ")}`);

// ---------- Pilih setelan (bobot campuran, tau kNN, ambang) HANYA dari data non-FINAL ----------
// Syarat keselamatan: pesan prospek/netral yang dilewati <= 1% di semua data non-FINAL; di antara yang lolos dipilih yang
// paling banyak melewati iseng/spam/penutup. Setelan terpilih lalu diuji SEKALI pada bagian FINAL.
const nonFinal = ujiBersih.filter((u) => tampil(u.sumber));
const finalSaja = ujiBersih.filter((u) => !tampil(u.sumber));
const knnTau = new Map();
const pKnn = (u, tau) => {
  const k = `${tau}`;
  if (!knnTau.has(k)) knnTau.set(k, new Map());
  const m = knnTau.get(k);
  if (!m.has(u)) m.set(u, P.nilaiKnn(u.v, [bank], { tau }).p);
  return m.get(u);
};
const pKep = new Map(ujiBersih.map((u) => [u, P.nilaiKepala(u.v, kepala)]));
function nilaiSetelan(data, s) {
  let jl = 0, salah = 0, hl = 0, tepat = 0;
  for (const u of data) {
    const p = P.gabungPeluang(pKep.get(u), pKnn(u, s.tau), s.w);
    const lw = p[2] + p[3] >= s.ambang;
    if (u.label === "jangan-lewati" || u.label === "prospek" || u.label === "netral") {
      jl += 1;
      if (lw) salah += 1;
    } else {
      hl += 1;
      if (lw) tepat += 1;
    }
  }
  return { salah: salah / jl, recall: tepat / hl, salahN: salah, jl, tepat, hl };
}
let setelan = null;
for (const w of [0.3, 0.5, 0.7])
  for (const tau of [0.02, 0.03, 0.05])
    for (const ambang of [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]) {
      const h = nilaiSetelan(nonFinal, { w, tau, ambang });
      if (h.salah <= 0.01 && (!setelan || h.recall > setelan.h.recall)) setelan = { w, tau, ambang, h };
    }
console.log(`\nSetelan terpilih (dari data non-FINAL): bobot kepala ${setelan.w}, tau ${setelan.tau}, ambang ${setelan.ambang} -> salah lewati ${persen(setelan.h.salahN, setelan.h.jl)}, iseng/spam/penutup terlewati ${persen(setelan.h.tepat, setelan.h.hl)}`);
// Rincian per sumber pada setelan terpilih (angka yang berlaku di app).
for (const s of [...new Set(ujiBersih.map((u) => u.sumber))]) {
  const xs = ujiBersih.filter((u) => u.sumber === s);
  const rincian = ["prospek", "netral", "jangan-lewati", "selesai", "bukan"]
    .map((l) => {
      const ys = xs.filter((u) => u.label === l);
      if (!ys.length) return null;
      const lw = ys.filter((u) => P.gabungPeluang(pKep.get(u), pKnn(u, setelan.tau), setelan.w).slice(2).reduce((a, c) => a + c) >= setelan.ambang).length;
      return `${l} dilewati ${lw}/${ys.length}`;
    })
    .filter(Boolean);
  console.log(`  ${s.padEnd(30)} ${rincian.join(", ")}`);
}
const fin = nilaiSetelan(finalSaja, setelan);
console.log(`UJI FINAL (dikunci, sekali): salah lewati prospek/netral ${persen(fin.salahN, fin.jl)} (${fin.salahN}/${fin.jl}), iseng/spam/penutup terlewati ${persen(fin.tepat, fin.hl)} (${fin.tepat}/${fin.hl})`);

// ---------- Simpan ----------
writeFileSync(
  "ml/kepala.json",
  JSON.stringify({ versi: 1, dim: D, label: L, W: kepala.W, b: kepala.b, campur: setelan.w, tau: setelan.tau, ambang: setelan.ambang, dilatih: new Date().toISOString().slice(0, 10), contoh: latih.length })
);
const kepalaBin = Buffer.alloc(8);
kepalaBin.write("WAB2", 0, "ascii");
kepalaBin.writeUInt32LE(latih.length, 4);
writeFileSync("ml/benih.bin", Buffer.concat([kepalaBin, Buffer.from(latih.map((x) => P.idLabel(x.label))), Buffer.from(latih.map((x) => x.bobot)), ...latih.map((x) => P.kodeVektor(x.v))]));
console.log(`\nDisimpan: ml/kepala.json, ml/benih.bin (${latih.length} contoh). Metode dengan salah-lewati terendah: ${terbaik.nama} @${terbaik.ambang}`);

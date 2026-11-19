// Uji jalur WhatsApp resmi (Cloud API Meta): src/lib/wa-resmi-def.ts, wa-resmi.ts, followup-jalur.ts, dan sambungannya ke
// wa.ts / bridge.ts / followup-usaha.ts. Yang asli: semua modul itu + PostgreSQL 15 (sementara). Tiruan: Graph API Meta
// (server HTTP lokal lewat META_GRAPH_URL) & Hermes. Tanpa jaringan, tanpa kredensial asli.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-wa-resmi.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-resmi");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
process.env.WA_SKALA_WAKTU ??= "0.2";
process.env.WA_FOLLOWUP_STABIL_MENIT ??= "0";
process.env.ML_PELUANG_AUDIT = "0";
process.env.AUTH_SECRET = "rahasia-uji-wa-resmi-0123456789";
process.env.APP_URL = "https://contoh.chatgercep.test";
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const kini = () => Math.floor(Date.now() / 1000);
async function tunggu(fn, ms = 8000, apa = "") {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error(`habis waktu menunggu ${apa || fn}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ---------- Hermes tiruan ----------
const TEKS1 = "Kak, bedcover king Rp35.000 selesai 2 hari dan bisa dijemput gratis. Mau dijemput sore ini atau besok pagi?";
const hermes = { panggilan: [] };
const srvAi = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.url.endsWith("/models")) return res.end("{}");
    const j = JSON.parse(b);
    const p = { sesi: String(req.headers["x-hermes-session-id"] ?? ""), sistem: j.messages[0].content, pesan: j.messages[1].content };
    hermes.panggilan.push(p);
    const isi = p.sesi.startsWith("followup-usaha-") ? TEKS1 : `Halo kak, bedcover king Rp35.000 ya.\n<nilai>prospek</nilai><minat>hangat</minat>`;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: isi } }] }));
  });
});
await new Promise((r) => srvAi.listen(0, "127.0.0.1", r));
process.env.HERMES_API_URL = `http://127.0.0.1:${srvAi.address().port}`;
process.env.HERMES_API_KEY = "uji";

// ---------- Graph API Meta tiruan ----------
const TOKEN = "EAAG" + "x".repeat(60);
const RAHASIA = "0123456789abcdef0123456789abcdef";
const PNID = "109876543210987";
const WABA = "102345678901234";
const meta = { kiriman: [], dibaca: [], templat: [], daftar: [], urut: 0, tier: "TIER_250", kualitas: "GREEN", status: "CONNECTED", register: 0, langganan: 0 };
const srvMeta = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    const kirim = (kode, isi) => ((res.statusCode = kode), res.end(JSON.stringify(isi)));
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return kirim(401, { error: { code: 190, message: "Invalid OAuth access token" } });
    const u = new URL(req.url, "http://x");
    const bagian = u.pathname.split("/").filter(Boolean);
    const j = b && req.headers["content-type"]?.includes("json") ? JSON.parse(b) : {};
    if (req.method === "GET" && bagian[0] === PNID)
      return kirim(200, { display_phone_number: "+62 811-1100-0001", verified_name: "Laundry Resmi", quality_rating: meta.kualitas, messaging_limit_tier: meta.tier, status: meta.status });
    if (req.method === "POST" && bagian[0] === PNID && bagian[1] === "register") return (meta.register++, kirim(200, { success: true }));
    if (req.method === "POST" && bagian[0] === WABA && bagian[1] === "subscribed_apps") return (meta.langganan++, kirim(200, { success: true }));
    if (req.method === "POST" && bagian[0] === PNID && bagian[1] === "messages") {
      if (j.status === "read") return (meta.dibaca.push(j.message_id), kirim(200, { success: true }));
      const id = `wamid.UJI${++meta.urut}`;
      meta.kiriman.push({ id, ...j });
      return kirim(200, { messaging_product: "whatsapp", contacts: [{ wa_id: j.to }], messages: [{ id }] });
    }
    if (req.method === "POST" && bagian[0] === WABA && bagian[1] === "message_templates") {
      meta.templat.push(j);
      return kirim(200, { id: `tpl${meta.templat.length}`, status: "PENDING", category: "MARKETING" });
    }
    if (req.method === "GET" && bagian[0] === WABA && bagian[1] === "message_templates") return kirim(200, { data: meta.daftar });
    kirim(404, { error: { code: 100, message: `tidak dikenal ${req.method} ${u.pathname}` } });
  });
});
await new Promise((r) => srvMeta.listen(0, "127.0.0.1", r));
process.env.META_GRAPH_URL = `http://127.0.0.1:${srvMeta.address().port}`;

const def = await lib("src/lib/wa-resmi-def.ts");
const { db } = await lib("src/lib/db.ts");
const wa = await lib("src/lib/wa.ts");
const bridge = await lib("src/lib/bridge.ts");
const resmi = await lib("src/lib/wa-resmi.ts");
const { tambahNomor, nomorById } = await lib("src/lib/numbers.ts");
const { tambahDokumen } = await lib("src/lib/knowledge.ts");
const fu = await lib("src/lib/followup.ts");
const fx = await lib("src/lib/followup-usaha.ts");
const fdef = await lib("src/lib/followup-def.ts");
const { dengar } = await lib("src/lib/peristiwa.ts");
const sql = await db();

let lolos = 0;
const gagalList = [];
async function cek(nama, fn) {
  const t0 = performance.now();
  try {
    await fn();
    lolos += 1;
    console.log(`  ok    ${nama} (${((performance.now() - t0) / 1000).toFixed(1)} dtk)`);
  } catch (e) {
    gagalList.push(nama);
    console.log(`  GAGAL ${nama}\n        ${String(e?.stack ?? e).split("\n").slice(0, 8).join("\n        ")}`);
  }
}
const peristiwa = [];
dengar((p) => peristiwa.push(p));
const tanda = (body) => `sha256=${createHmac("sha256", RAHASIA).update(body).digest("hex")}`;
let urutMasuk = 0;
const payloadPesan = (dari, teks, o = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: WABA,
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "6281111000001", phone_number_id: PNID },
            contacts: [{ profile: { name: o.nama ?? "Rina" }, wa_id: dari }],
            messages: [{ from: dari, id: o.id ?? `wamid.MASUK${++urutMasuk}`, timestamp: String(o.waktu ?? kini()), type: "text", text: { body: teks } }],
          },
        },
      ],
    },
  ],
});
const payloadStatus = (id, status, galat) => ({
  object: "whatsapp_business_account",
  entry: [{ id: WABA, changes: [{ field: "messages", value: { metadata: { phone_number_id: PNID }, statuses: [{ id, status, timestamp: String(kini()), recipient_id: "628444000001", ...(galat ? { errors: [galat] } : {}) }] } }] }],
});
const payloadLain = (field, value) => ({ object: "whatsapp_business_account", entry: [{ id: WABA, changes: [{ field, value }] }] });
let kunciWebhook = "";
async function webhook(isi, tandaLain) {
  const body = JSON.stringify(isi);
  return resmi.terimaWebhook(kunciWebhook, body, tandaLain ?? tanda(body));
}
const xst = () => globalThis.__waFollowupUsaha;
async function putaran() {
  for (const p of xst().per.values()) {
    p.bolehPada = 0;
    p.pindaiPada = 0;
    p.pindaiUlangPada = 0;
    p.cekRemPada = 0;
  }
  await fu.putaranFollowupUsaha();
  await bridge.tulisTuntas();
}
const chatDari = async (numberId, w) => (await bridge.tulisTuntas(), (await sql`SELECT * FROM percakapan WHERE number_id = ${numberId} AND telepon = ${w}`)[0]);
const prospekDari = async (w) => (await bridge.tulisTuntas(), (await sql`SELECT fp.* FROM followup_prospek fp JOIN percakapan p ON p.kunci = fp.kunci WHERE p.telepon = ${w}`)[0]);
async function mundurkan(numberId, w, detik) {
  await bridge.tulisTuntas();
  const c = await chatDari(numberId, w);
  await sql`UPDATE pesan_chat SET waktu = waktu - ${detik} WHERE percakapan_id = ${c.id}`;
  await sql`UPDATE percakapan SET terakhir_pada = terakhir_pada - ${detik}, minat_pada = minat_pada - ${detik}, masuk_pada = masuk_pada - ${detik} WHERE id = ${c.id}`;
}

const mulai = Date.now();
console.log("\n== WhatsApp resmi (Cloud API) + follow-up dua jalur ==");

await cek("definisi murni: status→ack, tier, jendela 24 jam, kredensial, template bawaan lolos aturan", async () => {
  assert.deepEqual(["sent", "delivered", "read", "failed", "x"].map(def.statusKeAck), [2, 3, 4, 0, null]);
  assert.equal(def.angkaTier("TIER_250"), 250);
  assert.equal(def.angkaTier("TIER_2K"), 2000);
  assert.equal(def.angkaTier("TIER_100K"), 100000);
  assert.equal(def.angkaTier("TIER_UNLIMITED"), Infinity);
  assert.equal(def.angkaTier(null), null);
  const t = kini();
  assert.equal(def.dalamJendela(t - 3600, t), true);
  assert.equal(def.dalamJendela(t - 24 * 3600 + 200, t), false, "5 menit terakhir jendela = di luar (margin aman)");
  assert.equal(def.dalamJendela(null, t), false);
  assert.ok("galat" in def.rapikanKredensial({ phone_number_id: "abc", waba_id: WABA, token: TOKEN, app_secret: RAHASIA }));
  assert.ok("galat" in def.rapikanKredensial({ phone_number_id: PNID, waba_id: WABA, token: "pendek", app_secret: RAHASIA }));
  assert.ok("galat" in def.rapikanKredensial({ phone_number_id: PNID, waba_id: WABA, token: TOKEN, app_secret: "bukan-hex" }));
  const ok = def.rapikanKredensial({ phone_number_id: ` ${PNID} `, waba_id: WABA, token: TOKEN, app_secret: RAHASIA.toUpperCase(), pin: "123456" });
  assert.equal(ok.data.phone_number_id, PNID);
  assert.equal(ok.data.app_secret, RAHASIA);
  for (const tb of def.TEMPLAT_BAWAAN) assert.equal(def.periksaIsiTemplat(tb.isi), null, `${tb.kode}: ${def.periksaIsiTemplat(tb.isi)}`);
  assert.match(def.periksaIsiTemplat("{{nama}} halo apa kabar kak semoga sehat selalu ya"), /awal atau akhir/);
  assert.match(def.periksaIsiTemplat("Halo kak {{nama}} {{usaha}} siap membantu Anda kapan saja ya"), /berdampingan/);
  assert.match(def.periksaIsiTemplat("Halo kak {{harga}}, terima kasih sudah bertanya ke kami ya"), /tidak dikenal/);
  const v = def.isiVariabel(def.TEMPLAT_BAWAAN[0].isi, { nama: "Rina\nSari   ", usaha: null });
  assert.deepEqual(v, { nama: "Rina Sari", usaha: "kami" });
  assert.match(def.renderTemplat(def.TEMPLAT_BAWAAN[0].isi, v), /^Halo Rina Sari, ini dari kami\./);
});

await cek("urai webhook: pesan teks/foto/lokasi/tombol, status + galat, template, kualitas; payload asing diabaikan", async () => {
  const w = def.uraiWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: WABA,
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: PNID },
              contacts: [{ profile: { name: "Budi" }, wa_id: "628555" }],
              messages: [
                { from: "628555", id: "m1", timestamp: "1700000000", type: "text", text: { body: "halo" }, context: { id: "wamid.lama" } },
                { from: "628555", id: "m2", timestamp: "1700000001", type: "image", image: { id: "med1", mime_type: "image/png", caption: "ini" } },
                { from: "628555", id: "m3", timestamp: "1700000002", type: "location", location: { latitude: -6.2, longitude: 106.8, name: "Rumah" } },
                { from: "628555", id: "m4", timestamp: "1700000003", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "ya", title: "YA" } } },
                { from: "628555", id: "m5", timestamp: "1700000004", type: "reaction", reaction: { emoji: "👍" } },
              ],
              statuses: [{ id: "s1", status: "failed", timestamp: "1700000005", recipient_id: "628555", errors: [{ code: 131049, title: "limit" }] }],
            },
          },
          { field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "cg_prospek_2", message_template_language: "id", message_template_id: 77 } },
          { field: "phone_number_quality_update", value: { display_phone_number: "6281111000001", event: "FLAGGED", current_limit: "TIER_250" } },
        ],
      },
    ],
  });
  assert.equal(w.pesan.length, 4, "reaksi diabaikan");
  assert.equal(w.pesan[0].nama, "Budi");
  assert.equal(w.pesan[0].konteks, "wamid.lama");
  assert.deepEqual(w.pesan[1].foto, { id: "med1", mime: "image/png" });
  assert.match(w.pesan[2].media, /lokasi "Rumah" https:\/\/maps\.google\.com/);
  assert.equal(w.pesan[3].teks, "YA");
  assert.deepEqual(w.status[0].galat, { kode: 131049, judul: "limit" });
  assert.equal(w.templat[0].status, "APPROVED");
  assert.equal(w.kualitas[0].peristiwa, "FLAGGED");
  assert.deepEqual(def.uraiWebhook({ object: "page", entry: [] }), { pesan: [], status: [], templat: [], kualitas: [] });
  assert.deepEqual(def.uraiWebhook(null), { pesan: [], status: [], templat: [], kualitas: [] });
});

fu.mulaiFollowup();
clearInterval(globalThis.__waFollowup.timer);
clearInterval(globalThis.__waFollowup.timerPindai);
clearInterval(globalThis.__waFollowup.timerUsaha);
await resmi.muatResmi();

const [{ id: pemilik }] = await sql`INSERT INTO users(email, nama, password_hash, peran, created_at) VALUES ('resmi@uji.id', 'Laundry Resmi', 'x', 'user', ${kini() - 40 * 86400}) RETURNING id`;
await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${pemilik}, 'Bisnis', ${kini() - 86400}, ${kini() + 30 * 86400}, 3, 100000, 'admin')`;
const n0 = await tambahNomor("Laundry Resmi", pemilik);
await sql`UPDATE numbers SET tunggu_detik = 1, tunggu_baca_detik = 3, saring_prospek = false, created_at = ${kini() - 30 * 86400} WHERE id = ${n0.id}`;
globalThis.__waNomor.janji = null;
await tambahDokumen({ numberId: n0.id, judul: "Usaha", sumber: "teks", teks: "Kamu CS Laundry Melati. Cuci bedcover king Rp35.000, selesai 2 hari. Jemput gratis area Jl. Melati." });
const RINA = "628444000001";

await cek("pasang: token salah ditolak (pesan Indonesia), kredensial benar = jalur resmi, terenkripsi, webhook & register", async () => {
  await assert.rejects(resmi.pasangResmi(n0.id, { phone_number_id: PNID, waba_id: WABA, token: "EAAG" + "y".repeat(60), app_secret: RAHASIA }), /Token akses Meta kedaluwarsa atau dicabut/);
  assert.equal((await nomorById(n0.id)).jalur, "baileys");
  const h = await resmi.pasangResmi(n0.id, { phone_number_id: PNID, waba_id: WABA, token: TOKEN, app_secret: RAHASIA, pin: "123456" });
  assert.equal(h.nomor, "6281111000001");
  assert.equal(h.nama, "Laundry Resmi");
  assert.match(h.webhook_url, /^https:\/\/contoh\.chatgercep\.test\/api\/wa\/meta\/[A-Za-z0-9_-]{20,}$/);
  assert.equal(meta.register, 1);
  assert.equal(meta.langganan, 1);
  kunciWebhook = h.webhook_url.split("/").pop();
  const n = await nomorById(n0.id);
  assert.equal(n.jalur, "resmi");
  assert.equal(n.wa_id, "6281111000001");
  assert.equal(wa.jalurSesi(n.sesi), "resmi");
  assert.equal(wa.infoSesi(n.sesi).status, "WORKING");
  const [r] = await sql`SELECT token_enkrip, rahasia_enkrip FROM nomor_resmi WHERE number_id = ${n0.id}`;
  assert.ok(!r.token_enkrip.includes(TOKEN.slice(4, 20)) && r.token_enkrip.startsWith("k1."), "token tidak tersimpan polos");
  assert.ok(!r.rahasia_enkrip.includes(RAHASIA));
  const s = await resmi.statusResmi(n0.id);
  assert.equal(s.jalur, "resmi");
  assert.equal(s.token, `••••${TOKEN.slice(-4)}`);
  assert.deepEqual(s.kuota, { terpakai: 0, batas: 250 });
  await assert.rejects(wa.cekTerdaftar(n.sesi, ["628123"]), /tidak tersedia di jalur WhatsApp resmi/);
});

await cek("jabat tangan webhook: verify token benar = challenge, salah / kunci asing = ditolak", async () => {
  const s = await resmi.statusResmi(n0.id);
  assert.equal(await resmi.verifikasiWebhook(kunciWebhook, "subscribe", s.verify_token, "tantangan123"), "tantangan123");
  assert.equal(await resmi.verifikasiWebhook(kunciWebhook, "subscribe", "salah", "x"), null);
  assert.equal(await resmi.verifikasiWebhook("kunci-asing", "subscribe", s.verify_token, "x"), null);
});

await cek("webhook: tanda tangan salah 401, kunci asing 404; pesan masuk dijawab AI lewat Cloud API (reply + tanda baca), duplikat dibuang", async () => {
  // Follow-up menyala lebih dulu: minat lead hanya dinilai bila follow-up / penyaring prospek aktif.
  await fx.simpanSetelanNomor(n0.id, { ...fdef.SETELAN_USAHA_AWAL, aktif: true, jamMulai: 0, jamSelesai: 24, batasHarian: 10 });
  const isi = payloadPesan(RINA, "kak cuci bedcover king berapa?", { id: "wamid.MASUK-A" });
  assert.equal(await webhook(isi, "sha256=" + "0".repeat(64)), 401);
  assert.equal(await resmi.terimaWebhook("kunci-asing", JSON.stringify(isi), tanda(JSON.stringify(isi))), 404);
  const awal = meta.kiriman.length;
  const t0 = performance.now();
  assert.equal(await webhook(isi), 200);
  const msWebhook = performance.now() - t0;
  assert.equal(await webhook(isi), 200, "kiriman ulang Meta tetap 200");
  await tunggu(() => meta.kiriman.length > awal, 8000, "balasan AI terkirim lewat Graph");
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(meta.kiriman.length, awal + 1, "duplikat tidak dijawab dua kali");
  const k = meta.kiriman.at(-1);
  assert.equal(k.to, RINA);
  assert.equal(k.type, "text");
  assert.match(k.text.body, /Rp35\.000/);
  assert.doesNotMatch(k.text.body, /<minat|<nilai/);
  assert.equal(k.context?.message_id, "wamid.MASUK-A", "balasan me-reply pesan pelanggan");
  assert.ok(meta.dibaca.includes("wamid.MASUK-A"), "pesan ditandai dibaca");
  const c = await chatDari(n0.id, RINA);
  assert.equal(c.nama, "Rina");
  assert.ok(Math.abs(c.masuk_pada - kini()) < 30, "masuk_pada (jendela 24 jam) tercatat");
  assert.equal(c.minat, 1);
  console.log(`        (webhook dijawab dalam ${msWebhook.toFixed(1)} ms, proses AI di latar)`);
});

await cek("status kiriman → ack ke pemantau & bus peristiwa (delivered = 3)", async () => {
  const id = meta.kiriman.at(-1).id;
  assert.equal(await webhook(payloadStatus(id, "delivered")), 200);
  await tunggu(() => peristiwa.some((p) => p.jenis === "pesan.status" && p.waId === id && p.status === 3), 2000, "pesan.status 3");
});

await cek("follow-up resmi di DALAM jendela 24 jam: teks AI bebas (bukan template), tanpa pemanasan", async () => {
  await fx.simpanSetelanNomor(n0.id, { ...fdef.SETELAN_USAHA_AWAL, aktif: true, jamMulai: 0, jamSelesai: 24, batasHarian: 10 });
  await mundurkan(n0.id, RINA, 4 * 3600);
  const awal = meta.kiriman.length;
  await putaran();
  assert.equal(meta.kiriman.length, awal + 1, "satu pesan follow-up");
  const k = meta.kiriman.at(-1);
  assert.equal(k.type, "text");
  assert.equal(k.text.body, TEKS1);
  const r = await prospekDari(RINA);
  assert.equal(r.tahap, 1);
  assert.equal(r.pesan1, TEKS1);
  assert.ok(peristiwa.some((p) => p.jenis === "followup.terkirim" && p.bentuk === "teks" && p.tahap === 1));
});

await cek("follow-up resmi di LUAR jendela tanpa template disetujui: ditahan dengan alasan jelas, tidak ada teks bebas", async () => {
  const r0 = await prospekDari(RINA);
  assert.equal(await webhook(payloadStatus(r0.pesan1_id, "delivered")), 200);
  await tunggu(async () => (await prospekDari(RINA)).ack1 === 3, 3000, "ack1 = 3");
  await mundurkan(n0.id, RINA, 30 * 3600);
  await sql`UPDATE followup_prospek SET jadwal = ${kini() - 1} WHERE kunci = ${r0.kunci}`;
  const awal = meta.kiriman.length;
  await putaran();
  assert.equal(meta.kiriman.length, awal, "tidak mengirim apa pun");
  const r = await prospekDari(RINA);
  assert.equal(r.status, "jalan");
  assert.equal(r.tahap, 1);
  assert.match(r.alasan, /template "Prospek: pesan 2 \(manfaat\)" belum disetujui Meta/);
});

await cek("template: bawaan diajukan (MARKETING, named params + contoh), webhook APPROVED → follow-up kirim template berisi nama", async () => {
  const daftar = await resmi.pasangTemplatBawaan(n0.id, "usaha");
  assert.deepEqual(daftar.map((t) => t.kode_tahap).sort(), ["prospek_1", "prospek_2", "prospek_3", "ulang"]);
  assert.ok(daftar.every((t) => t.status === "PENDING"));
  const aju = meta.templat.find((t) => t.name === "cg_prospek_2");
  assert.equal(aju.category, "MARKETING");
  assert.equal(aju.parameter_format, "named");
  assert.deepEqual(aju.components[0].example.body_text_named_params.map((p) => p.param_name), ["nama", "usaha"]);
  assert.equal(await webhook(payloadLain("message_template_status_update", { event: "APPROVED", message_template_name: "cg_prospek_2", message_template_language: "id", message_template_id: 2 })), 200);
  await tunggu(() => resmi.templatTahap(n0.id, "prospek_2"), 3000, "template tahap 2 siap");
  const r0 = await prospekDari(RINA);
  await sql`UPDATE followup_prospek SET jadwal = ${kini() - 1} WHERE kunci = ${r0.kunci}`;
  const awal = meta.kiriman.length;
  await putaran();
  assert.equal(meta.kiriman.length, awal + 1);
  const k = meta.kiriman.at(-1);
  assert.equal(k.type, "template");
  assert.equal(k.template.name, "cg_prospek_2");
  assert.equal(k.template.language.code, "id");
  assert.deepEqual(k.template.components[0].parameters, [
    { type: "text", parameter_name: "nama", text: "Rina" },
    { type: "text", parameter_name: "usaha", text: "Laundry Resmi" },
  ]);
  const r = await prospekDari(RINA);
  assert.equal(r.tahap, 2);
  assert.match(r.pesan2, /^Halo Rina, Laundry Resmi di sini\./, "teks yang tersimpan = template yang sudah diisi");
  assert.equal((await sql`SELECT count(*)::int AS n FROM kiriman_templat WHERE waba_id = ${WABA} AND penerima = ${RINA}`)[0].n, 1);
  assert.ok(peristiwa.some((p) => p.jenis === "followup.terkirim" && p.bentuk === "templat" && p.tahap === 2));
  assert.ok(peristiwa.some((p) => p.jenis === "templat.status" && p.status === "APPROVED"));
});

await cek("kuota tier: 90% dari 250 penerima/24 jam terpakai = template ditahan", async () => {
  await sql`INSERT INTO kiriman_templat (waba_id, penerima, pada) SELECT ${WABA}, '6290' || g, ${kini()} FROM generate_series(1, 230) g`;
  globalThis.__waResmi.kuota.clear();
  const n = await nomorById(n0.id);
  const alasan = await resmi.alasanKuota(n.id);
  assert.match(alasan, /Kuota penerima harian Meta hampir habis \(231 dari 250/);
  const { siapkanKiriman, TahanJalur } = await lib("src/lib/followup-jalur.ts");
  const c = await chatDari(n0.id, RINA);
  await assert.rejects(siapkanKiriman(n, c.kunci, "x", "prospek_2", { nama: "Rina" }), (e) => e instanceof TahanJalur && /hampir habis/.test(e.message));
  await sql`DELETE FROM kiriman_templat WHERE penerima LIKE '6290%'`;
  globalThis.__waResmi.kuota.clear();
});

await cek("kualitas: FLAGGED dari Meta = rem follow-up nomor + notifikasi pemilik; kesehatan nomor bahaya", async () => {
  meta.kualitas = "RED";
  assert.equal(await webhook(payloadLain("phone_number_quality_update", { display_phone_number: "6281111000001", event: "FLAGGED", current_limit: "TIER_250" })), 200);
  await tunggu(async () => (await sql`SELECT rem_pada FROM followup_nomor WHERE number_id = ${n0.id}`)[0]?.rem_pada, 4000, "rem nomor menyala");
  const n = await nomorById(n0.id);
  assert.ok(wa.kesehatanSesi(n.sesi).bahaya, "kesehatan nomor = bahaya");
  const [notif] = await tunggu(async () => {
    const r = await sql`SELECT judul FROM notifikasi WHERE user_id = ${pemilik} ORDER BY id DESC LIMIT 1`;
    return r.length ? r : null;
  }, 4000, "notifikasi pemilik");
  assert.match(notif.judul, /dihentikan otomatis/);
  assert.ok(peristiwa.some((p) => p.jenis === "followup.rem"));
  assert.ok(peristiwa.some((p) => p.jenis === "nomor.kualitas" && p.peristiwa === "FLAGGED"));
});

await cek("lepas: kembali ke Baileys, kredensial nonaktif (tidak dihapus), webhook nomor ini tidak diterima lagi", async () => {
  await resmi.lepasResmi(n0.id);
  const n = await nomorById(n0.id);
  assert.equal(n.jalur, "baileys");
  assert.equal(wa.jalurSesi(n.sesi), "baileys");
  assert.equal(wa.infoSesi(n.sesi).status, "BELUM_ADA");
  const [r] = await sql`SELECT aktif FROM nomor_resmi WHERE number_id = ${n0.id}`;
  assert.equal(r.aktif, false);
  assert.equal(await webhook(payloadPesan(RINA, "halo lagi")), 404);
});

await cek("hemat resource: 200 webhook status beruntun diproses tanpa query per event (median < 2 ms)", async () => {
  meta.kualitas = "GREEN";
  await resmi.pasangResmi(n0.id, { phone_number_id: PNID, waba_id: WABA, token: TOKEN, app_secret: RAHASIA });
  const ms = [];
  for (let i = 0; i < 200; i++) {
    const t0 = performance.now();
    assert.equal(await webhook(payloadStatus(`wamid.lain${i}`, "delivered")), 200);
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  const median = ms[100];
  console.log(`        (200 webhook status: median ${median.toFixed(2)} ms, p95 ${ms[190].toFixed(2)} ms)`);
  assert.ok(median < 2, `median ${median} ms`);
});

await bridge.tulisTuntas();
console.log(`\n${gagalList.length ? "ADA YANG GAGAL" : "SEMUA LOLOS"}: ${lolos} lolos, ${gagalList.length} gagal, ${((Date.now() - mulai) / 1000).toFixed(0)} dtk`);
if (gagalList.length) console.log("Gagal:\n- " + gagalList.join("\n- "));
srvAi.close();
srvMeta.close();
await globalThis.__waPg?.sql.end({ timeout: 2 }).catch(() => {});
await pg.berhenti().catch(() => {});
process.exit(gagalList.length ? 1 : 0);

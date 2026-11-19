import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db, getSetting, sekarang, setSetting } from "./db";
import { modeMesin } from "./mode";
import { kirimNotif } from "./notifikasi";
import { type Nomor, nomorById, semuaNomor, setJalur } from "./numbers";
import { pancarkan } from "./peristiwa";
import { dekripsiKredensial, enkripsiKredensial, samarkan } from "./rahasia";
import { type Foto, MAKS_FOTO_BYTE, MIME_FOTO, type SesiNomor } from "./types";
import {
  type Audio,
  type EventWa,
  type JalurLuar,
  MAKS_SUARA,
  type TemplatKirim,
  WaError,
  ackDariLuar,
  bahayaDariLuar,
  digitWa,
  kabariDariLuar,
  logout,
  pasangJalurLuar,
} from "./wa";
import {
  GRAPH_VERSI_BAWAAN,
  type IsiWebhook,
  type KebijakanJalur,
  type KodeTahap,
  type MasukanKredensial,
  NAMA_TEMPLAT_POLA,
  PORSI_KUOTA_TIER,
  TEMPLAT_BAWAAN,
  alasanTidakSehat,
  angkaTier,
  galatSementara,
  jelaskanGalatMeta,
  periksaIsiTemplat,
  statusKeAck,
  uraiKebijakan,
  uraiWebhook,
  variabelTemplat,
} from "./wa-resmi-def";

/**
 * Jalur WhatsApp resmi (Cloud API Meta) untuk nomor dengan numbers.jalur = 'resmi'.
 * Rencana: docs/plans/2026-11-18-followup-dua-jalur-wa-resmi.md.
 *
 * - Mendaftar ke wa.ts (pasangJalurLuar) saat dimuat: kirimTeks/kirimGambar/... di wa.ts otomatis lewat sini untuk
 *   nomor resmi, pesan masuk dari webhook masuk ke bridge.ts sebagai EventWa yang sama (kabariDariLuar), status
 *   sent/delivered/read/failed menjadi ack 2/3/4/0 (ackDariLuar) untuk follow-up.
 * - Kredensial per nomor (token System User + app secret) terenkripsi di nomor_resmi, didekripsi sekali ke memori.
 * - Webhook: /api/wa/meta/{kunci_webhook}. `kunci` memilih app secret SEBELUM body diurai; HMAC dicek, duplikat
 *   (Meta mengirim ulang sampai 7 hari) dibuang lewat LRU id, lalu langsung 200 (proses berjalan di latar).
 * - Tanpa polling: status, kualitas, dan template datang lewat webhook. Cadangan: cek nomor tiap 6 jam.
 */

interface Kred {
  numberId: number;
  sesi: string;
  userId: number | null;
  label: string;
  pnid: string;
  waba: string;
  token: string;
  rahasia: string;
  kunciWebhook: string;
  verify: string;
  nomorTampil: string | null;
  namaTampil: string | null;
  kualitas: string | null;
  tier: string | null;
  status: string | null;
  alasan: string | null;
  bahaya: { pada: number; alasan: string } | null;
  sejak: number;
}

export interface BarisTemplat {
  nama: string;
  bahasa: string;
  kategori: string;
  kode_tahap: KodeTahap | null;
  isi: string;
  status: string;
  alasan: string | null;
  diperbarui: number;
}

interface Keadaan {
  perSesi: Map<string, Kred>;
  perKunci: Map<string, Kred>;
  perPnid: Map<string, Kred>;
  /** Template APPROVED per nomor per kode tahap (untuk follow-up, tanpa I/O). */
  tahap: Map<number, Map<string, { nama: string; bahasa: string; isi: string }>>;
  dimuat: Promise<void> | null;
  /** Id pesan/status yang sudah diproses (Meta mengirim ulang webhook yang lambat dijawab). */
  terlihat: Map<string, number>;
  rantai: Map<string, Promise<void>>;
  kuota: Map<string, { n: number; pada: number }>;
  timer: ReturnType<typeof setInterval> | null;
}
const g = globalThis as unknown as { __waResmi?: Keadaan };
const st: Keadaan = (g.__waResmi ??= {
  perSesi: new Map(),
  perKunci: new Map(),
  perPnid: new Map(),
  tahap: new Map(),
  dimuat: null,
  terlihat: new Map(),
  rantai: new Map(),
  kuota: new Map(),
  timer: null,
});

const KUNCI_KEBIJAKAN = "jalur_wa";
const MAKS_TERLIHAT = 5_000;
const CEK_STATUS_MS = 6 * 3600_000;

const graphDasar = (): string => (process.env.META_GRAPH_URL || `https://graph.facebook.com/${process.env.META_GRAPH_VERSI || GRAPH_VERSI_BAWAAN}`).replace(/\/+$/, "");
// Mesin self-host: alamat publik mesin itu sendiri (ALAMAT_PUBLIK), supaya webhook Meta developer langsung ke mesinnya.
const asalApp = (): string => (process.env.APP_URL || (modeMesin() ? process.env.ALAMAT_PUBLIK : "") || "https://chatgercep.com").trim().replace(/\/+$/, "");
export const urlWebhook = (kunci: string): string => `${asalApp()}/api/wa/meta/${kunci}`;

// ---------- Kebijakan admin ----------

export async function kebijakanJalur(): Promise<KebijakanJalur> {
  return uraiKebijakan(await getSetting(KUNCI_KEBIJAKAN));
}
export async function simpanKebijakanJalur(k: KebijakanJalur): Promise<void> {
  await setSetting(KUNCI_KEBIJAKAN, uraiKebijakan(k));
}

// ---------- Graph API ----------

export class GalatMeta extends WaError {
  kode: number;
  constructor(kode: number, pesan: string) {
    super(pesan);
    this.kode = kode;
  }
}

async function graph<T>(token: string, metode: "GET" | "POST" | "DELETE", jalur: string, badan?: unknown, form?: FormData): Promise<T> {
  const url = /^https?:/.test(jalur) ? jalur : `${graphDasar()}/${jalur.replace(/^\/+/, "")}`;
  for (let coba = 0; ; coba++) {
    let r: Response;
    try {
      r = await fetch(url, {
        method: metode,
        headers: { Authorization: `Bearer ${token}`, ...(badan ? { "Content-Type": "application/json" } : {}) },
        body: form ?? (badan ? JSON.stringify(badan) : undefined),
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      if (coba < 1) continue;
      throw new WaError(`Server Meta tidak bisa dihubungi (${e instanceof Error ? e.message : String(e)}).`, "Could not reach Meta's servers.");
    }
    const teks = await r.text();
    let j: Record<string, unknown> = {};
    try {
      j = teks ? (JSON.parse(teks) as Record<string, unknown>) : {};
    } catch {
      // bukan JSON (mis. halaman galat proxy)
    }
    if (r.ok) return j as T;
    const e = (j.error ?? {}) as { code?: number; message?: string; error_data?: { details?: string } };
    const kode = Number(e.code) || r.status;
    if (galatSementara(kode) && coba < 2) {
      await new Promise((ok) => setTimeout(ok, 800 * (coba + 1)));
      continue;
    }
    throw new GalatMeta(kode, jelaskanGalatMeta(kode, `Meta menolak permintaan: ${e.error_data?.details || e.message || `HTTP ${r.status}`}`));
  }
}

// ---------- Muat & daftar ----------

interface BarisResmi {
  number_id: number;
  phone_number_id: string;
  waba_id: string;
  token_enkrip: string;
  rahasia_enkrip: string;
  kunci_webhook: string;
  verify_token: string;
  nomor_tampil: string | null;
  nama_tampil: string | null;
  kualitas: string | null;
  tier: string | null;
  status: string | null;
  alasan: string | null;
  diperbarui: number;
}

function jadiKred(b: BarisResmi, n: Nomor): Kred {
  return {
    numberId: n.id,
    sesi: n.sesi,
    userId: n.user_id,
    label: n.label,
    pnid: b.phone_number_id,
    waba: b.waba_id,
    token: dekripsiKredensial(b.token_enkrip),
    rahasia: dekripsiKredensial(b.rahasia_enkrip),
    kunciWebhook: b.kunci_webhook,
    verify: b.verify_token,
    nomorTampil: b.nomor_tampil,
    namaTampil: b.nama_tampil,
    kualitas: b.kualitas,
    tier: b.tier,
    status: b.status,
    alasan: b.alasan,
    bahaya: null,
    sejak: Date.now(),
  };
}

function simpanDiMemori(k: Kred): void {
  const lama = st.perSesi.get(k.sesi);
  if (lama) {
    st.perKunci.delete(lama.kunciWebhook);
    st.perPnid.delete(lama.pnid);
  }
  st.perSesi.set(k.sesi, k);
  st.perKunci.set(k.kunciWebhook, k);
  st.perPnid.set(k.pnid, k);
}
function buangDariMemori(sesi: string): void {
  const k = st.perSesi.get(sesi);
  if (!k) return;
  st.perSesi.delete(sesi);
  st.perKunci.delete(k.kunciWebhook);
  st.perPnid.delete(k.pnid);
  st.tahap.delete(k.numberId);
}

async function muatTahap(numberId?: number): Promise<void> {
  const sql = await db();
  const baris = numberId
    ? await sql<{ number_id: number; kode_tahap: string; nama: string; bahasa: string; isi: string }[]>`
        SELECT number_id, kode_tahap, nama, bahasa, isi FROM templat_wa
         WHERE number_id = ${numberId} AND kode_tahap IS NOT NULL AND status = 'APPROVED'`
    : await sql<{ number_id: number; kode_tahap: string; nama: string; bahasa: string; isi: string }[]>`
        SELECT number_id, kode_tahap, nama, bahasa, isi FROM templat_wa WHERE kode_tahap IS NOT NULL AND status = 'APPROVED'`;
  if (numberId) st.tahap.delete(numberId);
  else st.tahap.clear();
  for (const b of baris) {
    let m = st.tahap.get(b.number_id);
    if (!m) st.tahap.set(b.number_id, (m = new Map()));
    m.set(b.kode_tahap, { nama: b.nama, bahasa: b.bahasa, isi: b.isi });
  }
}

/** Muat semua nomor resmi ke memori (sekali; dipanggil saat server mulai dan oleh route webhook bila belum). */
export function muatResmi(): Promise<void> {
  return (st.dimuat ??= (async () => {
    const sql = await db();
    const [baris, nomor] = await Promise.all([
      sql<BarisResmi[]>`
        SELECT r.number_id, r.phone_number_id, r.waba_id, r.token_enkrip, r.rahasia_enkrip, r.kunci_webhook, r.verify_token,
               r.nomor_tampil, r.nama_tampil, r.kualitas, r.tier, r.status, r.alasan, r.diperbarui
          FROM nomor_resmi r JOIN numbers n ON n.id = r.number_id
         WHERE r.aktif AND n.jalur = 'resmi'`,
      semuaNomor(),
    ]);
    const perId = new Map(nomor.map((n) => [n.id, n]));
    for (const b of baris) {
      const n = perId.get(b.number_id);
      if (!n) continue;
      try {
        simpanDiMemori(jadiKred(b, n));
      } catch (e) {
        console.error(`[wa-resmi] kredensial nomor ${b.number_id} tidak bisa dibuka:`, e instanceof Error ? e.message : e);
      }
    }
    await muatTahap();
    if (!st.timer) {
      st.timer = setInterval(() => void segarkanSemua(), CEK_STATUS_MS);
      st.timer.unref?.();
    }
    if (baris.length) console.info(`[wa-resmi] ${st.perSesi.size} nomor memakai WhatsApp resmi`);
  })().catch((e) => {
    st.dimuat = null;
    // Database belum siap saat server mulai: dicoba lagi di latar (nomor resmi tidak boleh lama tidak terlayani).
    setTimeout(() => void muatResmi().catch(() => {}), 5_000).unref?.();
    throw e;
  }));
}

const kredDari = (sesi: string): Kred => {
  const k = st.perSesi.get(sesi);
  if (!k) throw new WaError("Nomor ini tidak memakai jalur WhatsApp resmi.", "This number is not on the official WhatsApp channel.");
  return k;
};

/** Tujuan kiriman: digit nomor HP. Chat lama Baileys yang hanya punya LID tidak bisa dihubungi lewat Cloud API. */
function tujuan(alamat: string): string {
  if (alamat.endsWith("@lid") || alamat.endsWith("@g.us")) {
    throw new WaError("Chat ini tidak punya nomor HP yang bisa dihubungi lewat WhatsApp resmi (ID tersembunyi / grup).", "This chat has no phone number reachable via official WhatsApp.");
  }
  const d = digitWa(alamat);
  if (!/^\d{8,15}$/.test(d)) throw new WaError("Nomor tujuan tidak valid.", "Invalid recipient number.");
  return d;
}

const idDari = (j: { messages?: { id?: string }[] }): string => {
  const id = j.messages?.[0]?.id;
  if (!id) throw new WaError("Meta tidak mengembalikan id pesan.", "Meta returned no message id.");
  return id;
};

async function kirimPesan(k: Kred, isi: Record<string, unknown>, padaId?: (id: string) => void): Promise<string> {
  const j = await graph<{ messages?: { id?: string }[] }>(k.token, "POST", `${k.pnid}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", ...isi });
  const id = idDari(j);
  padaId?.(id);
  return id;
}

async function unggahMedia(k: Kred, data: Buffer, mime: string, nama: string): Promise<string> {
  const f = new FormData();
  f.append("messaging_product", "whatsapp");
  f.append("type", mime);
  f.append("file", new Blob([new Uint8Array(data)], { type: mime }), nama);
  const j = await graph<{ id?: string }>(k.token, "POST", `${k.pnid}/media`, undefined, f);
  if (!j.id) throw new WaError("Meta tidak mengembalikan id media.", "Meta returned no media id.");
  return j.id;
}

async function unduhMedia(k: Kred, id: string, maks: number): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const info = await graph<{ url?: string; mime_type?: string; file_size?: number }>(k.token, "GET", id);
    if (!info.url || (info.file_size && info.file_size > maks)) return null;
    const r = await fetch(info.url, { headers: { Authorization: `Bearer ${k.token}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const data = Buffer.from(await r.arrayBuffer());
    if (data.length > maks) return null;
    return { data, mime: (info.mime_type || r.headers.get("content-type") || "").split(";")[0].trim() };
  } catch {
    return null;
  }
}

/** Satu template terkirim = satu penerima unik di kuota tier WABA (24 jam bergulir). */
async function catatKirimanTemplat(waba: string, penerima: string): Promise<void> {
  const sql = await db();
  const t = sekarang();
  await sql`INSERT INTO kiriman_templat (waba_id, penerima, pada) VALUES (${waba}, ${penerima}, ${t})
            ON CONFLICT (waba_id, penerima) DO UPDATE SET pada = EXCLUDED.pada`;
  const q = st.kuota.get(waba);
  if (q) q.n += 1;
}

const jalur: JalurLuar = {
  punya: (nama) => st.perSesi.has(nama),
  info(nama): SesiNomor {
    const k = st.perSesi.get(nama);
    if (!k) return { status: "BELUM_ADA", waId: null, nama: null, alasan: null };
    const sakit = k.bahaya?.alasan ?? alasanTidakSehat(k);
    const putus = (k.status ?? "CONNECTED").toUpperCase() !== "CONNECTED";
    return { status: putus ? "FAILED" : "WORKING", waId: putus ? null : k.nomorTampil, nama: k.namaTampil, alasan: putus ? sakit : null };
  },
  kesehatan(nama) {
    const k = st.perSesi.get(nama);
    if (!k) return { stabilMs: 0, bahaya: null };
    const sakit = alasanTidakSehat(k);
    const bahaya = k.bahaya ?? (sakit ? { pada: Date.now(), alasan: sakit } : null);
    // Cloud API tidak punya soket yang putus-sambung: "stabil" sejak kredensial dimuat.
    return { stabilMs: Math.max(Date.now() - k.sejak, 24 * 3600_000), bahaya };
  },
  async kirimTeks(nama, alamat, teks, padaId, kutipId) {
    const k = kredDari(nama);
    return kirimPesan(k, { to: tujuan(alamat), type: "text", text: { body: teks, preview_url: false }, ...(kutipId ? { context: { message_id: kutipId } } : {}) }, padaId);
  },
  async kirimGambar(nama, alamat, gambar, mime, caption, padaId) {
    const k = kredDari(nama);
    const to = tujuan(alamat);
    const id = await unggahMedia(k, gambar, mime, `foto.${mime.split("/")[1] || "jpg"}`);
    return kirimPesan(k, { to, type: "image", image: { id, ...(caption ? { caption } : {}) } }, padaId);
  },
  async kirimDokumen(nama, alamat, dokumen, mime, namaBerkas, caption, padaId) {
    const k = kredDari(nama);
    const to = tujuan(alamat);
    const id = await unggahMedia(k, dokumen, mime, namaBerkas);
    return kirimPesan(k, { to, type: "document", document: { id, filename: namaBerkas, ...(caption ? { caption } : {}) } }, padaId);
  },
  async kirimTemplat(nama, alamat, t: TemplatKirim, padaId) {
    const k = kredDari(nama);
    const to = tujuan(alamat);
    const parameters = Object.entries(t.variabel).map(([n, v]) => ({ type: "text", parameter_name: n, text: v }));
    const id = await kirimPesan(
      k,
      { to, type: "template", template: { name: t.nama, language: { code: t.bahasa }, ...(parameters.length ? { components: [{ type: "body", parameters }] } : {}) } },
      padaId,
    );
    await catatKirimanTemplat(k.waba, to).catch(() => {});
    return id;
  },
  async tandaiDibaca(nama, ids) {
    const k = kredDari(nama);
    // Cukup pesan terakhir: Meta menandai pesan sebelumnya ikut terbaca.
    const id = ids[ids.length - 1];
    if (id) await graph(k.token, "POST", `${k.pnid}/messages`, { messaging_product: "whatsapp", status: "read", message_id: id });
  },
  async lepas(nama) {
    const k = st.perSesi.get(nama);
    if (!k) return;
    await lepasResmi(k.numberId);
  },
};
pasangJalurLuar(jalur);

// ---------- Webhook ----------

/** Cocokkan X-Hub-Signature-256 dengan HMAC-SHA256(body mentah, app secret). Waktu konstan. */
export function tandaSahMeta(body: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const harap = Buffer.from(createHmac("sha256", appSecret).update(body, "utf8").digest("hex"), "utf8");
  const dapat = Buffer.from(header.slice(7).toLowerCase(), "utf8");
  return harap.length === dapat.length && timingSafeEqual(harap, dapat);
}

function sudahTerlihat(id: string): boolean {
  if (st.terlihat.has(id)) return true;
  st.terlihat.set(id, Date.now());
  if (st.terlihat.size > MAKS_TERLIHAT) {
    const tua = st.terlihat.keys().next().value;
    if (tua) st.terlihat.delete(tua);
  }
  return false;
}

function antre(sesi: string, kerja: () => Promise<void>): void {
  const lalu = st.rantai.get(sesi) ?? Promise.resolve();
  const berikut = lalu.then(kerja).catch((e) => console.error(`[wa-resmi ${sesi}] gagal memproses webhook:`, e instanceof Error ? e.message : e));
  st.rantai.set(sesi, berikut);
  void berikut.finally(() => {
    if (st.rantai.get(sesi) === berikut) st.rantai.delete(sesi);
  });
}

/** Jabat tangan GET dari Meta saat webhook dipasang di App Dashboard. Mengembalikan challenge atau null. */
export async function verifikasiWebhook(kunci: string, mode: string | null, token: string | null, challenge: string | null): Promise<string | null> {
  await muatResmi();
  const k = st.perKunci.get(kunci) ?? (await kredTidakAktif(kunci));
  if (!k || mode !== "subscribe" || !token || !challenge) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(k.verify);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? challenge : null;
}

/** Kredensial dari database untuk kunci webhook yang belum aktif di memori (jabat tangan sebelum nomor aktif). */
async function kredTidakAktif(kunci: string): Promise<{ verify: string } | null> {
  const sql = await db();
  const [r] = await sql<{ verify_token: string }[]>`SELECT verify_token FROM nomor_resmi WHERE kunci_webhook = ${kunci}`;
  return r ? { verify: r.verify_token } : null;
}

/**
 * POST webhook. Mengembalikan kode HTTP. Pemrosesan isi berjalan di latar (antrean per nomor), supaya Meta mendapat 200
 * secepatnya; event yang sama tidak diproses dua kali.
 */
export async function terimaWebhook(kunci: string, body: string, tanda: string | null): Promise<number> {
  await muatResmi();
  const k = st.perKunci.get(kunci);
  if (!k) return 404;
  if (!tandaSahMeta(body, tanda, k.rahasia)) return 401;
  let isi: unknown;
  try {
    isi = JSON.parse(body);
  } catch {
    return 400;
  }
  prosesIsi(uraiWebhook(isi), k);
  return 200;
}

/** Nomor tujuan event: phone_number_id di payload, tetapi hanya nomor yang memakai app secret yang sama (aplikasi Meta yang sama). */
function kredUntuk(pnid: string, dari: Kred): Kred | null {
  const k = st.perPnid.get(pnid);
  return k && k.rahasia === dari.rahasia ? k : null;
}

function prosesIsi(w: IsiWebhook, dari: Kred): void {
  for (const p of w.pesan) {
    const k = kredUntuk(p.pnid, dari);
    if (!k || sudahTerlihat(`m:${p.id}`)) continue;
    const alamat = `${p.dari}@s.whatsapp.net`;
    const ev: EventWa = {
      jenis: "pesan",
      sesi: k.sesi,
      id: p.id,
      chat: alamat,
      alamat,
      dariSaya: false,
      teks: p.teks,
      lampiran: p.lampiran,
      waktu: p.waktu,
      telepon: p.dari,
      namaPengirim: p.nama,
      media: p.media,
      kutip: { key: { id: p.id, remoteJid: alamat, fromMe: false } } as never,
      foto: p.foto ? () => fotoDari(k, p.foto!.id) : null,
      suara: p.suara ? () => suaraDari(k, p.suara!.id) : null,
      kutipan: null,
    };
    antre(k.sesi, () => kabariDariLuar(ev));
  }
  for (const s of w.status) {
    const k = kredUntuk(s.pnid, dari);
    const ack = statusKeAck(s.status);
    if (!k || ack === null || sudahTerlihat(`s:${s.id}:${s.status}`)) continue;
    ackDariLuar(k.sesi, s.id, ack);
    if (s.galat) {
      console.warn(`[wa-resmi ${k.sesi}] pesan ${s.id} gagal: ${s.galat.kode} ${s.galat.judul}`);
      if (s.galat.kode === 190 || s.galat.kode === 368) tandaiBahaya(k, jelaskanGalatMeta(s.galat.kode, s.galat.judul));
    }
  }
  if (w.templat.length) antre(`templat:${dari.waba}`, () => terapkanTemplat(w.templat));
  if (w.kualitas.length) antre(`kualitas:${dari.waba}`, () => terapkanKualitas(w.kualitas));
}

async function fotoDari(k: Kred, id: string): Promise<Foto | null> {
  const m = await unduhMedia(k, id, MAKS_FOTO_BYTE);
  if (!m || !(MIME_FOTO as readonly string[]).includes(m.mime)) return null;
  return { mime: m.mime as Foto["mime"], data: m.data.toString("base64") };
}
async function suaraDari(k: Kred, id: string): Promise<Audio | null> {
  const m = await unduhMedia(k, id, MAKS_SUARA.byte);
  return m ? { data: m.data, mime: m.mime || "audio/ogg", detik: 0 } : null;
}

function tandaiBahaya(k: Kred, alasan: string): void {
  k.bahaya = { pada: Date.now(), alasan };
  bahayaDariLuar(k.sesi, alasan);
}

async function nomorSeWaba(waba: string): Promise<Kred[]> {
  return [...st.perSesi.values()].filter((k) => k.waba === waba);
}

async function terapkanTemplat(daftar: IsiWebhook["templat"]): Promise<void> {
  const sql = await db();
  const t = sekarang();
  for (const u of daftar) {
    const kred = await nomorSeWaba(u.waba);
    if (!kred.length) continue;
    const ids = kred.map((k) => k.numberId);
    const baris = await sql<{ number_id: number; kode_tahap: string | null }[]>`
      UPDATE templat_wa SET status = ${u.status}, alasan = ${u.alasan}, meta_id = COALESCE(${u.metaId}, meta_id), diperbarui = ${t}
       WHERE number_id = ANY(${ids}) AND nama = ${u.nama} AND (${u.bahasa}::text IS NULL OR bahasa = ${u.bahasa})
       RETURNING number_id, kode_tahap`;
    for (const b of baris) {
      await muatTahap(b.number_id);
      const k = kred.find((x) => x.numberId === b.number_id);
      pancarkan({ jenis: "templat.status", numberId: b.number_id, nama: u.nama, status: u.status, alasan: u.alasan });
      if (k?.userId && (u.status === "PAUSED" || u.status === "DISABLED" || u.status === "REJECTED")) {
        const kata = u.status === "REJECTED" ? "ditolak" : u.status === "PAUSED" ? "dijeda" : "dimatikan";
        await kirimNotif(k.userId, {
          jenis: "nomor",
          judul: { id: `Template ${u.nama} ${kata} Meta`, en: `Template ${u.nama} ${u.status.toLowerCase()} by Meta` },
          isi: {
            id: `${u.alasan ? `Alasan: ${u.alasan}. ` : ""}Follow-up yang memakai template ini berhenti mengirim di luar jendela 24 jam sampai templatnya diperbaiki di tab Follow-up.`,
            en: `${u.alasan ? `Reason: ${u.alasan}. ` : ""}Follow-ups using this template stop sending outside the 24-hour window until it is fixed in the Follow-up tab.`,
          },
          tautan: `/nomor/${k.numberId}#followup`,
          kunci: `templat:${k.numberId}:${u.nama}:${u.status}:${t}`,
        });
      }
    }
  }
}

async function terapkanKualitas(daftar: IsiWebhook["kualitas"]): Promise<void> {
  for (const u of daftar) {
    for (const k of await nomorSeWaba(u.waba)) {
      if (u.nomor && k.nomorTampil && u.nomor !== k.nomorTampil) continue;
      await segarkanStatus(k.numberId).catch(() => {});
      pancarkan({ jenis: "nomor.kualitas", numberId: k.numberId, peristiwa: u.peristiwa, tier: u.tier, kualitas: k.kualitas });
      if (u.peristiwa === "DOWNGRADE" || u.peristiwa === "FLAGGED") {
        tandaiBahaya(k, `Meta menandai nomor (${u.peristiwa}${u.tier ? `, batas ${u.tier}` : ""})`);
      } else if (u.peristiwa === "UNFLAGGED" || u.peristiwa === "UPGRADE") {
        k.bahaya = null;
      }
    }
  }
}

// ---------- Pasang / lepas ----------

interface InfoNomorMeta {
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  status?: string;
  code_verification_status?: string;
}
const FIELD_NOMOR = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,status,code_verification_status";

export interface HasilPasang {
  webhook_url: string;
  verify_token: string;
  nomor: string | null;
  nama: string | null;
  peringatan: string[];
}

/**
 * Pasang jalur resmi untuk sebuah nomor: kredensial dicek ke Meta, nomor didaftarkan (bila PIN diisi), WABA
 * dilanggankan ke aplikasi, lalu kredensial disimpan terenkripsi dan sesi Baileys nomor itu dilepas.
 */
export async function pasangResmi(numberId: number, m: MasukanKredensial): Promise<HasilPasang> {
  const n = await nomorById(numberId);
  if (!n) throw new WaError("Nomor tidak ditemukan.", "Number not found.");
  const sql = await db();
  const [lain] = await sql<{ number_id: number }[]>`SELECT number_id FROM nomor_resmi WHERE phone_number_id = ${m.phone_number_id} AND number_id <> ${numberId}`;
  if (lain) throw new WaError("Phone number ID ini sudah dipasang di nomor lain.", "This phone number ID is already used by another number.");

  const info = await graph<InfoNomorMeta>(m.token, "GET", `${m.phone_number_id}?fields=${FIELD_NOMOR}`);
  const peringatan: string[] = [];
  if (m.pin) {
    try {
      await graph(m.token, "POST", `${m.phone_number_id}/register`, { messaging_product: "whatsapp", pin: m.pin });
    } catch (e) {
      peringatan.push(`Pendaftaran nomor ke Cloud API: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  try {
    await graph(m.token, "POST", `${m.waba_id}/subscribed_apps`);
  } catch (e) {
    peringatan.push(`Langganan webhook WABA: ${e instanceof Error ? e.message : String(e)}`);
  }

  const t = sekarang();
  const [ada] = await sql<{ kunci_webhook: string; verify_token: string }[]>`SELECT kunci_webhook, verify_token FROM nomor_resmi WHERE number_id = ${numberId}`;
  const kunci = ada?.kunci_webhook ?? randomBytes(18).toString("base64url");
  const verify = ada?.verify_token ?? randomBytes(18).toString("base64url");
  const nomorTampil = (info.display_phone_number ?? "").replace(/\D/g, "") || null;
  await sql`
    INSERT INTO nomor_resmi (number_id, phone_number_id, waba_id, token_enkrip, rahasia_enkrip, kunci_webhook, verify_token,
                             nomor_tampil, nama_tampil, kualitas, tier, status, alasan, aktif, diperbarui)
    VALUES (${numberId}, ${m.phone_number_id}, ${m.waba_id}, ${enkripsiKredensial(m.token)}, ${enkripsiKredensial(m.app_secret)}, ${kunci}, ${verify},
            ${nomorTampil}, ${info.verified_name ?? null}, ${info.quality_rating ?? null}, ${info.messaging_limit_tier ?? null}, ${info.status ?? null}, null, true, ${t})
    ON CONFLICT (number_id) DO UPDATE SET
      phone_number_id = EXCLUDED.phone_number_id, waba_id = EXCLUDED.waba_id, token_enkrip = EXCLUDED.token_enkrip,
      rahasia_enkrip = EXCLUDED.rahasia_enkrip, nomor_tampil = EXCLUDED.nomor_tampil, nama_tampil = EXCLUDED.nama_tampil,
      kualitas = EXCLUDED.kualitas, tier = EXCLUDED.tier, status = EXCLUDED.status, alasan = null, aktif = true, diperbarui = EXCLUDED.diperbarui`;

  // Sesi Baileys nomor ini dilepas lebih dulu (satu nomor satu jalur), baru jalur resmi dipasang di memori.
  if (n.jalur !== "resmi") {
    await logout(n.sesi).catch(() => {});
    await setJalur(numberId, "resmi");
  }
  if (nomorTampil) {
    await sql`UPDATE numbers SET wa_id = NULL WHERE wa_id = ${nomorTampil} AND id <> ${numberId}`;
    await sql`UPDATE numbers SET wa_id = ${nomorTampil}, nama_wa = COALESCE(${info.verified_name ?? null}, nama_wa), last_connected_at = ${t} WHERE id = ${numberId}`;
  }
  const baru = await nomorById(numberId);
  const [b] = await sql<BarisResmi[]>`SELECT * FROM nomor_resmi WHERE number_id = ${numberId}`;
  if (baru && b) simpanDiMemori(jadiKred(b, baru));
  await muatTahap(numberId);
  pancarkan({ jenis: "nomor.terhubung", sesi: n.sesi, waId: nomorTampil ?? "", nama: info.verified_name ?? null });
  return { webhook_url: urlWebhook(kunci), verify_token: verify, nomor: nomorTampil, nama: info.verified_name ?? null, peringatan };
}

/** Kembali ke jalur Baileys (scan QR). Kredensial dinonaktifkan, tidak dihapus (bisa dipasang lagi). */
export async function lepasResmi(numberId: number): Promise<void> {
  const n = await nomorById(numberId);
  const sql = await db();
  await sql`UPDATE nomor_resmi SET aktif = false, diperbarui = ${sekarang()} WHERE number_id = ${numberId}`;
  if (n) {
    buangDariMemori(n.sesi);
    if (n.jalur === "resmi") await setJalur(numberId, "baileys");
  }
}

/** Ambil ulang kualitas, tier, dan status nomor dari Meta. */
export async function segarkanStatus(numberId: number): Promise<void> {
  const k = [...st.perSesi.values()].find((x) => x.numberId === numberId);
  if (!k) return;
  const sql = await db();
  try {
    const info = await graph<InfoNomorMeta>(k.token, "GET", `${k.pnid}?fields=${FIELD_NOMOR}`);
    k.kualitas = info.quality_rating ?? k.kualitas;
    k.tier = info.messaging_limit_tier ?? k.tier;
    k.status = info.status ?? k.status;
    k.namaTampil = info.verified_name ?? k.namaTampil;
    k.alasan = null;
    const sakit = alasanTidakSehat(k);
    if (sakit && !k.bahaya) tandaiBahaya(k, sakit);
    if (!sakit && k.bahaya && Date.now() - k.bahaya.pada > 6 * 3600_000) k.bahaya = null;
  } catch (e) {
    k.alasan = e instanceof Error ? e.message : String(e);
    if (e instanceof GalatMeta && (e.kode === 190 || e.kode === 10 || e.kode === 200)) {
      k.status = "TOKEN_DITOLAK";
      tandaiBahaya(k, k.alasan);
    }
  }
  await sql`UPDATE nomor_resmi SET kualitas = ${k.kualitas}, tier = ${k.tier}, status = ${k.status}, nama_tampil = ${k.namaTampil}, alasan = ${k.alasan}, diperbarui = ${sekarang()}
             WHERE number_id = ${numberId}`;
}

async function segarkanSemua(): Promise<void> {
  for (const k of [...st.perSesi.values()]) await segarkanStatus(k.numberId).catch(() => {});
}

// ---------- Kuota & jendela ----------

/** Penerima unik template WABA ini dalam 24 jam (disimpan 60 dtk di memori). */
export async function kuotaTerpakai(waba: string): Promise<number> {
  const q = st.kuota.get(waba);
  if (q && Date.now() - q.pada < 60_000) return q.n;
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM kiriman_templat WHERE waba_id = ${waba} AND pada > ${sekarang() - 86400}`;
  st.kuota.set(waba, { n: r.n, pada: Date.now() });
  return r.n;
}

export interface KesiapanTemplat {
  nama: string;
  bahasa: string;
  isi: string;
}

/** Template APPROVED untuk tahap follow-up di nomor ini (memori), atau null. */
export function templatTahap(numberId: number, kode: KodeTahap): KesiapanTemplat | null {
  return st.tahap.get(numberId)?.get(kode) ?? null;
}

/** null = boleh mengirim template; selain itu alasan menahan (kuota tier WABA hampir habis). */
export async function alasanKuota(numberId: number): Promise<string | null> {
  const k = [...st.perSesi.values()].find((x) => x.numberId === numberId);
  if (!k) return "Nomor tidak memakai jalur resmi";
  const batas = angkaTier(k.tier) ?? 250;
  if (!Number.isFinite(batas)) return null;
  const n = await kuotaTerpakai(k.waba);
  return n >= Math.floor(batas * PORSI_KUOTA_TIER) ? `Kuota penerima harian Meta hampir habis (${n} dari ${batas} dalam 24 jam)` : null;
}

export const nomorResmi = (sesi: string): boolean => st.perSesi.has(sesi);

// ---------- Status untuk UI / API ----------

export interface StatusResmi {
  jalur: "baileys" | "resmi";
  kebijakan: KebijakanJalur;
  phone_number_id: string | null;
  waba_id: string | null;
  token: string | null;
  nomor: string | null;
  nama: string | null;
  kualitas: string | null;
  tier: string | null;
  status: string | null;
  alasan: string | null;
  webhook_url: string | null;
  verify_token: string | null;
  kuota: { terpakai: number; batas: number | null } | null;
}

export async function statusResmi(numberId: number): Promise<StatusResmi> {
  const [n, kebijakan] = await Promise.all([nomorById(numberId), kebijakanJalur()]);
  const k = n ? st.perSesi.get(n.sesi) : undefined;
  if (!n || !k) {
    const sql = await db();
    const [b] = await sql<{ phone_number_id: string; waba_id: string; kunci_webhook: string; verify_token: string; nomor_tampil: string | null; nama_tampil: string | null }[]>`
      SELECT phone_number_id, waba_id, kunci_webhook, verify_token, nomor_tampil, nama_tampil FROM nomor_resmi WHERE number_id = ${numberId}`;
    return {
      jalur: "baileys",
      kebijakan,
      phone_number_id: b?.phone_number_id ?? null,
      waba_id: b?.waba_id ?? null,
      token: null,
      nomor: b?.nomor_tampil ?? null,
      nama: b?.nama_tampil ?? null,
      kualitas: null,
      tier: null,
      status: null,
      alasan: null,
      webhook_url: b ? urlWebhook(b.kunci_webhook) : null,
      verify_token: b?.verify_token ?? null,
      kuota: null,
    };
  }
  const batas = angkaTier(k.tier);
  return {
    jalur: "resmi",
    kebijakan,
    phone_number_id: k.pnid,
    waba_id: k.waba,
    token: samarkan(k.token),
    nomor: k.nomorTampil,
    nama: k.namaTampil,
    kualitas: k.kualitas,
    tier: k.tier,
    status: k.status,
    alasan: k.bahaya?.alasan ?? k.alasan,
    webhook_url: urlWebhook(k.kunciWebhook),
    verify_token: k.verify,
    kuota: { terpakai: await kuotaTerpakai(k.waba), batas: batas === null ? null : Number.isFinite(batas) ? batas : null },
  };
}

/** Boleh memasang jalur resmi di nomor ini menurut kebijakan admin? (Admin selalu boleh.) */
export async function bolehResmi(adalahAdmin: boolean): Promise<boolean> {
  if (adalahAdmin) return true;
  return (await kebijakanJalur()) !== "baileys";
}

// ---------- Template ----------

export async function daftarTemplat(numberId: number): Promise<BarisTemplat[]> {
  const sql = await db();
  const b = await sql<BarisTemplat[]>`
    SELECT nama, bahasa, kategori, kode_tahap, isi, status, alasan, diperbarui FROM templat_wa
     WHERE number_id = ${numberId} ORDER BY kode_tahap NULLS LAST, nama, bahasa LIMIT 200`;
  return [...b];
}

const kredNomor = async (numberId: number): Promise<Kred> => {
  const n = await nomorById(numberId);
  const k = n ? st.perSesi.get(n.sesi) : undefined;
  if (!k) throw new WaError("Pasang jalur WhatsApp resmi di nomor ini dulu.", "Set up the official WhatsApp channel on this number first.");
  return k;
};

/** Simpan (dan ajukan ke Meta) template. Isi divalidasi; template yang sudah ada diganti lalu diajukan ulang. */
export async function simpanTemplat(numberId: number, t: { nama: string; isi: string; kode_tahap?: string | null; bahasa?: string }): Promise<BarisTemplat> {
  const nama = t.nama.trim().toLowerCase();
  if (!NAMA_TEMPLAT_POLA.test(nama)) throw new WaError("Nama template hanya huruf kecil, angka, dan garis bawah (maks 100).", "Template name: lowercase letters, digits and underscores only.");
  const isi = t.isi.trim();
  const salah = periksaIsiTemplat(isi);
  if (salah) throw new WaError(salah);
  const kode = t.kode_tahap && TEMPLAT_BAWAAN.some((x) => x.kode === t.kode_tahap) ? (t.kode_tahap as KodeTahap) : null;
  const bahasa = /^[a-z]{2}(_[A-Z]{2})?$/.test(t.bahasa ?? "id") ? (t.bahasa ?? "id") : "id";
  const k = await kredNomor(numberId);
  const sql = await db();
  // Kode tahap unik per nomor: template lain dengan kode yang sama dilepas dari tahap itu.
  if (kode) await sql`UPDATE templat_wa SET kode_tahap = NULL WHERE number_id = ${numberId} AND kode_tahap = ${kode} AND NOT (nama = ${nama} AND bahasa = ${bahasa})`;
  const vars = variabelTemplat(isi);
  const contoh: Record<string, string> = { nama: "Rina", usaha: k.namaTampil || k.label || "Toko Kami" };
  let status = "PENDING";
  let alasan: string | null = null;
  let metaId: string | null = null;
  try {
    const j = await graph<{ id?: string; status?: string }>(k.token, "POST", `${k.waba}/message_templates`, {
      name: nama,
      language: bahasa,
      category: "MARKETING",
      parameter_format: "named",
      components: [
        {
          type: "BODY",
          text: isi,
          ...(vars.length ? { example: { body_text_named_params: vars.map((v) => ({ param_name: v, example: contoh[v] ?? "contoh" })) } } : {}),
        },
      ],
    });
    status = (j.status ?? "PENDING").toUpperCase();
    metaId = j.id ?? null;
  } catch (e) {
    // Nama sudah ada di Meta: isi lama tetap dipakai Meta; status disinkronkan dari daftar Meta.
    status = "GAGAL_AJU";
    alasan = e instanceof Error ? e.message : String(e);
  }
  const t2 = sekarang();
  const [b] = await sql<BarisTemplat[]>`
    INSERT INTO templat_wa (number_id, nama, bahasa, kategori, kode_tahap, isi, status, alasan, meta_id, diperbarui)
    VALUES (${numberId}, ${nama}, ${bahasa}, 'MARKETING', ${kode}, ${isi}, ${status}, ${alasan}, ${metaId}, ${t2})
    ON CONFLICT (number_id, nama, bahasa) DO UPDATE SET kode_tahap = EXCLUDED.kode_tahap, isi = EXCLUDED.isi, status = EXCLUDED.status,
      alasan = EXCLUDED.alasan, meta_id = COALESCE(EXCLUDED.meta_id, templat_wa.meta_id), diperbarui = EXCLUDED.diperbarui
    RETURNING nama, bahasa, kategori, kode_tahap, isi, status, alasan, diperbarui`;
  await muatTahap(numberId);
  return b;
}

/** Ajukan semua template bawaan yang cocok untuk nomor ini (yang belum ada). */
export async function pasangTemplatBawaan(numberId: number, untuk: "cs" | "usaha"): Promise<BarisTemplat[]> {
  const ada = new Set((await daftarTemplat(numberId)).map((t) => t.kode_tahap).filter(Boolean));
  const hasil: BarisTemplat[] = [];
  for (const t of TEMPLAT_BAWAAN) {
    if (ada.has(t.kode) || (t.untuk !== "keduanya" && t.untuk !== untuk)) continue;
    hasil.push(await simpanTemplat(numberId, { nama: t.nama, isi: t.isi, kode_tahap: t.kode }));
  }
  return hasil;
}

/** Tarik status semua template WABA dari Meta (tombol "Segarkan"; webhook tetap jalur utama). */
export async function sinkronTemplat(numberId: number): Promise<BarisTemplat[]> {
  const k = await kredNomor(numberId);
  const j = await graph<{ data?: { name: string; language: string; status: string; rejected_reason?: string; id?: string }[] }>(
    k.token,
    "GET",
    `${k.waba}/message_templates?fields=name,language,status,rejected_reason,id&limit=200`,
  );
  const sql = await db();
  const t = sekarang();
  for (const x of j.data ?? []) {
    const alasan = x.rejected_reason && x.rejected_reason !== "NONE" ? x.rejected_reason : null;
    await sql`UPDATE templat_wa SET status = ${x.status.toUpperCase()}, alasan = ${alasan}, meta_id = COALESCE(${x.id ?? null}, meta_id), diperbarui = ${t}
               WHERE number_id = ${numberId} AND nama = ${x.name} AND bahasa = ${x.language}`;
  }
  await muatTahap(numberId);
  return daftarTemplat(numberId);
}

export async function hapusTemplat(numberId: number, nama: string): Promise<void> {
  const k = await kredNomor(numberId);
  try {
    await graph(k.token, "DELETE", `${k.waba}/message_templates?name=${encodeURIComponent(nama)}`);
  } catch (e) {
    if (!(e instanceof GalatMeta) || e.kode !== 100) throw e; // 100 = tidak ada di Meta: tetap dihapus dari daftar kita
  }
  const sql = await db();
  await sql`DELETE FROM templat_wa WHERE number_id = ${numberId} AND nama = ${nama}`;
  await muatTahap(numberId);
}

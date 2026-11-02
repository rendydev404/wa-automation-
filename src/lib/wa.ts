import "server-only";
import { createHash } from "node:crypto";
import type { ConnectionState, SocketConfig, WAMessage, WASocket, proto } from "baileys";
import { type BitQr, kemasQr } from "./qr";
import { type Foto, MAKS_FOTO_BYTE, MIME_FOTO, type SesiNomor } from "./types";
import { type AuthSesi, bukaAuth, hapusAuth, rapikanAuthYatim, sesiTerpasang, tungguSemuaTulis } from "./wa-auth";

/**
 * Gerbang WhatsApp: Baileys berjalan di dalam proses app ini, satu soket WebSocket per nomor
 * (nama sesinya = numbers.sesi). Tidak ada container, HTTP, maupun webhook di antaranya: status
 * dibaca dari memori dan pesan masuk langsung diteruskan ke jembatan (src/lib/bridge.ts).
 *
 * Supaya ringan untuk banyak nomor:
 *   - riwayat chat tidak disinkronkan dan tidak ada penyimpanan pesan;
 *   - grup, status, dan saluran dibuang sebelum didekripsi;
 *   - kunci Signal ada di database, yang di memori hanya cache LRU kecil per nomor (wa-auth.ts);
 *   - nomor yang belum dipasangkan tidak punya soket sampai QR-nya diminta, dan soketnya ditutup
 *     lagi bila QR tidak dipindai;
 *   - saat server mulai, nomor disambungkan bergiliran, bukan serentak.
 */

type Baileys = typeof import("baileys");

export type EventWa =
  | { jenis: "terhubung"; sesi: string; waId: string; nama: string | null }
  | {
      jenis: "pesan";
      sesi: string;
      id: string;
      /** Id tetap lawan bicara (LID bila diketahui), dipakai sebagai kunci percakapan. */
      chat: string;
      /** JID tujuan untuk membalas pesan ini. */
      alamat: string;
      dariSaya: boolean;
      teks: string;
      lampiran: boolean;
      /**
       * Pesan masuk berisi foto: pengunduhnya. Foto baru diunduh bila AI memang akan menjawab
       * (tidak saat AI diam / dimatikan), dan tidak pernah disimpan. null bila gagal / terlalu besar.
       */
      foto?: (() => Promise<Foto | null>) | null;
      /** Detik epoch. */
      waktu: number;
      /** Digit nomor WA lawan bicara bila diketahui (dari PN JID / remoteJidAlt). */
      telepon?: string | null;
      /** Nama profil WA lawan bicara (pushName pesan masuk). */
      namaPengirim?: string | null;
      /** Pesan masuk ini apa adanya, untuk dikutip (reply) oleh balasan AI. */
      kutip?: WAMessage | null;
      /** Isi non-teks dalam kata-kata (mis. 'lokasi "Rumah" https://maps...', 'dokumen "menu.pdf"'), null bila tidak ada. */
      media?: string | null;
      /** Pesan suara/audio: pengunduhnya (dipanggil hanya bila AI akan menjawab). */
      suara?: (() => Promise<Audio | null>) | null;
      /** Pesan yang di-reply (dikutip) lawan bicara. `dariKami` = pesan dari nomor ini (bot/pemilik). */
      kutipan?: { teks: string; dariKami: boolean; foto: (() => Promise<Foto | null>) | null } | null;
      /** Lawan bicara mengedit pesannya; `teks` berisi versi barunya. */
      diedit?: boolean;
    }
  /** Pesan masuk di chat ini terbaca dari perangkat lain milik nomor (HP pemilik). */
  | { jenis: "dibaca"; sesi: string; chat: string };

export class WaError extends Error {}

/** Pesan suara/audio pelanggan, langsung di memori (tidak disimpan). */
export interface Audio {
  data: Buffer;
  mime: string;
  detik: number;
}
/** Batas pesan suara yang ditranskrip: lebih panjang dari ini tidak diunduh. */
export const MAKS_SUARA = { detik: 300, byte: 10 * 1024 * 1024 } as const;

interface Sesi {
  nama: string;
  sock: WASocket | null;
  status: SesiNomor["status"];
  waId: string | null;
  namaWa: string | null;
  alasan: string | null;
  qr: string | null;
  qrBit: { hash: string; kode: BitQr } | null;
  /** Naik tiap soket dibuat atau sengaja diputus; event dari soket sebelumnya diabaikan. */
  gen: number;
  gagal: number;
  /** Nomor sudah tertaut (punya kredensial `me`): sambung ulang tanpa pernah menyerah. */
  terpasang: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Event satu sesi diproses berurutan. */
  rantai: Promise<void>;
  /** Menunggu keadaan pertama yang pasti (QR / terhubung / tertutup). */
  tunggu: (() => void)[];
  /** Jumlah chat yang sedang "mengetik"; nomor dibuat offline lagi setelah kembali ke 0. */
  mengetik: number;
  online: boolean;
  timerOffline: ReturnType<typeof setTimeout> | null;
  presensi: Promise<void>;
}

interface Keadaan {
  sesi: Map<string, Sesi>;
  lib?: Promise<Baileys>;
  versi?: [number, number, number];
  versiPada: number;
  versiJanji?: Promise<void>;
  penangan: ((ev: EventWa) => void | Promise<void>) | null;
  dimulai: boolean;
  /** Khusus pengujian: ubah jeda mulai bergiliran & coba-ulang DB setelah diuji. */
  jedaMulaiMs?: number;
  jedaDbMs?: number;
}

const g = globalThis as unknown as { __waGerbang?: Keadaan };
const st: Keadaan = (g.__waGerbang ??= { sesi: new Map(), versiPada: 0, penangan: null, dimulai: false });

const JEDA_MULAI_MS = 700; // jarak antar-nomor saat menyambungkan semuanya di awal
const JEDA_ULANG_MAKS_MS = 60_000;
const JEDA_DIGANTIKAN_MAKS_MS = 300_000;
const KODE = { keluar: 401, ditolak: 403, versiDitolak: 405, waktuHabis: 408, tidakCocok: 411, digantikan: 440, mulaiUlang: 515 } as const;

/** Pustaka dimuat saat pertama dibutuhkan, bukan saat server mulai atau saat build. */
const baileys = (): Promise<Baileys> => (st.lib ??= import("baileys"));

export const digitWa = (id: string | null | undefined): string => (id ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");

const tidur = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), ms));

async function denganBatas<T>(janji: Promise<T>, ms: number, aksi: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([janji, new Promise<never>((_, tolak) => (timer = setTimeout(() => tolak(new WaError(`WhatsApp tidak menjawab saat ${aksi}.`)), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** Jembatan mendaftarkan diri di sini; dicari saat event tiba supaya tetap benar setelah modul dimuat ulang. */
export function padaEvent(fn: (ev: EventWa) => void | Promise<void>): void {
  st.penangan = fn;
}

/** Selesai setelah penangannya selesai, supaya event satu nomor benar-benar diproses berurutan. */
async function kabari(ev: EventWa): Promise<void> {
  try {
    await st.penangan?.(ev);
  } catch (e) {
    console.error("[wa] gagal menangani event:", e);
  }
}

/** Baileys mencatat lewat antarmuka mirip pino; yang diteruskan hanya galat, satu baris ringkas. */
function pencatat(nama: string): SocketConfig["logger"] {
  const diam = () => {};
  const l: SocketConfig["logger"] = {
    level: "error",
    child: () => l,
    trace: diam,
    debug: diam,
    info: diam,
    warn: diam,
    error(obj: unknown, msg?: string) {
      const o = (typeof obj === "object" && obj ? obj : {}) as Record<string, unknown>;
      const rinci = [o.err, o.error, o.trace].map((v) => (v instanceof Error ? v.message : typeof v === "string" ? v.split("\n")[0] : "")).find(Boolean) || ringkasNode(o.fullErrorNode);
      console.error(`[wa ${nama}] ${[msg ?? (typeof obj === "string" ? obj : ""), rinci].filter(Boolean).join(": ").slice(0, 300)}`);
    },
  };
  return l;
}

/** Isi `stream:error` dari WhatsApp (mis. `stream:error{"code":"401"} > conflict{"type":"device_removed"}`): satu-satunya petunjuk alasan diputus. */
function ringkasNode(n: unknown): string {
  type Node = { tag?: string; attrs?: Record<string, string>; content?: unknown };
  const node = n as Node | null;
  if (!node?.tag) return "";
  const satu = (x: Node) => `${x.tag}${x.attrs && Object.keys(x.attrs).length ? JSON.stringify(x.attrs) : ""}`;
  const anak = Array.isArray(node.content) ? (node.content as Node[]).filter((c) => c?.tag).map(satu) : [];
  return [satu(node), ...anak].join(" > ");
}

function sesiAtauBaru(nama: string): Sesi {
  let s = st.sesi.get(nama);
  if (!s) {
    s = {
      nama,
      sock: null,
      status: "STOPPED",
      waId: null,
      namaWa: null,
      alasan: null,
      qr: null,
      qrBit: null,
      gen: 0,
      gagal: 0,
      terpasang: false,
      timer: null,
      rantai: Promise.resolve(),
      tunggu: [],
      mengetik: 0,
      online: false,
      timerOffline: null,
      presensi: Promise.resolve(),
    };
    st.sesi.set(nama, s);
  }
  return s;
}

function lepasTunggu(s: Sesi): void {
  for (const fn of s.tunggu.splice(0)) fn();
}

function antre(s: Sesi, kerja: () => Promise<void> | void): void {
  s.rantai = s.rantai.then(kerja).catch((e) => console.error(`[wa ${s.nama}] gagal memproses event:`, e));
}

/**
 * Versi WhatsApp Web terkini, dipakai untuk SETIAP soket. Versi bawaan pustaka cepat usang, dan
 * WhatsApp tidak selalu menolaknya saat menyambung (405): perangkat bisa diterima dulu lalu dicabut
 * beberapa detik/menit setelah tertaut (stream:error 401, "dikeluarkan").
 * Dicek paling sering sejam sekali (satu permintaan untuk semua nomor); bila gagal, dicoba lagi
 * 5 menit kemudian dan sementara itu dipakai versi terakhir yang diketahui.
 */
function perbaruiVersi(B: Baileys, paksa = false): Promise<void> {
  if (!paksa && st.versiJanji && Date.now() - st.versiPada < 3_600_000) return st.versiJanji;
  st.versiPada = Date.now();
  return (st.versiJanji = B.fetchLatestWaWebVersion({ signal: AbortSignal.timeout(8_000) })
    .then((h) => {
      if (!h.isLatest) throw new Error("versi terbaru tidak bisa diambil");
      if (h.version.join(".") !== st.versi?.join(".")) console.info(`[wa] memakai versi WhatsApp Web ${h.version.join(".")}`);
      st.versi = h.version;
    })
    .catch((e) => {
      st.versiPada = Date.now() - 3_300_000;
      console.warn(`[wa] gagal mengambil versi WhatsApp Web (${e instanceof Error ? e.message : String(e)}); memakai ${st.versi ? "versi terakhir" : "versi bawaan pustaka"}`);
    }));
}

/**
 * Id tetap sebuah chat pribadi. Lawan bicara yang sama bisa muncul sebagai nomor telepon (PN) di
 * satu event dan sebagai LID di event lain; dipakai LID-nya bila diketahui supaya keadaan
 * percakapan tidak terbelah dua.
 */
async function kanonik(B: Baileys, sock: WASocket, jid: string, alt?: string | null): Promise<string> {
  const a = B.jidNormalizedUser(jid);
  if (B.isLidUser(a)) return a;
  if (alt && B.isLidUser(alt)) return B.jidNormalizedUser(alt);
  if (!B.isPnUser(a)) return a;
  // Biasanya terjawab dari cache/SQLite; dibatasi karena pemetaan yang belum dikenal ditanyakan ke server.
  const lid = await denganBatas(sock.signalRepository.lidMapping.getLIDForPN(a), 2_000, "mencari id chat").catch(() => null);
  return lid ? B.jidNormalizedUser(lid) : a;
}

const chatPribadi = (B: Baileys, jid: string | null | undefined): jid is string => !!jid && !!(B.isPnUser(jid) || B.isLidUser(jid));

/** Teks sebuah konten pesan (isi ketikan, keterangan foto/video/dokumen, pilihan tombol). */
function teksKonten(c: proto.IMessage): string {
  return (
    c.conversation ||
    c.extendedTextMessage?.text ||
    c.imageMessage?.caption ||
    c.videoMessage?.caption ||
    c.documentMessage?.caption ||
    c.buttonsResponseMessage?.selectedDisplayText ||
    c.listResponseMessage?.title ||
    c.templateButtonReplyMessage?.selectedDisplayText ||
    ""
  );
}

/** Nomor telepon pertama di vCard (waid=... atau TEL:...). */
function teleponVcard(vcard: string | null | undefined): string | null {
  const m = vcard?.match(/waid=(\d{6,15})/) ?? vcard?.match(/TEL[^:\n]*:\s*([+\d][\d\s-]{5,20})/);
  return m ? m[1].replace(/[\s-]/g, "") : null;
}

/** Isi non-teks dalam kata-kata untuk AI & histori; null bila pesan hanya teks. */
function keteranganMedia(c: proto.IMessage): string | null {
  const lok = c.locationMessage ?? c.liveLocationMessage;
  if (lok) {
    const lat = Number(lok.degreesLatitude);
    const lng = Number(lok.degreesLongitude);
    const nama = [c.locationMessage?.name, c.locationMessage?.address].filter(Boolean).join(", ");
    return `${c.liveLocationMessage ? "lokasi terkini" : "lokasi"}${nama ? ` "${nama}"` : ""}${Number.isFinite(lat) && Number.isFinite(lng) ? ` https://maps.google.com/?q=${lat},${lng}` : ""}`;
  }
  if (c.contactMessage) return `kartu kontak "${c.contactMessage.displayName ?? "tanpa nama"}"${teleponVcard(c.contactMessage.vcard) ? ` (${teleponVcard(c.contactMessage.vcard)})` : ""}`;
  if (c.contactsArrayMessage)
    return `kartu kontak: ${(c.contactsArrayMessage.contacts ?? [])
      .slice(0, 5)
      .map((k) => `${k.displayName ?? "tanpa nama"}${teleponVcard(k.vcard) ? ` (${teleponVcard(k.vcard)})` : ""}`)
      .join(", ")}`;
  if (c.documentMessage) return `dokumen "${c.documentMessage.fileName ?? c.documentMessage.title ?? "tanpa nama"}"`;
  if (c.audioMessage) return c.audioMessage.ptt ? "pesan suara" : "rekaman audio";
  if (c.stickerMessage) return "stiker";
  if (c.videoMessage || c.ptvMessage) return "video";
  if (c.imageMessage) return "foto";
  return null;
}

/** Konteks pesan (kutipan, dsb.) dari jenis konten apa pun. */
function konteksPesan(B: Baileys, c: proto.IMessage): proto.IContextInfo | null {
  const jenis = B.getContentType(c);
  const isi = jenis ? (c[jenis] as { contextInfo?: proto.IContextInfo | null } | null | undefined) : null;
  return isi && typeof isi === "object" && "contextInfo" in isi ? (isi.contextInfo ?? null) : null;
}

/**
 * Teks dan lampiran sebuah pesan; null untuk yang bukan pesan percakapan (protokol, reaksi, dsb.). Suntingan pesan
 * (MESSAGE_EDIT) diperlakukan sebagai pesan baru berisi versi suntingannya, ditandai `diedit`.
 */
function isiPesan(B: Baileys, m: WAMessage): { teks: string; lampiran: boolean; media: string | null; konten: proto.IMessage; diedit: boolean } | null {
  let c = B.normalizeMessageContent(m.message);
  if (!c) return null;
  let diedit = false;
  const pr = c.protocolMessage;
  if (pr?.type === B.proto.Message.ProtocolMessage.Type.MESSAGE_EDIT && pr.editedMessage) {
    c = B.normalizeMessageContent(pr.editedMessage);
    if (!c) return null;
    diedit = true;
  }
  const teks = teksKonten(c);
  const lampiran = !!(
    c.imageMessage ||
    c.videoMessage ||
    c.audioMessage ||
    c.documentMessage ||
    c.stickerMessage ||
    c.ptvMessage ||
    c.locationMessage ||
    c.liveLocationMessage ||
    c.contactMessage ||
    c.contactsArrayMessage
  );
  return teks || lampiran ? { teks, lampiran, media: keteranganMedia(c), konten: c, diedit } : null;
}

/**
 * Unduh satu foto pelanggan langsung ke memori (tanpa berkas), dibatasi ukuran & waktu. Ukuran dicek
 * dari metadata pesan sebelum mengunduh. URL media yang kedaluwarsa diminta ulang ke HP lewat soket.
 */
async function unduhFoto(B: Baileys, s: Sesi, sock: WASocket, m: WAMessage, img: proto.Message.IImageMessage): Promise<Foto | null> {
  const mime = (img.mimetype ?? "image/jpeg").split(";")[0].trim().toLowerCase() as Foto["mime"];
  if (!MIME_FOTO.includes(mime) || B.toNumber(img.fileLength ?? 0) > MAKS_FOTO_BYTE) return null;
  try {
    const buf = await denganBatas(
      B.downloadMediaMessage(m, "buffer", {}, { logger: pencatat(s.nama)!, reuploadRequest: (x) => sock.updateMediaMessage(x) }),
      20_000,
      "mengunduh foto"
    );
    return buf.length && buf.length <= MAKS_FOTO_BYTE ? { mime, data: buf.toString("base64") } : null;
  } catch (e) {
    console.error(`[wa ${s.nama}] foto gagal diunduh:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Unduh pesan suara/audio ke memori untuk ditranskrip, dibatasi durasi, ukuran & waktu. */
async function unduhAudio(B: Baileys, s: Sesi, sock: WASocket, m: WAMessage, au: proto.Message.IAudioMessage): Promise<Audio | null> {
  const detik = Number(au.seconds ?? 0);
  if (detik > MAKS_SUARA.detik || B.toNumber(au.fileLength ?? 0) > MAKS_SUARA.byte) return null;
  try {
    const buf = await denganBatas(
      B.downloadMediaMessage(m, "buffer", {}, { logger: pencatat(s.nama)!, reuploadRequest: (x) => sock.updateMediaMessage(x) }),
      25_000,
      "mengunduh pesan suara"
    );
    return buf.length && buf.length <= MAKS_SUARA.byte ? { data: buf, mime: (au.mimetype ?? "audio/ogg").split(";")[0].trim(), detik } : null;
  } catch (e) {
    console.error(`[wa ${s.nama}] pesan suara gagal diunduh:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Pesan yang di-reply lawan bicara: teksnya (atau keterangan medianya) dan, bila berupa foto, pengunduhnya supaya AI
 * bisa melihat foto yang dimaksud. Dibangun dari konteks pesan (quotedMessage), tanpa query ke WhatsApp.
 */
function kutipanPesan(B: Baileys, s: Sesi, sock: WASocket, m: WAMessage, c: proto.IMessage): NonNullable<Extract<EventWa, { jenis: "pesan" }>["kutipan"]> | null {
  const ctx = konteksPesan(B, c);
  const q = ctx?.quotedMessage ? B.normalizeMessageContent(ctx.quotedMessage) : null;
  if (!ctx || !q) return null;
  const pengirim = ctx.participant ?? null;
  const dariKami = !!pengirim && (B.areJidsSameUser(pengirim, sock.user?.id) || B.areJidsSameUser(pengirim, sock.user?.lid));
  const media = keteranganMedia(q);
  const teks = [teksKonten(q).trim(), media && media !== "foto" ? `[${media}]` : ""].filter(Boolean).join(" ").slice(0, 600);
  const img = q.imageMessage;
  const pesanKutipan: WAMessage = { key: { remoteJid: m.key.remoteJid, id: ctx.stanzaId, fromMe: dariKami, participant: pengirim }, message: ctx.quotedMessage };
  return { teks: teks || (img ? "(foto)" : ""), dariKami, foto: img ? () => unduhFoto(B, s, sock, pesanKutipan, img) : null };
}

async function pesanTiba(B: Baileys, s: Sesi, sock: WASocket, m: WAMessage): Promise<void> {
  const jid = m.key.remoteJid;
  const id = m.key.id;
  if (!id || !chatPribadi(B, jid)) return;
  // Chat dengan diri sendiri dan pesan protokol antar-perangkat bukan percakapan pelanggan.
  if (B.areJidsSameUser(jid, sock.user?.id) || B.areJidsSameUser(jid, sock.user?.lid)) return;
  const isi = isiPesan(B, m);
  if (!isi) return;
  const alt = m.key.remoteJidAlt;
  const pn = B.isPnUser(jid) ? jid : alt && B.isPnUser(alt) ? alt : null;
  const gambar = m.key.fromMe ? null : isi.konten.imageMessage;
  const audio = m.key.fromMe ? null : isi.konten.audioMessage;
  await kabari({
    jenis: "pesan",
    sesi: s.nama,
    id,
    chat: await kanonik(B, sock, jid, alt),
    alamat: B.jidNormalizedUser(jid),
    dariSaya: !!m.key.fromMe,
    teks: isi.teks,
    lampiran: isi.lampiran,
    foto: gambar ? () => unduhFoto(B, s, sock, m, gambar) : null,
    waktu: B.toNumber(m.messageTimestamp),
    telepon: pn ? digitWa(pn) || null : null,
    namaPengirim: !m.key.fromMe && m.pushName ? m.pushName.trim().slice(0, 80) || null : null,
    // Suntingan tidak dikutip balik: yang dikutip WhatsApp adalah pesan protokolnya, bukan isi barunya.
    kutip: m.key.fromMe || isi.diedit ? null : { key: m.key, message: m.message, messageTimestamp: m.messageTimestamp },
    media: isi.media,
    suara: audio ? () => unduhAudio(B, s, sock, m, audio) : null,
    kutipan: m.key.fromMe ? null : kutipanPesan(B, s, sock, m, isi.konten),
    diedit: isi.diedit,
  });
}

async function sambung(s: Sesi): Promise<void> {
  const gen = ++s.gen;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  s.status = "STARTING";
  s.qr = s.qrBit = null;

  let B: Baileys;
  let auth: AuthSesi;
  let sock: WASocket;
  try {
    B = await baileys();
    await perbaruiVersi(B);
    if (s.gen !== gen) return;
    auth = await bukaAuth(B, s.nama);
    if (s.gen !== gen) return;
    if (auth.creds.me?.id) s.terpasang = true;
    const log = pencatat(s.nama);
    sock = B.makeWASocket({
      auth: { creds: auth.creds, keys: auth.keys },
      ...(st.versi ? { version: st.versi } : {}),
      logger: log,
      browser: B.Browsers.ubuntu("Chrome"),
      // Tetap "offline" supaya HP pemilik nomor terus menerima notifikasi (lihat mengetik()).
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      // Kiriman soket ini sendiri tidak dipantulkan sebagai event: pesan keluar yang tiba di
      // `messages.upsert` pasti dikirim dari perangkat lain, yaitu manusia.
      emitOwnEvents: false,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: (jid) => !!(B.isJidGroup(jid) || B.isJidBroadcast(jid) || B.isJidNewsletter(jid)),
    });
  } catch (e) {
    console.error(`[wa ${s.nama}] gagal membuat koneksi:`, e instanceof Error ? e.message : e);
    if (s.gen !== gen) return;
    // Biasanya database sedang tidak terjangkau. Nomor yang sudah tertaut tidak pernah menyerah (hanya
    // pemiliknya yang boleh memutus); yang belum tertaut berhenti setelah beberapa kali.
    s.gagal += 1;
    if (s.terpasang || s.gagal <= 5) {
      if (s.terpasang) s.alasan = "Sedang menyambung ulang (database atau WhatsApp belum terjangkau).";
      s.timer = setTimeout(() => void sambung(s), Math.min(JEDA_ULANG_MAKS_MS, 2_000 * 2 ** (s.gagal - 1)));
    } else {
      s.status = "FAILED";
      s.alasan = "Koneksi gagal dibuat (database atau WhatsApp tidak terjangkau). Coba hubungkan ulang.";
    }
    lepasTunggu(s);
    return;
  }
  s.sock = sock;

  sock.ev.on("creds.update", (u) => {
    if (s.gen !== gen) return;
    auth.simpanCreds();
    const nama = u.me?.name;
    if (nama && nama !== s.namaWa) {
      s.namaWa = nama;
      if (s.status === "WORKING" && s.waId) void kabari({ jenis: "terhubung", sesi: s.nama, waId: s.waId, nama });
    }
  });

  sock.ev.on("connection.update", (u) => {
    if (s.gen === gen) koneksiBerubah(B, s, sock, auth, gen, u);
  });

  sock.ev.on("messages.upsert", ({ messages }) => {
    if (s.gen !== gen) return;
    for (const m of messages) antre(s, () => pesanTiba(B, s, sock, m));
  });

  // Tanda-baca atas pesan MASUK berarti pesan itu dibaca dari perangkat lain milik nomor ini.
  sock.ev.on("messages.update", (daftar) => {
    if (s.gen !== gen) return;
    const chat = new Set<string>();
    for (const { key, update } of daftar) {
      if (!key.fromMe && chatPribadi(B, key.remoteJid) && (update.status ?? 0) >= B.proto.WebMessageInfo.Status.READ) chat.add(key.remoteJid);
    }
    for (const jid of chat) antre(s, async () => kabari({ jenis: "dibaca", sesi: s.nama, chat: await kanonik(B, sock, jid) }));
  });
}

function koneksiBerubah(B: Baileys, s: Sesi, sock: WASocket, auth: AuthSesi, gen: number, u: Partial<ConnectionState>): void {
  if (u.qr) {
    s.qr = u.qr;
    s.qrBit = null;
    s.status = "SCAN_QR_CODE";
    lepasTunggu(s);
  }

  if (u.connection === "open") {
    s.status = "WORKING";
    s.terpasang = true;
    s.qr = s.qrBit = null;
    s.gagal = 0;
    s.alasan = null;
    s.mengetik = 0;
    s.online = false;
    s.waId = digitWa(sock.user?.id) || s.waId;
    s.namaWa = sock.user?.name ?? s.namaWa;
    console.info(`[wa ${s.nama}] terhubung`);
    if (s.waId) void kabari({ jenis: "terhubung", sesi: s.nama, waId: s.waId, nama: s.namaWa });
    // Nama profil sendiri hanya datang lewat sinkronisasi pengaturan; tanpa itu status "mengetik"
    // tidak bisa ditampilkan. Sekali saja, dan hanya koleksi kecil yang memuatnya.
    if (!sock.user?.name) void sock.resyncAppState(["critical_block"], false).catch(() => {});
    lepasTunggu(s);
    return;
  }
  if (u.connection !== "close") return;

  const kode = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode ?? 0;
  const terpasang = !!auth.creds.me?.id;
  s.sock = null;
  s.qr = s.qrBit = null;
  s.mengetik = 0;
  s.online = false;
  if (s.timerOffline) clearTimeout(s.timerOffline);
  s.timerOffline = null;

  if (kode === KODE.mulaiUlang) {
    void sambung(s); // normal tepat setelah QR dipindai
    return;
  }
  if (kode === KODE.versiDitolak && s.gagal < 2) {
    s.gagal += 1;
    s.status = "STARTING";
    void perbaruiVersi(B, true).then(() => {
        if (s.gen === gen) void sambung(s);
      });
    return;
  }
  if (kode === KODE.keluar || !terpasang) {
    // Dikeluarkan dari HP, atau QR tidak jadi dipindai: kunci yang tersisa tidak berguna lagi, dan
    // tidak ada gunanya terus membuat QR baru tanpa ada yang memindai.
    s.terpasang = false;
    void hapusAuth(s.nama).catch((e) => console.error(`[wa ${s.nama}] gagal membuang kredensial:`, e));
    s.status = terpasang ? "STOPPED" : "FAILED";
    s.alasan = terpasang
      ? "Perangkat ini dikeluarkan dari WhatsApp di HP. Pindai QR lagi untuk menautkan."
      : kode === KODE.waktuHabis
        ? "Kode QR tidak dipindai tepat waktu. Tampilkan QR baru untuk menautkan."
        : "Koneksi ke WhatsApp terputus sebelum nomor ditautkan. Coba lagi.";
    console.info(`[wa ${s.nama}] ${terpasang ? "dikeluarkan dari WhatsApp" : "berhenti sebelum ditautkan"} (kode ${kode})`);
    lepasTunggu(s);
    return;
  }
  if (kode === KODE.ditolak || kode === KODE.tidakCocok) {
    s.status = "FAILED";
    s.alasan = "WhatsApp menolak koneksi nomor ini (kemungkinan dibatasi atau diblokir).";
    console.warn(`[wa ${s.nama}] berhenti (kode ${kode})`);
    lepasTunggu(s);
    return;
  }

  // Putus biasa (jaringan, server WhatsApp, dsb.): sambung ulang dengan jeda yang makin panjang, tanpa
  // pernah menyerah. 440 (sesi digantikan koneksi lain) juga: jedanya panjang supaya tidak saling
  // rebut bila memang ada koneksi lain, lalu 5 menit setelah 5 kali berturut-turut.
  s.gagal += 1;
  const dasar =
    kode === KODE.digantikan
      ? s.gagal > 5
        ? JEDA_DIGANTIKAN_MAKS_MS
        : JEDA_ULANG_MAKS_MS
      : Math.min(JEDA_ULANG_MAKS_MS, 1_000 * 2 ** Math.min(s.gagal - 1, 6));
  const jeda = dasar + Math.floor(Math.random() * 1_000);
  s.status = "STARTING";
  console.warn(`[wa ${s.nama}] terputus (kode ${kode}), menyambung ulang dalam ${Math.round(jeda / 1000)} dtk`);
  s.timer = setTimeout(() => void sambung(s), jeda);
  lepasTunggu(s);
}

/**
 * Dipanggil sekali saat server mulai: sambungkan semua nomor yang sudah dipasangkan, bergiliran.
 * Bila database belum bisa dihubungi, dicoba lagi tiap 5 detik tanpa menahan server.
 */
export async function mulaiGerbang(): Promise<void> {
  if (st.dimulai) return;
  st.dimulai = true;
  let daftar: string[];
  try {
    await rapikanAuthYatim();
    daftar = await sesiTerpasang();
  } catch (e) {
    st.dimulai = false;
    console.error(`[wa] database belum siap (${e instanceof Error ? e.message : String(e)}); mencoba lagi dalam 5 dtk`);
    setTimeout(() => void mulaiGerbang(), st.jedaDbMs ?? 5_000);
    return;
  }
  const jedaMulai = st.jedaMulaiMs ?? JEDA_MULAI_MS;
  daftar.forEach((nama, i) => {
    const s = sesiAtauBaru(nama);
    s.terpasang = true;
    if (s.sock || s.timer) return; // sudah dijalankan lewat dashboard selagi menunggu database
    s.status = "STARTING";
    s.timer = setTimeout(() => void sambung(s), i * jedaMulai + Math.floor(Math.random() * Math.min(200, jedaMulai)));
  });
  console.info(`[wa] menyambungkan ${daftar.length} nomor`);
}

const KOSONG: SesiNomor = { status: "BELUM_ADA", waId: null, nama: null, alasan: null };

/** Status sebuah sesi, dari memori. */
export function infoSesi(nama: string): SesiNomor {
  const s = st.sesi.get(nama);
  return s ? { status: s.status, waId: s.status === "WORKING" ? s.waId : null, nama: s.namaWa, alasan: s.alasan } : KOSONG;
}

/**
 * Jalankan sesi: menyambung dengan kredensial yang ada, atau menampilkan QR bila belum dipasangkan.
 * Menunggu sebentar sampai keadaannya pasti, supaya QR sudah siap saat halaman pertama kali memintanya.
 */
export async function hubungkan(nama: string): Promise<void> {
  const s = sesiAtauBaru(nama);
  if (s.sock && s.status !== "FAILED" && s.status !== "STOPPED") return;
  s.gagal = 0;
  s.alasan = null;
  const pasti = new Promise<void>((r) => s.tunggu.push(r));
  await sambung(s);
  await Promise.race([pasti, tidur(4_000)]);
}

async function putus(s: Sesi, keluar: boolean): Promise<void> {
  s.gen += 1; // event dari soket ini tidak lagi diproses
  if (s.timer) clearTimeout(s.timer);
  if (s.timerOffline) clearTimeout(s.timerOffline);
  s.timer = s.timerOffline = null;
  const sock = s.sock;
  const terhubung = s.status === "WORKING";
  s.sock = null;
  s.status = "STOPPED";
  if (keluar) s.terpasang = false;
  s.alasan = null;
  s.qr = s.qrBit = null;
  s.waId = null;
  s.mengetik = 0;
  s.online = false;
  lepasTunggu(s);
  if (!sock) return;
  try {
    // logout() memberi tahu WhatsApp agar perangkat ini dicabut dari daftar "Perangkat tertaut".
    if (keluar && terhubung) await denganBatas(sock.logout(), 10_000, "logout");
    else await sock.end(undefined);
  } catch {
    void sock.end(undefined).catch(() => {});
  }
}

/**
 * Dipanggil saat proses dimatikan (SIGTERM dari Docker tiap deploy): tutup semua soket tanpa logout,
 * lalu tunggu kunci Signal & kredensial yang masih antre sampai tertulis. Tanpa ini proses keluar
 * di tengah tulis; kunci yang hilang membuat WhatsApp mencabut perangkat setelah tersambung lagi
 * (stream:error 401 device_removed), paling rawan tepat setelah QR dipindai.
 */
export async function matikanGerbang(batasMs = 20_000): Promise<void> {
  const semua = [...st.sesi.values()];
  for (const s of semua) {
    s.gen += 1; // event dari soket yang ditutup tidak lagi diproses
    if (s.timer) clearTimeout(s.timer);
    if (s.timerOffline) clearTimeout(s.timerOffline);
    s.timer = s.timerOffline = null;
    const sock = s.sock;
    s.sock = null;
    s.status = "STOPPED";
    lepasTunggu(s);
    if (sock) {
      try {
        await sock.end(undefined);
      } catch {
        // soket sudah tertutup
      }
    }
  }
  await Promise.race([tungguSemuaTulis(), tidur(batasMs)]);
}

/** Keluarkan nomor dari sesi (unlink perangkat) dan buang kredensialnya. */
export async function logout(nama: string): Promise<void> {
  const s = st.sesi.get(nama);
  if (s) await putus(s, true);
  await hapusAuth(nama);
}

/** Hapus sesi beserta datanya (saat nomor dihapus). */
export async function hapusSesi(nama: string): Promise<void> {
  await logout(nama);
  st.sesi.delete(nama);
}

/** Matriks kode QR; dihitung sekali per kode (berganti tiap ±20 detik) lalu disimpan. */
export async function qr(nama: string): Promise<{ hash: string; kode: BitQr } | null> {
  const s = st.sesi.get(nama);
  if (!s?.qr || s.status !== "SCAN_QR_CODE") return null;
  if (!s.qrBit) {
    const { encode } = await import("uqr");
    s.qrBit = {
      hash: createHash("sha1").update(s.qr).digest("hex").slice(0, 12),
      kode: kemasQr(encode(s.qr, { ecc: "L", border: 2 }).data),
    };
  }
  return s.qrBit;
}

function aktif(nama: string): { s: Sesi; sock: WASocket } {
  const s = st.sesi.get(nama);
  if (!s?.sock || s.status !== "WORKING") throw new WaError("Nomor ini sedang tidak terhubung ke WhatsApp.");
  return { s, sock: s.sock };
}

export async function tandaiDibaca(nama: string, alamat: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    await aktif(nama).sock.readMessages(ids.map((id) => ({ remoteJid: alamat, id, fromMe: false })));
  } catch {
    // tanda-baca tidak penting untuk kelanjutan balasan
  }
}

/**
 * Status "sedang mengetik". Lawan bicara hanya melihatnya bila nomor sedang "online", sedangkan
 * selama online HP pemilik nomor tidak menerima notifikasi. Karena itu nomor dibuat online hanya
 * selama AI menyusun balasan, lalu dikembalikan ke offline.
 */
export function mengetik(nama: string, alamat: string, nyala: boolean): Promise<void> {
  const s = st.sesi.get(nama);
  if (!s) return Promise.resolve();
  if (nyala) {
    s.mengetik += 1;
    if (s.timerOffline) clearTimeout(s.timerOffline);
    s.timerOffline = null;
  } else {
    s.mengetik = Math.max(0, s.mengetik - 1);
  }
  // Berurutan per nomor: "berhenti mengetik" tidak boleh mendahului "mengetik" yang dipanggil lebih dulu.
  s.presensi = s.presensi
    .then(async () => {
      const sock = s.sock;
      if (!sock || s.status !== "WORKING") return;
      if (nyala) {
        if (!s.online && sock.user?.name) {
          s.online = true;
          await sock.sendPresenceUpdate("available");
        }
        await sock.sendPresenceUpdate("composing", alamat);
        return;
      }
      await sock.sendPresenceUpdate("paused", alamat);
      if (s.mengetik === 0 && s.online && !s.timerOffline) {
        s.timerOffline = setTimeout(() => {
          s.timerOffline = null;
          if (s.mengetik > 0 || !s.online) return;
          s.online = false;
          void s.sock?.sendPresenceUpdate("unavailable").catch(() => {});
        }, 2_000);
      }
    })
    .catch(() => {
      // indikator saja; kegagalannya tidak boleh menggagalkan balasan
    });
  return s.presensi;
}

/**
 * Kirim teks. `padaId` dipanggil dengan id pesan SEBELUM pesan dikirim, supaya pemanggil bisa
 * mengenali pesan itu sebagai miliknya sendiri kapan pun gema-nya tiba.
 */
/** Kirim teks; `kutip` = pesan yang dibalas (tampil sebagai reply di WhatsApp). */
export async function kirimTeks(nama: string, alamat: string, teks: string, padaId?: (id: string) => void, kutip?: WAMessage | null): Promise<string> {
  const { sock } = aktif(nama);
  const B = await baileys();
  const id = B.generateMessageIDV2(sock.user?.id);
  padaId?.(id);
  // linkPreview: null -> server ini tidak pernah mengunduh tautan yang ada di dalam teks balasan.
  await denganBatas(sock.sendMessage(alamat, { text: teks, linkPreview: null }, { messageId: id, ...(kutip ? { quoted: kutip } : {}) }), 25_000, "mengirim pesan");
  return id;
}

/** Kirim satu gambar (foto produk katalog) dengan keterangan; `padaId` seperti kirimTeks. */
export async function kirimGambar(nama: string, alamat: string, gambar: Buffer, mime: string, caption: string, padaId?: (id: string) => void): Promise<string> {
  const { sock } = aktif(nama);
  const B = await baileys();
  const id = B.generateMessageIDV2(sock.user?.id);
  padaId?.(id);
  await denganBatas(sock.sendMessage(alamat, { image: gambar, mimetype: mime, caption }, { messageId: id }), 45_000, "mengirim foto");
  return id;
}

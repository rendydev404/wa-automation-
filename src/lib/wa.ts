import "server-only";
import { skala } from "./skala-waktu";
import { createHash } from "node:crypto";
import type { ConnectionState, SocketConfig, WAMessage, WAPatchName, WASocket, proto } from "baileys";
import { type BitQr, kemasQr } from "./qr";
import { rapikanNomorWa } from "./format";
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

export class WaError extends Error {
  /** Pesan versi Inggris (tampilan /eng, dipilih di actions.ts); `message` tetap bahasa Indonesia (juga untuk log). */
  en?: string;
  constructor(message: string, en?: string) {
    super(message);
    this.en = en;
  }
}

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
  /** Kode tautan 8 karakter saat pengguna memilih menautkan dengan nomor telepon. */
  kodePairing: string | null;
  /** LID akun sendiri yang dipertahankan agar tidak terhapus bila `<success>` tidak menyertakan atribut `lid`. */
  lidTersimpan: string | null;
  /** Baru saja berhasil pair-success / companion_finish pada soket ini dan menunggu sambung ulang ke sesi penuh. */
  baruTertaut: boolean;
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
  timerJaga?: ReturnType<typeof setInterval> | null;
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

/**
 * Nomor benar-benar sudah tertaut bila punya `me.id` hasil pemasangan perangkat (mengandung `:device` atau `account`),
 * bukan sekadar placeholder sementara `{ id: "...@s.whatsapp.net", name: "~" }` saat meminta kode pairing.
 */
const sudahTertaut = (creds: { me?: { id?: string; name?: string }; account?: unknown }): boolean =>
  !!creds.me?.id && (creds.me.id.includes(":") || !!creds.account || creds.me.name !== "~");

function simpanPemetaanPasangan(B: Baileys, sock: WASocket, pn: string | undefined, lid: string | undefined): void {
  if (!pn || !lid || !B.isPnUser(pn) || !B.isLidUser(lid)) return;
  const lm = sock.signalRepository?.lidMapping as unknown as
    | {
        storeLIDPNMappings?: (p: { lid: string; pn: string }[]) => Promise<unknown>;
        mappingCache?: { set?: (k: string, v: string) => unknown };
      }
    | undefined;
  if (!lm) return;
  // Panggil storeLIDPNMappings lebih dulu agar pemeriksaan cache-miss untuk penulisan DB tetap berjalan,
  // lalu isi mappingCache secara sinkron agar dekripsi pesan pertama (getDecryptionJid) langsung memakai LID.
  if (typeof lm.storeLIDPNMappings === "function") {
    void lm.storeLIDPNMappings([{ lid, pn }]).catch(() => {});
  }
  const pnUser = B.jidDecode(pn)?.user;
  const lidUser = B.jidDecode(lid)?.user;
  if (pnUser && lidUser && typeof lm.mappingCache?.set === "function") {
    lm.mappingCache.set(`pn:${pnUser}`, lidUser);
    lm.mappingCache.set(`lid:${lidUser}`, pnUser);
  }
}

function simpanPemetaanDiri(B: Baileys, sock: WASocket, creds: { me?: { id?: string; lid?: string } }): void {
  simpanPemetaanPasangan(B, sock, creds.me?.id, creds.me?.lid);
}

const tidur = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), ms));

async function denganBatas<T>(janji: Promise<T>, ms: number, aksi: string, aksiEn?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const galat = () => new WaError(`WhatsApp tidak menjawab saat ${aksi}.`, aksiEn && `WhatsApp did not respond while ${aksiEn}.`);
    return await Promise.race([janji, new Promise<never>((_, tolak) => (timer = setTimeout(() => tolak(galat()), ms)))]);
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

/**
 * Baileys mencatat lewat antarmuka mirip pino. Galat diteruskan satu baris ringkas; peringatan juga (dulu dibuang,
 * padahal di situ petunjuk pesan yang tertahan: "received error in ack", "Buffer timeout", gagal dekripsi), tetapi
 * dibatasi: pesan peringatan yang sama paling sering sekali per JEDA_PERINGATAN_MS per nomor.
 * Bila WhatsApp memutus stream berulang kali karena stanza yang SAMA belum di-ack, pesan pelanggan bisa tertahan
 * di belakangnya: dicatat sebagai galat yang jelas supaya tidak lagi diam-diam.
 */
const JEDA_PERINGATAN_MS = 600_000;
// Di tingkat modul (bukan per soket): soket dibuat ulang tiap sambung ulang, hitungannya harus tetap berlanjut.
const peringatanTerakhir = new Map<string, number>();
const ackBerulang = new Map<string, number>();
/**
 * Log `info` Baileys yang diloloskan: tahap tautan perangkat & sinkron app-state. Jarang terjadi (sekali per tautan
 * atau sambung), tetapi satu-satunya petunjuk bila HP menolak/menggagalkan tautan. Sisanya tetap dibuang.
 */
const INFO_PENTING =
  /^(pairing configured successfully|error in pairing|connection errored|opened connection to WA|injecting new app state sync keys|recv app state sync with 0 keys|app state sync key arrived|got history notification)/;
function pencatat(nama: string): SocketConfig["logger"] {
  const diam = () => {};
  const ringkas = (obj: unknown, msg?: string): string => {
    const o = (typeof obj === "object" && obj ? obj : {}) as Record<string, unknown>;
    const rinci = [o.err, o.error, o.trace].map((v) => (v instanceof Error ? v.message : typeof v === "string" ? v.split("\n")[0] : "")).find(Boolean) || ringkasNode(o.fullErrorNode);
    return [msg ?? (typeof obj === "string" ? obj : ""), rinci].filter(Boolean).join(": ").slice(0, 300);
  };
  const l: SocketConfig["logger"] = {
    level: "warn",
    child: () => l,
    trace: diam,
    debug: diam,
    info(obj: unknown, msg?: string) {
      if (!INFO_PENTING.test(msg ?? (typeof obj === "string" ? obj : ""))) return;
      // `platform` (mis. smbi = WA Business iPhone) hanya ada di log pairing; isi lain (kunci, notifikasi) tidak dicetak.
      const platform = (obj as { platform?: unknown } | null)?.platform;
      console.info(`[wa ${nama}] ${ringkas(obj, msg)}${typeof platform === "string" ? ` (platform ${platform})` : ""}`);
    },
    warn(obj: unknown, msg?: string) {
      const teks = ringkas(obj, msg);
      const kunci = `${nama}:${(msg ?? teks).slice(0, 80)}`;
      const kini = Date.now();
      if (kini - (peringatanTerakhir.get(kunci) ?? 0) < JEDA_PERINGATAN_MS) return;
      if (peringatanTerakhir.size > 1000) peringatanTerakhir.clear();
      peringatanTerakhir.set(kunci, kini);
      console.warn(`[wa ${nama}] ${teks}`);
    },
    error(obj: unknown, msg?: string) {
      const teks = ringkas(obj, msg);
      console.error(`[wa ${nama}] ${teks}`);
      const id = /ack\{[^}]*"id":"([^"]+)"/.exec(teks)?.[1];
      if (id) {
        const k = `${nama}:${id}`;
        const n = (ackBerulang.get(k) ?? 0) + 1;
        if (ackBerulang.size > 500) ackBerulang.clear();
        ackBerulang.set(k, n);
        if (n >= 3) console.error(`[wa ${nama}] WhatsApp mengirim ulang stanza ${id} ${n}x tanpa ack yang diterima: pesan pelanggan bisa tertahan di belakangnya`);
      }
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
      kodePairing: null,
      lidTersimpan: null,
      baruTertaut: false,
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

/**
 * Event satu nomor diproses berurutan. Satu tugas yang menggantung (mis. jaringan/database tidak menjawab) tidak
 * boleh menahan semua pesan berikutnya selamanya: lewat BATAS_TUGAS_MS antrean jalan terus (tugas lama tetap
 * selesai sendiri di latar) dan kejadiannya dicatat.
 */
const BATAS_TUGAS_MS = 120_000;
function antre(s: Sesi, kerja: () => Promise<void> | void): void {
  s.rantai = s.rantai
    .then(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const batas = new Promise<void>((r) => {
        timer = setTimeout(() => {
          console.error(`[wa ${s.nama}] memproses event lebih dari ${BATAS_TUGAS_MS / 1000} dtk; antrean dilanjutkan`);
          r();
        }, BATAS_TUGAS_MS);
        timer.unref?.();
      });
      return Promise.race([Promise.resolve().then(kerja), batas]).finally(() => clearTimeout(timer));
    })
    .catch((e) => console.error(`[wa ${s.nama}] gagal memproses event:`, e));
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
  s.kodePairing = null;

  let B: Baileys;
  let auth: AuthSesi;
  let sock: WASocket;
  try {
    B = await baileys();
    await perbaruiVersi(B);
    if (s.gen !== gen) return;
    auth = await bukaAuth(B, s.nama);
    if (s.gen !== gen) return;
    if (sudahTertaut(auth.creds)) {
      s.terpasang = true;
      const lidAwal = auth.creds.me?.lid || auth.creds.signalIdentities?.[0]?.identifier?.name;
      if (lidAwal && B.isLidUser(lidAwal)) {
        s.lidTersimpan = lidAwal;
        if (auth.creds.me && !auth.creds.me.lid) auth.creds.me.lid = lidAwal;
      }
    } else if (auth.creds.me) {
      delete auth.creds.me;
    }
    const log = pencatat(s.nama);
    // Grup, saluran, dan daftar siaran tidak pernah dilayani. Status (story) kontak SENGAJA tidak diabaikan di
    // tingkat soket: WhatsApp menuntut tanda terima resminya. Bila ditolak (NACK 500 bawaan) perangkat dicabut;
    // bila hanya di-ack polos, server mengirim ulang status yang sama dan memutus stream tiap ±50 menit
    // (`stream:error > ack{"class":"status"}`) sementara pesan pelanggan tertahan di belakangnya, berjam-jam,
    // pada nomor yang kontaknya banyak memasang status. Baileys yang memprosesnya; pesanTiba lalu membuangnya
    // karena bukan chat pribadi, jadi tidak pernah sampai ke AI.
    const abaikanJid = (jid: string | undefined): boolean =>
      !!jid && !!(B.isJidGroup(jid) || B.isJidNewsletter(jid) || (B.isJidBroadcast(jid) && !B.isJidStatusBroadcast(jid)));
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
      shouldIgnoreJid: abaikanJid,
    });
    simpanPemetaanDiri(B, sock, auth.creds);
    // Baileys bawaan mengirim NACK error="500" (UnhandledError) setiap ada pesan dari JID yang diabaikan
    // (grup, status, saluran). Ribuan NACK 500 membuat server WhatsApp memutus stream atau mencabut perangkat
    // (401 device_removed). Di sini pesan yang diabaikan langsung diberi ACK bersih tanpa error="500".
    const ws = (sock as unknown as { ws?: { emit?: (ev: string, ...args: unknown[]) => boolean } }).ws;
    if (ws && typeof ws.emit === "function" && typeof sock.sendMessageAck === "function") {
      const emitAsli = ws.emit.bind(ws);
      ws.emit = (ev: string, ...args: unknown[]) => {
        if (ev === "CB:success") {
          // Baileys 7 baru menyalin `node.attrs.lid` ke `creds.me.lid` setelah 3 round-trip jaringan
          // (uploadPreKeys, passiveIq, digestKeyBundle). Catat secara sinkron begitu `<success>` tiba agar
          // pesan peer dari iPhone yang masuk selama jeda tersebut langsung dikenali sebagai `fromMe`.
          const node = args[0] as { attrs?: Record<string, string> } | undefined;
          const lidNode = node?.attrs?.lid;
          if (lidNode && B.isLidUser(lidNode)) {
            s.lidTersimpan = lidNode;
            if (auth.creds.me && sudahTertaut(auth.creds)) {
              auth.creds.me.lid = lidNode;
              auth.simpanCreds();
              simpanPemetaanDiri(B, sock, auth.creds);
            }
          } else if (node?.attrs && !lidNode) {
            const lidCadangan = auth.creds.me?.lid || s.lidTersimpan;
            if (lidCadangan && B.isLidUser(lidCadangan)) node.attrs.lid = lidCadangan;
          }
        } else if (ev === "CB:message") {
          const node = args[0] as { attrs?: Record<string, string> } | undefined;
          const dari = node?.attrs?.from;
          if (dari && dari !== "@s.whatsapp.net" && abaikanJid(dari)) {
            void sock.sendMessageAck(node as never).catch(() => {});
            return true;
          }
          const a = node?.attrs ?? {};
          // Alamat alternatif PENGIRIM saja. `peer_recipient_*` milik PENERIMA (pesan yang diketik di HP pemilik),
          // jadi tidak pernah dipasangkan dengan `from`.
          const pnAlt = a.sender_pn || a.participant_pn;
          const lidAlt = a.sender_lid || a.participant_lid;
          const milikSendiri = (j: string | undefined): boolean =>
            !!j && (B.areJidsSameUser(j, auth.creds.me?.id) || B.areJidsSameUser(j, auth.creds.me?.lid || s.lidTersimpan || undefined));
          // Simpan pemetaan PN<->LID ke cache secara sinkron SEBELUM `getDecryptionJid` berjalan di Baileys 7.
          if (dari && !milikSendiri(dari)) {
            // Pesan dari lawan bicara: alamat pengirim <-> alamat alternatif pengirim itu sendiri.
            if (B.isLidUser(dari) && pnAlt && B.isPnUser(pnAlt) && !milikSendiri(pnAlt)) simpanPemetaanPasangan(B, sock, pnAlt, dari);
            else if (B.isPnUser(dari) && lidAlt && B.isLidUser(lidAlt) && !milikSendiri(lidAlt)) simpanPemetaanPasangan(B, sock, dari, lidAlt);
          } else if (dari && a.recipient && !milikSendiri(a.recipient)) {
            // Pesan dari perangkat pemilik sendiri (HP): pemetaannya milik PENERIMA, bukan pengirim.
            if (B.isLidUser(a.recipient) && a.peer_recipient_pn && B.isPnUser(a.peer_recipient_pn) && !milikSendiri(a.peer_recipient_pn))
              simpanPemetaanPasangan(B, sock, a.peer_recipient_pn, a.recipient);
            else if (B.isPnUser(a.recipient) && a.peer_recipient_lid && B.isLidUser(a.peer_recipient_lid) && !milikSendiri(a.peer_recipient_lid))
              simpanPemetaanPasangan(B, sock, a.recipient, a.peer_recipient_lid);
          }
          // Di beberapa iPhone (iOS), pesan protokol peer (APP_STATE_SYNC_KEY_SHARE / HISTORY_SYNC_NOTIFICATION)
          // dikirim dari LID pemilik sebelum `me.lid` tercatat di `<success>`. Tanpa `me.lid`, Baileys 7 menganggap
          // `fromMe = false` dan membuang kunci sinkronisasi tersebut sebagai spoofed message.
          if (dari && auth.creds.me?.id && !auth.creds.me.lid && sudahTertaut(auth.creds)) {
            if (B.isLidUser(dari) && (node?.attrs?.category === "peer" || (pnAlt && B.areJidsSameUser(pnAlt, auth.creds.me.id)))) {
              auth.creds.me.lid = dari;
              s.lidTersimpan = dari;
              auth.simpanCreds();
              simpanPemetaanDiri(B, sock, auth.creds);
            } else if (lidAlt && B.isLidUser(lidAlt) && B.areJidsSameUser(dari, auth.creds.me.id)) {
              auth.creds.me.lid = lidAlt;
              s.lidTersimpan = lidAlt;
              auth.simpanCreds();
              simpanPemetaanDiri(B, sock, auth.creds);
            }
          }
        }
        return emitAsli(ev, ...args);
      };
    }
  } catch (e) {
    console.error(`[wa ${s.nama}] gagal membuat koneksi:`, e instanceof Error ? e.message : e);
    if (s.gen !== gen) return;
    // Biasanya database sedang tidak terjangkau. Nomor yang sudah tertaut tidak pernah menyerah (hanya
    // pemiliknya yang boleh memutus); yang belum tertaut berhenti setelah beberapa kali.
    s.gagal += 1;
    if (s.terpasang || s.gagal <= 5) {
      if (s.terpasang) s.alasan = "Sedang menyambung ulang (database atau WhatsApp belum terjangkau).";
      s.timer = setTimeout(() => void sambung(s), skala(Math.min(JEDA_ULANG_MAKS_MS, 2_000 * 2 ** (s.gagal - 1))));
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
    const lidBaru = u.me?.lid || auth.creds.me?.lid || u.signalIdentities?.[0]?.identifier?.name || auth.creds.signalIdentities?.[0]?.identifier?.name;
    if (lidBaru && B.isLidUser(lidBaru)) s.lidTersimpan = lidBaru;
    if (auth.creds.me && !auth.creds.me.lid && s.lidTersimpan) auth.creds.me.lid = s.lidTersimpan;

    // Jangan tulis `me` sementara (`{ id: "...@s.whatsapp.net", name: "~" }` dari requestPairingCode) ke DB
    // sebelum pemasangan perangkat benar-benar selesai, agar sesi yang batal tidak dianggap sudah terpasang.
    const meSementara = auth.creds.me && !sudahTertaut(auth.creds) ? auth.creds.me : undefined;
    if (meSementara) delete auth.creds.me;
    auth.simpanCreds();
    if (meSementara) auth.creds.me = meSementara;

    if (sudahTertaut(auth.creds)) {
      s.terpasang = true;
      simpanPemetaanDiri(B, sock, auth.creds);
    }
    if (u.registered && s.status === "SCAN_QR_CODE") {
      s.baruTertaut = true;
      s.qr = s.qrBit = null;
      s.kodePairing = null;
      s.status = "STARTING";
      s.alasan = null;
      lepasTunggu(s);
    }
    const nama = u.me?.name && u.me.name !== "~" ? u.me.name : undefined;
    if (nama && nama !== s.namaWa) {
      s.namaWa = nama;
      if (s.status === "WORKING" && s.waId) void kabari({ jenis: "terhubung", sesi: s.nama, waId: s.waId, nama });
    }
    // Saat kunci app-state pertama tiba dari HP (baik iPhone/Android biasa maupun WA Business),
    // wajib jalankan resync awal SEMUA koleksi dan bersihkan dirty bit account_sync agar tautan tidak gagal/dicabut WA.
    if (u.myAppStateKeyId && !auth.creds.accountSyncCounter) {
      sinkronAwal(sock, auth, KOLEKSI_APP_STATE);
    }
    if (u.lastAccountSyncTimestamp && typeof sock.cleanDirtyBits === "function") {
      void sock.cleanDirtyBits("account_sync", u.lastAccountSyncTimestamp).catch(() => {});
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

/** Kelima koleksi app-state WhatsApp (sama dengan ALL_WA_PATCH_NAMES Baileys): yang diminta WA Web saat tautan pertama. */
const KOLEKSI_APP_STATE = ["critical_block", "critical_unblock_low", "regular_high", "regular_low", "regular"] as const satisfies readonly WAPatchName[];

function sinkronAwal(sock: WASocket, auth: AuthSesi, koleksi: readonly WAPatchName[]): void {
  if (typeof sock.resyncAppState !== "function") return;
  void sock
    .resyncAppState(koleksi, false)
    .then(() => {
      // Hanya tandai selesai bila myAppStateKeyId sudah ada; bila dipanggil saat `open` sebelum HP mengirim
      // APP_STATE_SYNC_KEY_SHARE (umum di iOS), biarkan 0 agar disinkronkan ulang begitu kunci tiba.
      if (!auth.creds.accountSyncCounter && auth.creds.myAppStateKeyId) {
        auth.creds.accountSyncCounter = 1;
        auth.simpanCreds();
      }
    })
    .catch(() => {});
}

function koneksiBerubah(B: Baileys, s: Sesi, sock: WASocket, auth: AuthSesi, gen: number, u: Partial<ConnectionState>): void {
  if (u.qr) {
    s.qr = u.qr;
    s.qrBit = null;
    s.status = "SCAN_QR_CODE";
    lepasTunggu(s);
  }
  if (u.isNewLogin) {
    s.terpasang = true;
    s.baruTertaut = true;
    s.qr = s.qrBit = null;
    s.kodePairing = null;
    s.status = "STARTING";
    s.alasan = null;
    lepasTunggu(s);
  }

  if (u.connection === "open") {
    s.status = "WORKING";
    s.terpasang = true;
    s.baruTertaut = false;
    s.qr = s.qrBit = null;
    s.kodePairing = null;
    s.gagal = 0;
    s.alasan = null;
    s.mengetik = 0;
    s.online = false;
    s.waId = digitWa(sock.user?.id) || s.waId;
    const nama = sock.user?.name && sock.user.name !== "~" ? sock.user.name : null;
    s.namaWa = nama ?? s.namaWa;
    console.info(`[wa ${s.nama}] terhubung${auth.creds.platform ? ` (platform ${auth.creds.platform})` : ""}`);
    if (s.waId) void kabari({ jenis: "terhubung", sesi: s.nama, waId: s.waId, nama: s.namaWa });
    // Tautan pertama (accountSyncCounter 0): minta SEMUA koleksi pengaturan saat itu juga, seperti WhatsApp Web,
    // termasuk WA Business yang namanya sudah terisi dari sertifikat bisnis saat pairing. Dulu Business hanya
    // menunggu kunci app-state dikirim HP; iPhone (smbi) mengirimnya terlambat atau tidak sama sekali pada tautan
    // pertama, sehingga tautan tidak pernah tuntas. Koleksi yang kuncinya belum ada diparkir Baileys dan
    // disinkronkan ulang otomatis begitu kunci tiba. Tersambung ulang tanpa nama profil: cukup critical_block.
    if (!auth.creds.accountSyncCounter) sinkronAwal(sock, auth, KOLEKSI_APP_STATE);
    else if (!nama) sinkronAwal(sock, auth, ["critical_block"]);
    lepasTunggu(s);
    return;
  }
  if (u.connection !== "close") return;

  const kode = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode ?? 0;
  const terpasang = sudahTertaut(auth.creds);
  const pakaiKode = !!s.kodePairing;
  s.sock = null;
  s.qr = s.qrBit = null;
  s.kodePairing = null;
  s.mengetik = 0;
  s.online = false;
  if (s.timerOffline) clearTimeout(s.timerOffline);
  s.timerOffline = null;

  if (kode === KODE.mulaiUlang || (s.baruTertaut && terpasang && kode !== KODE.keluar && kode !== KODE.versiDitolak)) {
    s.baruTertaut = false;
    console.info(`[wa ${s.nama}] tautan diterima, menyambung ulang (kode ${kode})`);
    void sambung(s); // normal tepat setelah QR dipindai atau kode tautan diterima
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
    // Dikeluarkan secara eksplisit dari HP (401), atau QR/kode tidak jadi dimasukkan: kunci sementara dibuang.
    s.terpasang = false;
    s.baruTertaut = false;
    s.lidTersimpan = null;
    void hapusAuth(s.nama).catch((e) => console.error(`[wa ${s.nama}] gagal membuang kredensial:`, e));
    s.status = terpasang ? "STOPPED" : "FAILED";
    s.alasan = terpasang
      ? "Perangkat ini dikeluarkan dari WhatsApp di HP. Pindai QR lagi untuk menautkan."
      : kode === KODE.waktuHabis
        ? pakaiKode
          ? "Kode tautan kedaluwarsa sebelum dimasukkan di HP. Minta kode baru atau pindai QR untuk menautkan."
          : "Kode QR tidak dipindai tepat waktu. Tampilkan QR baru untuk menautkan."
        : "Koneksi ke WhatsApp terputus sebelum nomor ditautkan. Coba lagi.";
    console.info(`[wa ${s.nama}] ${terpasang ? "dikeluarkan dari WhatsApp" : "berhenti sebelum ditautkan"} (kode ${kode})`);
    lepasTunggu(s);
    return;
  }

  // Nomor sudah tertaut: TIDAK PERNAH berhenti menyambung ulang (kecuali pengguna sendiri yang logout / 401).
  // Bila gagal berulang atau ditolak edge server (403/405/411), buang routingInfo lama agar mencoba edge server baru.
  s.gagal += 1;
  if ((s.gagal >= 2 || kode === KODE.ditolak || kode === KODE.versiDitolak || kode === KODE.tidakCocok) && auth.creds.routingInfo) {
    delete auth.creds.routingInfo;
    auth.simpanCreds();
  }
  const dasar =
    kode === KODE.digantikan
      ? s.gagal > 5
        ? JEDA_DIGANTIKAN_MAKS_MS
        : JEDA_ULANG_MAKS_MS
      : Math.min(JEDA_ULANG_MAKS_MS, 1_000 * 2 ** Math.min(s.gagal - 1, 6));
  const jeda = skala(dasar + Math.floor(Math.random() * 1_000));
  s.status = "STARTING";
  s.alasan = "Sedang menyambung ulang secara otomatis ke WhatsApp...";
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
    setTimeout(() => void mulaiGerbang(), st.jedaDbMs ?? skala(5_000));
    return;
  }
  // Jeda adaptif: <=20 nomor = 700 ms; 200+ nomor dirapatkan otomatis (min 120 ms) agar seluruh nomor tersambung dalam ±25 dtk.
  const jedaAdaptif = daftar.length > 20 ? Math.max(120, Math.floor(25_000 / daftar.length)) : JEDA_MULAI_MS;
  const jedaMulai = st.jedaMulaiMs ?? jedaAdaptif;
  daftar.forEach((nama, i) => {
    const s = sesiAtauBaru(nama);
    s.terpasang = true;
    if (s.sock || s.timer) return; // sudah dijalankan lewat dashboard selagi menunggu database
    s.status = "STARTING";
    s.timer = setTimeout(() => void sambung(s), skala(i * jedaMulai + Math.floor(Math.random() * Math.min(200, jedaMulai))));
  });
  if (st.timerJaga) clearInterval(st.timerJaga);
  // Penjaga berkala: memastikan tidak ada nomor tertaut yang diam tanpa soket dan tanpa jadwal sambung ulang.
  st.timerJaga = setInterval(() => {
    let urutan = 0;
    for (const s of st.sesi.values()) {
      if (s.terpasang && !s.sock && !s.timer && s.status !== "WORKING" && s.status !== "SCAN_QR_CODE") {
        s.timer = setTimeout(() => void sambung(s), skala(urutan++ * 150));
      }
    }
  }, 45_000);
  st.timerJaga.unref?.();
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
  if (s.sock && s.status !== "FAILED" && s.status !== "STOPPED") {
    if (s.status === "STARTING") await Promise.race([new Promise<void>((r) => s.tunggu.push(r)), tidur(4_000)]);
    return;
  }
  s.gagal = 0;
  s.alasan = null;
  const pasti = new Promise<void>((r) => s.tunggu.push(r));
  await sambung(s);
  await Promise.race([pasti, tidur(4_000)]);
}

/** Kode tautan 8 karakter yang sedang aktif untuk sesi ini (null bila tidak ada / sudah terhubung). */
export function kodePairing(nama: string): string | null {
  const s = st.sesi.get(nama);
  return s?.status === "SCAN_QR_CODE" ? s.kodePairing : null;
}

/**
 * Minta kode tautan 8 karakter dari WhatsApp untuk menautkan perangkat lewat nomor telepon
 * (alternatif selain memindai QR, sama seperti "Tautkan dengan nomor telepon" di WhatsApp Web).
 */
export async function mintaKodePairing(nama: string, nomorHp: string): Promise<string> {
  const digit = rapikanNomorWa(nomorHp);
  if (!digit) throw new WaError("Nomor WhatsApp tidak valid (contoh: 0812-3456-7890).", "Invalid WhatsApp number (example: +62 812-3456-7890).");
  const s = sesiAtauBaru(nama);
  if (s.status === "WORKING") throw new WaError("Nomor ini sudah terhubung ke WhatsApp.", "This number is already connected to WhatsApp.");
  if (!s.sock || s.status === "FAILED" || s.status === "STOPPED") {
    await hubungkan(nama);
  } else if (s.status === "STARTING" && !s.qr) {
    await Promise.race([new Promise<void>((r) => s.tunggu.push(r)), tidur(6_000)]);
  }
  if ((s.status as SesiNomor["status"]) === "WORKING") throw new WaError("Nomor ini sudah terhubung ke WhatsApp.", "This number is already connected to WhatsApp.");
  const sock = s.sock;
  if (!sock || s.status !== "SCAN_QR_CODE") {
    throw new WaError(s.alasan || "Sesi WhatsApp belum siap. Klik Hubungkan ulang lalu coba lagi.", s.alasan ? undefined : "The WhatsApp session isn't ready yet. Click Reconnect and try again.");
  }
  if (typeof sock.requestPairingCode !== "function") {
    throw new WaError("Koneksi WhatsApp belum mendukung kode tautan.", "This WhatsApp connection doesn't support link codes yet.");
  }
  const mentah = await denganBatas(sock.requestPairingCode(digit), 15_000, "meminta kode tautan", "requesting the link code");
  const kode = String(mentah ?? "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  if (kode.length !== 8) throw new WaError("Gagal mendapatkan kode 8 karakter dari WhatsApp. Coba lagi.", "Couldn't get the 8-character code from WhatsApp. Please try again.");
  s.kodePairing = kode;
  return kode;
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
  if (keluar) {
    s.terpasang = false;
    s.lidTersimpan = null;
  }
  s.baruTertaut = false;
  s.alasan = null;
  s.qr = s.qrBit = null;
  s.kodePairing = null;
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
  if (st.timerJaga) {
    clearInterval(st.timerJaga);
    st.timerJaga = null;
  }
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
  if (!s?.sock || s.status !== "WORKING") throw new WaError("Nomor ini sedang tidak terhubung ke WhatsApp.", "This number is not connected to WhatsApp right now.");
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
        }, skala(2_000));
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

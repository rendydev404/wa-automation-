import "server-only";
import { skala } from "./skala-waktu";
import { createHash } from "node:crypto";
import type { AuthenticationCreds, ConnectionState, SocketConfig, WAMessage, WAPatchName, WASocket, proto } from "baileys";
import { type BitQr, kemasQr } from "./qr";
import { rapikanNomorWa } from "./format";
import { catatMengetik } from "./aktivitas";
import { pancarkan } from "./peristiwa";
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
  /** Stanza yang tiba vs yang sampai ke `messages.upsert`, dan pendeteksi nomor diam (lihat catatDiag). */
  diag: Diag | null;
  /** Sejak kapan (ms) soket terakhir WORKING tanpa putus; 0 = tidak terhubung. Follow-up menunggu koneksi stabil. */
  terhubungPada: number;
  /** Tanda terakhir WhatsApp membatasi nomor ini (perangkat dicabut 401, ditolak 403, error 463), lihat tandaiBahaya. */
  bahaya: { pada: number; alasan: string } | null;
  /** 403 beruntun: WhatsApp menolak login (nomor dibatasi/diblokir). Dari DITOLAK_LAMBAT dan seterusnya jedanya panjang. */
  ditolak: number;
}

interface Diag {
  mulai: number;
  /** Detik sampai `<success>` diterima; null = login belum selesai. */
  login: number | null;
  stanza: number;
  pribadi: number;
  status: number;
  offline: number;
  abaikan: number;
  upsert: number;
  ackStatus: number;
  /** Stanza yang tidak pernah sampai ke `messages.upsert` setelah DIAG_BUANG_MS (mis. gagal dekripsi). */
  hilang: number;
  tertunda: Map<string, { pada: number; jenis: string; offline: boolean }>;
  /** Jumlah semua frame per tag (iq, ib, receipt, ...): membedakan soket mati dari server yang tidak mengirim pesan. */
  frame: Map<string, number>;
  frameTerakhir: number;
  stanzaTerakhir: number;
  /** Pesan tertunda yang diumumkan server (`offline_preview`); null = tidak diumumkan. */
  pratinjau: string | null;
  /** Detik sejak soket dibuat sampai WhatsApp menandai pesan tertunda habis; null = belum. */
  offlineSelesai: number | null;
  diam: boolean;
  logPada: number;
}

interface Keadaan {
  sesi: Map<string, Sesi>;
  lib?: Promise<Baileys>;
  versi?: [number, number, number];
  versiPada: number;
  versiJanji?: Promise<void>;
  penangan: ((ev: EventWa) => void | Promise<void>) | null;
  /** Status kiriman pesan KELUAR (2 = sampai server, 3 = sampai HP, 4 = dibaca); dipakai follow-up CS (followup.ts). */
  padaAck?: ((sesi: string, id: string, status: number) => void) | null;
  /** Tanda WhatsApp membatasi sebuah nomor (followup.ts menghentikan follow-up nomor itu). */
  padaBahaya?: ((sesi: string, alasan: string) => void) | null;
  dimulai: boolean;
  timerJaga?: ReturnType<typeof setInterval> | null;
  timerDiag?: ReturnType<typeof setInterval> | null;
  /** Khusus pengujian: ubah jeda mulai bergiliran & coba-ulang DB setelah diuji. */
  jedaMulaiMs?: number;
  jedaDbMs?: number;
}

const g = globalThis as unknown as { __waGerbang?: Keadaan };
const st: Keadaan = (g.__waGerbang ??= { sesi: new Map(), versiPada: 0, penangan: null, dimulai: false });

const JEDA_MULAI_MS = 700; // jarak antar-nomor saat menyambungkan semuanya di awal
const JEDA_ULANG_MAKS_MS = 60_000;
const JEDA_DIGANTIKAN_MAKS_MS = 300_000;
/**
 * 403 = WhatsApp menolak login nomor ini (dibatasi/diblokir). Mencoba tiap menit berjam-jam tidak membuka blokir dan
 * justru terlihat seperti klien yang memaksa masuk; dari 403 ke-DITOLAK_LAMBAT jedanya JEDA_DITOLAK_MS (tetap mencoba
 * sendiri, jadi begitu blokir dibuka nomor tersambung lagi tanpa scan ulang).
 */
const DITOLAK_LAMBAT = 3;
const JEDA_DITOLAK_MS = 15 * 60_000;
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

/**
 * Baileys 7.0.0-rc14 (`validate-connection.js:161`) meng-hardcode `WA_ADV_DEVICE_SIG_PREFIX` (`[6, 1]`) saat
 * menandatangani `pair-device-sign`, padahal akun WA Business Coexistence / Cloud Hosted (`ADVEncryptionType.HOSTED`)
 * wajib memakai `WA_ADV_HOSTED_DEVICE_SIG_PREFIX` (`[6, 6]`). Mengembalikan `true` bila stanza `HOSTED` sudah ditangani.
 */
function tanganiPairSuccessHosted(B: Baileys, namaSesi: string, sock: WASocket, creds: AuthenticationCreds, stanza: unknown): boolean {
  type BNode = { tag: string; attrs: Record<string, string>; content?: unknown };
  const sNode = stanza as BNode | undefined;
  const pairNode = sNode ? (B.getBinaryNodeChild(sNode as never, "pair-success") as BNode | undefined) : undefined;
  const devIdNode = pairNode ? (B.getBinaryNodeChild(pairNode as never, "device-identity") as BNode | undefined) : undefined;
  const devNode = pairNode ? (B.getBinaryNodeChild(pairNode as never, "device") as BNode | undefined) : undefined;
  if (!pairNode || !devIdNode?.content || !devNode) return false;

  const isiHmac = devIdNode.content instanceof Uint8Array ? devIdNode.content : null;
  if (!isiHmac) return false;
  const { details, hmac, accountType } = B.proto.ADVSignedDeviceIdentityHMAC.decode(isiHmac);
  if (!details || !hmac) return false;
  const account = B.proto.ADVSignedDeviceIdentity.decode(details);
  if (!account.details || !account.accountSignatureKey || !account.accountSignature) return false;
  const deviceIdentity = B.proto.ADVDeviceIdentity.decode(account.details);
  const isHostedAccount = accountType === B.proto.ADVEncryptionType.HOSTED;
  const isHostedDevice = deviceIdentity.deviceType === B.proto.ADVEncryptionType.HOSTED;
  if (!isHostedAccount && !isHostedDevice) return false;

  const sockInternal = sock as unknown as {
    sendNode?: (n: unknown) => Promise<void>;
    sendUnifiedSession?: () => Promise<void>;
    updateServerTimeOffset?: (n: unknown) => void;
    end?: (e: Error) => void;
  };
  if (typeof sockInternal.sendNode !== "function") return false;

  try {
    sockInternal.updateServerTimeOffset?.(sNode);
    const hmacPrefix = isHostedAccount ? B.WA_ADV_HOSTED_ACCOUNT_SIG_PREFIX : Buffer.alloc(0);
    const advSign = B.hmacSign(Buffer.concat([hmacPrefix, details]), Buffer.from(creds.advSecretKey, "base64"));
    if (!hmac || Buffer.compare(hmac, advSign) !== 0) throw new Error("Invalid account signature");

    const accSigPrefix = isHostedDevice ? B.WA_ADV_HOSTED_ACCOUNT_SIG_PREFIX : B.WA_ADV_ACCOUNT_SIG_PREFIX;
    const accountMsg = Buffer.concat([accSigPrefix, account.details, creds.signedIdentityKey.public]);
    if (!B.Curve.verify(account.accountSignatureKey, accountMsg, account.accountSignature)) {
      throw new Error("Failed to verify account signature");
    }

    const devSigPrefix = isHostedDevice ? B.WA_ADV_HOSTED_DEVICE_SIG_PREFIX : B.WA_ADV_DEVICE_SIG_PREFIX;
    const deviceMsg = Buffer.concat([devSigPrefix, account.details, creds.signedIdentityKey.public, account.accountSignatureKey]);
    account.deviceSignature = B.Curve.sign(creds.signedIdentityKey.private, deviceMsg);

    const jid = devNode.attrs?.jid;
    const lid = devNode.attrs?.lid;
    const bizNode = B.getBinaryNodeChild(pairNode as never, "biz") as BNode | undefined;
    const platformNode = B.getBinaryNodeChild(pairNode as never, "platform") as BNode | undefined;
    const platform = platformNode?.attrs?.name;
    const identity = B.createSignalIdentity(lid || jid, account.accountSignatureKey);
    const accountEnc = B.encodeSignedDeviceIdentity(account, false);
    const reply = {
      tag: "iq",
      attrs: { to: B.S_WHATSAPP_NET, type: "result", id: sNode?.attrs?.id },
      content: [
        {
          tag: "pair-device-sign",
          attrs: {},
          content: [{ tag: "device-identity", attrs: { "key-index": String(deviceIdentity.keyIndex ?? 0) }, content: accountEnc }],
        },
      ],
    };

    console.info(`[wa ${namaSesi}] pairing configured successfully, expect to restart the connection...${platform ? ` (platform ${platform})` : ""}`);
    sock.ev.emit("creds.update", {
      account,
      me: { id: jid, name: bizNode?.attrs?.name, lid },
      signalIdentities: [...(creds.signalIdentities || []), identity],
      platform,
    });
    sock.ev.emit("connection.update", { isNewLogin: true, qr: undefined });
    void sockInternal
      .sendNode(reply)
      .then(() => sockInternal.sendUnifiedSession?.())
      .catch((err: unknown) => sockInternal.end?.(err instanceof Error ? err : new Error(String(err))));
  } catch (err) {
    console.error(`[wa ${namaSesi}] error in pairing:`, err instanceof Error ? err.message : err);
    sockInternal.end?.(err instanceof Error ? err : new Error(String(err)));
  }
  return true;
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

/** Penerima status kiriman pesan keluar (centang satu/dua/biru). Dipanggil seketika, tanpa I/O di sini. */
export function padaAck(fn: (sesi: string, id: string, status: number) => void): void {
  st.padaAck = fn;
}

/** Penerima tanda bahaya nomor (lihat tandaiBahaya). */
export function padaBahaya(fn: (sesi: string, alasan: string) => void): void {
  st.padaBahaya = fn;
}

/**
 * WhatsApp memberi tanda membatasi nomor ini: perangkat dicabut (401 device_removed), login ditolak (403), atau pesan
 * ditolak karena akun dibatasi (error 463). Disimpan di memori dan diteruskan ke follow-up (berhenti + pemilik diberi
 * tahu). Pesan yang kita mulai sendiri adalah pemicu blokir paling kuat, jadi saat seperti ini tidak boleh ada.
 */
function tandaiBahaya(s: Sesi, alasan: string): void {
  s.bahaya = { pada: Date.now(), alasan };
  try {
    st.padaBahaya?.(s.nama, alasan);
  } catch (e) {
    console.warn(`[wa ${s.nama}] penanda bahaya gagal:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Kesehatan nomor untuk pesan yang kita MULAI sendiri (follow-up): berapa lama soketnya tersambung tanpa putus dan
 * tanda bahaya terakhir. Dari memori, tanpa I/O.
 */
export function kesehatanSesi(nama: string): { stabilMs: number; bahaya: { pada: number; alasan: string } | null } {
  const s = st.sesi.get(nama);
  if (!s) return { stabilMs: 0, bahaya: null };
  return { stabilMs: s.status === "WORKING" && s.terhubungPada ? Date.now() - s.terhubungPada : 0, bahaya: s.bahaya };
}

/** Selesai setelah penangannya selesai, supaya event satu nomor benar-benar diproses berurutan. */
async function kabari(ev: EventWa): Promise<void> {
  // Bus peristiwa (webhook aplikasi di mesin self-host); tanpa pendengar biayanya nol.
  if (ev.jenis === "terhubung") pancarkan({ jenis: "nomor.terhubung", sesi: ev.sesi, waId: ev.waId, nama: ev.nama });
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
      // Baileys: "error 463: account restricted or missing tctoken" = WhatsApp sedang membatasi akun ini.
      if (/^error 463\b/.test(msg ?? "")) {
        const s = st.sesi.get(nama);
        if (s && (!s.bahaya || Date.now() - s.bahaya.pada > 60_000)) tandaiBahaya(s, "WhatsApp membatasi akun ini (error 463: pesan ditolak)");
      }
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
      diag: null,
      terhubungPada: 0,
      bahaya: null,
      ditolak: 0,
    };
    st.sesi.set(nama, s);
  }
  return s;
}

const DIAG_TERTUNDA_MAKS = 2_000;
const DIAG_JEDA_MS = 60_000;
const DIAG_SEHAT_MS = 300_000;
/** Nomor lain menerima tanda "pesan tertunda habis" dalam 2-7 dtk; tanpa tanda dan tanpa stanza selama ini = server diam. */
const DIAM_MS = 180_000;
const DIAG_BUANG_MS = 600_000;

type PenilaianDiag = "normal" | "server-diam" | "soket-mati" | "tertahan-baileys";

/** Letak masalah menurut hitungan frame. Bukan penyebab: "server-diam" berarti WhatsApp tidak mengirim, bukan alasannya. */
function nilaiDiag(d: Diag, tertuaPada: number | null, kini: number): PenilaianDiag {
  if (kini - (d.frameTerakhir || d.mulai) >= DIAM_MS) return "soket-mati";
  if (tertuaPada !== null && kini - tertuaPada >= DIAM_MS) return "tertahan-baileys";
  if (d.offlineSelesai === null && kini - d.mulai >= DIAM_MS && kini - (d.stanzaTerakhir || d.mulai) >= DIAM_MS) return "server-diam";
  return "normal";
}

/** Tanpa isi pesan dan tanpa nomor lawan bicara. Nomor sehat dicatat tiap DIAG_SEHAT_MS, nomor bermasalah tiap menit. */
function catatDiag(): void {
  const kini = Date.now();
  for (const s of st.sesi.values()) {
    const d = s.diag;
    if (!d || s.status !== "WORKING") continue;
    for (const [id, x] of d.tertunda) {
      if (kini - x.pada < DIAG_BUANG_MS) break;
      d.tertunda.delete(id);
      d.hilang += 1;
    }
    const tertua = d.tertunda.values().next().value;
    const nilai = nilaiDiag(d, tertua?.pada ?? null, kini);
    if (nilai === "server-diam" && !d.diam) {
      d.diam = true;
      void import("./notifikasi").then((m) => m.notifNomorDiam(s.nama));
    } else if (nilai === "normal" && d.diam) {
      d.diam = false;
      console.warn(`[wa ${s.nama}] kiriman dari WhatsApp berjalan lagi`);
    }
    if (nilai === "normal" && kini - d.logPada < DIAG_SEHAT_MS) continue;
    d.logPada = kini;
    const frame = [...d.frame].map(([tag, jumlah]) => `${tag}:${jumlah}`).join(",") || "-";
    const baris =
      `[diag ${s.nama}] penilaian=${nilai} umur=${Math.round((kini - d.mulai) / 1000)}dtk login=${d.login ?? "belum"} stanza=${d.stanza} pribadi=${d.pribadi} status=${d.status} offline=${d.offline} abaikan=${d.abaikan} upsert=${d.upsert} ackStatus=${d.ackStatus} hilang=${d.hilang} tertunda=${d.tertunda.size}` +
      `${tertua ? ` tertua=${Math.round((kini - tertua.pada) / 1000)}dtk(${tertua.jenis}${tertua.offline ? ",offline" : ""})` : ""} offlineSelesai=${d.offlineSelesai ?? "belum"} pratinjau=${d.pratinjau ?? "-"} frameTerakhir=${d.frameTerakhir ? `${Math.round((kini - d.frameTerakhir) / 1000)}dtk` : "-"} frame=${frame}`;
    if (nilai === "normal") console.info(baris);
    else console.error(baris);
  }
}

function diagBaru(): Diag {
  if (!st.timerDiag) {
    st.timerDiag = setInterval(catatDiag, DIAG_JEDA_MS);
    st.timerDiag.unref?.();
  }
  return {
    mulai: Date.now(),
    login: null,
    stanza: 0,
    pribadi: 0,
    status: 0,
    offline: 0,
    abaikan: 0,
    upsert: 0,
    ackStatus: 0,
    hilang: 0,
    tertunda: new Map(),
    frame: new Map(),
    frameTerakhir: 0,
    stanzaTerakhir: 0,
    pratinjau: null,
    offlineSelesai: null,
    diam: false,
    logPada: 0,
  };
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
    const diag = diagBaru();
    s.diag = diag;
    // Grup, saluran, dan daftar siaran tidak pernah dilayani. Status (story) kontak SENGAJA tidak diabaikan di
    // tingkat soket: WhatsApp menuntut tanda terima resminya. Bila ditolak (NACK 500 bawaan) perangkat dicabut;
    // bila hanya di-ack polos, server mengirim ulang status yang sama dan memutus stream tiap ±50 menit
    // (`stream:error > ack{"class":"status"}`) sementara pesan pelanggan tertahan di belakangnya, berjam-jam,
    // pada nomor yang kontaknya banyak memasang status. Baileys yang memprosesnya; pesanTiba lalu membuangnya
    // karena bukan chat pribadi, jadi tidak pernah sampai ke AI.
    // Sebagian akun menerima status sebagai frame `<status>`, bukan `<message>`: lihat "CB:status" di bawah.
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
        if (ev === "frame") {
          const tag = (args[0] as { tag?: string } | undefined)?.tag;
          if (tag) {
            diag.frame.set(tag, (diag.frame.get(tag) ?? 0) + 1);
            diag.frameTerakhir = Date.now();
          }
        } else if (ev === "CB:iq,,pair-success") {
          if (tanganiPairSuccessHosted(B, s.nama, sock, auth.creds, args[0])) return true;
        } else if (ev === "CB:failure") {
          console.warn(`[wa ${s.nama}] kegagalan koneksi dari WhatsApp: ${ringkasNode(args[0])}`);
        } else if (ev === "CB:success") {
          diag.login = Math.round((Date.now() - diag.mulai) / 1000);
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
            diag.abaikan += 1;
            void sock.sendMessageAck(node as never).catch(() => {});
            return true;
          }
          const a = node?.attrs ?? {};
          diag.stanza += 1;
          diag.stanzaTerakhir = Date.now();
          const jenisDiag = dari && B.isJidStatusBroadcast(dari) ? "status" : chatPribadi(B, dari) ? "pribadi" : "lain";
          if (jenisDiag === "status") diag.status += 1;
          else if (jenisDiag === "pribadi") diag.pribadi += 1;
          if (a.offline) diag.offline += 1;
          if (a.id) {
            if (diag.tertunda.size >= DIAG_TERTUNDA_MAKS) diag.tertunda.clear();
            diag.tertunda.set(a.id, { pada: Date.now(), jenis: jenisDiag, offline: !!a.offline });
          }
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
        } else if (ev === "CB:status") {
          // Baileys rc14 belum punya penangan `<status>` (Baileys #2858, PR #2883): tanpa ack ini server menahan pesan
          // masuk dan memutus stream tiap 50 menit. Ack polos tanpa error, isinya tidak dibaca. Hapus bila sudah ada di rilis.
          diag.ackStatus += 1;
          void sock.sendMessageAck(args[0] as never).catch((e) => console.error(`[wa ${s.nama}] gagal meng-ack status:`, e instanceof Error ? e.message : e));
        } else if (ev === "CB:ib,,offline") {
          diag.offlineSelesai = Math.round((Date.now() - diag.mulai) / 1000);
        } else if (ev === "CB:ib,,offline_preview") {
          const anak = (args[0] as { content?: { attrs?: Record<string, string> }[] } | undefined)?.content?.[0];
          diag.pratinjau = JSON.stringify(anak?.attrs ?? {}).slice(0, 120);
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

  // Baileys 7 (`socket.js:843-856`) menembakkan `<presence name="..."/>` setiap kali `creds.me?.name !== update.me?.name`:
  // 1) Pada WA Business (`<biz name="..."/>`), `pair-success` memicu `<presence>` di soket registrasi SEBELUM `pair-device-sign`!
  // 2) Setiap `creds.update` parsial tanpa `me` (`uploadPreKeys`, `dirty`, `myAppStateKeyId`) memicu `<presence/>` kosong cacat!
  // Samakan `me.name` & jaga `me.lid` / `signalIdentities` sebelum pendengar internal Baileys berjalan agar protokol iPhone (smbi) bersih.
  const evMentah = sock.ev as unknown as { emit?: (ev: string, ...args: unknown[]) => boolean };
  if (typeof evMentah?.emit === "function") {
    const emitEvAsli = evMentah.emit.bind(sock.ev);
    evMentah.emit = (ev: string, ...args: unknown[]) => {
      if (ev === "creds.update" && args[0] && typeof args[0] === "object" && args[0] !== auth.creds) {
        const u = args[0] as Partial<AuthenticationCreds>;
        const lidJaga = u.me?.lid || auth.creds.me?.lid || s.lidTersimpan;
        if (u.me) {
          const meBaru = { ...auth.creds.me, ...u.me, ...(lidJaga ? { lid: lidJaga } : {}) } as NonNullable<AuthenticationCreds["me"]>;
          auth.creds.me = meBaru;
          args[0] = { ...u, me: meBaru };
        } else if (auth.creds.me?.name !== undefined) {
          args[0] = { ...u, me: { ...auth.creds.me, ...(lidJaga ? { lid: lidJaga } : {}) } };
        }
        const idents = (args[0] as Partial<AuthenticationCreds>).signalIdentities;
        if (idents?.[0]?.identifier && !idents[0].identifier.name) {
          const fallbackNama = lidJaga || (args[0] as Partial<AuthenticationCreds>).me?.id || auth.creds.me?.id;
          if (fallbackNama) idents[0].identifier.name = fallbackNama;
        }
      }
      return emitEvAsli(ev, ...args);
    };
  }

  let dirtyTerbersih = 0;
  let sinkronAktif: { janji: Promise<void>; denganKunci: boolean } | null = null;
  const bersihkanDirtyAkun = (ts?: number): void => {
    const target = ts ?? auth.creds.lastAccountSyncTimestamp;
    if (!target || target === dirtyTerbersih || typeof sock.cleanDirtyBits !== "function") return;
    dirtyTerbersih = target;
    void sock.cleanDirtyBits("account_sync", target).catch(() => {});
  };
  const jalankanSinkron = (koleksi: readonly WAPatchName[]): void => {
    if (typeof sock.resyncAppState !== "function") return;
    const punyaKunci = !!auth.creds.myAppStateKeyId;
    if (sinkronAktif) {
      // Bila sinkron dengan kunci sudah berjalan, cukup tunggu selesai; bila sinkron tanpa kunci sedang jalan dan
      // kunci baru saja tiba dari iPhone, antrekan tepat sesudahnya agar tidak balapan mutex.
      if (!sinkronAktif.denganKunci && punyaKunci) {
        const setelah = sinkronAktif.janji.then(() => jalankanSinkron(koleksi));
        sinkronAktif = { janji: setelah, denganKunci: true };
      }
      return;
    }
    const janji = sock
      .resyncAppState(koleksi, false)
      .then(() => {
        // Hanya tandai selesai & bersihkan dirty bit bila myAppStateKeyId sudah tiba dari HP; bila dipanggil saat
        // `open` sebelum iPhone mengirim APP_STATE_SYNC_KEY_SHARE, biarkan 0 agar disinkronkan ulang begitu kunci tiba.
        if (auth.creds.myAppStateKeyId) {
          if (!auth.creds.accountSyncCounter) {
            auth.creds.accountSyncCounter = 1;
            auth.simpanCreds();
          }
          bersihkanDirtyAkun();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (sinkronAktif?.janji === janji) sinkronAktif = null;
      });
    sinkronAktif = { janji, denganKunci: punyaKunci };
  };

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
    // wajib jalankan resync awal SEMUA koleksi lalu bersihkan dirty bit account_sync sesudahnya.
    if (u.myAppStateKeyId && !auth.creds.accountSyncCounter) {
      jalankanSinkron(KOLEKSI_APP_STATE);
    }
    // Pada tautan pertama (accountSyncCounter 0), JANGAN bersihkan dirty bit sebelum kunci app-state tiba & sinkron selesai:
    // di iPhone WA Business (smbi), `<ib><dirty type="account_sync">` tiba lebih dulu dan pembersihan prematur menggagalkan tautan.
    if (u.lastAccountSyncTimestamp && auth.creds.accountSyncCounter) {
      bersihkanDirtyAkun(u.lastAccountSyncTimestamp);
    }
  });

  sock.ev.on("connection.update", (u) => {
    if (s.gen === gen) koneksiBerubah(B, s, sock, auth, gen, u, jalankanSinkron);
  });

  sock.ev.on("messages.upsert", ({ messages }) => {
    if (s.gen !== gen) return;
    if (s.diag) {
      s.diag.upsert += messages.length;
      for (const m of messages) if (m.key.id) s.diag.tertunda.delete(m.key.id);
    }
    for (const m of messages) antre(s, () => pesanTiba(B, s, sock, m));
  });

  // Tanda-baca atas pesan MASUK berarti pesan itu dibaca dari perangkat lain milik nomor ini.
  sock.ev.on("messages.update", (daftar) => {
    if (s.gen !== gen) return;
    const chat = new Set<string>();
    for (const { key, update } of daftar) {
      if (!key.fromMe && chatPribadi(B, key.remoteJid) && (update.status ?? 0) >= B.proto.WebMessageInfo.Status.READ) chat.add(key.remoteJid);
      else if (key.fromMe && key.id && typeof update.status === "number") {
        pancarkan({ jenis: "pesan.status", sesi: s.nama, waId: key.id, status: update.status });
        try {
          st.padaAck?.(s.nama, key.id, update.status);
        } catch {
          // pemantau kiriman tidak boleh mengganggu event lain
        }
      }
    }
    for (const jid of chat) antre(s, async () => kabari({ jenis: "dibaca", sesi: s.nama, chat: await kanonik(B, sock, jid) }));
  });
}

/** Kelima koleksi app-state WhatsApp (sama dengan ALL_WA_PATCH_NAMES Baileys): yang diminta WA Web saat tautan pertama. */
const KOLEKSI_APP_STATE = ["critical_block", "critical_unblock_low", "regular_high", "regular_low", "regular"] as const satisfies readonly WAPatchName[];

function koneksiBerubah(
  B: Baileys,
  s: Sesi,
  sock: WASocket,
  auth: AuthSesi,
  gen: number,
  u: Partial<ConnectionState>,
  jalankanSinkron: (koleksi: readonly WAPatchName[]) => void,
): void {
  if (u.qr) {
    s.qr = u.qr;
    qrSejak.set(s.nama, Date.now());
    s.qrBit = null;
    s.status = "SCAN_QR_CODE";
    lepasTunggu(s);
    pancarkan({ jenis: "nomor.qr", sesi: s.nama, qr: u.qr });
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
    s.terhubungPada = Date.now();
    s.ditolak = 0;
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
    if (!auth.creds.accountSyncCounter) jalankanSinkron(KOLEKSI_APP_STATE);
    else if (!nama) jalankanSinkron(["critical_block"]);
    lepasTunggu(s);
    return;
  }
  if (u.connection !== "close") return;

  const kode = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode ?? 0;
  const terpasang = sudahTertaut(auth.creds);
  const pakaiKode = !!s.kodePairing;
  s.sock = null;
  s.terhubungPada = 0;
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
    if (terpasang && kode === KODE.keluar) tandaiBahaya(s, "Perangkat dikeluarkan dari WhatsApp (401)");
    if (terpasang) void import("./notifikasi").then((m) => m.notifNomorTerputus(s.nama));
    if (terpasang) pancarkan({ jenis: "nomor.terputus", sesi: s.nama, kode, keluar: kode === KODE.keluar });
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
  if (kode === KODE.ditolak) {
    s.ditolak += 1;
    if (s.ditolak === 1) tandaiBahaya(s, "WhatsApp menolak login nomor ini (403): kemungkinan dibatasi atau diblokir");
    if (s.ditolak === DITOLAK_LAMBAT) void import("./notifikasi").then((m) => m.notifNomorDitolak(s.nama));
  } else s.ditolak = 0;
  if ((s.gagal >= 2 || kode === KODE.ditolak || kode === KODE.versiDitolak || kode === KODE.tidakCocok) && auth.creds.routingInfo) {
    delete auth.creds.routingInfo;
    auth.simpanCreds();
  }
  const dasar =
    s.ditolak >= DITOLAK_LAMBAT
      ? JEDA_DITOLAK_MS
      : kode === KODE.digantikan
      ? s.gagal > 5
        ? JEDA_DIGANTIKAN_MAKS_MS
        : JEDA_ULANG_MAKS_MS
      : Math.min(JEDA_ULANG_MAKS_MS, 1_000 * 2 ** Math.min(s.gagal - 1, 6));
  const jeda = skala(dasar + Math.floor(Math.random() * 1_000));
  s.status = "STARTING";
  s.alasan =
    s.ditolak >= DITOLAK_LAMBAT
      ? "WhatsApp menolak nomor ini (403): kemungkinan dibatasi atau diblokir. Cek WhatsApp di HP; sistem mencoba lagi tiap 15 menit."
      : "Sedang menyambung ulang secara otomatis ke WhatsApp...";
  if (s.gagal === 1) pancarkan({ jenis: "nomor.terputus", sesi: s.nama, kode, keluar: false });
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
  pancarkan({ jenis: "nomor.pairing", sesi: s.nama, kode });
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

const qrSejak = new Map<string, number>();

/** Teks mentah kode QR yang sedang aktif + sejak kapan (ms), untuk API v1 mesin self-host. */
export function qrMentah(nama: string): { teks: string; sejakMs: number } | null {
  const s = st.sesi.get(nama);
  return s?.qr && s.status === "SCAN_QR_CODE" ? { teks: s.qr, sejakMs: qrSejak.get(nama) ?? Date.now() } : null;
}

/** Matriks kode QR; dihitung sekali per kode (berganti tiap ±20 detik) lalu disimpan. */
export async function qr(nama: string): Promise<{ hash: string; kode: BitQr } | null> {
  const s = st.sesi.get(nama);
  if (!s?.qr || s.status !== "SCAN_QR_CODE") return null;
  if (!s.qrBit) {
    const { encode } = await import("uqr");
    s.qrBit = {
      hash: createHash("sha1").update(s.qr).digest("hex").slice(0, 12),
      kode: kemasQr(encode(s.qr, { ecc: "Q", border: 3, boostEcc: true }).data),
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
  // Maskot dashboard: "sedang membalas" hanya selama nomor ini benar-benar mengetik (tanpa I/O).
  catatMengetik(nama, s.mengetik > 0);
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
 * Ulangi status "sedang mengetik" yang masih menyala (WhatsApp menghapusnya sendiri setelah beberapa detik) selama AI
 * menyusun jawaban yang lama. Tanpa mengubah penghitung mengetik; diam bila sudah berhenti mengetik.
 */
export function mengetikLagi(nama: string, alamat: string): void {
  const s = st.sesi.get(nama);
  if (!s || s.mengetik === 0) return;
  s.presensi = s.presensi
    .then(async () => {
      if (s.sock && s.status === "WORKING" && s.mengetik > 0) await s.sock.sendPresenceUpdate("composing", alamat);
    })
    .catch(() => {});
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

/**
 * Cek nomor HP terdaftar di WhatsApp (Developer API `kontak.cek`). Satu permintaan usync untuk semua nomor sekaligus;
 * pemanggil membatasi jumlahnya (cek massal = pola yang dicurigai WhatsApp). `digit` = nomor berawalan kode negara.
 */
export async function cekTerdaftar(nama: string, digit: string[]): Promise<Map<string, string | null>> {
  const { sock } = aktif(nama);
  const hasil = new Map<string, string | null>(digit.map((d) => [d, null]));
  if (!digit.length) return hasil;
  const r = await denganBatas(sock.onWhatsApp(...digit.map((d) => `${d}@s.whatsapp.net`)), 20_000, "mengecek nomor");
  for (const x of r ?? []) {
    const d = digitWa(x.jid);
    if (x.exists && hasil.has(d)) hasil.set(d, d);
  }
  return hasil;
}

/** Foto profil nomor yang terhubung (URL sementara dari WhatsApp), null bila tidak ada / disembunyikan. */
export async function fotoProfilSendiri(nama: string): Promise<string | null> {
  const { sock } = aktif(nama);
  const jid = sock.user?.id;
  if (!jid) return null;
  try {
    return (await denganBatas(sock.profilePictureUrl(`${digitWa(jid)}@s.whatsapp.net`, "image"), 15_000, "mengambil foto profil")) ?? null;
  } catch (e) {
    if (e instanceof WaError) throw e;
    return null; // 404/401 dari WhatsApp = tidak punya foto atau privasi
  }
}

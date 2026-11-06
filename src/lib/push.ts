import "server-only";
import { db, sekarang } from "./db";

/**
 * Push notification (Web Push) ke perangkat admin: notifikasi lonceng yang ditujukan ke admin ikut muncul di HP/laptop
 * walaupun tab dashboard tertutup. Tanpa Firebase: dikirim langsung ke layanan push browser (Google/Mozilla/Apple)
 * dengan kunci VAPID.
 *
 * - Hanya admin aktif: pendaftaran perangkat ditolak untuk non-admin (api/push), dan saat mengirim peran & status akun
 *   diperiksa lagi lewat join, jadi admin yang diturunkan/diblokir otomatis berhenti menerima.
 * - Hemat: daftar pemilik perangkat dipegang di memori, jadi notifikasi untuk pengguna biasa (kuota, paket, nomor) tidak
 *   menambah query sama sekali. Library web-push baru dimuat saat benar-benar ada yang dikirim.
 * - Perangkat yang sudah tidak berlaku (404/410 dari layanan push: izin dicabut, browser dihapus) dibuang otomatis.
 * - Kunci VAPID: dari env (VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY) bila diisi; kalau tidak, dibuat sekali dan disimpan di
 *   tabel settings. Kunci tidak boleh berganti, karena semua langganan yang ada terikat pada kunci publiknya.
 */

export interface LanggananPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface IsiPush {
  /** id notifikasi (untuk menandai dibaca saat diklik). */
  id?: number;
  judul: string;
  isi?: string;
  tautan?: string | null;
}

interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Cookie berisi id baris push_langganan perangkat ini: keluar dari akun = push di perangkat ini dimatikan. */
export const COOKIE_PUSH = "wa_push";

const MAKS_PERANGKAT = 10;
const UMUR_PEMILIK_MS = 5 * 60_000;

const g = globalThis as unknown as {
  __waVapid?: Promise<Vapid>;
  __waPushPemilik?: { ids: Set<number>; at: number } | null;
  __waPushTerima?: Map<string, LaporanTerima>;
};

/** Laporan service worker setelah menerima push (diagnosis "terkirim tapi tidak muncul"). Hanya di memori. */
export interface LaporanTerima {
  at: number;
  tampil: boolean;
  izin: string | null;
  galat: string | null;
}
const terima = (g.__waPushTerima ??= new Map());

function subjek(): string {
  const env = process.env.VAPID_SUBJECT?.trim();
  if (env) return env;
  const url = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (url?.startsWith("https://")) return url;
  const email = process.env.ADMIN_EMAIL?.trim();
  return email ? `mailto:${email}` : "https://chatgercep.com";
}

async function muatVapid(): Promise<Vapid> {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (pub && priv) return { publicKey: pub, privateKey: priv, subject: subjek() };
  const sql = await db();
  const baca = async () => {
    const [r] = await sql<{ nilai: string }[]>`SELECT nilai FROM settings WHERE kunci = 'push_vapid'`;
    return r ? (JSON.parse(r.nilai) as { publicKey: string; privateKey: string }) : null;
  };
  let k = await baca();
  if (!k) {
    const { default: webpush } = await import("web-push");
    const baru = webpush.generateVAPIDKeys();
    // Dua proses yang mulai bersamaan: yang kalah memakai kunci yang tersimpan lebih dulu.
    await sql`INSERT INTO settings(kunci, nilai) VALUES ('push_vapid', ${JSON.stringify(baru)}) ON CONFLICT (kunci) DO NOTHING`;
    k = await baca();
  }
  return { publicKey: k!.publicKey, privateKey: k!.privateKey, subject: subjek() };
}

function vapid(): Promise<Vapid> {
  return (g.__waVapid ??= muatVapid().catch((e) => {
    g.__waVapid = undefined;
    throw e;
  }));
}

/** Kunci publik VAPID untuk browser (applicationServerKey). */
export async function kunciPublikPush(): Promise<string> {
  return (await vapid()).publicKey;
}

/** user_id yang punya minimal satu perangkat terdaftar; dimuat ulang paling lama tiap 5 menit. */
async function pemilik(): Promise<Set<number>> {
  const c = g.__waPushPemilik;
  if (c && Date.now() - c.at < UMUR_PEMILIK_MS) return c.ids;
  const sql = await db();
  const rows = await sql<{ user_id: number }[]>`SELECT DISTINCT user_id FROM push_langganan`;
  const ids = new Set(rows.map((r) => r.user_id));
  g.__waPushPemilik = { ids, at: Date.now() };
  return ids;
}

const lupakanPemilik = () => {
  g.__waPushPemilik = null;
};

const sah = (s: unknown, maks: number): s is string => typeof s === "string" && s.length > 0 && s.length <= maks;

/** Validasi bentuk PushSubscription dari browser. Endpoint wajib https (layanan push resmi). */
export function uraiLangganan(x: unknown): LanggananPush | null {
  const o = x as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!o || !sah(o.endpoint, 1000) || !o.endpoint.startsWith("https://")) return null;
  if (!sah(o.keys?.p256dh, 200) || !sah(o.keys?.auth, 100)) return null;
  return { endpoint: o.endpoint, keys: { p256dh: o.keys.p256dh, auth: o.keys.auth } };
}

/** Simpan/perbarui perangkat milik userId. Maksimal 10 perangkat per akun (yang terlama dibuang). Mengembalikan id baris. */
export async function simpanLangganan(userId: number, s: LanggananPush, perangkat: string | null): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ id: number }[]>`
    INSERT INTO push_langganan (user_id, endpoint, p256dh, auth, perangkat, dibuat)
    VALUES (${userId}, ${s.endpoint}, ${s.keys.p256dh}, ${s.keys.auth}, ${perangkat?.slice(0, 200) ?? null}, ${sekarang()})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
      perangkat = EXCLUDED.perangkat, dibuat = EXCLUDED.dibuat
    RETURNING id`;
  await sql`
    DELETE FROM push_langganan WHERE user_id = ${userId} AND id NOT IN (
      SELECT id FROM push_langganan WHERE user_id = ${userId} ORDER BY dibuat DESC, id DESC LIMIT ${MAKS_PERANGKAT})`;
  lupakanPemilik();
  return r.id;
}

/** Hapus perangkat: lewat endpoint (tombol matikan) atau id (keluar dari akun), selalu dibatasi pemiliknya. */
export async function hapusLangganan(userId: number, kunci: { endpoint?: string; id?: number }): Promise<void> {
  if (!kunci.endpoint && !kunci.id) return;
  const sql = await db();
  if (kunci.endpoint) await sql`DELETE FROM push_langganan WHERE user_id = ${userId} AND endpoint = ${kunci.endpoint}`;
  else await sql`DELETE FROM push_langganan WHERE user_id = ${userId} AND id = ${kunci.id!}`;
  lupakanPemilik();
}

/**
 * Kirim push ke semua perangkat admin aktif milik userIds. Tidak pernah melempar galat dan tidak perlu ditunggu:
 * dipanggil dari kirimNotif() setelah notifikasi tersimpan.
 */
export async function kirimPush(userIds: number[], isi: IsiPush | ((userId: number) => IsiPush)): Promise<{ terkirim: number; gagal: number }> {
  const hasil = { terkirim: 0, gagal: 0 };
  try {
    const ada = await pemilik();
    const tujuan = userIds.filter((id) => ada.has(id));
    if (!tujuan.length) return hasil;
    const sql = await db();
    const perangkat = await sql<{ id: number; user_id: number; endpoint: string; p256dh: string; auth: string }[]>`
      SELECT p.id, p.user_id, p.endpoint, p.p256dh, p.auth
        FROM push_langganan p JOIN users u ON u.id = p.user_id
       WHERE p.user_id = ANY(${tujuan}::int[]) AND u.peran = 'admin' AND u.status = 'aktif'`;
    if (!perangkat.length) return hasil;
    const [{ default: webpush }, v] = await Promise.all([import("web-push"), vapid()]);
    const basi: number[] = [];
    await Promise.all(
      perangkat.map(async (p) => {
        const data = typeof isi === "function" ? isi(p.user_id) : isi;
        try {
          await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, JSON.stringify(data), {
            vapidDetails: v,
            TTL: 24 * 3600,
            urgency: "high",
            timeout: 10_000,
            contentEncoding: "aes128gcm",
          });
          hasil.terkirim++;
        } catch (e) {
          hasil.gagal++;
          const kode = (e as { statusCode?: number }).statusCode;
          if (kode === 404 || kode === 410) basi.push(p.id);
          else console.warn("[push] gagal terkirim:", kode ?? (e instanceof Error ? e.message : e));
        }
      }),
    );
    if (basi.length) {
      await sql`DELETE FROM push_langganan WHERE id = ANY(${basi}::int[])`;
      lupakanPemilik();
    }
  } catch (e) {
    console.warn("[push] gagal:", e instanceof Error ? e.message : e);
  }
  return hasil;
}

/** Catat laporan terima dari service worker perangkat milik userId (endpoint harus terdaftar atas nama akun itu). */
export async function catatTerima(userId: number, endpoint: string, lap: Omit<LaporanTerima, "at">): Promise<boolean> {
  const sql = await db();
  const [p] = await sql<{ id: number }[]>`SELECT id FROM push_langganan WHERE user_id = ${userId} AND endpoint = ${endpoint}`;
  if (!p) return false;
  if (terima.size > 500) terima.clear();
  terima.set(endpoint, { ...lap, at: Date.now() });
  console.log(`[push] diterima perangkat=#${p.id} tampil=${lap.tampil ? "ya" : "tidak"} izin=${lap.izin ?? "-"}${lap.galat ? ` galat=${lap.galat}` : ""}`);
  return true;
}

/** Nama singkat perangkat dari user agent, mis. "Chrome · Android". */
export function namaPerangkat(ua: string | null): string {
  if (!ua) return "Perangkat";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return os ? `${br} · ${os}` : br;
}

/** Perangkat milik userId beserta laporan terima terakhir (untuk tombol Uji). */
export async function statusPerangkat(userId: number): Promise<{ id: number; nama: string; endpoint: string; terima: LaporanTerima | null }[]> {
  const sql = await db();
  const rows = await sql<{ id: number; endpoint: string; perangkat: string | null }[]>`
    SELECT id, endpoint, perangkat FROM push_langganan WHERE user_id = ${userId} ORDER BY id`;
  return rows.map((r) => ({ id: r.id, nama: namaPerangkat(r.perangkat), endpoint: r.endpoint, terima: terima.get(r.endpoint) ?? null }));
}

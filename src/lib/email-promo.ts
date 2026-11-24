import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, sekarang } from "./db";
import { EmailError, type IsiEmail, emailTerkonfigurasi, htmlEmail, kirimEmail } from "./email";
import { MEREK } from "./merek";

/**
 * Email kabar fitur & promo ke pengguna terdaftar (kampanye sekali kirim, dipicu admin dari server).
 *
 * - Penerima: akun pengguna aktif yang tidak memilih berhenti (users.email_promo_mati). Akun uji (*.test, example.*)
 *   dilewati. Staf tidak ikut.
 * - Dicicil pelan (JEDA_MS per email) di latar, satu kampanye sekaligus; setiap penerima dicatat di email_kampanye,
 *   jadi kampanye yang terhenti (server mulai ulang, kuota harian penyedia email habis) dilanjutkan tanpa dobel.
 * - Kuota/batas laju penyedia (mis. Resend 429) = berhenti, catat alasannya; jalankan lagi nanti untuk melanjutkan.
 * - Setiap email membawa tautan & header berhenti satu klik (RFC 8058), terpisah dari pengingat pembayaran.
 */

export const JEDA_MS = 1_200;

const asalApp = (): string => (process.env.APP_URL || "https://chatgercep.com").replace(/\/+$/, "");
const rahasia = (): string => process.env.AUTH_SECRET || MEREK;

export const tokenPromo = (userId: number): string => createHmac("sha256", rahasia()).update(`email-promo:${userId}`).digest("hex").slice(0, 32);

export function tokenPromoSah(userId: number, token: string): boolean {
  const benar = Buffer.from(tokenPromo(userId));
  const diberi = Buffer.from(String(token));
  return diberi.length === benar.length && timingSafeEqual(diberi, benar);
}

export const tautanBerhentiPromo = (userId: number): string => `${asalApp()}/api/email/berhenti?u=${userId}&t=${tokenPromo(userId)}`;

export async function berhentiPromo(userId: number): Promise<boolean> {
  const sql = await db();
  const r = await sql`UPDATE users SET email_promo_mati = true WHERE id = ${userId}`;
  return r.count > 0;
}

/** Kunci pemicu internal (route admin kampanye) dari AUTH_SECRET: dipanggil dari dalam server lewat curl ke 127.0.0.1. */
export function kunciPemicuSah(diberi: string | null): boolean {
  if (!process.env.AUTH_SECRET || !diberi) return false;
  const benar = Buffer.from(createHmac("sha256", process.env.AUTH_SECRET).update("kampanye-email").digest("hex"));
  const b = Buffer.from(diberi);
  return b.length === benar.length && timingSafeEqual(b, benar);
}

// ---------- Isi kampanye ----------

interface Penerima {
  user_id: number;
  email: string;
  nama: string;
  nomor_qr: number | null;
}

interface Kampanye {
  judul: string;
  isi: (p: Penerima) => IsiEmail & { teks: string };
}

const sapaan = (p: Penerima) => (p.nama?.trim() ? `Halo ${p.nama.trim().split(/\s+/)[0]},` : "Halo,");

export const KAMPANYE: Record<string, Kampanye> = {
  "fitur-kontak-tersimpan": {
    judul: "Chat dari keluarga tidak lagi dibalas bot 😄 Fitur baru ChatGerCep",
    isi: (p) => {
      const url = p.nomor_qr ? `${asalApp()}/nomor/${p.nomor_qr}?tur=kontak#pengaturan` : `${asalApp()}/dashboard`;
      const paragraf = [
        "Pernah salah tingkah karena bot ikut membalas chat dari Mama, teman, atau supplier? Mulai hari ini itu tidak perlu terjadi lagi.",
        "Dengan fitur baru “Jangan balas kontak yang tersimpan di HP”, ChatGerCep mengenali nomor yang Anda simpan di buku telepon. Chat dari mereka tetap Anda yang pegang, sementara AI tetap sigap melayani calon pembeli baru, 24 jam tanpa jeda.",
        "Punya pelanggan setia yang nomornya Anda simpan tapi tetap ingin dilayani AI? Tinggal tekan “Tetap balas” di samping namanya. Selesai.",
      ];
      const rincian: [string, string][] = [
        ["Cara pakai", "Buka nomor Anda → Pengaturan → nyalakan sakelarnya"],
        ["Waktu", "Kurang dari 1 menit, dipandu tur langkah demi langkah"],
        ["Biaya", "Tanpa biaya tambahan"],
      ];
      const catatan = "Fitur ini untuk nomor yang tersambung lewat scan QR. Daftar kontak diambil otomatis dari WhatsApp di HP Anda, tanpa perlu mengunggah apa pun.";
      const berhenti = tautanBerhentiPromo(p.user_id);
      return {
        pratinjau: "Chat pribadi tetap Anda yang pegang, AI fokus melayani calon pembeli baru.",
        ikon: "cek",
        judul: "Chat pribadi tetap Anda yang pegang",
        subjudul: "Fitur baru: AI tidak membalas kontak yang tersimpan di HP Anda.",
        sapaan: sapaan(p),
        paragraf,
        rincian,
        tombol: { teks: "Coba sekarang", url },
        catatan,
        tautanKecil: { teks: "Berhenti menerima kabar fitur & promo", url: berhenti },
        teks: `${sapaan(p)}\n\n${paragraf.join("\n\n")}\n\n${rincian.map(([l, v]) => `${l}: ${v}`).join("\n")}\n\nCoba sekarang: ${url}\n\n${catatan}\n\nBerhenti menerima kabar fitur & promo: ${berhenti}`,
      };
    },
  },
};

const BUKAN_UJI = "u.email NOT LIKE '%.test' AND u.email NOT LIKE '%@example.%' AND u.email NOT LIKE '%@contoh.%'";

async function calon(kode: string, batas?: number): Promise<Penerima[]> {
  const sql = await db();
  const baris = await sql<Penerima[]>`
    SELECT u.id AS user_id, u.email, COALESCE(u.nama, '') AS nama,
           (SELECT n.id FROM numbers n WHERE n.user_id = u.id AND n.jalur <> 'resmi' ORDER BY n.id LIMIT 1) AS nomor_qr
      FROM users u
     WHERE u.peran = 'user' AND u.status = 'aktif' AND NOT u.email_promo_mati AND ${sql.unsafe(BUKAN_UJI)}
       AND NOT EXISTS (SELECT 1 FROM email_kampanye k WHERE k.kode = ${kode} AND k.user_id = u.id AND k.galat IS NULL)
     ORDER BY u.id
     ${batas ? sql`LIMIT ${batas}` : sql``}`;
  return [...baris];
}

export interface StatusKampanye {
  kode: string;
  sedang: boolean;
  sisa: number;
  terkirim: number;
  gagal: number;
  berhenti: string | null;
}

const g = globalThis as unknown as { __waKampanye?: { sedang: string | null; berhenti: string | null } };
const st = (g.__waKampanye ??= { sedang: null, berhenti: null });

export async function statusKampanye(kode: string): Promise<StatusKampanye> {
  const sql = await db();
  const [r] = await sql<{ terkirim: number; gagal: number }[]>`
    SELECT COUNT(*) FILTER (WHERE galat IS NULL)::int AS terkirim, COUNT(*) FILTER (WHERE galat IS NOT NULL)::int AS gagal FROM email_kampanye WHERE kode = ${kode}`;
  return { kode, sedang: st.sedang === kode, sisa: (await calon(kode)).length, terkirim: r.terkirim, gagal: r.gagal, berhenti: st.berhenti };
}

/** Satu email uji ke alamat tertentu (memakai data akun pemilik alamat itu bila ada). Tidak dicatat di kampanye. */
export async function kirimUji(kode: string, ke: string): Promise<void> {
  const k = KAMPANYE[kode];
  if (!k) throw new EmailError("Kampanye tidak dikenal.");
  const sql = await db();
  const [u] = await sql<Penerima[]>`
    SELECT u.id AS user_id, u.email, COALESCE(u.nama, '') AS nama,
           (SELECT n.id FROM numbers n WHERE n.user_id = u.id AND n.jalur <> 'resmi' ORDER BY n.id LIMIT 1) AS nomor_qr
      FROM users u WHERE lower(u.email) = lower(${ke})`;
  const p = u ?? { user_id: 0, email: ke, nama: "", nomor_qr: null };
  const isi = k.isi(p);
  await kirimEmail({ ke, judul: `[Uji] ${k.judul}`, teks: isi.teks, html: htmlEmail(isi), berhenti: tautanBerhentiPromo(p.user_id) });
}

const tidur = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Mulai (atau lanjutkan) kampanye di latar. false = sudah ada kampanye yang berjalan / email belum dikonfigurasi. */
export function mulaiKampanye(kode: string, jedaMs = JEDA_MS): boolean {
  const k = KAMPANYE[kode];
  if (!k || st.sedang || !emailTerkonfigurasi()) return false;
  st.sedang = kode;
  st.berhenti = null;
  void (async () => {
    const sql = await db();
    let n = 0;
    try {
      for (const p of await calon(kode)) {
        const isi = k.isi(p);
        try {
          await kirimEmail({ ke: p.email, judul: k.judul, teks: isi.teks, html: htmlEmail(isi), berhenti: tautanBerhentiPromo(p.user_id) });
          await sql`INSERT INTO email_kampanye (kode, user_id, pada, galat) VALUES (${kode}, ${p.user_id}, ${sekarang()}, NULL)
                    ON CONFLICT (kode, user_id) DO UPDATE SET pada = EXCLUDED.pada, galat = NULL`;
          n += 1;
        } catch (e) {
          const pesan = (e instanceof Error ? e.message : String(e)).slice(0, 300);
          // Batas laju / kuota penyedia: berhenti seluruhnya (lanjutkan nanti). Galat alamat: catat lalu lanjut.
          if (/\b(429|421|454)\b|rate|quota|limit|too many/i.test(pesan)) {
            st.berhenti = `Dihentikan: ${pesan}`;
            break;
          }
          await sql`INSERT INTO email_kampanye (kode, user_id, pada, galat) VALUES (${kode}, ${p.user_id}, ${sekarang()}, ${pesan})
                    ON CONFLICT (kode, user_id) DO UPDATE SET pada = EXCLUDED.pada, galat = EXCLUDED.galat`;
        }
        await tidur(jedaMs);
      }
    } catch (e) {
      st.berhenti = `Galat: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      console.info(`[kampanye] ${kode}: ${n} email terkirim${st.berhenti ? ` (${st.berhenti})` : ""}`);
      st.sedang = null;
    }
  })();
  return true;
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { tanpaIngatan, tanyaAiTerjaga } from "./ai";
import { db, sekarang } from "./db";
import { BATAS_DEMO, type IsianDemo, teksInformasi } from "./demo-bot-def";
import { buangSalamUlang } from "./gaya";
import { susunSistem, tambahDokumen } from "./knowledge";
import { aiUntukAkun } from "./langganan";
import { SLUG_LP } from "./lp/def";
import { tambahNomor } from "./numbers";
import { TOLAK_KODE, adaKode } from "./penjaga";

/**
 * Bot instan di landing ("Buat bot Anda dalam 60 detik"): pengunjung tanpa akun mengisi info usaha singkat, lalu
 * mengobrol dengan AI yang menjawab dari isian itu (mesin & penjaga sama dengan Uji bot, penyedia AI akun gratis).
 * Isian disimpan sebagai draf (draf_bot, kunci = token cookie cg_draf); saat pengunjung mendaftar, draf diklaim menjadi
 * nomor pertama akun beserta Informasi Usaha-nya, jadi bot yang tadi dicoba sudah jadi di dashboard (efek IKEA).
 *
 * Pengaman biaya: batas per pengunjung, per IP, dan global per 24 jam (memori proses; satu proses aplikasi).
 */

export const TOKEN_SAH = /^[a-f0-9]{32}$/;
export const tokenBaru = (): string => randomBytes(16).toString("hex");

const HARI_MS = 86_400_000;
const g = globalThis as unknown as { __waDemoBot?: { hitung: Map<string, { n: number; mulai: number }>; global: { n: number; mulai: number } } };
const st = (g.__waDemoBot ??= { hitung: new Map(), global: { n: 0, mulai: Date.now() } });

/** Hitungan 24 jam per kunci (tanpa menambah). */
function terpakai(kunci: string): number {
  const h = st.hitung.get(kunci);
  return h && Date.now() - h.mulai < HARI_MS ? h.n : 0;
}
function tambah(kunci: string): void {
  const kini = Date.now();
  const h = st.hitung.get(kunci);
  if (!h || kini - h.mulai >= HARI_MS) {
    if (st.hitung.size > 50_000) st.hitung.clear();
    st.hitung.set(kunci, { n: 1, mulai: kini });
  } else h.n += 1;
}

export type HasilDemo =
  | { ok: true; teks: string; sisa: number; abaikan?: boolean }
  | { ok: false; batas: "pengunjung" | "ip" | "global" };

/** Untuk uji: kosongkan hitungan batas. */
export function aturUlangBatasDemo(): void {
  st.hitung.clear();
  st.global = { n: 0, mulai: Date.now() };
}

/**
 * Satu balasan demo. `riwayat` = obrolan demo sejauh ini dari browser (maks 12 baris). Draf disimpan/diperbarui setelah
 * balasan berhasil; token yang drafnya sudah diklaim akun lain diganti token baru (dikembalikan supaya cookie diperbarui).
 */
export async function jawabDemo(r: { token: string; ip: string; isian: IsianDemo; pesan: string; riwayat: { ai: boolean; teks: string }[] }): Promise<HasilDemo & { token: string }> {
  let token = r.token;
  if (Date.now() - st.global.mulai >= HARI_MS) st.global = { n: 0, mulai: Date.now() };
  if (st.global.n >= BATAS_DEMO.global) return { ok: false, batas: "global", token };
  if (terpakai(`t:${token}`) >= BATAS_DEMO.perPengunjung) return { ok: false, batas: "pengunjung", token };
  if (terpakai(`ip:${r.ip}`) >= BATAS_DEMO.perIp) return { ok: false, batas: "ip", token };
  tambah(`t:${token}`);
  tambah(`ip:${r.ip}`);
  st.global.n += 1;

  const pengetahuan = teksInformasi(r.isian);
  const pesan = r.pesan.slice(0, BATAS_DEMO.pesan);
  const ai = await aiUntukAkun(null);
  const lengkap = tanpaIngatan(ai.penyedia);
  const riwayat = r.riwayat.slice(-12).map((m) => `${m.ai ? "Kamu (AI)" : "Pelanggan"}: ${m.teks.replace(/\s*\n\s*/g, " / ").slice(0, 500)}`);
  const posisi = { balasan: r.riwayat.filter((m) => m.ai).length, detikSejakBalasan: null };
  const { sistem } = await susunSistem({ id: 0, instruksi: "", belajar: false }, pesan, {
    pengetahuan,
    riwayat: lengkap ? riwayat : [],
    riwayatLengkap: lengkap,
    saringSpam: true,
    posisi,
  });
  // Sesi AI per pengunjung + isi info: info diubah = sesi baru, supaya ingatan Hermes tidak membawa fakta lama.
  const sidik = createHash("sha256").update(pengetahuan).digest("hex").slice(0, 10);
  const j = await tanyaAiTerjaga(
    { sessionId: `demo-${token}-${sidik}`, sistem, pesan, gambar: [], paksa: { penyedia: ai.penyedia }, cadanganHermes: ai.cadanganHermes },
    [sistem, pesan, ...riwayat].join("\n"),
    { saringSpam: true, gaya: true },
  );
  const sisa = Math.max(0, BATAS_DEMO.perPengunjung - terpakai(`t:${token}`));
  token = await simpanDraf(token, r.isian, pengetahuan);
  if (j.abaikan || !j.teks) return { ok: true, teks: "", sisa, abaikan: true, token };
  const teks = adaKode(j.teks) ? TOLAK_KODE : buangSalamUlang(rapikanWa(j.teks), posisi);
  return { ok: true, teks, sisa, token };
}

/** Format WhatsApp yang sama dengan jembatan (bridge.formatWa), tanpa memuat modul jembatan di route publik. */
function rapikanWa(teks: string): string {
  return teks
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3500);
}

/** Simpan/perbarui draf. Mengembalikan token yang dipakai (baru bila draf token lama sudah diklaim). */
async function simpanDraf(token: string, i: IsianDemo, teks: string): Promise<string> {
  const sql = await db();
  const kini = sekarang();
  const [r] = await sql<{ token: string }[]>`
    INSERT INTO draf_bot(token, jenis, nama, teks, balasan, dibuat, diubah) VALUES (${token}, ${i.jenis}, ${i.nama}, ${teks}, 1, ${kini}, ${kini})
    ON CONFLICT (token) DO UPDATE SET jenis = EXCLUDED.jenis, nama = EXCLUDED.nama, teks = EXCLUDED.teks, balasan = draf_bot.balasan + 1, diubah = EXCLUDED.diubah
     WHERE draf_bot.diklaim IS NULL
    RETURNING token`;
  if (r) return r.token;
  const baru = tokenBaru();
  await sql`INSERT INTO draf_bot(token, jenis, nama, teks, balasan, dibuat, diubah) VALUES (${baru}, ${i.jenis}, ${i.nama}, ${teks}, 1, ${kini}, ${kini})`;
  return baru;
}

/**
 * Akun baru mendaftar dengan cookie draf: draf menjadi nomor pertama akun + Informasi Usaha-nya (sekali; draf yang sudah
 * diklaim diabaikan). Jenis usaha yang juga industri LP mengisi asal_industri bila kosong. Mengembalikan id nomor baru,
 * atau null bila tidak ada draf. Tidak pernah melempar: pendaftaran tidak boleh gagal karena draf.
 */
export async function klaimDrafBot(userId: number, token: string | undefined): Promise<number | null> {
  if (!token || !TOKEN_SAH.test(token)) return null;
  try {
    const sql = await db();
    const [d] = await sql<{ jenis: string; nama: string; teks: string }[]>`
      UPDATE draf_bot SET user_id = ${userId}, diklaim = ${sekarang()} WHERE token = ${token} AND diklaim IS NULL
      RETURNING jenis, nama, teks`;
    if (!d) return null;
    const label = d.nama.replace(/\s*\((contoh|sample)\)\s*/gi, " ").trim().slice(0, 60) || "WhatsApp usaha";
    const n = await tambahNomor(label, userId);
    await tambahDokumen({ numberId: n.id, judul: "Informasi Usaha", sumber: "teks", teks: d.teks });
    if ((SLUG_LP as readonly string[]).includes(d.jenis)) await sql`UPDATE users SET asal_industri = ${d.jenis} WHERE id = ${userId} AND asal_industri IS NULL`;
    return n.id;
  } catch (e) {
    console.warn(`[demo-bot] klaim draf user=${userId} gagal:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Angka demo untuk admin: draf dibuat, yang diklaim (mendaftar), dan total balasan demo dalam `hari` terakhir. */
export async function ringkasanDemo(hari = 30): Promise<{ draf: number; diklaim: number; balasan: number }> {
  const sql = await db();
  const [r] = await sql<{ draf: number; diklaim: number; balasan: number }[]>`
    SELECT count(*)::int AS draf, count(diklaim)::int AS diklaim, COALESCE(sum(balasan), 0)::int AS balasan
      FROM draf_bot WHERE dibuat >= ${sekarang() - hari * 86400}`;
  return r;
}

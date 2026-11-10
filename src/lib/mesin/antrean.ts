import "server-only";
import { db, sekarang } from "../db";
import { rapikanNomorWa } from "../format";
import { modeMesin } from "../mode";
import { type Nomor, nomorById } from "../numbers";
import { dengar } from "../peristiwa";
import { tandaiKirimanSistem } from "../bridge";
import { WaError, infoSesi, kirimGambar, kirimTeks } from "../wa";
import { fiturBoleh, layananBoleh, lisensiSekarang, nomorUji, sandboxAktif, tujuanNomorUji } from "./lisensi";
import { antrekanEvent } from "./webhook";

/**
 * Antrean pesan keluar lewat API (POST /api/v1/pesan). Aturan anti-blokir yang tidak bisa dimatikan lewat API:
 *   - per nomor maks `batas.pesan_menit` pesan per menit, dengan jeda acak 1–3 dtk antar pesan;
 *   - maks `batas.kontak_baru_hari` kontak baru per hari WIB per nomor (kontak baru = belum pernah ada percakapan
 *     dan belum pernah dikirimi lewat API) -> ditolak saat masuk antrean (422 ditolak_anti_blokir).
 * Mode terbatas (lisensi tidak aktif) / nomor belum terhubung: pesan tetap menunggu di antrean, tidak dibuang.
 * Pesan yang menunggu lebih dari 24 jam ditandai gagal.
 */

export const MAKS_TEKS = 4096;
export const MAKS_GAMBAR_BYTE = 5 * 1024 * 1024;
const MIME_GAMBAR = new Set(["image/jpeg", "image/png", "image/webp"]);
const UMUR_ANTRE_MAKS = 24 * 3600;

export class AntreanError extends Error {
  kode: "isian_tidak_sah" | "ditolak_anti_blokir" | "tidak_ditemukan" | "bukan_nomor_penguji" | "nomor_penguji_belum_ada";
  constructor(kode: AntreanError["kode"], pesan: string) {
    super(pesan);
    this.kode = kode;
  }
}

export interface PesanKeluar {
  id: number;
  number_id: number;
  ke: string;
  status: "antre" | "terkirim" | "dibaca" | "gagal";
  alasan: string | null;
  dibuat: number;
  berubah: number;
}

/** Awal hari ini menurut WIB (detik epoch). */
export const awalHariWib = (kini = sekarang()): number => Math.floor((kini + 7 * 3600) / 86_400) * 86_400 - 7 * 3600;

export interface IsianPesan {
  nomor: Nomor;
  ke: unknown;
  teks?: unknown;
  gambar?: { base64?: unknown; mime?: unknown; caption?: unknown } | null;
}

/** Validasi + anti-blokir + simpan ke antrean (status 'antre'). */
export async function masukkanPesan(i: IsianPesan): Promise<PesanKeluar> {
  const ke = rapikanNomorWa(String(i.ke ?? ""));
  if (!ke) throw new AntreanError("isian_tidak_sah", "`ke` harus nomor WhatsApp tujuan (mis. 6281234567890).");
  const teks = typeof i.teks === "string" ? i.teks.replace(/\u0000/g, "").trim() : "";
  if (teks.length > MAKS_TEKS) throw new AntreanError("isian_tidak_sah", `Teks pesan maksimal ${MAKS_TEKS} karakter.`);
  let gambar: { data: string; mime: string; caption: string } | null = null;
  if (i.gambar) {
    const mime = String(i.gambar.mime ?? "");
    const data = String(i.gambar.base64 ?? "").replace(/^data:[^;]+;base64,/, "");
    if (!MIME_GAMBAR.has(mime)) throw new AntreanError("isian_tidak_sah", "gambar.mime harus image/jpeg, image/png, atau image/webp.");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || (data.length * 3) / 4 > MAKS_GAMBAR_BYTE) throw new AntreanError("isian_tidak_sah", "gambar.base64 tidak valid atau lebih dari 5 MB.");
    const caption = typeof i.gambar.caption === "string" ? i.gambar.caption.trim().slice(0, 1024) : "";
    gambar = { data, mime, caption };
  }
  if (!teks && !gambar) throw new AntreanError("isian_tidak_sah", "Isi `teks` atau `gambar`.");
  // Sandbox: hanya boleh mengirim ke SATU nomor penguji yang sudah diverifikasi (cek memori, tanpa query).
  if (sandboxAktif()) {
    if (!nomorUji()) throw new AntreanError("nomor_penguji_belum_ada", "Sandbox: daftarkan nomor penguji dulu di portal Developer (kirim WA berisi UJI <kode> ke nomor bot).");
    if (!tujuanNomorUji(ke)) throw new AntreanError("bukan_nomor_penguji", "Sandbox hanya boleh mengirim ke nomor penguji yang terverifikasi.");
  }
  const batas = lisensiSekarang()?.batas;
  const maksBaru = batas?.kontak_baru_hari ?? 50;
  const kini = sekarang();
  const sql = await db();
  return sql.begin(async (tx) => {
    // Satu penulis per nomor: hitungan kontak baru tidak bisa dilewati dengan permintaan serentak.
    await tx`SELECT pg_advisory_xact_lock(72727420, ${i.nomor.id})`;
    const [lama] = await tx<{ ada: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pesan_keluar WHERE number_id = ${i.nomor.id} AND ke = ${ke})
          OR EXISTS (SELECT 1 FROM percakapan WHERE number_id = ${i.nomor.id} AND telepon = ${ke}) AS ada`;
    const baru = !lama.ada;
    if (baru) {
      const [{ n }] = await tx<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM pesan_keluar WHERE number_id = ${i.nomor.id} AND kontak_baru AND dibuat >= ${awalHariWib(kini)}`;
      if (n >= maksBaru)
        throw new AntreanError("ditolak_anti_blokir", `Batas ${maksBaru} kontak baru per hari untuk nomor ini sudah tercapai. Kirim ke kontak yang sudah pernah chat, atau coba besok.`);
    }
    const [r] = await tx<PesanKeluar[]>`
      INSERT INTO pesan_keluar (number_id, ke, isi, kontak_baru, dibuat, berubah)
      VALUES (${i.nomor.id}, ${ke}, ${tx.json({ teks, gambar } as never)}, ${baru}, ${kini}, ${kini})
      RETURNING id, number_id, ke, status, alasan, dibuat, berubah`;
    setImmediate(() => void putaranAntrean().catch(() => {}));
    return r;
  });
}

export async function pesanById(id: number): Promise<PesanKeluar | undefined> {
  if (!Number.isSafeInteger(id) || id <= 0) return undefined;
  const sql = await db();
  const [r] = await sql<PesanKeluar[]>`SELECT id, number_id, ke, status, alasan, dibuat, berubah FROM pesan_keluar WHERE id = ${id}`;
  return r;
}

// ---------- Pekerja ----------

interface Keadaan {
  /** Waktu kirim (ms) dalam 60 dtk terakhir per nomor, untuk batas per menit. */
  jejak: Map<number, number[]>;
  /** Kirim berikutnya paling cepat (ms) per nomor (jeda acak 1–3 dtk). */
  berikut: Map<number, number>;
  sibuk: Set<number>;
  timer: ReturnType<typeof setInterval> | null;
  jalan: boolean;
  lepas: (() => void) | null;
}
const g = globalThis as unknown as { __waMesinAntrean?: Keadaan };
const st = (g.__waMesinAntrean ??= { jejak: new Map(), berikut: new Map(), sibuk: new Set(), timer: null, jalan: false, lepas: null });

/** Jeda acak antar pesan per nomor (ms); uji bisa memperkecil lewat WA_SKALA_WAKTU di wa.ts tidak berlaku di sini. */
const jedaAcak = (): number => (process.env.ANTREAN_JEDA_MS ? Number(process.env.ANTREAN_JEDA_MS) : 1000 + Math.floor(Math.random() * 2000));

function bolehKirim(numberId: number, maksMenit: number, kiniMs: number): boolean {
  if ((st.berikut.get(numberId) ?? 0) > kiniMs) return false;
  const j = (st.jejak.get(numberId) ?? []).filter((t: number) => kiniMs - t < 60_000);
  st.jejak.set(numberId, j);
  return j.length < maksMenit;
}

/**
 * Satu putaran: nomor yang punya antrean (indeks parsial status='antre'), satu pesan tertua per nomor yang boleh
 * mengirim sekarang. Nomor berbeda berjalan bersamaan; satu nomor selalu berurutan.
 */
export async function putaranAntrean(): Promise<number> {
  if (st.jalan || !modeMesin()) return 0;
  st.jalan = true;
  let terkirim = 0;
  try {
    const sql = await db();
    const kini = sekarang();
    // Yang menunggu terlalu lama: gagal (beri tahu developer lewat webhook).
    const basi = await sql<{ id: number; number_id: number }[]>`
      UPDATE pesan_keluar SET status = 'gagal', alasan = 'tidak terkirim dalam 24 jam (nomor tidak terhubung / layanan nonaktif)', berubah = ${kini}
       WHERE status = 'antre' AND dibuat < ${kini - UMUR_ANTRE_MAKS} RETURNING id, number_id`;
    for (const b of basi) void antrekanEvent("pesan.status", b.number_id, { id_pesan: String(b.id), status: "gagal" });
    if (!layananBoleh() || !fiturBoleh("pesan.kirim")) return 0; // fitur dimatikan: pesan tertahan di antrean, tidak dibuang
    const maks = lisensiSekarang()?.batas.pesan_menit ?? 20;
    const nomor = await sql<{ number_id: number }[]>`SELECT DISTINCT number_id FROM pesan_keluar WHERE status = 'antre'`;
    const kiniMs = Date.now();
    const kerja = nomor.filter((n) => !st.sibuk.has(n.number_id) && bolehKirim(n.number_id, maks, kiniMs)).map((n) => kirimBerikut(n.number_id));
    terkirim = (await Promise.all(kerja)).filter(Boolean).length;
  } finally {
    st.jalan = false;
  }
  return terkirim;
}

async function kirimBerikut(numberId: number): Promise<boolean> {
  st.sibuk.add(numberId);
  try {
    const nomor = await nomorById(numberId);
    if (!nomor || infoSesi(nomor.sesi).status !== "WORKING") return false; // tunggu sampai terhubung
    const sql = await db();
    const [p] = await sql<{ id: number; ke: string; isi: { teks: string; gambar: { data: string; mime: string; caption: string } | null } }[]>`
      SELECT id, ke, isi FROM pesan_keluar WHERE number_id = ${numberId} AND status = 'antre' ORDER BY id LIMIT 1`;
    if (!p) return false;
    const alamat = `${p.ke}@s.whatsapp.net`;
    const mulai = Date.now();
    st.jejak.set(numberId, [...(st.jejak.get(numberId) ?? []), mulai]);
    st.berikut.set(numberId, mulai + jedaAcak());
    try {
      let waId: string;
      if (p.isi.gambar) {
        waId = await kirimGambar(nomor.sesi, alamat, Buffer.from(p.isi.gambar.data, "base64"), p.isi.gambar.mime, p.isi.gambar.caption || p.isi.teks, tandaiKirimanSistem);
        // Data gambar tidak perlu disimpan lagi setelah terkirim.
        await sql`UPDATE pesan_keluar SET status = 'terkirim', wa_id = ${waId}, berubah = ${sekarang()}, isi = isi - 'gambar' WHERE id = ${p.id}`;
      } else {
        // Gema kiriman API bukan balasan manusia: AI tidak dijeda di chat ini.
        waId = await kirimTeks(nomor.sesi, alamat, p.isi.teks, tandaiKirimanSistem);
        await sql`UPDATE pesan_keluar SET status = 'terkirim', wa_id = ${waId}, berubah = ${sekarang()} WHERE id = ${p.id}`;
      }
      void antrekanEvent("pesan.status", numberId, { id_pesan: String(p.id), status: "terkirim" });
      return true;
    } catch (e) {
      // Nomor terputus di tengah jalan: biarkan menunggu. Galat lain: gagal dengan alasannya.
      if (e instanceof WaError && /tidak terhubung/i.test(e.message)) return false;
      const alasan = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await sql`UPDATE pesan_keluar SET status = 'gagal', alasan = ${alasan}, berubah = ${sekarang()} WHERE id = ${p.id}`;
      void antrekanEvent("pesan.status", numberId, { id_pesan: String(p.id), status: "gagal" });
      return false;
    }
  } finally {
    st.sibuk.delete(numberId);
  }
}

/** Centang biru dari WhatsApp (ack >= 4) untuk pesan API: status 'dibaca' + event pesan.status. */
async function terimaAck(waId: string, status: number): Promise<void> {
  if (status < 4) return;
  const sql = await db();
  const r = await sql<{ id: number; number_id: number }[]>`
    UPDATE pesan_keluar SET status = 'dibaca', berubah = ${sekarang()} WHERE wa_id = ${waId} AND status = 'terkirim' RETURNING id, number_id`;
  for (const x of r) void antrekanEvent("pesan.status", x.number_id, { id_pesan: String(x.id), status: "dibaca" });
}

export function mulaiAntreanMesin(): void {
  if (!modeMesin() || st.timer) return;
  st.lepas = dengar((p) => (p.jenis === "pesan.status" ? terimaAck(p.waId, p.status) : undefined));
  st.timer = setInterval(() => void putaranAntrean().catch((e) => console.warn("[antrean] putaran gagal:", e instanceof Error ? e.message : e)), 1_000);
  st.timer.unref?.();
}

/** Hapus pesan_keluar > 30 hari, berkelompok. */
export async function bersihkanAntrean(kini = sekarang()): Promise<number> {
  const sql = await db();
  let total = 0;
  for (;;) {
    const r = await sql`
      DELETE FROM pesan_keluar WHERE id IN (SELECT id FROM pesan_keluar WHERE dibuat < ${kini - 30 * 86_400} AND status <> 'antre' LIMIT 5000) RETURNING id`;
    total += r.length;
    if (r.length < 5000) return total;
  }
}

/** Untuk uji. */
export function aturUlangAntreanUji(): void {
  st.jejak.clear();
  st.berikut.clear();
  st.sibuk.clear();
}

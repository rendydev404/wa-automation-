import "server-only";
import { db, sekarang } from "./db";
import { kirimPush } from "./push";

/**
 * Notifikasi in-app (lonceng di dashboard). Dibuat oleh aktivitas di server: pembayaran, paket, kuota AI, bonus dari
 * admin, afiliasi, nomor WhatsApp terputus, dan peristiwa yang perlu diketahui admin. Teks disimpan dalam dua bahasa
 * (judul/isi + *_en) karena penerimanya bisa membuka versi Indonesia atau Inggris.
 *
 * - kirimNotif() tidak pernah melempar galat: dipanggil dari jalur latar (jembatan WhatsApp, webhook) yang tidak boleh
 *   gagal hanya karena notifikasi tidak tersimpan.
 * - `kunci` = anti-dobel (unik per pengguna): peristiwa yang bisa terpicu berulang (kuota 80%, paket akan berakhir)
 *   hanya tersimpan sekali.
 * - Jumlah "belum dibaca" dipegang di memori per pengguna (dihitung lewat indeks parsial), diperbarui saat notifikasi
 *   dibuat/dibaca, dan dihitung ulang paling lama tiap UMUR_HITUNGAN_MS supaya notifikasi yang masuk di luar proses ini
 *   (mis. langsung lewat database) tetap muncul: polling status di browser hampir tidak menambah query.
 */

export type JenisNotif =
  | "pembayaran"
  | "paket"
  | "paket_berakhir"
  | "kuota"
  | "bonus"
  | "afiliasi"
  | "nomor"
  | "admin_daftar"
  | "admin_bayar"
  | "admin_afiliasi"
  | "admin_followup";

export interface IsiNotif {
  jenis: JenisNotif;
  judul: { id: string; en: string };
  isi?: { id: string; en: string };
  /** Jalur internal tanpa awalan bahasa, mis. "/langganan". */
  tautan?: string | null;
  kunci?: string | null;
}

export interface Notif {
  id: number;
  jenis: JenisNotif;
  judul: string;
  judul_en: string | null;
  isi: string;
  isi_en: string | null;
  tautan: string | null;
  dibaca: number | null;
  dibuat: number;
}

const g = globalThis as unknown as { __waNotifBelum?: Map<number, { n: number; at: number }> };
const belum = (g.__waNotifBelum ??= new Map());
const UMUR_HITUNGAN_MS = 30_000;
const ubahBelum = (userId: number, fn: (n: number) => number) => {
  const c = belum.get(userId);
  if (c) c.n = Math.max(0, fn(c.n));
};

/** UMUR maksimal notifikasi; yang lebih tua dibersihkan berkala (mulaiPengingat). */
const UMUR_DTK = 90 * 86400;

export async function kirimNotif(userIds: number | number[], n: IsiNotif): Promise<void> {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter((x) => Number.isInteger(x) && x > 0);
  if (!ids.length) return;
  try {
    const sql = await db();
    const kini = sekarang();
    const baris = ids.map((user_id) => ({
      user_id,
      jenis: n.jenis,
      judul: n.judul.id.slice(0, 200),
      judul_en: n.judul.en.slice(0, 200),
      isi: (n.isi?.id ?? "").slice(0, 600),
      isi_en: n.isi ? n.isi.en.slice(0, 600) : null,
      tautan: n.tautan ?? null,
      kunci: n.kunci ?? null,
      dibuat: kini,
    }));
    const masuk = await sql<{ id: number; user_id: number }[]>`
      INSERT INTO notifikasi ${sql(baris)}
      ON CONFLICT (user_id, kunci) WHERE kunci IS NOT NULL DO NOTHING
      RETURNING id::int AS id, user_id`;
    for (const r of masuk) ubahBelum(r.user_id, (n) => n + 1);
    // Push ke perangkat admin yang mendaftar (push.ts); tanpa perangkat terdaftar = tanpa query tambahan. Tidak ditunggu.
    if (masuk.length) {
      const idNotif = new Map(masuk.map((r) => [r.user_id, r.id]));
      void kirimPush([...idNotif.keys()], (uid) => ({ id: idNotif.get(uid), judul: n.judul.id, isi: n.isi?.id, tautan: n.tautan ?? null }));
    }
  } catch (e) {
    console.warn("[notifikasi] gagal disimpan:", e instanceof Error ? e.message : e);
  }
}

/** Ke semua admin aktif (peristiwa jarang: pendaftaran, pembayaran, penarikan), jadi daftar admin dibaca langsung. */
export async function kirimNotifAdmin(n: IsiNotif): Promise<void> {
  try {
    const sql = await db();
    const admin = await sql<{ id: number }[]>`SELECT id FROM users WHERE peran = 'admin' AND status = 'aktif'`;
    await kirimNotif(admin.map((a) => a.id), n);
  } catch (e) {
    console.warn("[notifikasi] admin gagal dicari:", e instanceof Error ? e.message : e);
  }
}

/** Jumlah belum dibaca: dari memori; dihitung (ulang) lewat notifikasi_belum_idx paling sering tiap 30 dtk per pengguna. */
export async function jumlahBelum(userId: number): Promise<number> {
  const c = belum.get(userId);
  if (c && Date.now() - c.at < UMUR_HITUNGAN_MS) return c.n;
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM notifikasi WHERE user_id = ${userId} AND dibaca IS NULL`;
  belum.set(userId, { n: r.n, at: Date.now() });
  return r.n;
}

/** Terbaru dulu, paginasi keyset lewat notifikasi_user_idx (user_id, id DESC). */
export async function daftarNotif(userId: number, opsi: { sebelum?: number; batas?: number } = {}): Promise<{ daftar: Notif[]; adaLagi: boolean }> {
  const sql = await db();
  const batas = Math.min(Math.max(opsi.batas ?? 20, 1), 100);
  const baris = await sql<Notif[]>`
    SELECT id::int AS id, jenis, judul, judul_en, isi, isi_en, tautan, dibaca, dibuat
      FROM notifikasi
     WHERE user_id = ${userId} AND (${opsi.sebelum ?? null}::bigint IS NULL OR id < ${opsi.sebelum ?? null}::bigint)
     ORDER BY id DESC
     LIMIT ${batas + 1}`;
  return { daftar: baris.slice(0, batas), adaLagi: baris.length > batas };
}

/** Tandai dibaca: satu notifikasi (`id`) atau semuanya. Mengembalikan jumlah belum dibaca yang tersisa. */
export async function tandaiNotifDibaca(userId: number, id?: number): Promise<number> {
  const sql = await db();
  const kini = sekarang();
  if (id === undefined) {
    await sql`UPDATE notifikasi SET dibaca = ${kini} WHERE user_id = ${userId} AND dibaca IS NULL`;
    belum.set(userId, { n: 0, at: Date.now() });
    return 0;
  }
  const r = await sql`UPDATE notifikasi SET dibaca = ${kini} WHERE id = ${id} AND user_id = ${userId} AND dibaca IS NULL`;
  if (r.count > 0) ubahBelum(userId, (n) => n - r.count);
  return jumlahBelum(userId);
}

/** Peristiwa baru: akun baru mendaftar sendiri (form daftar / Google) -> admin. */
export function notifPendaftarBaru(id: number, email: string, lewat: "email" | "google"): void {
  void kirimNotifAdmin({
    jenis: "admin_daftar",
    judul: { id: `Pendaftar baru: ${email}`, en: `New sign-up: ${email}` },
    isi: { id: lewat === "google" ? "Mendaftar dengan Google." : "Mendaftar dengan email.", en: lewat === "google" ? "Signed up with Google." : "Signed up with email." },
    tautan: `/admin/pengguna/${id}`,
  });
}

/** Perangkat dikeluarkan dari WhatsApp di HP (401): pemilik nomor perlu menautkan ulang. Dipanggil dari wa.ts. */
export async function notifNomorTerputus(sesi: string): Promise<void> {
  try {
    const { nomorBySesi } = await import("./numbers");
    const n = await nomorBySesi(sesi);
    if (!n?.user_id) return;
    await kirimNotif(n.user_id, {
      jenis: "nomor",
      judul: { id: `Nomor ${n.label} terputus dari WhatsApp`, en: `Number ${n.label} was disconnected from WhatsApp` },
      isi: {
        id: "Perangkat ini dikeluarkan dari WhatsApp di HP, jadi AI berhenti membalas. Pindai QR lagi untuk menyambungkan.",
        en: "This device was logged out from WhatsApp on the phone, so the AI stopped replying. Scan the QR code again to reconnect.",
      },
      tautan: `/nomor/${n.id}`,
    });
  } catch (e) {
    console.warn("[notifikasi] nomor terputus:", e instanceof Error ? e.message : e);
  }
}

/**
 * Soket tersambung tetapi pesan tidak datang dari WhatsApp (lihat catatDiag di wa.ts). Sekali per nomor per hari,
 * supaya restart/deploy tidak mengulang notifikasi.
 */
export async function notifNomorDiam(sesi: string): Promise<void> {
  try {
    const { nomorBySesi } = await import("./numbers");
    const n = await nomorBySesi(sesi);
    if (!n?.user_id) return;
    const hari = new Date((sekarang() + 7 * 3600) * 1000).toISOString().slice(0, 10);
    await kirimNotif(n.user_id, {
      jenis: "nomor",
      judul: { id: `Nomor ${n.label} tersambung, tapi pesan tidak masuk`, en: `Number ${n.label} is connected, but messages are not arriving` },
      isi: {
        id: "Pesan dari WhatsApp tertahan di perangkat ini, jadi AI tidak membalas dan chat tidak masuk ke dashboard. Bila belum pulih dalam beberapa menit, putuskan nomor ini lalu pindai QR lagi.",
        en: "Messages from WhatsApp are being held back on this device, so the AI is not replying and chats are not reaching the dashboard. If this does not clear within a few minutes, disconnect this number and scan the QR code again.",
      },
      tautan: `/nomor/${n.id}`,
      kunci: `nomor_diam:${n.id}:${hari}`,
    });
  } catch (e) {
    console.warn("[notifikasi] nomor diam:", e instanceof Error ? e.message : e);
  }
}

// ---------- Pengingat berkala: paket akan berakhir / sudah berakhir, dan pembersihan ----------

const gp = globalThis as unknown as { __waPengingat?: ReturnType<typeof setInterval> };

/** Satu putaran: H-3 sebelum paket berakhir, paket yang baru berakhir (tanpa perpanjangan), lalu buang yang > 90 hari. */
export async function jalankanPengingat(): Promise<void> {
  const sql = await db();
  const kini = sekarang();
  // Hanya langganan terakhir tiap akun: yang sudah diperpanjang (ada langganan lebih lama berakhirnya) dilewati.
  const segera = await sql<{ id: number; user_id: number; nama_paket: string; sampai: number }[]>`
    SELECT l.id, l.user_id, l.nama_paket, l.sampai FROM langganan l
     WHERE l.sampai > ${kini} AND l.sampai <= ${kini + 3 * 86400}
       AND NOT EXISTS (SELECT 1 FROM langganan l2 WHERE l2.user_id = l.user_id AND l2.sampai > l.sampai)`;
  for (const l of segera) {
    const hari = Math.max(1, Math.ceil((l.sampai - kini) / 86400));
    await kirimNotif(l.user_id, {
      jenis: "paket_berakhir",
      judul: { id: `Paket ${l.nama_paket} berakhir ${hari} hari lagi`, en: `Your ${l.nama_paket} plan ends in ${hari} day${hari === 1 ? "" : "s"}` },
      isi: { id: "Perpanjang sekarang supaya balasan AI tidak berhenti.", en: "Renew now so AI replies don't stop." },
      tautan: "/langganan",
      kunci: `berakhir3:${l.id}`,
    });
  }
  const lewat = await sql<{ id: number; user_id: number; nama_paket: string }[]>`
    SELECT l.id, l.user_id, l.nama_paket FROM langganan l
     WHERE l.sampai <= ${kini} AND l.sampai > ${kini - 2 * 86400}
       AND NOT EXISTS (SELECT 1 FROM langganan l2 WHERE l2.user_id = l.user_id AND l2.sampai > l.sampai)`;
  for (const l of lewat) {
    await kirimNotif(l.user_id, {
      jenis: "paket_berakhir",
      judul: { id: `Paket ${l.nama_paket} telah berakhir`, en: `Your ${l.nama_paket} plan has ended` },
      isi: { id: "Akun kembali ke kuota gratis. Pilih paket untuk melanjutkan balasan AI.", en: "Your account is back on the free quota. Choose a plan to keep AI replies going." },
      tautan: "/langganan",
      kunci: `berakhir:${l.id}`,
    });
  }
  await sql`DELETE FROM notifikasi WHERE dibuat < ${kini - UMUR_DTK}`;
}

/** Dipanggil sekali saat server mulai (instrumentation.ts): satu putaran tiap jam, yang pertama 2 menit setelah mulai. */
export function mulaiPengingat(): void {
  if (gp.__waPengingat) return;
  const jalan = () => void jalankanPengingat().catch((e) => console.warn("[notifikasi] pengingat gagal:", e instanceof Error ? e.message : e));
  setTimeout(jalan, 120_000).unref?.();
  gp.__waPengingat = setInterval(jalan, 3600_000);
  gp.__waPengingat.unref?.();
}

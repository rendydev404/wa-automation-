import { NextResponse } from "next/server";
import { getSetting, sekarang } from "@/lib/db";
import { aiSehat } from "@/lib/ai";
import { catatTerhubung, nomorMilik, semuaNomor } from "@/lib/numbers";
import { getUser } from "@/lib/session";
import type { StatusWa } from "@/lib/types";
import { infoSesi } from "@/lib/wa";

const g = globalThis as unknown as { __waHermes?: { at: number; ok: boolean; janji: Promise<boolean> | null } };

/**
 * Kesehatan Hermes, diperiksa paling sering 30 detik sekali. Polling tidak ikut menunggu
 * pemeriksaan itu: nilai terakhir langsung dipakai dan penyegarannya berjalan di latar.
 */
async function hermesCache(): Promise<boolean> {
  const c = (g.__waHermes ??= { at: 0, ok: false, janji: null });
  if (Date.now() - c.at >= 30_000 && !c.janji) {
    c.janji = aiSehat()
      .then((ok) => (c.ok = ok))
      .finally(() => {
        c.at = Date.now();
        c.janji = null;
      });
  }
  return c.at === 0 && c.janji ? c.janji : c.ok;
}

/**
 * Status nomor milik pengguna ini. Dalam keadaan biasa hanya satu query (pemeriksaan sesi login pengguna):
 * daftar nomor, status koneksi, dan galat terakhir semuanya dibaca dari memori.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

  const hermes = await hermesCache();
  // Galat AI berisi detail teknis server: hanya untuk admin.
  const galatMentah = user.peran === "admin" ? await getSetting("galat_terakhir") : null;
  const galatAi = galatMentah ? (JSON.parse(galatMentah) as { at: number; pesan: string }) : null;
  const hasil: StatusWa = { hermes, galatAi: galatAi && sekarang() - galatAi.at < 86400 ? galatAi : null, nomor: {} };

  // Admin memantau semua nomor (juga saat membuka nomor milik pengguna lain); pengguna biasa hanya miliknya.
  for (const n of user.peran === "admin" ? await semuaNomor() : await nomorMilik(user.id)) {
    const s = infoSesi(n.sesi);
    hasil.nomor[n.id] = s;
    // Biasanya sudah dicatat saat sesi terhubung; ini hanya menulis bila ternyata masih berbeda.
    if (s.status === "WORKING" && s.waId && s.waId !== n.wa_id) await catatTerhubung(n.id, s.waId, s.nama);
  }
  return NextResponse.json(hasil, { headers: { "Cache-Control": "no-store" } });
}

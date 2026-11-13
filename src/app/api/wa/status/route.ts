import { fiturBoleh } from "@/lib/mesin/lisensi";
import { NextResponse } from "next/server";
import { ringkasAktivitas } from "@/lib/aktivitas";
import { getSetting, sekarang } from "@/lib/db";
import { aiSehat } from "@/lib/ai";
import { catatTerhubung, nomorMilik, semuaNomor } from "@/lib/numbers";
import { getUser } from "@/lib/session";
import type { StatusWa } from "@/lib/types";
import { infoSesi } from "@/lib/wa";
import { teksPermintaan } from "@/lib/bahasa-server";
import { jumlahBelum } from "@/lib/notifikasi";
import { staf } from "@/lib/peran";

const g = globalThis as unknown as { __waAiStatus?: { at: number; ok: boolean; janji: Promise<boolean> | null } };

/**
 * Kesehatan mesin AI aktif (aiSehat), diperiksa paling sering 30 detik sekali. Polling tidak ikut menunggu
 * pemeriksaan itu: nilai terakhir langsung dipakai dan penyegarannya berjalan di latar.
 */
async function aiCache(): Promise<boolean> {
  const c = (g.__waAiStatus ??= { at: 0, ok: false, janji: null });
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
  if (!fiturBoleh("nomor")) return Response.json({ error: "Fitur ini dinonaktifkan oleh ChatGerCep." }, { status: 403 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: (await teksPermintaan()).t("Sesi berakhir.", "Your session has ended.") }, { status: 401 });

  // Jumlah notifikasi belum dibaca ikut di polling ini (dari memori): lonceng tidak butuh permintaan sendiri.
  const [ai, notif] = await Promise.all([aiCache(), jumlahBelum(user.id).catch(() => 0)]);
  // Galat AI berisi detail teknis server (termasuk nama mesin/model): hanya untuk admin.
  const galatMentah = staf(user.peran) ? await getSetting("galat_terakhir") : null;
  const galatAi = galatMentah ? (JSON.parse(galatMentah) as { at: number; pesan: string }) : null;
  const daftar = staf(user.peran) ? await semuaNomor() : await nomorMilik(user.id);
  const hasil: StatusWa = {
    ai,
    galatAi: galatAi && sekarang() - galatAi.at < 86400 ? galatAi : null,
    nomor: {},
    notif,
    aktivitas: ringkasAktivitas(daftar),
  };

  // Admin memantau semua nomor (juga saat membuka nomor milik pengguna lain); pengguna biasa hanya miliknya.
  for (const n of daftar) {
    const s = infoSesi(n.sesi);
    hasil.nomor[n.id] = s;
    // Biasanya sudah dicatat saat sesi terhubung; ini hanya menulis bila ternyata masih berbeda.
    if (s.status === "WORKING" && s.waId && s.waId !== n.wa_id) await catatTerhubung(n.id, s.waId, s.nama);
  }
  return NextResponse.json(hasil, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { sesiDanNomor } from "@/lib/akses";
import { teksPermintaan } from "@/lib/bahasa-server";
import { type FilterPercakapan, ambilPesanPercakapan, daftarPercakapan, ringkasanPercakapan } from "@/lib/percakapan";

const FILTER_SAH = new Set<FilterPercakapan>(["semua", "bot", "manusia"]);

/**
 * Endpoint ringan untuk membaca daftar percakapan atau isi pesan sebuah percakapan per nomor bot.
 * Mendukung paginasi berbasis kursor (`sebelum_waktu` + `sebelum_id` atau `sebelum_id` / `setelah_id`).
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const { user, nomor } = await sesiDanNomor(u.searchParams.get("number_id"));
  // Bahasa hanya dibaca di jalur galat.
  if (!user) return NextResponse.json({ error: (await teksPermintaan()).t("Sesi berakhir. Silakan login kembali.", "Your session has ended. Please sign in again.") }, { status: 401 });
  if (!nomor) return NextResponse.json({ error: (await teksPermintaan()).t("Nomor tidak ditemukan.", "Number not found.") }, { status: 404 });
  const numberId = nomor.id;
  const tidakAda = async () => NextResponse.json({ error: (await teksPermintaan()).t("Percakapan tidak ditemukan.", "Conversation not found.") }, { status: 404 });

  const percakapanIdParam = u.searchParams.get("percakapan_id");
  if (percakapanIdParam !== null) {
    const percakapanId = Number(percakapanIdParam);
    if (!Number.isInteger(percakapanId) || percakapanId <= 0) return tidakAda();
    const sebelumId = Number(u.searchParams.get("sebelum_id")) || undefined;
    const setelahId = Number(u.searchParams.get("setelah_id")) || undefined;
    const batas = Number(u.searchParams.get("batas")) || undefined;
    const hasil = await ambilPesanPercakapan(numberId, percakapanId, { sebelumId, setelahId, batas });
    if (!hasil) return tidakAda();
    return NextResponse.json(hasil, { headers: { "Cache-Control": "no-store" } });
  }

  const filterRaw = (u.searchParams.get("filter") ?? "semua") as FilterPercakapan;
  const filter: FilterPercakapan = FILTER_SAH.has(filterRaw) ? filterRaw : "semua";
  const cari = u.searchParams.get("cari") ?? "";
  const sWaktuRaw = u.searchParams.get("sebelum_waktu");
  const sIdRaw = u.searchParams.get("sebelum_id");
  const sebelumWaktu = sWaktuRaw !== null && Number.isInteger(Number(sWaktuRaw)) ? Number(sWaktuRaw) : undefined;
  const sebelumId = sIdRaw !== null && Number.isInteger(Number(sIdRaw)) ? Number(sIdRaw) : undefined;
  const batas = Number(u.searchParams.get("batas")) || undefined;
  const sertakanRingkasan = u.searchParams.get("ringkasan") === "1";

  const [daftarHasil, ringkasan] = await Promise.all([
    daftarPercakapan(numberId, { filter, cari, sebelumWaktu, sebelumId, batas }),
    sertakanRingkasan ? ringkasanPercakapan(numberId) : Promise.resolve(undefined),
  ]);

  return NextResponse.json({ ...daftarHasil, ...(ringkasan ? { ringkasan } : {}) }, { headers: { "Cache-Control": "no-store" } });
}

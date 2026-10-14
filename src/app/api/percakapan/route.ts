import { NextResponse } from "next/server";
import { nomorById } from "@/lib/numbers";
import { type FilterPercakapan, ambilPesanPercakapan, daftarPercakapan, ringkasanPercakapan } from "@/lib/percakapan";
import { getUser } from "@/lib/session";

const FILTER_SAH = new Set<FilterPercakapan>(["semua", "bot", "manusia"]);

/**
 * Endpoint ringan untuk membaca daftar percakapan atau isi pesan sebuah percakapan per nomor bot.
 * Mendukung paginasi berbasis kursor (`sebelum_waktu` + `sebelum_id` atau `sebelum_id` / `setelah_id`).
 */
export async function GET(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Sesi berakhir. Silakan login kembali." }, { status: 401 });

  const u = new URL(req.url);
  const numberId = Number(u.searchParams.get("number_id"));
  if (!Number.isInteger(numberId) || !(await nomorById(numberId))) {
    return NextResponse.json({ error: "Nomor tidak ditemukan." }, { status: 404 });
  }

  const percakapanIdParam = u.searchParams.get("percakapan_id");
  if (percakapanIdParam !== null) {
    const percakapanId = Number(percakapanIdParam);
    if (!Number.isInteger(percakapanId) || percakapanId <= 0) {
      return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    }
    const sebelumId = Number(u.searchParams.get("sebelum_id")) || undefined;
    const setelahId = Number(u.searchParams.get("setelah_id")) || undefined;
    const batas = Number(u.searchParams.get("batas")) || undefined;
    const hasil = await ambilPesanPercakapan(numberId, percakapanId, { sebelumId, setelahId, batas });
    if (!hasil) return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
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

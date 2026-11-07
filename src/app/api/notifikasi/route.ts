import { NextResponse } from "next/server";
import { catatFitur } from "@/lib/analitik";
import { teksPermintaan } from "@/lib/bahasa-server";
import { daftarNotif, jumlahBelum, tandaiNotifDibaca } from "@/lib/notifikasi";
import { getUser } from "@/lib/session";

const tanpaCache = { "Cache-Control": "no-store" };

/**
 * GET: notifikasi terbaru milik pengguna (?sebelum=<id> untuk halaman berikutnya), dimuat hanya saat panel lonceng
 * dibuka. ?hanya=jumlah: jumlah belum dibaca saja (dari memori, tanpa query) untuk halaman tanpa polling status.
 * POST {id?}: tandai satu notifikasi (atau semua bila tanpa id) sudah dibaca.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: (await teksPermintaan()).t("Sesi berakhir.", "Your session has ended.") }, { status: 401, headers: tanpaCache });
  const sp = new URL(req.url).searchParams;
  if (sp.get("hanya") === "jumlah") return NextResponse.json({ belum: await jumlahBelum(user.id) }, { headers: tanpaCache });
  const sebelum = Number(sp.get("sebelum"));
  const [hasil, belum] = await Promise.all([daftarNotif(user.id, { sebelum: Number.isInteger(sebelum) && sebelum > 0 ? sebelum : undefined, batas: 20 }), jumlahBelum(user.id)]);
  return NextResponse.json({ ...hasil, belum }, { headers: tanpaCache });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: (await teksPermintaan()).t("Sesi berakhir.", "Your session has ended.") }, { status: 401, headers: tanpaCache });
  const badan = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof badan.id === "number" && Number.isInteger(badan.id) && badan.id > 0 ? badan.id : undefined;
  const belum = await tandaiNotifDibaca(user.id, id);
  catatFitur(user.id, id ? "notifikasi.baca" : "notifikasi.baca_semua");
  return NextResponse.json({ belum }, { headers: tanpaCache });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { catatFitur } from "@/lib/analitik";
import { lewatHttps, terlaluSering } from "@/lib/batas";
import { COOKIE_PUSH, catatTerima, hapusLangganan, kirimPush, kunciPublikPush, simpanLangganan, statusPerangkat, uraiLangganan } from "@/lib/push";
import { getUser } from "@/lib/session";
import { staf } from "@/lib/peran";

const tanpaCache = { "Cache-Control": "no-store" };

async function admin() {
  const user = await getUser();
  return user && staf(user.peran) ? user : null;
}

const tolak = () => NextResponse.json({ error: "Hanya admin yang bisa memakai notifikasi push." }, { status: 403, headers: tanpaCache });

/**
 * GET: kunci publik VAPID untuk browser. Khusus admin.
 * GET ?status=1: perangkat akun ini + laporan terima terakhir dari service worker-nya (diagnosis tombol Uji).
 */
export async function GET(req: Request) {
  const user = await admin();
  if (!user) return tolak();
  if (new URL(req.url).searchParams.get("status")) {
    const daftar = await statusPerangkat(user.id);
    const perangkat = daftar.map((p) => ({ id: p.id, nama: p.nama, terima: p.terima }));
    return NextResponse.json({ perangkat, kini: Date.now() }, { headers: tanpaCache });
  }
  return NextResponse.json({ kunci: await kunciPublikPush() }, { headers: tanpaCache });
}

/** PUT {endpoint, tampil, izin, galat}: laporan dari service worker bahwa push sampai di perangkat (dan tampil atau tidak). */
export async function PUT(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: tanpaCache });
  const b = (await req.json().catch(() => ({}))) as { endpoint?: unknown; tampil?: unknown; izin?: unknown; galat?: unknown };
  if (typeof b.endpoint !== "string" || b.endpoint.length > 1000) return NextResponse.json({ ok: false }, { status: 400, headers: tanpaCache });
  const ok = await catatTerima(user.id, b.endpoint, {
    tampil: b.tampil === true,
    izin: typeof b.izin === "string" ? b.izin.slice(0, 20) : null,
    galat: typeof b.galat === "string" ? b.galat.slice(0, 200) : null,
  });
  return NextResponse.json({ ok }, { headers: tanpaCache });
}

/**
 * POST {langganan}: daftarkan perangkat ini (PushSubscription dari browser). Id barisnya disimpan di cookie supaya
 * keluar dari akun ikut mematikan push di perangkat ini.
 * POST {uji: true}: kirim notifikasi uji ke semua perangkat admin ini.
 */
export async function POST(req: Request) {
  const user = await admin();
  if (!user) return tolak();
  const badan = (await req.json().catch(() => ({}))) as { langganan?: unknown; uji?: unknown };
  if (badan.uji === true) {
    if (terlaluSering(`push-uji:${user.id}`, 5, 60_000)) return NextResponse.json({ error: "Terlalu sering. Coba lagi sebentar." }, { status: 429, headers: tanpaCache });
    const hasil = await kirimPush([user.id], { judul: "Notifikasi uji", isi: "Push notification di perangkat ini sudah aktif.", tautan: "/admin" });
    catatFitur(user.id, "push.uji");
    return NextResponse.json(hasil, { headers: tanpaCache });
  }
  const s = uraiLangganan(badan.langganan);
  if (!s) return NextResponse.json({ error: "Data perangkat tidak valid." }, { status: 400, headers: tanpaCache });
  const id = await simpanLangganan(user.id, s, req.headers.get("user-agent"));
  (await cookies()).set(COOKIE_PUSH, String(id), { httpOnly: true, secure: await lewatHttps(), sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  catatFitur(user.id, "push.daftarkan_perangkat");
  return NextResponse.json({ ok: true }, { headers: tanpaCache });
}

/** DELETE {endpoint}: matikan push di perangkat ini. */
export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401, headers: tanpaCache });
  const badan = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof badan.endpoint === "string" && badan.endpoint.length <= 1000) await hapusLangganan(user.id, { endpoint: badan.endpoint });
  (await cookies()).delete(COOKIE_PUSH);
  catatFitur(user.id, "push.matikan");
  return NextResponse.json({ ok: true }, { headers: tanpaCache });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { lewatHttps, terlaluSering } from "@/lib/batas";
import { COOKIE_PUSH, hapusLangganan, kirimPush, kunciPublikPush, simpanLangganan, uraiLangganan } from "@/lib/push";
import { getUser } from "@/lib/session";

const tanpaCache = { "Cache-Control": "no-store" };

async function admin() {
  const user = await getUser();
  return user?.peran === "admin" ? user : null;
}

const tolak = () => NextResponse.json({ error: "Hanya admin yang bisa memakai notifikasi push." }, { status: 403, headers: tanpaCache });

/** GET: kunci publik VAPID untuk browser. Khusus admin. */
export async function GET() {
  if (!(await admin())) return tolak();
  return NextResponse.json({ kunci: await kunciPublikPush() }, { headers: tanpaCache });
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
    return NextResponse.json(hasil, { headers: tanpaCache });
  }
  const s = uraiLangganan(badan.langganan);
  if (!s) return NextResponse.json({ error: "Data perangkat tidak valid." }, { status: 400, headers: tanpaCache });
  const id = await simpanLangganan(user.id, s, req.headers.get("user-agent"));
  (await cookies()).set(COOKIE_PUSH, String(id), { httpOnly: true, secure: await lewatHttps(), sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  return NextResponse.json({ ok: true }, { headers: tanpaCache });
}

/** DELETE {endpoint}: matikan push di perangkat ini. */
export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401, headers: tanpaCache });
  const badan = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof badan.endpoint === "string" && badan.endpoint.length <= 1000) await hapusLangganan(user.id, { endpoint: badan.endpoint });
  (await cookies()).delete(COOKIE_PUSH);
  return NextResponse.json({ ok: true }, { headers: tanpaCache });
}

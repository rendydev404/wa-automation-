import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_GOOGLE, GoogleError, asal, googleSiap, selesaikanGoogle } from "@/lib/google";
import { akunGoogle } from "@/lib/pengguna";
import { catatLoginBerhasil, halamanAwal, mulaiSesi, pastikanAdminAwal, pendaftaranDibuka } from "@/lib/session";

/** Kembali dari Google: verifikasi, cari/tautkan/buat akun, lalu mulai sesi login biasa. */
export async function GET(req: Request) {
  const app = asal(req);
  const ke = (jalur: string) => {
    const res = NextResponse.redirect(`${app}${jalur}`);
    res.cookies.delete({ name: COOKIE_GOOGLE, path: "/api/auth/google" }); // sekali pakai
    return res;
  };
  if (!googleSiap()) return ke("/login?galat=belum");

  const toples = await cookies();
  let identitas;
  try {
    identitas = await selesaikanGoogle(app, new URL(req.url).searchParams, toples.get(COOKIE_GOOGLE)?.value);
  } catch (e) {
    return ke(`/login?galat=${e instanceof GoogleError ? e.message : "google"}`);
  }

  const bolehDaftar = await pendaftaranDibuka();
  await pastikanAdminAwal();
  const akun = await akunGoogle(identitas, bolehDaftar);
  if (!akun) return ke(`/login?galat=${bolehDaftar ? "gagal" : "tutup"}`);
  if (akun.status === "diblokir") return ke("/login?galat=blokir");

  await catatLoginBerhasil(akun.id);
  await mulaiSesi(akun, app.startsWith("https://"));
  return ke(halamanAwal(akun.peran));
}

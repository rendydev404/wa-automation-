import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_GOOGLE, COOKIE_GOOGLE_BAHASA, GoogleError, asal, googleSiap, selesaikanGoogle } from "@/lib/google";
import { bahasaSah, tautan } from "@/lib/bahasa";
import { catatFitur } from "@/lib/analitik";
import { akunGoogle } from "@/lib/pengguna";
import { catatLoginBerhasil, halamanAwal, mulaiSesi, pastikanAdminAwal, pendaftaranDibuka } from "@/lib/session";
import { COOKIE_REF, terapkanReferral } from "@/lib/afiliasi";
import { COOKIE_PIXEL_REG, kirimCapiEvent } from "@/lib/meta-pixel";
import { konteksMetaPermintaan } from "@/lib/meta-pixel-konteks";
import { notifPendaftarBaru } from "@/lib/notifikasi";
import { COOKIE_ASAL, bacaAsal } from "@/lib/asal-def";
import { simpanAsal } from "@/lib/asal";

/** Kembali dari Google: verifikasi, cari/tautkan/buat akun, lalu mulai sesi login biasa. */
export async function GET(req: Request) {
  const app = asal(req);
  const toples = await cookies();
  const bahasaAsal = toples.get(COOKIE_GOOGLE_BAHASA)?.value;
  const b = bahasaSah(bahasaAsal) ? bahasaAsal : "id";
  const ke = (jalur: string) => {
    const res = NextResponse.redirect(`${app}${tautan(b, jalur)}`);
    res.cookies.delete({ name: COOKIE_GOOGLE, path: "/api/auth/google" }); // sekali pakai
    res.cookies.delete({ name: COOKIE_GOOGLE_BAHASA, path: "/api/auth/google" });
    return res;
  };
  if (!googleSiap()) return ke("/login?galat=belum");

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

  if (akun.baru) {
    const refKode = toples.get(COOKIE_REF)?.value;
    if (refKode) await terapkanReferral(akun.id, refKode).catch(() => {});
    // Asal dari LP industri / iklan: cookie dipasang proxy.ts saat /daftar atau /login dibuka dengan parameternya.
    const asal = bacaAsal(toples.get(COOKIE_ASAL)?.value);
    await simpanAsal(akun.id, asal);
    void kirimCapiEvent({
      ...(await konteksMetaPermintaan()),
      kunci: "complete_registration",
      eventId: `reg_${akun.id}`,
      email: identitas.email,
      externalId: akun.id,
      ...(asal?.industri ? { customData: { content_category: asal.industri } } : {}),
    });
    notifPendaftarBaru(akun.id, identitas.email, "google");
  }

  await catatLoginBerhasil(akun.id);
  await mulaiSesi(akun, app.startsWith("https://"));
  catatFitur(akun.id, akun.baru ? "akun.daftar_google" : "akun.masuk_google");
  const res = ke(halamanAwal(akun.peran));
  res.cookies.delete({ name: COOKIE_REF, path: "/" });
  if (akun.baru) res.cookies.delete({ name: COOKIE_ASAL, path: "/" });
  if (akun.baru) {
    res.cookies.set(COOKIE_PIXEL_REG, String(akun.id), { maxAge: 120, path: "/", httpOnly: false, sameSite: "lax" });
  }
  return res;
}

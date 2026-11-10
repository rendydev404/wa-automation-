import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { nomorUntuk } from "@/lib/akses";
import { catatFitur } from "@/lib/analitik";
import { BATAS_KATALOG, KatalogError, katalogBoleh, simpanProduk } from "@/lib/katalog";
import { getUser } from "@/lib/session";
import { teksPermintaan } from "@/lib/bahasa-server";
import { staf } from "@/lib/peran";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/**
 * Tambah/ubah satu produk katalog (multipart, karena membawa foto). Fitur akun berbayar: pemilik nomor harus punya
 * langganan aktif (admin selalu boleh). Foto sudah diperkecil di browser; jenisnya dicek dari isi berkas di katalog.ts.
 */
export async function POST(req: Request) {
  const [user, { b, t }] = await Promise.all([getUser(), teksPermintaan()]);
  if (!user) return galat(t("Sesi berakhir. Silakan login kembali.", "Your session has ended. Please sign in again."), 401);
  if (Number(req.headers.get("content-length") ?? 0) > BATAS_KATALOG.fotoByte + 64 * 1024) return galat(t("Foto terlalu besar (maksimal 1,5 MB).", "Photo is too large (max 1.5 MB)."), 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return galat(t("Isian tidak terbaca.", "The form couldn't be read."));
  }
  const nomor = await nomorUntuk(user, form.get("number_id"));
  if (!nomor) return galat(t("Nomor tidak ditemukan.", "Number not found."), 404);
  if (!staf(user.peran) && !(await katalogBoleh(nomor.user_id))) return galat(t("Katalog produk tersedia untuk paket berbayar. Pilih paket di halaman Langganan.", "The product catalog is available on paid plans. Choose a plan on the Subscription page."), 403);

  const idMentah = Number(form.get("id"));
  const idLama = Number.isInteger(idMentah) && idMentah > 0 ? idMentah : undefined;
  const hargaMentah = String(form.get("harga") ?? "").replace(/\D/g, "");
  const berkas = form.get("foto");
  let foto: Uint8Array | null | undefined;
  if (berkas instanceof File && berkas.size > 0) foto = new Uint8Array(await berkas.arrayBuffer());
  else if (form.get("hapus_foto") === "1") foto = null;
  try {
    const id = await simpanProduk(nomor.id, {
      id: idLama,
      nama: String(form.get("nama") ?? "").slice(0, 200),
      harga: hargaMentah ? Number(hargaMentah) : null,
      deskripsi: String(form.get("deskripsi") ?? "").slice(0, 1000),
      tersedia: form.get("tersedia") !== "0",
      foto,
    });
    revalidatePath(`/nomor/${nomor.id}`);
    catatFitur(user.id, idLama ? "katalog.ubah" : "katalog.tambah");
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof KatalogError) return galat((b === "en" && e.en) || e.message);
    throw e;
  }
}

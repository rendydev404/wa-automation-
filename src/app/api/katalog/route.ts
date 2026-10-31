import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { nomorUntuk } from "@/lib/akses";
import { BATAS_KATALOG, KatalogError, katalogBoleh, simpanProduk } from "@/lib/katalog";
import { getUser } from "@/lib/session";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/**
 * Tambah/ubah satu produk katalog (multipart, karena membawa foto). Fitur akun berbayar: pemilik nomor harus punya
 * langganan aktif (admin selalu boleh). Foto sudah diperkecil di browser; jenisnya dicek dari isi berkas di katalog.ts.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return galat("Sesi berakhir. Silakan login kembali.", 401);
  if (Number(req.headers.get("content-length") ?? 0) > BATAS_KATALOG.fotoByte + 64 * 1024) return galat("Foto terlalu besar (maksimal 1,5 MB).", 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return galat("Isian tidak terbaca.");
  }
  const nomor = await nomorUntuk(user, form.get("number_id"));
  if (!nomor) return galat("Nomor tidak ditemukan.", 404);
  if (user.peran !== "admin" && !(await katalogBoleh(nomor.user_id))) return galat("Katalog produk tersedia untuk paket berbayar. Pilih paket di halaman Langganan.", 403);

  const idMentah = Number(form.get("id"));
  const hargaMentah = String(form.get("harga") ?? "").replace(/\D/g, "");
  const berkas = form.get("foto");
  let foto: Uint8Array | null | undefined;
  if (berkas instanceof File && berkas.size > 0) foto = new Uint8Array(await berkas.arrayBuffer());
  else if (form.get("hapus_foto") === "1") foto = null;
  try {
    const id = await simpanProduk(nomor.id, {
      id: Number.isInteger(idMentah) && idMentah > 0 ? idMentah : undefined,
      nama: String(form.get("nama") ?? "").slice(0, 200),
      harga: hargaMentah ? Number(hargaMentah) : null,
      deskripsi: String(form.get("deskripsi") ?? "").slice(0, 1000),
      tersedia: form.get("tersedia") !== "0",
      foto,
    });
    revalidatePath(`/nomor/${nomor.id}`);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof KatalogError) return galat(e.message);
    throw e;
  }
}

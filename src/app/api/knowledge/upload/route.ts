import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { KnowledgeError, tambahDokumen } from "@/lib/knowledge";
import { getUser } from "@/lib/session";
import { nomorUntuk } from "@/lib/akses";

const MAKS_BYTE = 10 * 1024 * 1024;
const EKSTENSI_TEKS = new Set(["txt", "md", "markdown", "csv"]);

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/** Unggah PDF / berkas teks ke base knowledge sebuah nomor. Hanya teksnya yang disimpan. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return galat("Sesi berakhir. Silakan login kembali.", 401);
  if (Number(req.headers.get("content-length") ?? 0) > MAKS_BYTE + 64 * 1024) return galat("Berkas terlalu besar (maksimal 10 MB).", 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return galat("Unggahan tidak terbaca.");
  }
  const numberId = Number(form.get("number_id"));
  const berkas = form.get("berkas");
  if (!(await nomorUntuk(user, numberId))) return galat("Nomor tidak ditemukan.", 404);
  if (!(berkas instanceof File) || berkas.size === 0) return galat("Pilih berkas dulu.");
  if (berkas.size > MAKS_BYTE) return galat("Berkas terlalu besar (maksimal 10 MB).", 413);

  const ext = berkas.name.split(".").pop()?.toLowerCase() ?? "";
  const data = new Uint8Array(await berkas.arrayBuffer());
  const isPdf = ext === "pdf" || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46); // %PDF
  let teks: string;
  if (isPdf) {
    try {
      teks = (await (await import("@/lib/pdf")).teksDariPdf(data)).teks;
    } catch {
      return galat("PDF tidak bisa dibaca (rusak atau terkunci password).");
    }
    if (teks.replace(/\s/g, "").length < 20) return galat("PDF ini tidak memuat teks (kemungkinan hasil pindai/foto). Salin isinya lewat \"Tulis teks\".");
  } else if (EKSTENSI_TEKS.has(ext) || berkas.type.startsWith("text/")) {
    teks = new TextDecoder("utf-8").decode(data);
  } else {
    return galat("Format belum didukung. Unggah PDF atau berkas teks (.txt, .md, .csv).");
  }

  try {
    const hasil = await tambahDokumen({
      numberId,
      judul: berkas.name.replace(/\.[^.]+$/, "").slice(0, 120),
      sumber: isPdf ? "pdf" : "berkas",
      namaBerkas: berkas.name.slice(0, 200),
      ukuranByte: berkas.size,
      teks,
    });
    revalidatePath("/dashboard");
    revalidatePath(`/nomor/${numberId}`);
    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    return galat(e instanceof KnowledgeError ? e.message : "Gagal menyimpan dokumen.", e instanceof KnowledgeError ? 400 : 500);
  }
}

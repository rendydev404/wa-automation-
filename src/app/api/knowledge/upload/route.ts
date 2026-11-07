import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { catatFitur } from "@/lib/analitik";
import { KnowledgeError, tambahDokumen } from "@/lib/knowledge";
import { getUser } from "@/lib/session";
import { nomorUntuk } from "@/lib/akses";
import { teksPermintaan } from "@/lib/bahasa-server";

const MAKS_BYTE = 10 * 1024 * 1024;
const EKSTENSI_TEKS = new Set(["txt", "md", "markdown", "csv"]);

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/** Unggah PDF / berkas teks ke base knowledge sebuah nomor. Hanya teksnya yang disimpan. */
export async function POST(req: Request) {
  const [user, { b, t }] = await Promise.all([getUser(), teksPermintaan()]);
  if (!user) return galat(t("Sesi berakhir. Silakan login kembali.", "Your session has ended. Please sign in again."), 401);
  const terlaluBesar = () => galat(t("Berkas terlalu besar (maksimal 10 MB).", "File is too large (max 10 MB)."), 413);
  if (Number(req.headers.get("content-length") ?? 0) > MAKS_BYTE + 64 * 1024) return terlaluBesar();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return galat(t("Unggahan tidak terbaca.", "The upload couldn't be read."));
  }
  const numberId = Number(form.get("number_id"));
  const berkas = form.get("berkas");
  if (!(await nomorUntuk(user, numberId))) return galat(t("Nomor tidak ditemukan.", "Number not found."), 404);
  if (!(berkas instanceof File) || berkas.size === 0) return galat(t("Pilih berkas dulu.", "Choose a file first."));
  if (berkas.size > MAKS_BYTE) return terlaluBesar();

  const ext = berkas.name.split(".").pop()?.toLowerCase() ?? "";
  const data = new Uint8Array(await berkas.arrayBuffer());
  const isPdf = ext === "pdf" || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46); // %PDF
  let teks: string;
  if (isPdf) {
    try {
      teks = (await (await import("@/lib/pdf")).teksDariPdf(data)).teks;
    } catch {
      return galat(t("PDF tidak bisa dibaca (rusak atau terkunci password).", "The PDF can't be read (it's damaged or password-protected)."));
    }
    if (teks.replace(/\s/g, "").length < 20)
      return galat(
        t(
          "PDF ini tidak memuat teks (kemungkinan hasil pindai/foto). Salin isinya lewat \"Tulis teks\".",
          "This PDF contains no text (it's probably a scan or photo). Copy its content using \"Write text\"."
        )
      );
  } else if (EKSTENSI_TEKS.has(ext) || berkas.type.startsWith("text/")) {
    teks = new TextDecoder("utf-8").decode(data);
  } else {
    return galat(t("Format belum didukung. Unggah PDF atau berkas teks (.txt, .md, .csv).", "Unsupported format. Upload a PDF or a text file (.txt, .md, .csv)."));
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
    catatFitur(user.id, isPdf ? "knowledge.unggah_pdf" : "knowledge.unggah_berkas");
    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    if (e instanceof KnowledgeError) return galat((b === "en" && e.en) || e.message);
    return galat(t("Gagal menyimpan dokumen.", "Couldn't save the document."), 500);
  }
}

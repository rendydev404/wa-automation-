import { type Dokumen, KnowledgeError, daftarDokumen, tambahDokumen } from "@/lib/knowledge";
import { MAKS_BERKAS, aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

const EKSTENSI_TEKS = new Set(["txt", "md", "markdown", "csv"]);

const bentukDokumen = (d: Pick<Dokumen, "id" | "judul" | "sumber" | "jumlah_karakter" | "created_at">) => ({
  id: String(d.id),
  judul: d.judul,
  sumber: d.sumber,
  karakter: d.jumlah_karakter,
  dibuat: d.created_at,
});

/** GET /api/v1/nomor/{id}/knowledge: daftar product knowledge nomor (tanpa dokumen sinkron otomatis). */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "knowledge");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    return ok({ data: (await daftarDokumen(n.id, false)).map(bentukDokumen) }, k);
  });
}

/**
 * POST /api/v1/nomor/{id}/knowledge
 *   - JSON {judul, teks}; atau
 *   - multipart/form-data: field "berkas" (PDF / .txt / .md / .csv, maks 10 MB) + opsional "judul".
 * Hanya teksnya yang disimpan.
 */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "knowledge");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const salah = (pesan: string) => galat("isian_tidak_sah", pesan, k.id, k.kepala);
    const jenis = req.headers.get("content-type") ?? "";
    let isi: { judul: string; sumber: Dokumen["sumber"]; teks: string; namaBerkas?: string; ukuranByte?: number };
    if (jenis.startsWith("multipart/form-data")) {
      if (Number(req.headers.get("content-length") ?? 0) > MAKS_BERKAS + 64 * 1024) return salah("Berkas maksimal 10 MB.");
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return salah("Unggahan multipart tidak terbaca.");
      }
      const berkas = form.get("berkas");
      if (!(berkas instanceof File) || berkas.size === 0) return salah("Sertakan field `berkas`.");
      if (berkas.size > MAKS_BERKAS) return salah("Berkas maksimal 10 MB.");
      const ext = berkas.name.split(".").pop()?.toLowerCase() ?? "";
      const data = new Uint8Array(await berkas.arrayBuffer());
      const pdf = ext === "pdf" || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46);
      let teks: string;
      if (pdf) {
        try {
          teks = (await (await import("@/lib/pdf")).teksDariPdf(data)).teks;
        } catch {
          return salah("PDF tidak bisa dibaca (rusak atau terkunci password).");
        }
      } else if (EKSTENSI_TEKS.has(ext) || berkas.type.startsWith("text/")) {
        teks = new TextDecoder("utf-8").decode(data);
      } else {
        return salah("Format belum didukung. Unggah PDF atau berkas teks (.txt, .md, .csv).");
      }
      const judul = String(form.get("judul") ?? "").trim() || berkas.name.replace(/\.[^.]+$/, "");
      isi = { judul, sumber: pdf ? "pdf" : "berkas", teks, namaBerkas: berkas.name.slice(0, 200), ukuranByte: berkas.size };
    } else {
      const b = await bacaJson(req, k);
      if (!("teks" in b)) return b;
      if (typeof b.data.teks !== "string") return salah("Isi `teks` (string), atau unggah berkas multipart.");
      isi = { judul: String(b.data.judul ?? "").trim() || "Tanpa judul", sumber: "teks", teks: b.data.teks };
    }
    try {
      const h = await tambahDokumen({ numberId: n.id, ...isi, judul: isi.judul.slice(0, 120) });
      return ok(bentukDokumen({ id: h.id, judul: isi.judul.slice(0, 120), sumber: isi.sumber, jumlah_karakter: h.karakter, created_at: Math.floor(Date.now() / 1000) }), k, 201);
    } catch (e) {
      if (e instanceof KnowledgeError) return salah(e.message);
      throw e;
    }
  });
}

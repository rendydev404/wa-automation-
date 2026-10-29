import { NextResponse } from "next/server";
import { teksDokumen } from "@/lib/knowledge";
import { sesiDanNomor } from "@/lib/akses";

/** Unduh isi satu dokumen base knowledge sebagai berkas .txt. Query: ?id=<dokumen>&nomor=<number_id>. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const { user, nomor } = await sesiDanNomor(q.get("nomor"));
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Silakan login kembali." }, { status: 401 });
  const id = Number(q.get("id"));
  if (!Number.isInteger(id) || !nomor) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
  const numberId = nomor.id;

  const dok = await teksDokumen(id, numberId);
  if (!dok) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });

  const nama = `${dok.judul.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 100) || "dokumen"}.txt`;
  const ascii = nama.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(dok.teks, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

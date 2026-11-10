import { fiturBoleh } from "@/lib/mesin/lisensi";
import { NextResponse } from "next/server";
import { catatFitur } from "@/lib/analitik";
import { teksDokumen } from "@/lib/knowledge";
import { sesiDanNomor } from "@/lib/akses";
import { teksPermintaan } from "@/lib/bahasa-server";
import { staf } from "@/lib/peran";

/** Unduh isi satu dokumen base knowledge sebagai berkas .txt. Query: ?id=<dokumen>&nomor=<number_id>. */
export async function GET(req: Request) {
  if (!fiturBoleh("knowledge")) return Response.json({ error: "Fitur ini dinonaktifkan oleh ChatGerCep." }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const [{ user, nomor }, { t }] = await Promise.all([sesiDanNomor(q.get("nomor")), teksPermintaan()]);
  if (!user) return NextResponse.json({ error: t("Sesi berakhir. Silakan login kembali.", "Your session has ended. Please sign in again.") }, { status: 401 });
  const id = Number(q.get("id"));
  const tidakAda = () => NextResponse.json({ error: t("Dokumen tidak ditemukan.", "Document not found.") }, { status: 404 });
  if (!Number.isInteger(id) || !nomor) return tidakAda();
  const numberId = nomor.id;

  const dok = await teksDokumen(id, numberId, staf(user.peran));
  if (!dok) return tidakAda();

  const nama = `${dok.judul.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 100) || t("dokumen", "document")}.txt`;
  const ascii = nama.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  catatFitur(user.id, "knowledge.unduh");
  return new Response(dok.teks, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

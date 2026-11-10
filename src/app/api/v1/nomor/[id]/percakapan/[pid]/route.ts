import { aturJedaChat, bangunkanChat } from "@/lib/bridge";
import { sekarang } from "@/lib/db";
import { ambilPesanPercakapan, hapusPercakapan, tandaiBukanSpam } from "@/lib/percakapan";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { idSah, percakapanApi } from "../umum";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/**
 * PATCH /api/v1/nomor/{id}/percakapan/{pid} {bot?: "jeda" | "lanjut", menit?: 1-10080, layani_lagi?: true, bukan_spam?: true}
 *   -> Percakapan. "jeda" = ambil alih manual (bot diam sampai waktu jeda habis), "lanjut" = bot melayani lagi sekarang,
 *   layani_lagi = chat yang dibisukan penyaring prospek dilayani lagi, bukan_spam = tandai pesan spam keliru.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "percakapan");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    const pid = idSah(p.pid);
    const h = pid ? await ambilPesanPercakapan(n.id, pid, { batas: 1 }) : null;
    if (!h || !pid) return galat("tidak_ditemukan", "Percakapan tidak ditemukan.", k.id, k.kepala);
    const d = b.data;
    if (d.bot !== undefined && d.bot !== "jeda" && d.bot !== "lanjut") return galat("isian_tidak_sah", "`bot` harus \"jeda\" atau \"lanjut\".", k.id, k.kepala);
    const menit = d.menit === undefined ? Math.ceil(n.jeda_detik / 60) : Number(d.menit);
    if (!(Number.isInteger(menit) && menit >= 1 && menit <= 10_080)) return galat("isian_tidak_sah", "`menit` harus 1-10080.", k.id, k.kepala);
    if (d.bot === undefined && d.layani_lagi !== true && d.bukan_spam !== true) return galat("isian_tidak_sah", "Isi `bot`, `layani_lagi`, atau `bukan_spam`.", k.id, k.kepala);
    if (d.bot === "jeda") await aturJedaChat(h.percakapan.kunci, sekarang() + menit * 60);
    if (d.bot === "lanjut") await aturJedaChat(h.percakapan.kunci, 0);
    if (d.layani_lagi === true) await bangunkanChat(n.id, h.percakapan.kunci);
    if (d.bukan_spam === true) await tandaiBukanSpam(n.id, pid);
    const baru = await ambilPesanPercakapan(n.id, pid, { batas: 1 });
    return ok(percakapanApi(baru!.percakapan), k);
  });
}

/** DELETE /api/v1/nomor/{id}/percakapan/{pid}: hapus riwayat chat ini (di mesin Anda). */
export async function DELETE(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "percakapan");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    const pid = idSah(p.pid);
    if (!pid || !(await hapusPercakapan(n.id, pid))) return galat("tidak_ditemukan", "Percakapan tidak ditemukan.", k.id, k.kepala);
    return ok({ dihapus: true }, k);
  });
}

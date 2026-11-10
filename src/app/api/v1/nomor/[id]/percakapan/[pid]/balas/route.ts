import type { KodeGalat } from "@/lib/api-def";
import { aturJedaChat } from "@/lib/bridge";
import { sekarang } from "@/lib/db";
import { catatPesan, ambilPesanPercakapan } from "@/lib/percakapan";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { AntreanError, masukkanPesan } from "@/lib/mesin/antrean";
import { fiturBoleh } from "@/lib/mesin/lisensi";
import { idSah } from "../../umum";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/**
 * POST /api/v1/nomor/{id}/percakapan/{pid}/balas {teks} -> 202 {id, status: "antre"}.
 * Balas manual sebagai manusia lewat antrean anti-blokir. Bot dijeda untuk chat ini selama `jeda_detik` nomor (seperti
 * saat pemilik membalas dari HP). Butuh fitur `percakapan` + `pesan.kirim`.
 */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "percakapan");
  if (bukanKonteks(k)) return k;
  if (!fiturBoleh("pesan.kirim")) return galat("fitur_tidak_dibuka", "Fitur 'pesan.kirim' belum dibuka untuk aplikasi ini.", k.id, k.kepala);
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    const pid = idSah(p.pid);
    const h = pid ? await ambilPesanPercakapan(n.id, pid, { batas: 1 }) : null;
    if (!h) return galat("tidak_ditemukan", "Percakapan tidak ditemukan.", k.id, k.kepala);
    if (!h.percakapan.telepon) return galat("isian_tidak_sah", "Nomor telepon lawan bicara belum diketahui (hanya LID). Balas dari HP atau tunggu pesan berikutnya.", k.id, k.kepala);
    const teks = typeof b.data.teks === "string" ? b.data.teks : "";
    try {
      const pesan = await masukkanPesan({ nomor: n, ke: h.percakapan.telepon, teks });
      const kini = sekarang();
      await aturJedaChat(h.percakapan.kunci, kini + Math.max(60, n.jeda_detik));
      await catatPesan({ numberId: n.id, kunci: h.percakapan.kunci, peran: 2, teks: teks.trim(), waktu: kini, telepon: h.percakapan.telepon });
      return ok({ id: String(pesan.id), status: pesan.status }, k, 202);
    } catch (e) {
      if (e instanceof AntreanError) return galat(e.kode as KodeGalat, e.message, k.id, k.kepala);
      throw e;
    }
  });
}

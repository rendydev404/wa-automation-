import { VERSI_APLIKASI } from "@/lib/mode";
import { semuaNomor } from "@/lib/numbers";
import { infoSesi } from "@/lib/wa";
import { aman, bukanKonteks, ok, otorisasi } from "@/lib/mesin/api";
import { infoLisensi } from "@/lib/mesin/lisensi";

/** GET /api/v1/status: versi mesin, mode (sandbox/production), nomor penguji, lisensi, jumlah nomor. Tetap menjawab dalam mode terbatas (untuk tahu sebabnya). */
export async function GET(req: Request) {
  const k = await otorisasi(req, null, { izinkanTerbatas: true });
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const l = infoLisensi();
    const nomor = await semuaNomor();
    return ok(
      {
        versi: VERSI_APLIKASI,
        mode: l.mode === "sandbox" ? "sandbox" : "production",
        ...(l.mode === "sandbox" ? { nomor_uji: l.nomor_uji } : {}),
        lisensi: {
          status: l.status,
          aktif: l.aktif,
          alasan: l.alasan,
          aplikasi: l.aplikasi,
          fitur: l.fitur,
          batas: l.batas,
          berlaku_sampai: l.berlaku_sampai,
        },
        nomor: { total: nomor.length, terhubung: nomor.filter((n) => infoSesi(n.sesi).status === "WORKING").length },
      },
      k,
    );
  });
}

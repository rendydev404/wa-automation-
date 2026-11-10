import { nomorById } from "@/lib/numbers";
import { aman, bacaJson, bukanKonteks, denganIdempotensi, idJalur, otorisasi } from "@/lib/mesin/api";
import { AntreanError, masukkanPesan } from "@/lib/mesin/antrean";

/**
 * POST /api/v1/pesan {nomor_id, ke, teks?, gambar?: {base64, mime, caption?}} -> 202 {id, status: "antre"}.
 * Pesan masuk antrean anti-blokir; status akhirnya lewat GET /pesan/{id} atau webhook pesan.status.
 * Disarankan menyertakan Idempotency-Key supaya percobaan ulang tidak mengirim dua kali.
 */
export async function POST(req: Request) {
  const k = await otorisasi(req, "pesan.kirim");
  if (bukanKonteks(k)) return k;
  // Body bisa memuat gambar base64 (maks 5 MB): batas JSON dinaikkan untuk endpoint ini saja.
  const b = await bacaJson(req, k, 7 * 1024 * 1024);
  if (!("teks" in b)) return b;
  return aman(k, () =>
    denganIdempotensi(req, k, b.teks, async () => {
      const gagal = (status: number, kode: string, pesan: string) => ({ status, body: { galat: { kode, pesan, id_permintaan: k.id } } });
      const id = idJalur(String(b.data.nomor_id ?? ""));
      const nomor = id ? await nomorById(id) : undefined;
      if (!nomor) return gagal(404, "tidak_ditemukan", "Nomor tidak ditemukan.");
      try {
        const p = await masukkanPesan({
          nomor,
          ke: b.data.ke,
          teks: b.data.teks,
          gambar: b.data.gambar && typeof b.data.gambar === "object" ? (b.data.gambar as Record<string, unknown>) : null,
        });
        return { status: 202, body: { id: String(p.id), status: p.status } };
      } catch (e) {
        if (e instanceof AntreanError) return gagal(e.kode === "ditolak_anti_blokir" ? 422 : e.kode === "tidak_ditemukan" ? 404 : 400, e.kode, e.message);
        throw e;
      }
    }),
  );
}

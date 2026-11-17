import { KODE_GALAT, type KodeGalat } from "@/lib/api-def";
import { nomorById } from "@/lib/numbers";
import { aman, bacaJson, bukanKonteks, denganIdempotensi, galat, idJalur, otorisasi } from "@/lib/mesin/api";
import { AntreanError, MAKS_DOKUMEN_BYTE, masukkanPesan } from "@/lib/mesin/antrean";

/**
 * POST /api/v1/pesan -> 202 {id, status: "antre"}.
 * Menerima JSON ({nomor_id, ke, teks?, gambar?: {base64, mime, caption?}, dokumen?: {base64, nama, mime?, caption?}})
 * maupun multipart/form-data (field nomor_id, ke, teks?, caption?, serta berkas `dokumen`/`berkas` maks 100 MB).
 * Pesan masuk antrean anti-blokir; status akhirnya lewat GET /pesan/{id} atau webhook pesan.status.
 */
export async function POST(req: Request) {
  const k = await otorisasi(req, "pesan.kirim");
  if (bukanKonteks(k)) return k;
  const gagal = (status: number, kode: string, pesan: string) => ({ status, body: { galat: { kode, pesan, id_permintaan: k.id } } });
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();

  if (ct.startsWith("multipart/form-data")) {
    if (Number(req.headers.get("content-length") ?? 0) > MAKS_DOKUMEN_BYTE + 2 * 1024 * 1024)
      return galat("isian_tidak_sah", "Ukuran berkas maksimal 100 MB.", k.id, k.kepala);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return galat("isian_tidak_sah", "Body multipart tidak sah.", k.id, k.kepala);
    }
    const nomorIdTeks = String(form.get("nomor_id") ?? "");
    const ke = String(form.get("ke") ?? "");
    const teks = typeof form.get("teks") === "string" ? String(form.get("teks")) : "";
    const caption = typeof form.get("caption") === "string" ? String(form.get("caption")) : "";
    const f = form.get("dokumen") ?? form.get("berkas");
    if (!(f instanceof Blob)) return galat("isian_tidak_sah", "Sertakan berkas di field `dokumen` atau `berkas`.", k.id, k.kepala);
    if (!f.size || f.size > MAKS_DOKUMEN_BYTE) return galat("isian_tidak_sah", "Berkas tidak boleh kosong atau lebih dari 100 MB.", k.id, k.kepala);
    const nama = typeof form.get("nama") === "string" && String(form.get("nama")).trim() ? String(form.get("nama")).trim() : (f as File).name || "berkas";
    const mime = typeof form.get("mime") === "string" && String(form.get("mime")).trim() ? String(form.get("mime")).trim() : f.type;
    const buffer = Buffer.from(await f.arrayBuffer());
    const sidik = `${nomorIdTeks}|${ke}|${teks}|${caption}|${nama}|${buffer.byteLength}`;
    return aman(k, () =>
      denganIdempotensi(req, k, sidik, async () => {
        const id = idJalur(nomorIdTeks);
        const nomor = id ? await nomorById(id) : undefined;
        if (!nomor) return gagal(404, "tidak_ditemukan", "Nomor tidak ditemukan.");
        try {
          const p = await masukkanPesan({ nomor, ke, teks, dokumen: { buffer, nama, mime, caption } });
          return { status: 202, body: { id: String(p.id), status: p.status } };
        } catch (e) {
          if (e instanceof AntreanError) return gagal(KODE_GALAT[e.kode as KodeGalat] ?? 400, e.kode, e.message);
          throw e;
        }
      }),
    );
  }

  // Body JSON bisa memuat gambar base64 (maks 5 MB) atau dokumen base64 (maks 100 MB biner ≈ 134 MB base64).
  const b = await bacaJson(req, k, 140 * 1024 * 1024);
  if (!("teks" in b)) return b;
  return aman(k, () =>
    denganIdempotensi(req, k, b.teks, async () => {
      const id = idJalur(String(b.data.nomor_id ?? ""));
      const nomor = id ? await nomorById(id) : undefined;
      if (!nomor) return gagal(404, "tidak_ditemukan", "Nomor tidak ditemukan.");
      const dok = b.data.dokumen ?? b.data.berkas;
      try {
        const p = await masukkanPesan({
          nomor,
          ke: b.data.ke,
          teks: b.data.teks,
          gambar: b.data.gambar && typeof b.data.gambar === "object" ? (b.data.gambar as Record<string, unknown>) : null,
          dokumen: dok && typeof dok === "object" ? (dok as Record<string, unknown>) : null,
        });
        return { status: 202, body: { id: String(p.id), status: p.status } };
      } catch (e) {
        if (e instanceof AntreanError) return gagal(KODE_GALAT[e.kode as KodeGalat] ?? 400, e.kode, e.message);
        throw e;
      }
    }),
  );
}

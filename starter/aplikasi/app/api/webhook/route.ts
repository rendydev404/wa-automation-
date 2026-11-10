import { catat } from "../../../lib/peristiwa";
import { rahasiaWebhook } from "../../../lib/rahasia";
import { GalatTandaWebhook, verifikasiWebhook } from "../../../lib/sdk";

const MAKS_BODY = 1024 * 1024;

/**
 * POST /api/webhook: penerima webhook dari mesin ChatGerCep.
 * Tanda tangan (header X-CG-Tanda) diperiksa dulu; event yang sah disimpan lalu disiarkan ke browser lewat /api/aliran.
 * Mesin menunggu jawaban maksimal 5 detik dan mengirim ulang bila bukan 2xx, jadi jawab cepat dan kerjakan hal berat
 * (simpan ke database, panggil layanan lain) di latar.
 */
export async function POST(req: Request) {
  const rahasia = rahasiaWebhook();
  // 503 = mesin akan mencoba lagi nanti, setelah rahasia diisi.
  if (!rahasia) return Response.json({ galat: "CHATGERCEP_RAHASIA_WEBHOOK belum diisi di aplikasi ini." }, { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > MAKS_BODY) return Response.json({ galat: "Body terlalu besar." }, { status: 413 });

  // Body mentah, persis seperti dikirim: tanda tangan dihitung dari teks ini.
  const body = await req.text();
  let event;
  try {
    event = verifikasiWebhook(rahasia, req.headers.get("x-cg-tanda"), body);
  } catch (e) {
    if (e instanceof GalatTandaWebhook) return Response.json({ galat: e.message, alasan: e.alasan }, { status: 401 });
    throw e;
  }

  // Pengiriman minimal sekali: event yang sama bisa datang dua kali, `catat` membuang duplikat lewat id_event.
  const baru = catat(event);
  return Response.json({ ok: true, duplikat: !baru });
}

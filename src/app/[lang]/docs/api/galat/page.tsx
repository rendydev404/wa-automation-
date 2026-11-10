import { teksHalaman } from "@/lib/bahasa-halaman";
import { DaftarGalat } from "../_dok/daftar";
import { Catatan, JudulHalaman, metaDok } from "../_dok/kerangka";
import { Kode } from "../_dok/kode";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "galat");

export default async function Galat() {
  const { t } = await teksHalaman();
  return (
    <article className="space-y-6">
      <JudulHalaman label={t("Referensi", "Reference")} judul={t("Kode galat", "Error codes")}>
        {t("Setiap galat punya kode tetap yang aman dipakai di kode Anda. Cari kode untuk melihat artinya dan apa yang harus dilakukan.", "Every error has a stable code that's safe to branch on in your code. Search a code to see what it means and what to do.")}
      </JudulHalaman>
      <Kode judul={t("Bentuk galat", "Error shape")}>{JSON.stringify({ galat: { kode: "nomor_belum_terhubung", pesan: "Nomor belum terhubung ke WhatsApp.", id_permintaan: "req_3qHAwX..." } }, null, 2)}</Kode>
      <Catatan jenis="tips">{t("Kode 429 dan 503 boleh dicoba ulang (ikuti header Retry-After). Sertakan id_permintaan bila menghubungi ChatGerCep.", "429 and 503 may be retried (follow the Retry-After header). Include the id_permintaan when contacting ChatGerCep.")}</Catatan>
      <DaftarGalat />
    </article>
  );
}

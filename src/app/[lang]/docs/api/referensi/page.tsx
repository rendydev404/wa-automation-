import { teksHalaman } from "@/lib/bahasa-halaman";
import { JudulHalaman, metaDok } from "../_dok/kerangka";
import { ReferensiEndpoint } from "../_dok/referensi";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "referensi");

export default async function Referensi() {
  const { t } = await teksHalaman();
  return (
    <article>
      <JudulHalaman label={t("Referensi", "Reference")} judul={t("Referensi endpoint", "Endpoint reference")}>
        {t(
          "Klik endpoint untuk melihat contoh kode (cURL, TypeScript SDK, PHP, Python), isi permintaan, dan jawaban. Pilih Sandbox atau Production untuk menyesuaikan alamat di contoh kode.",
          "Click an endpoint to see code samples (cURL, TypeScript SDK, PHP, Python), the request body, and the response. Pick Sandbox or Production to adjust the address in the samples.",
        )}
      </JudulHalaman>
      <ReferensiEndpoint />
    </article>
  );
}

import { teksHalaman } from "@/lib/bahasa-halaman";
import { Bagian, Catatan, JudulHalaman, K, Tabel, metaDok } from "../_dok/kerangka";
import { Kode } from "../_dok/kode";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "autentikasi");

export default async function Autentikasi() {
  const { t } = await teksHalaman();
  return (
    <article className="space-y-10">
      <JudulHalaman label={t("Referensi", "Reference")} judul={t("Autentikasi & konvensi", "Authentication & conventions")}>
        {t("Semua permintaan memakai satu API key di header, JSON UTF-8, dan format galat yang sama.", "Every request uses one API key in a header, UTF-8 JSON, and the same error format.")}
      </JudulHalaman>

      <Bagian id="key" judul="API key">
        <Kode judul={t("Header", "Header")}>{`Authorization: Bearer cg_live_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Kode>
        <Tabel
          kepala={[t("Jenis", "Type"), t("Awalan", "Prefix"), t("Dipakai untuk", "Used for")]}
          baris={[
            ["Production", <K key="l">cg_live_</K>, t("Mesin production (setelah pengajuan disetujui)", "Production engine (after approval)")],
            ["Sandbox", <K key="s">cg_test_</K>, t("Mencoba dengan 1 nomor penguji", "Testing with 1 tester number")],
          ]}
        />
        <Catatan jenis="awas" judul={t("Hanya server ke server", "Server-to-server only")}>
          {t(
            "Jangan pernah menaruh key di browser atau aplikasi HP. Mesin menolak permintaan yang membawa header Origin (dari browser). Key tampil sekali saat dibuat; ganti kapan saja di portal (key production lama tetap berlaku 24 jam).",
            "Never put the key in a browser or mobile app. The engine rejects requests carrying an Origin header (from browsers). Keys are shown once; rotate any time in the portal (an old production key keeps working for 24 hours).",
          )}
        </Catatan>
      </Bagian>

      <Bagian id="base-url" judul="Base URL">
        <Tabel
          kepala={[t("Lingkungan", "Environment"), "Base URL"]}
          baris={[
            ["Production", <K key="p">https://&lt;ALAMAT_PUBLIK&gt;/api/v1</K>],
            ["Sandbox", <K key="s">http://localhost:1975/api/v1</K>],
          ]}
        />
        <p className="text-[13.5px] text-muted">
          {t("Setiap jawaban membawa header ", "Every response carries the header ")}
          <K>X-ChatGerCep-Mode: sandbox | production</K>
          {t(" dan ", " and ")}
          <K>X-Request-Id</K>.
        </p>
      </Bagian>

      <Bagian id="konvensi" judul={t("Konvensi", "Conventions")}>
        <Tabel
          kepala={[t("Hal", "Topic"), t("Aturan", "Rule")]}
          baris={[
            [t("Format", "Format"), t("JSON UTF-8. Waktu dalam epoch detik. Semua ID berupa string.", "UTF-8 JSON. Times are epoch seconds. All IDs are strings.")],
            [t("Idempotensi", "Idempotency"), <span key="i">{t("Kirim ", "Send ")}<K>Idempotency-Key</K>{t(" pada POST pesan/nomor/balas. Permintaan ulang dengan key sama (24 jam) mendapat jawaban pertama: pesan tidak terkirim dua kali.", " on message/number/reply POSTs. A retry with the same key (within 24 h) gets the first response, so messages are never sent twice.")}</span>],
            [t("Paginasi", "Pagination"), <span key="p"><K>?batas=50&amp;setelah=&lt;berikutnya&gt;</K>{t(" (maks 100). Ambil halaman berikutnya selama ", " (max 100). Fetch the next page while ")}<K>berikutnya</K>{t(" tidak null.", " isn't null.")}</span>],
            [t("Batas ukuran", "Size limits"), t("JSON 1 MB, berkas 10 MB, teks pesan 4.096 karakter.", "JSON 1 MB, files 10 MB, message text 4,096 characters.")],
            [t("Batas laju", "Rate limit"), t("Per key per detik (bawaan 60). Lewat batas = 429 dengan header Retry-After.", "Per key per second (default 60). Over the limit = 429 with a Retry-After header.")],
          ]}
        />
      </Bagian>

      <Bagian id="galat" judul={t("Format galat", "Error format")}>
        <Kode judul="JSON">{JSON.stringify({ galat: { kode: "fitur_tidak_dibuka", pesan: "Fitur 'knowledge' belum dibuka untuk aplikasi ini.", id_permintaan: "req_9f2a..." } }, null, 2)}</Kode>
        <p className="text-[13.5px] text-muted">
          {t("Kode 429 & 503 boleh dicoba ulang. Daftar lengkap ada di halaman ", "429 & 503 may be retried. The full list is on the ")}
          <a href="/docs/api/galat" className="font-semibold text-accent hover:underline">
            {t("Kode galat", "Error codes")}
          </a>
          {t(".", " page.")}
        </p>
      </Bagian>
    </article>
  );
}

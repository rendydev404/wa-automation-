import { connection } from "next/server";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { faqLanding } from "@/lib/faq-landing";
import { daftarPaket } from "@/lib/langganan";
import { MEREK, NOMOR_WA_TAMPIL } from "@/lib/merek";
import { ASAL_SITUS, ID_APLIKASI, ID_ORGANISASI, ID_SITUS, dataOrganisasi, jsonLdAman } from "@/lib/seo";

/**
 * Data terstruktur (schema.org JSON-LD) landing page: Organization, WebSite, WebPage, dan FAQPage. Statis (ikut
 * prerender), supaya Google, Bing, dan mesin AI (ChatGPT, Perplexity, Gemini) mengenali merek, badan usaha, dan
 * jawaban FAQ tanpa harus menebak dari tata letak.
 */
export async function DataSitusLanding() {
  const { b, t } = await teksHalaman();
  const url = b === "en" ? `${ASAL_SITUS}/eng` : `${ASAL_SITUS}/`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        ...dataOrganisasi(),
        contactPoint: { "@type": "ContactPoint", contactType: "customer service", telephone: NOMOR_WA_TAMPIL, availableLanguage: ["id", "en"] },
      },
      {
        "@type": "WebSite",
        "@id": ID_SITUS,
        url: `${ASAL_SITUS}/`,
        name: MEREK,
        inLanguage: ["id-ID", "en-US"],
        publisher: { "@id": ID_ORGANISASI },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#halaman`,
        url,
        name: t(`${MEREK} · AI yang membalas pelanggan WhatsApp Anda 24/7`, `${MEREK} · AI that replies to your WhatsApp customers 24/7`),
        inLanguage: b === "en" ? "en-US" : "id-ID",
        isPartOf: { "@id": ID_SITUS },
        about: { "@id": ID_APLIKASI },
        publisher: { "@id": ID_ORGANISASI },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: b === "en" ? "en-US" : "id-ID",
        mainEntity: faqLanding(t).map((f) => ({ "@type": "Question", name: f.t, acceptedAnswer: { "@type": "Answer", text: f.j } })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdAman(data) }} />;
}

/**
 * SoftwareApplication + harga paket aktif (dari database, sama dengan kartu harga). Dialirkan dalam Suspense setelah
 * kerangka statis; database tak terjangkau = data aplikasi tetap tampil, hanya tanpa daftar harga.
 */
export async function DataProdukLanding() {
  await connection();
  const { b, t } = await teksHalaman();
  let offers: object[] = [];
  try {
    offers = (await daftarPaket())
      .filter((p) => p.harga > 0)
      .map((p) => ({
        "@type": "Offer",
        name: p.nama,
        price: p.harga,
        priceCurrency: "IDR",
        availability: "https://schema.org/InStock",
        url: `${ASAL_SITUS}${b === "en" ? "/eng" : "/"}#harga`,
        description: t(
          `${p.kuota_nomor} nomor WhatsApp, ${p.kuota_balasan} balasan AI per ${p.durasi_hari} hari`,
          `${p.kuota_nomor} WhatsApp number(s), ${p.kuota_balasan} AI replies per ${p.durasi_hari} days`,
        ),
      }));
  } catch {
    offers = [];
  }
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": ID_APLIKASI,
    name: MEREK,
    url: `${ASAL_SITUS}/`,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: t("Chatbot AI WhatsApp", "AI WhatsApp chatbot"),
    operatingSystem: "Web",
    inLanguage: ["id-ID", "en-US"],
    description: t(
      `${MEREK} adalah asisten AI untuk WhatsApp yang membalas chat pelanggan usaha secara otomatis 24 jam, berdasarkan Informasi Usaha yang diisi pemilik usaha. Nomor WhatsApp biasa maupun WhatsApp Business disambungkan lewat scan QR.`,
      `${MEREK} is an AI assistant for WhatsApp that replies to a business's customer chats automatically 24/7, using the Business Info the owner provides. Regular WhatsApp and WhatsApp Business numbers connect with a QR scan.`,
    ),
    featureList: [
      t("Balasan AI otomatis 24 jam di WhatsApp", "Automatic 24/7 AI replies on WhatsApp"),
      t("Jawaban hanya dari Informasi Usaha (PDF, menu, harga, FAQ)", "Answers only from your Business Info (PDFs, menus, prices, FAQs)"),
      t("AI berhenti otomatis saat pemilik membalas sendiri", "AI steps back automatically when the owner replies"),
      t("Sambung nomor lewat scan QR atau kode di HP", "Connect a number with a QR scan or a phone code"),
      t("Bisa banyak nomor WhatsApp dalam satu akun", "Multiple WhatsApp numbers in one account"),
      t("Garansi uang kembali", "Money-back guarantee"),
    ],
    publisher: { "@id": ID_ORGANISASI },
    ...(offers.length ? { offers } : {}),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdAman(data) }} />;
}

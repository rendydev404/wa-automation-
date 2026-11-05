import { teksHalaman } from "@/lib/bahasa-halaman";
import { MEREK, PERUSAHAAN } from "@/lib/merek";

/** Baris badan usaha di kaki halaman publik (landing & program afiliasi). */
export async function KakiPerusahaan({ className = "" }: { className?: string }) {
  const { t } = await teksHalaman();
  return (
    <div className={`border-t border-line ${className}`}>
      <p className="mx-auto max-w-[1200px] px-4 py-4 text-center text-[12px] leading-relaxed text-faint sm:px-6">
        &copy; {PERUSAHAAN}. {t(`${MEREK} adalah produk dan layanan milik ${PERUSAHAAN}.`, `${MEREK} is a product and service of ${PERUSAHAAN}.`)}
      </p>
    </div>
  );
}

/** Data terstruktur Organization (schema.org) supaya mesin pencari mengaitkan merek dengan badan usahanya. */
export function DataOrganisasi() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: PERUSAHAAN,
    legalName: PERUSAHAAN,
    url: "https://chatgercep.com",
    logo: "https://chatgercep.com/icon.svg",
    brand: { "@type": "Brand", name: MEREK },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

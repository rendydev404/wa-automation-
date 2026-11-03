import type { KanalBayar } from "@/lib/harga";

/**
 * Logo kanal pembayaran (public/logo-bayar/<kanal>.svg, SVG resmi yang sudah diperkecil, ±1–6 KB per logo). Selalu di
 * atas latar putih supaya warna merek tetap benar di mode gelap. Dekoratif: nama kanal selalu tertulis di sebelahnya.
 */
export function LogoKanal({ kanal, ukuran = "md" }: { kanal: KanalBayar; ukuran?: "md" | "lg" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg border border-line bg-white ${ukuran === "lg" ? "h-11 w-[4.5rem] p-2" : "h-9 w-14 p-1.5"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis kecil, tidak perlu optimasi gambar Next */}
      <img src={`/logo-bayar/${kanal}.svg`} alt="" width={48} height={24} decoding="async" className="max-h-full max-w-full object-contain" />
    </span>
  );
}

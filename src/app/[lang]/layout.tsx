import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { MetaPixel } from "@/components/meta-pixel-server";
import { PenyediaBahasa } from "@/components/bahasa";
import { DAFTAR_BAHASA, bahasaSah, pembuatT } from "@/lib/bahasa";
import { MEREK } from "@/lib/merek";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Hanya untuk tulisan logo (components/logo.tsx): satu ketebalan (~20 KB). Tetap di-preload karena logo tampil di
// atas setiap halaman; tanpa itu tulisan merek sempat berkedip memakai font cadangan.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: "700",
});

/** Kedua bahasa dirender statis; URL /eng/... ditulis ulang proxy.ts ke /en/..., jalur lain ke /id/... */
export function generateStaticParams() {
  return DAFTAR_BAHASA.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const t = pembuatT(bahasaSah(lang) ? lang : "id");
  return {
    title: MEREK,
    description: t("Kelola nomor WhatsApp dan base knowledge asisten AI-nya.", "Manage your WhatsApp numbers and your AI assistant's product knowledge."),
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!bahasaSah(lang)) notFound();
  return (
    <html lang={lang} data-scroll-behavior="smooth" className={`${plusJakarta.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas font-sans text-fg">
        <MetaPixel />
        <PenyediaBahasa bahasa={lang}>{children}</PenyediaBahasa>
      </body>
    </html>
  );
}

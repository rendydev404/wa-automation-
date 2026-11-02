import type { Metadata } from "next";
import { Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { MetaPixel } from "@/components/meta-pixel-server";
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

export const metadata: Metadata = {
  title: MEREK,
  description: "Kelola nomor WhatsApp dan base knowledge asisten AI-nya.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" data-scroll-behavior="smooth" className={`${plusJakarta.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas font-sans text-fg">
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}

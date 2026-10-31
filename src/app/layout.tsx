import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { MEREK } from "@/lib/merek";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: MEREK,
  description: "Kelola nomor WhatsApp dan base knowledge asisten AI-nya.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" data-scroll-behavior="smooth" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas font-sans text-fg">{children}</body>
    </html>
  );
}

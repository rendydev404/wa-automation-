import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Navigasi } from "../komponen/navigasi";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aplikasi Saya · ChatGerCep",
  description: "Contoh aplikasi dengan tampilan sendiri di atas mesin ChatGerCep.",
};

export default function TataLetak({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="kepala">
          {/* Ganti nama & logo di sini dengan milik aplikasi Anda. */}
          <strong className="merek">Aplikasi Saya</strong>
          <Navigasi />
        </header>
        <main className="isi">{children}</main>
      </body>
    </html>
  );
}

import { Suspense } from "react";
import { requireAksesApi } from "@/lib/session";

/**
 * Gerbang portal Developer API: belum dibuka umum, hanya akun yang dipilih developer internal (users.akses_api).
 * Seluruh isi (termasuk teks pengantar & formulir) baru dirender setelah akses dipastikan; selain itu 404.
 */
async function Gerbang({ children }: { children: React.ReactNode }) {
  await requireAksesApi();
  return children;
}

export default function LayoutDeveloper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div aria-hidden className="card h-[28rem] animate-denyut" />}>
      <Gerbang>{children}</Gerbang>
    </Suspense>
  );
}

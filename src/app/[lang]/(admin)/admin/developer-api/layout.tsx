import { Suspense } from "react";
import { requireDeveloper } from "@/lib/session";

/** Panel Developer API hanya untuk peran developer; admin pun 404 (fitur belum dibuka umum). */
async function Gerbang({ children }: { children: React.ReactNode }) {
  await requireDeveloper();
  return children;
}

export default function LayoutDeveloperApi({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div aria-hidden className="card h-[28rem] animate-denyut" />}>
      <Gerbang>{children}</Gerbang>
    </Suspense>
  );
}

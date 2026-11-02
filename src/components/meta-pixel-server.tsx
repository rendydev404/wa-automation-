import { Suspense } from "react";
import { connection } from "next/server";
import { konfigMetaPixelPublik } from "@/lib/meta-pixel";
import { MetaPixelClient } from "./meta-pixel";

async function IsiMetaPixel() {
  await connection();
  let konfig;
  try {
    konfig = await konfigMetaPixelPublik();
  } catch {
    return null;
  }
  if (!konfig.aktif || !konfig.pixelId) return null;
  return <MetaPixelClient konfig={konfig} />;
}

export function MetaPixel() {
  return (
    <Suspense fallback={null}>
      <IsiMetaPixel />
    </Suspense>
  );
}

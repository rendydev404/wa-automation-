import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type Bahasa, HEADER_BAHASA, bahasaSah, pembuatT, tautan } from "./bahasa";

/**
 * Bahasa untuk Server Action & Route Handler (juga fungsi server yang sudah dinamis, mis. requireUser): dibaca dari
 * header yang dipasang proxy.ts — bahasa halaman asal (/eng/... = "en"), untuk API dari Referer.
 * Server Component biasa: pakai bahasa-halaman.ts (tanpa header, halaman statis tetap statis).
 */
export async function bahasaPermintaan(): Promise<Bahasa> {
  const h = (await headers()).get(HEADER_BAHASA);
  return bahasaSah(h) ? h : "id";
}

/** `const { b, t, href } = await teksPermintaan();` */
export async function teksPermintaan() {
  const b = await bahasaPermintaan();
  return { b, t: pembuatT(b), href: (jalur: string) => tautan(b, jalur) };
}

/** redirect() yang mempertahankan bahasa asal permintaan. */
export async function alihkanPermintaan(jalur: string): Promise<never> {
  redirect(tautan(await bahasaPermintaan(), jalur));
}

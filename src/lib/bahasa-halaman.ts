import { lang } from "next/root-params";
import { redirect } from "next/navigation";
import { type Bahasa, bahasaSah, pembuatT, tautan } from "./bahasa";

/**
 * Bahasa untuk Server Component (halaman, layout, komponen di dalamnya): segmen [lang] lewat next/root-params —
 * tanpa membaca header, jadi halaman statis tetap statis. Server Action & Route Handler: pakai bahasa-server.ts.
 */
export async function bahasaHalaman(): Promise<Bahasa> {
  const l = await lang();
  return bahasaSah(l) ? l : "id";
}

/** `const { b, t, href } = await teksHalaman();` */
export async function teksHalaman() {
  const b = await bahasaHalaman();
  return { b, t: pembuatT(b), href: (jalur: string) => tautan(b, jalur) };
}

/** redirect() dari Server Component yang mempertahankan bahasa halaman (/login -> /eng/login). */
export async function alihkanHalaman(jalur: string): Promise<never> {
  redirect(tautan(await bahasaHalaman(), jalur));
}

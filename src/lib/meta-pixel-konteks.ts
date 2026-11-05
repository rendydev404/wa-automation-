import "server-only";
import { cookies, headers } from "next/headers";
import { asalAplikasi, ipKlien } from "./batas";
import type { KonteksMeta } from "./meta-pixel-def";

/** Konteks Meta dari permintaan yang sedang berjalan (server action / route handler). */
export async function konteksMetaPermintaan(): Promise<KonteksMeta> {
  const [h, c, ip, asal] = await Promise.all([headers(), cookies(), ipKlien(), asalAplikasi()]);
  const rujukan = h.get("referer") ?? "";
  return {
    fbp: c.get("_fbp")?.value,
    fbc: c.get("_fbc")?.value,
    ip: ip === "unknown" ? undefined : ip,
    userAgent: h.get("user-agent")?.slice(0, 512),
    urlSumber: rujukan.startsWith(`${asal}/`) ? rujukan : `${asal}/`,
  };
}

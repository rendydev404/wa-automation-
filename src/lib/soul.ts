import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Aturan umum bot (SOUL) untuk penyedia AI tanpa Hermes. Sumbernya satu: hermes/SOUL-cs.md (berkas yang
 * sama yang dipasang ke profil Hermes), dibaca sekali lalu dipegang di memori. Baris komentar pertama dibuang.
 * Ikut ke build standalone lewat outputFileTracingIncludes di next.config.ts.
 */
let soul: string | null = null;

export function teksSoul(): string {
  if (soul === null) {
    const mentah = readFileSync(path.join(process.cwd(), "hermes", "SOUL-cs.md"), "utf8");
    soul = mentah.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
  }
  return soul;
}

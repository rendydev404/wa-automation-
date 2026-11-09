// Menjalankan src/lib/*.ts langsung di Node (tanpa Next): impor relatif tanpa ekstensi -> .ts,
// dan "server-only" dijadikan modul kosong.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

// Kurs USD→Rp memakai angka tetap supaya uji tidak bergantung pada jaringan; uji kurs.ts sendiri mematikannya.
process.env.KURS_USD_TETAP ??= "16500";
// Tarif model Claude: tabel cadangan tanpa jaringan; uji tarif.ts sendiri mematikannya.
process.env.TARIF_TETAP ??= "1";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    // Subpath Next tanpa "exports" (mis. "next/server") butuh ekstensi .js di ESM Node.
    if (/^next\/[a-z-]+$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
    // Alias "@/..." (tsconfig paths) -> src/..., supaya route handler (mis. webhook pembayaran) bisa diuji langsung.
    if (specifier.startsWith("@/")) {
      const dasar = path.join(SRC, specifier.slice(2));
      for (const f of [dasar, `${dasar}.ts`, path.join(dasar, "index.ts")])
        if (path.extname(f) && existsSync(f)) return { url: pathToFileURL(f).href, shortCircuit: true };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !path.extname(specifier)) {
      const kandidat = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(kandidat))) return { url: kandidat.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

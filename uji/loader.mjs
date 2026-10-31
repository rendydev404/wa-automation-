// Menjalankan src/lib/*.ts langsung di Node (tanpa Next): impor relatif tanpa ekstensi -> .ts,
// dan "server-only" dijadikan modul kosong.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Kurs USD→Rp memakai angka tetap supaya uji tidak bergantung pada jaringan; uji kurs.ts sendiri mematikannya.
process.env.KURS_USD_TETAP ??= "16500";
// Tarif model Claude: tabel cadangan tanpa jaringan; uji tarif.ts sendiri mematikannya.
process.env.TARIF_TETAP ??= "1";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !path.extname(specifier)) {
      const kandidat = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(kandidat))) return { url: kandidat.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { catatFitur } from "@/lib/analitik";
import { aplikasiMilik, sandboxMilik } from "@/lib/developer-api";
import { modeMesin } from "@/lib/mode";
import { getUser } from "@/lib/session";
import { buatZip } from "@/lib/zip";

/**
 * Unduh SDK TypeScript + contoh aplikasi starter (folder `starter/`) sebagai .zip. HANYA lewat portal Developer: akun
 * yang punya akses portal DAN punya sandbox / aplikasi disetujui, atau developer internal. Selain itu 404. Tidak
 * dipublikasikan di GitHub/npm. Dibuat sekali per proses lalu disimpan di memori (isinya statis per rilis).
 */
const g = globalThis as unknown as { __waZipStarter?: Promise<Buffer> };
const LEWATI = new Set(["node_modules", ".next", ".env", ".env.local", "tsconfig.tsbuildinfo", "next-env.d.ts"]);

async function kumpulkan(dir: string, awalan: string, hasil: { nama: string; isi: Buffer }[]): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (LEWATI.has(e.name)) continue;
    const penuh = path.join(dir, e.name);
    const nama = `${awalan}${e.name}`;
    if (e.isDirectory()) await kumpulkan(penuh, `${nama}/`, hasil);
    else if (e.isFile()) hasil.push({ nama, isi: await readFile(penuh) });
  }
}

export async function GET() {
  const tidakAda = () => new Response("Tidak ditemukan.", { status: 404, headers: { "cache-control": "no-store" } });
  if (modeMesin()) return tidakAda();
  const user = await getUser();
  if (!user) return tidakAda();
  const internal = user.peran === "developer";
  if (!internal) {
    if (!user.aksesApi) return tidakAda();
    const [sb, apl] = await Promise.all([sandboxMilik(user.id), aplikasiMilik(user.id)]);
    const punya = (sb && sb.status !== "dicabut") || apl.some((a) => a.status === "disetujui" || a.status === "ditangguhkan");
    if (!punya) return tidakAda();
  }
  const zip = await (g.__waZipStarter ??= (async () => {
    const isi: { nama: string; isi: Buffer }[] = [];
    await kumpulkan(path.join(process.cwd(), "starter"), "chatgercep-starter/", isi);
    if (!isi.length) throw new Error("folder starter kosong");
    return buatZip(isi);
  })().catch((e) => {
    g.__waZipStarter = undefined;
    throw e;
  }));
  catatFitur(user.id, "developer.unduh_starter");
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="chatgercep-starter.zip"',
      "cache-control": "no-store",
    },
  });
}

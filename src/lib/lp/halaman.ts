import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { uang } from "@/lib/format";
import { syaratJaminan } from "@/lib/jaminan-def";
import { daftarPaket } from "@/lib/langganan";
import { konfigMetaPixelPublik } from "@/lib/meta-pixel";
import { customTampil, hargaAngka, paketCustom, tautanCustom } from "@/lib/paket-custom";
import type { SlugLp } from "./def";
import { DAFTAR_INDUSTRI, INDUSTRI } from "./industri";
import { type CustomLp, type DataLp, type PaketLp, renderGaransi, renderLp } from "./template";

/**
 * Penyaji landing page industri (route src/app/[lang]/(lp)/<slug>/route.ts). Harga & pixel dibaca dari pengaturan
 * admin, lalu HTML jadi disimpan di memori proses selama UMUR_MS: satu kunjungan iklan = 0 kueri database selama
 * cache masih hangat. Perubahan harga di panel admin terlihat di LP paling lambat UMUR_MS kemudian.
 */
const UMUR_MS = 60_000;
const ASAL = process.env.APP_URL?.replace(/\/+$/, "") || "https://chatgercep.com";
const DIR_ASET = path.join(process.cwd(), "lp", "aset");

/** Minifikasi CSS ringan (komentar & spasi), sama dengan build.mjs paket asli. */
const minCss = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*\n\s*/g, "")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}");

let aset: Promise<{ css: string; js: string }> | null = null;
function bacaAset() {
  aset ??= Promise.all([readFile(path.join(DIR_ASET, "lp.css"), "utf8"), readFile(path.join(DIR_ASET, "lp.js"), "utf8")])
    .then(([css, js]) => ({ css: minCss(css), js }))
    .catch((e) => {
      aset = null; // gagal baca = coba lagi di permintaan berikutnya
      throw e;
    });
  return aset;
}

interface DataDinamis {
  paket: PaketLp[];
  custom: Omit<CustomLp, "href"> & { wa: boolean; hrefWa: (tambahan: string) => string };
  adaCustom: boolean;
  metaPixelId: string;
}

let dinamis: { kapan: number; data: Promise<DataDinamis> } | null = null;
function bacaDinamis(): Promise<DataDinamis> {
  if (dinamis && Date.now() - dinamis.kapan < UMUR_MS) return dinamis.data;
  const data = (async (): Promise<DataDinamis> => {
    const [paket, custom, pixel] = await Promise.all([
      daftarPaket(),
      paketCustom(),
      konfigMetaPixelPublik().catch(() => ({ aktif: false, pixelId: "" })),
    ]);
    const kuota = custom.tampil_kuota ? `${custom.kuota_nomor.toLocaleString("id-ID")} nomor · ${custom.kuota_balasan.toLocaleString("id-ID")} balasan AI` : "Jumlah nomor & kuota disesuaikan";
    return {
      paket: paket
        .filter((p) => p.harga > 0)
        .map((p) => ({
          kode: p.kode,
          nama: p.nama,
          harga: p.harga,
          durasi_hari: p.durasi_hari,
          kuota_nomor: p.kuota_nomor,
          kuota_balasan: p.kuota_balasan,
          deskripsi: p.deskripsi,
          unggulan: p.unggulan,
        })),
      adaCustom: customTampil(custom),
      custom: {
        nama: custom.nama,
        label: hargaAngka(custom) ? uang(custom.harga) : custom.teks_harga,
        catatan: custom.deskripsi,
        poin: kuota,
        tombol: custom.tombol || "Hubungi kami",
        luar: custom.aksi === "wa",
        wa: custom.aksi === "wa",
        hrefWa: (tambahan) => tautanCustom(custom, tambahan),
      },
      metaPixelId: pixel.aktif ? pixel.pixelId : "",
    };
  })();
  dinamis = { kapan: Date.now(), data };
  // Gagal (mis. database sesaat tak terjangkau) = jangan disimpan; permintaan berikutnya mencoba lagi.
  data.catch(() => {
    if (dinamis?.data === data) dinamis = null;
  });
  return data;
}

const html = new Map<string, { kapan: number; isi: string }>();

const KEPALA = {
  "content-type": "text/html; charset=utf-8",
  // Browser & CDN boleh menyimpan sebentar; harga baru tetap tampil dalam hitungan menit.
  "cache-control": "public, max-age=60, stale-while-revalidate=300",
};

async function halamanIndustri(slug: SlugLp): Promise<string> {
  const ada = html.get(slug);
  if (ada && Date.now() - ada.kapan < UMUR_MS) return ada.isi;
  const ind = INDUSTRI[slug];
  const [{ css, js }, dd] = await Promise.all([
    bacaAset(),
    bacaDinamis().catch(() => null), // database tak terjangkau: LP tetap tampil, bagian harga mengarah ke halaman utama
  ]);
  const data: DataLp = {
    paket: dd?.paket ?? [],
    custom: dd?.adaCustom
      ? { ...dd.custom, href: dd.custom.wa ? dd.custom.hrefWa(`Usaha saya: ${ind.industry_short}.`) : "/daftar" }
      : null,
    metaPixelId: dd?.metaPixelId ?? "",
    adaOg: existsSync(path.join(process.cwd(), "public", "lp-assets", "og", `${slug}.png`)),
    asal: ASAL,
    css,
    js,
  };
  const isi = renderLp(ind, DAFTAR_INDUSTRI, data);
  if (dd) html.set(slug, { kapan: Date.now(), isi }); // versi tanpa harga (database gagal) tidak disimpan
  return isi;
}

const tolakBahasa = (lang: string) => (lang === "id" ? null : new Response("Not found", { status: 404 }));

/** Handler GET untuk satu slug LP. Hanya versi Indonesia (/eng/<slug> = 404). */
export function routeLp(slug: SlugLp) {
  return async function GET(_req: Request, ctx: { params: Promise<{ lang: string }> }): Promise<Response> {
    await connection(); // dirender saat permintaan (harga dari database), bukan saat build
    const tolak = tolakBahasa((await ctx.params).lang);
    if (tolak) return tolak;
    return new Response(await halamanIndustri(slug), { headers: KEPALA });
  };
}

let garansi: string | null = null;
export async function GET_GARANSI(_req: Request, ctx: { params: Promise<{ lang: string }> }): Promise<Response> {
  await connection();
  const tolak = tolakBahasa((await ctx.params).lang);
  if (tolak) return tolak;
  garansi ??= renderGaransi(syaratJaminan((id) => id), { asal: ASAL, css: (await bacaAset()).css });
  return new Response(garansi, { headers: { ...KEPALA, "cache-control": "public, max-age=3600" } });
}

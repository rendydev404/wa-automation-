import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fiturBoleh } from "@/lib/mesin/lisensi";
import { ipKlien } from "@/lib/batas";
import { BATAS_DEMO, COOKIE_DRAF, UMUR_COOKIE_DRAF, rapikanIsian } from "@/lib/demo-bot-def";
import { TOKEN_SAH, jawabDemo, tokenBaru } from "@/lib/demo-bot";
import { jenisUsahaSah } from "@/lib/templat-usaha";

/**
 * Bot instan di landing (publik, tanpa login): satu balasan AI dari isian info usaha pengunjung. Batas pemakaian &
 * penyimpanan draf ada di src/lib/demo-bot.ts. Hanya dari halaman situs ini sendiri (Origin sama) supaya tidak dipakai
 * sebagai API AI gratis oleh situs lain.
 */
export async function POST(req: Request) {
  if (!fiturBoleh("ai")) return NextResponse.json({ error: "Demo sedang tidak tersedia." }, { status: 403 });
  const asal = req.headers.get("origin");
  if (asal && new URL(asal).host !== new URL(req.url).host && new URL(asal).host !== req.headers.get("host")) {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 403 });
  }
  const b = (await req.json().catch(() => null)) as { isian?: Record<string, unknown>; pesan?: unknown; riwayat?: unknown; en?: unknown } | null;
  const en = b?.en === true;
  const t = (id: string, eng: string) => (en ? eng : id);
  const isian = rapikanIsian(b?.isian ?? {}, jenisUsahaSah);
  if (!isian) return NextResponse.json({ error: t("Isi nama usaha dan produk/harga dulu.", "Fill in your business name and products/prices first.") }, { status: 400 });
  const pesan = typeof b?.pesan === "string" ? b.pesan.trim() : "";
  if (!pesan || pesan.length > BATAS_DEMO.pesan) return NextResponse.json({ error: t("Pesan kosong atau terlalu panjang.", "The message is empty or too long.") }, { status: 400 });
  const riwayat = Array.isArray(b?.riwayat)
    ? b.riwayat.slice(-12).flatMap((m: unknown) => {
        const x = m as { ai?: unknown; teks?: unknown };
        return typeof x?.teks === "string" ? [{ ai: x.ai === true, teks: x.teks.slice(0, 500) }] : [];
      })
    : [];

  const toples = await cookies();
  const lama = toples.get(COOKIE_DRAF)?.value;
  const token = lama && TOKEN_SAH.test(lama) ? lama : tokenBaru();
  let h;
  try {
    h = await jawabDemo({ token, ip: await ipKlien(), isian, pesan, riwayat });
  } catch (e) {
    console.warn("[demo-bot] gagal:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: t("AI sedang sibuk. Coba lagi sebentar lagi.", "The AI is busy. Please try again shortly.") }, { status: 503 });
  }
  const res = h.ok
    ? NextResponse.json({ teks: h.teks, sisa: h.sisa, abaikan: !!h.abaikan })
    : NextResponse.json({ batas: h.batas }, { status: 429 });
  if (h.token !== lama) res.cookies.set(COOKIE_DRAF, h.token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: UMUR_COOKIE_DRAF, secure: req.url.startsWith("https://") });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

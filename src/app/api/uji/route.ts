import { NextResponse } from "next/server";
import { formatWa } from "@/lib/bridge";
import { tanyaHermes } from "@/lib/hermes";
import { susunSistem } from "@/lib/knowledge";
import { TOLAK_KODE, adaKode } from "@/lib/penjaga";
import { type Foto, MAKS_FOTO_BYTE } from "@/lib/types";
import { sesiDanNomor } from "@/lib/akses";
import { terlaluSering } from "@/lib/batas";

/** Uji bot dari dashboard: jalur yang sama dengan WhatsApp (knowledge nomor + Hermes), tanpa mengirim WA. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { numberId?: number; pesan?: string; sesi?: string; kueriLalu?: string; foto?: string } | null;
  const { user, nomor } = await sesiDanNomor(b?.numberId);
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Silakan login kembali." }, { status: 401 });
  // Uji memakai kuota AI yang sama dengan WhatsApp: dibatasi per akun.
  if (terlaluSering(`uji:${user.id}`, 30, 10 * 60_000)) return NextResponse.json({ error: "Terlalu banyak uji. Tunggu beberapa menit." }, { status: 429 });
  const teksPesan = b?.pesan?.trim() ?? "";
  const sesi = b?.sesi ?? "";
  if (!nomor) return NextResponse.json({ error: "Nomor tidak ditemukan." }, { status: 404 });
  // Foto uji (opsional): data URL gambar yang sudah diperkecil di browser, diperlakukan sama dengan foto dari WhatsApp.
  let gambar: Foto[] = [];
  if (b?.foto) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.foto);
    if (!m || (m[2].length * 3) / 4 > MAKS_FOTO_BYTE) return NextResponse.json({ error: "Foto tidak valid atau lebih dari 3,7 MB." }, { status: 400 });
    gambar = [{ mime: m[1] as Foto["mime"], data: m[2] }];
  }
  if ((!teksPesan && !gambar.length) || teksPesan.length > 2000) return NextResponse.json({ error: "Pesan kosong atau terlalu panjang." }, { status: 400 });
  if (!/^[a-z0-9]{8,24}$/.test(sesi)) return NextResponse.json({ error: "Sesi uji tidak valid." }, { status: 400 });
  const pesan = gambar.length ? (teksPesan ? `${teksPesan}\n[Pelanggan melampirkan foto]` : "[Pelanggan mengirim foto]") : teksPesan;

  const { sistem, konteks, pelajaran } = await susunSistem(nomor, `${(b?.kueriLalu ?? "").slice(0, 2000)}\n${teksPesan}`, { adaFoto: gambar.length > 0 });
  try {
    const j = await tanyaHermes({ sessionId: `uji-${user.id}-${nomor.id}-${sesi}`, sistem, pesan, gambar });
    // Penjaga yang sama dengan WhatsApp, supaya hasil uji mencerminkan yang benar-benar terkirim.
    const diblokir = adaKode(j.teks);
    const teks = diblokir ? TOLAK_KODE : formatWa(j.teks);
    return NextResponse.json({ teks, ms: j.ms, mode: konteks.mode, karakterKonteks: konteks.karakter, pelajaran, diblokir });
  } catch (e) {
    return NextResponse.json({ error: `AI tidak menjawab: ${e instanceof Error ? e.message : "galat"}` }, { status: 502 });
  }
}

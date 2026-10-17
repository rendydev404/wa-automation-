import { NextResponse } from "next/server";
import { formatWa } from "@/lib/bridge";
import { tanyaHermes } from "@/lib/hermes";
import { susunSistem } from "@/lib/knowledge";
import { nomorById } from "@/lib/numbers";
import { TOLAK_KODE, adaKode } from "@/lib/penjaga";
import { getUser } from "@/lib/session";

/** Uji bot dari dashboard: jalur yang sama dengan WhatsApp (knowledge nomor + Hermes), tanpa mengirim WA. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Silakan login kembali." }, { status: 401 });

  const b = (await req.json().catch(() => null)) as { numberId?: number; pesan?: string; sesi?: string; kueriLalu?: string } | null;
  const pesan = b?.pesan?.trim() ?? "";
  const sesi = b?.sesi ?? "";
  const nomor = await nomorById(Number(b?.numberId));
  if (!nomor) return NextResponse.json({ error: "Nomor tidak ditemukan." }, { status: 404 });
  if (!pesan || pesan.length > 2000) return NextResponse.json({ error: "Pesan kosong atau terlalu panjang." }, { status: 400 });
  if (!/^[a-z0-9]{8,24}$/.test(sesi)) return NextResponse.json({ error: "Sesi uji tidak valid." }, { status: 400 });

  const { sistem, konteks, pelajaran } = await susunSistem(nomor, `${(b?.kueriLalu ?? "").slice(0, 2000)}\n${pesan}`);
  try {
    const j = await tanyaHermes({ sessionId: `uji-${user.id}-${nomor.id}-${sesi}`, sistem, pesan });
    // Penjaga yang sama dengan WhatsApp, supaya hasil uji mencerminkan yang benar-benar terkirim.
    const diblokir = adaKode(j.teks);
    const teks = diblokir ? TOLAK_KODE : formatWa(j.teks);
    return NextResponse.json({ teks, ms: j.ms, mode: konteks.mode, karakterKonteks: konteks.karakter, pelajaran, diblokir });
  } catch (e) {
    return NextResponse.json({ error: `AI tidak menjawab: ${e instanceof Error ? e.message : "galat"}` }, { status: 502 });
  }
}

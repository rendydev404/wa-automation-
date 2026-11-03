import { NextResponse } from "next/server";
import { formatWa } from "@/lib/bridge";
import { tanpaIngatan, tanyaAiTerjaga } from "@/lib/ai";
import { aiUntukAkun } from "@/lib/langganan";
import { susunSistem } from "@/lib/knowledge";
import { TOLAK_KODE, adaKode } from "@/lib/penjaga";
import { bisaTeruskan } from "@/lib/penerusan";
import { siapDipakai } from "@/lib/numbers";
import { JENIS_TERUSKAN, PERLU_PENERUS } from "@/lib/teruskan";
import { type Foto, MAKS_FOTO_BYTE } from "@/lib/types";
import { sesiDanNomor } from "@/lib/akses";
import { terlaluSering } from "@/lib/batas";
import { alasanSpam, periksaSpam } from "@/lib/spam";
import { type KirimProduk, type Produk, captionProduk, daftarProduk, katalogBoleh, perluDaftar, pilihUntukKirim, teksKatalog } from "@/lib/katalog";

/** Yang akan terkirim di WhatsApp untuk tag katalog, dalam bentuk yang bisa ditampilkan Uji bot. */
function kirimanUji(katalog: Produk[], tag: KirimProduk | null, jawaban: string) {
  if (!tag) return null;
  const p = pilihUntukKirim(katalog, tag);
  return { daftar: p.daftarTeks && perluDaftar(jawaban, katalog) ? teksKatalog(katalog) : "", foto: p.foto.map((x) => ({ id: x.id, caption: captionProduk(x) })) };
}

/** Uji bot dari dashboard: jalur yang sama dengan WhatsApp (knowledge nomor + penyedia AI aktif), tanpa mengirim WA. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as {
    numberId?: number;
    pesan?: string;
    sesi?: string;
    kueriLalu?: string;
    foto?: string;
    riwayat?: { ai?: boolean; teks?: string }[];
  } | null;
  const { user, nomor } = await sesiDanNomor(b?.numberId);
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Silakan login kembali." }, { status: 401 });
  // Uji memakai kuota AI yang sama dengan WhatsApp: dibatasi per akun.
  if (terlaluSering(`uji:${user.id}`, 30, 10 * 60_000)) return NextResponse.json({ error: "Terlalu banyak uji. Tunggu beberapa menit." }, { status: 429 });
  const teksPesan = b?.pesan?.trim() ?? "";
  const sesi = b?.sesi ?? "";
  if (!nomor) return NextResponse.json({ error: "Nomor tidak ditemukan." }, { status: 404 });
  if (!siapDipakai(nomor)) return NextResponse.json({ error: PERLU_PENERUS }, { status: 400 });
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
  // Penyaring spam sama dengan WhatsApp (chat uji = lawan bicara yang belum dikenal).
  const saringSpam = nomor.saring_spam;
  const lokal = saringSpam ? periksaSpam(teksPesan) : null;
  if (lokal?.spam) return NextResponse.json({ teks: "", ms: 0, abaikan: `${alasanSpam(lokal)}, tanpa memanggil AI` });

  // Percakapan uji sejauh ini (dikirim browser). Penyedia tanpa ingatan (Claude API) menerimanya di pesan sistem;
  // untuk semua penyedia ia juga sumber fakta bagi pemeriksa jawaban.
  // Penyedia sama seperti balasan WhatsApp nomor ini (menurut paket pemilik nomor bila mode "per_paket").
  const [ai, teruskan, katalog] = await Promise.all([
    aiUntukAkun(nomor.user_id),
    bisaTeruskan(nomor),
    katalogBoleh(nomor.user_id).then((ok) => (ok || user.peran === "admin" ? daftarProduk(nomor.id) : [])),
  ]);
  const lengkap = tanpaIngatan(ai.penyedia);
  const semuaRiwayat = Array.isArray(b?.riwayat)
    ? b.riwayat.slice(-12).map((m) => `${m.ai ? "Kamu (AI)" : "Pelanggan"}: ${String(m.teks ?? "").replace(/\s*\n\s*/g, " / ").slice(0, 500)}`)
    : [];
  const { sistem, konteks, pelajaran } = await susunSistem(nomor, `${(b?.kueriLalu ?? "").slice(0, 2000)}\n${teksPesan}`, {
    adaFoto: gambar.length > 0,
    riwayat: lengkap ? semuaRiwayat : [],
    riwayatLengkap: lengkap,
    teruskan,
    saringSpam,
    katalog,
    nilaiPesan: nomor.saring_prospek,
  });
  // Nama mesin/model, biaya, dan galat mentah hanya untuk admin; pengguna biasa tidak perlu tahu mesin di baliknya.
  const admin = user.peran === "admin";
  try {
    const j = await tanyaAiTerjaga({ sessionId: `uji-${user.id}-${nomor.id}-${sesi}`, sistem, pesan, gambar, paksa: { penyedia: ai.penyedia }, cadanganHermes: ai.cadanganHermes }, [sistem, pesan, ...semuaRiwayat].join("\n"), { teruskan, saringSpam, katalog: katalog.length > 0, gaya: true, nilai: nomor.saring_prospek });
    if (j.abaikan) return NextResponse.json({ teks: "", ms: j.ms, abaikan: `Dinilai AI: ${j.abaikan.jenis}${j.abaikan.alasan ? ` (${j.abaikan.alasan})` : ""}` });
    // AI menilai pesan ini tidak perlu dibalas (ucapan penutup saat urusan sudah tuntas).
    if (!j.teks && j.nilai) return NextResponse.json({ teks: "", ms: j.ms, selesai: true, nilai: j.nilai });
    // Penjaga yang sama dengan WhatsApp, supaya hasil uji mencerminkan yang benar-benar terkirim.
    const diblokir = adaKode(j.teks);
    const teks = diblokir ? TOLAK_KODE : formatWa(j.teks);
    return NextResponse.json({
      teks,
      ms: j.ms,
      mode: konteks.mode,
      karakterKonteks: konteks.karakter,
      pelajaran,
      diblokir,
      // Penilaian AI atas pesan ini (penyaring prospek): prospek / netral / selesai / bukan.
      nilai: j.nilai,
      // Untuk admin yang menguji: mesin & model yang menjawab, biayanya, dan draf pertama yang ditolak pemeriksa
      // (jenis pelanggarannya) lalu ditulis ulang / diganti jawaban aman.
      ...(admin ? { model: j.model, biayaUsd: j.biayaUsd, koreksi: j.pelanggaran.map((x) => x.jenis), aman: j.aman } : {}),
      // Di WhatsApp ini dikirim ke nomor pribadi pemilik; di uji hanya ditampilkan.
      teruskan: j.teruskan ? { label: JENIS_TERUSKAN[j.teruskan.jenis].label, ringkasan: j.teruskan.ringkasan } : null,
      // Di WhatsApp ini dikirim sebagai pesan terpisah setelah jawaban: daftar katalog dan/atau foto produk.
      katalog: kirimanUji(katalog, j.kirimProduk, teks),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "galat";
    if (!admin) console.error(`[uji] AI tidak menjawab user=${user.id} nomor=${nomor.id}: ${detail}`);
    return NextResponse.json({ error: admin ? `AI tidak menjawab: ${detail}` : "AI sedang tidak bisa menjawab. Coba lagi sebentar lagi." }, { status: 502 });
  }
}

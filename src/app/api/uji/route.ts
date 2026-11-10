import { NextResponse } from "next/server";
import { formatWa } from "@/lib/bridge";
import { tanpaIngatan, tanyaAiTerjaga } from "@/lib/ai";
import { aiUntukAkun } from "@/lib/langganan";
import { adaKnowledge, susunSistem } from "@/lib/knowledge";
import { TOLAK_KODE, adaKode } from "@/lib/penjaga";
import { type Foto, MAKS_FOTO_BYTE } from "@/lib/types";
import { sesiDanNomor } from "@/lib/akses";
import { catatFitur } from "@/lib/analitik";
import { teksPermintaan } from "@/lib/bahasa-server";
import { terlaluSering } from "@/lib/batas";
import { alasanSpam, periksaSpam } from "@/lib/spam";
import { type KirimProduk, type Produk, captionProduk, daftarProduk, katalogBoleh, perluDaftar, pilihUntukKirim, teksKatalog } from "@/lib/katalog";
import { staf } from "@/lib/peran";

/** Nama jenis pesan yang diabaikan AI, untuk tampilan Uji bot versi Inggris. */
const JENIS_ABAIKAN_EN: Record<string, string> = { judi: "gambling", promosi: "promotion", penipuan: "scam", asusila: "adult content" };

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
  const [{ user, nomor }, { t }] = await Promise.all([sesiDanNomor(b?.numberId), teksPermintaan()]);
  if (!user) return NextResponse.json({ error: t("Sesi berakhir. Silakan login kembali.", "Your session has ended. Please sign in again.") }, { status: 401 });
  // Uji memakai kuota AI yang sama dengan WhatsApp: dibatasi per akun.
  if (terlaluSering(`uji:${user.id}`, 30, 10 * 60_000)) return NextResponse.json({ error: t("Terlalu banyak uji. Tunggu beberapa menit.", "Too many tests. Please wait a few minutes.") }, { status: 429 });
  const teksPesan = b?.pesan?.trim() ?? "";
  const sesi = b?.sesi ?? "";
  if (!nomor) return NextResponse.json({ error: t("Nomor tidak ditemukan.", "Number not found.") }, { status: 404 });
  // Aturan pakai: AI hanya bisa dipakai setelah product knowledge nomor ini diisi.
  if (!(await adaKnowledge(nomor.id))) {
    return NextResponse.json(
      { error: t("Isi dulu tab Informasi Usaha, lalu coba lagi di sini.", "Fill in the Business Info tab first, then try again here.") },
      { status: 409 },
    );
  }
  // Foto uji (opsional): data URL gambar yang sudah diperkecil di browser, diperlakukan sama dengan foto dari WhatsApp.
  let gambar: Foto[] = [];
  if (b?.foto) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.foto);
    if (!m || (m[2].length * 3) / 4 > MAKS_FOTO_BYTE) return NextResponse.json({ error: t("Foto tidak valid atau lebih dari 3,7 MB.", "The photo is invalid or larger than 3.7 MB.") }, { status: 400 });
    gambar = [{ mime: m[1] as Foto["mime"], data: m[2] }];
  }
  if ((!teksPesan && !gambar.length) || teksPesan.length > 2000) return NextResponse.json({ error: t("Pesan kosong atau terlalu panjang.", "The message is empty or too long.") }, { status: 400 });
  if (!/^[a-z0-9]{8,24}$/.test(sesi)) return NextResponse.json({ error: t("Sesi uji tidak valid.", "Invalid test session.") }, { status: 400 });
  const pesan = gambar.length ? (teksPesan ? `${teksPesan}\n[Pelanggan melampirkan foto]` : "[Pelanggan mengirim foto]") : teksPesan;
  // Analitik: setiap jawaban uji yang berhasil (termasuk yang disaring/diabaikan) = satu pemakaian fitur; galat tidak.
  const kodeUji = gambar.length ? "uji.kirim_foto" : "uji.kirim";
  const jawab = (isi: object) => {
    catatFitur(user.id, kodeUji);
    return NextResponse.json(isi);
  };
  // Penyaring spam sama dengan WhatsApp (chat uji = lawan bicara yang belum dikenal).
  const saringSpam = nomor.saring_spam;
  const lokal = saringSpam ? periksaSpam(teksPesan) : null;
  if (lokal?.spam)
    return jawab({
      teks: "",
      ms: 0,
      abaikan: t(`${alasanSpam(lokal)}, tanpa memanggil AI`, `Online gambling promotion (${lokal.sinyal.slice(0, 4).join(", ")}), without calling the AI`),
    });

  // Percakapan uji sejauh ini (dikirim browser). Penyedia tanpa ingatan (Claude API) menerimanya di pesan sistem;
  // untuk semua penyedia ia juga sumber fakta bagi pemeriksa jawaban.
  // Penyedia sama seperti balasan WhatsApp nomor ini (menurut paket pemilik nomor bila mode "per_paket").
  const [ai, katalog] = await Promise.all([
    aiUntukAkun(nomor.user_id),
    katalogBoleh(nomor.user_id).then((ok) => (ok || staf(user.peran) ? daftarProduk(nomor.id) : [])),
  ]);
  const lengkap = tanpaIngatan(ai.penyedia);
  const semuaRiwayat = Array.isArray(b?.riwayat)
    ? b.riwayat.slice(-12).map((m) => `${m.ai ? "Kamu (AI)" : "Pelanggan"}: ${String(m.teks ?? "").replace(/\s*\n\s*/g, " / ").slice(0, 500)}`)
    : [];
  const { sistem, konteks, pelajaran } = await susunSistem(nomor, `${(b?.kueriLalu ?? "").slice(0, 2000)}\n${teksPesan}`, {
    adaFoto: gambar.length > 0,
    riwayat: lengkap ? semuaRiwayat : [],
    riwayatLengkap: lengkap,
    saringSpam,
    katalog,
    nilaiPesan: nomor.saring_prospek,
  });
  // Nama mesin/model, biaya, dan galat mentah hanya untuk admin; pengguna biasa tidak perlu tahu mesin di baliknya.
  const admin = staf(user.peran);
  try {
    const j = await tanyaAiTerjaga({ sessionId: `uji-${user.id}-${nomor.id}-${sesi}`, sistem, pesan, gambar, paksa: { penyedia: ai.penyedia }, cadanganHermes: ai.cadanganHermes }, [sistem, pesan, ...semuaRiwayat].join("\n"), { saringSpam, katalog: katalog.length > 0, gaya: true, nilai: nomor.saring_prospek });
    if (j.abaikan) {
      const alasan = j.abaikan.alasan ? ` (${j.abaikan.alasan})` : "";
      return jawab({
        teks: "",
        ms: j.ms,
        abaikan: t(`Dinilai AI: ${j.abaikan.jenis}${alasan}`, `Flagged by the AI: ${JENIS_ABAIKAN_EN[j.abaikan.jenis] ?? j.abaikan.jenis}${alasan}`),
      });
    }
    // AI menilai pesan ini tidak perlu dibalas (ucapan penutup saat urusan sudah tuntas).
    if (!j.teks && j.nilai) return jawab({ teks: "", ms: j.ms, selesai: true, nilai: j.nilai });
    // Penjaga yang sama dengan WhatsApp, supaya hasil uji mencerminkan yang benar-benar terkirim.
    const diblokir = adaKode(j.teks);
    const teks = diblokir ? TOLAK_KODE : formatWa(j.teks);
    return jawab({
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
      // Di WhatsApp ini dikirim sebagai pesan terpisah setelah jawaban: daftar katalog dan/atau foto produk.
      katalog: kirimanUji(katalog, j.kirimProduk, teks),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "galat";
    if (!admin) console.error(`[uji] AI tidak menjawab user=${user.id} nomor=${nomor.id}: ${detail}`);
    return NextResponse.json({ error: admin ? `AI tidak menjawab: ${detail}` : t("AI sedang tidak bisa menjawab. Coba lagi sebentar lagi.", "The AI can't answer right now. Please try again shortly.") }, { status: 502 });
  }
}

import { formatWa } from "@/lib/bridge";
import { tanpaIngatan, tanyaAiTerjaga } from "@/lib/ai";
import { aiUntukAkun } from "@/lib/langganan";
import { adaKnowledge, susunSistem } from "@/lib/knowledge";
import { daftarProduk } from "@/lib/katalog";
import { nomorById } from "@/lib/numbers";
import { TOLAK_KODE, adaKode } from "@/lib/penjaga";
import { aman, bacaJson, bukanKonteks, galat, hitungLaju, idJalur, ok, otorisasi } from "@/lib/mesin/api";

/** Batas pemanggilan AI per key (biaya AI milik pemilik mesin, tetap dijaga dari lonjakan tak sengaja). */
const AI_PER_MENIT = Math.max(1, Number(process.env.API_AI_PER_MENIT) || 60);

/**
 * POST /api/v1/ai/jawab {nomor_id, pertanyaan, id_sesi?, riwayat?: [{ai, teks}]}
 *   -> {jawaban, ms, token: {masuk, keluar}}
 * Jalur yang sama dengan balasan WhatsApp & Uji bot: product knowledge nomor + penjaga jawaban, tanpa mengirim WA.
 * Penyedia tanpa ingatan (Claude API / kompatibel OpenAI) memakai `riwayat` yang dikirim pemanggil.
 */
export async function POST(req: Request) {
  const k = await otorisasi(req, "ai");
  if (bukanKonteks(k)) return k;
  const laju = hitungLaju(`ai:${k.awalan}`, AI_PER_MENIT, 60_000);
  if (!laju.boleh) return galat("terlalu_sering", `Maks ${AI_PER_MENIT} panggilan AI per menit per key.`, k.id, laju.kepala);
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const salah = (pesan: string) => galat("isian_tidak_sah", pesan, k.id, k.kepala);
    const id = idJalur(String(b.data.nomor_id ?? ""));
    const nomor = id ? await nomorById(id) : undefined;
    if (!nomor) return galat("tidak_ditemukan", "Nomor tidak ditemukan.", k.id, k.kepala);
    const pertanyaan = typeof b.data.pertanyaan === "string" ? b.data.pertanyaan.trim() : "";
    if (!pertanyaan || pertanyaan.length > 4000) return salah("`pertanyaan` wajib diisi (maks 4.000 karakter).");
    const sesi = typeof b.data.id_sesi === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(b.data.id_sesi) ? b.data.id_sesi : "umum";
    if (!(await adaKnowledge(nomor.id))) return salah("Isi Informasi Usaha nomor ini dulu (POST /nomor/{id}/knowledge).");
    const riwayat = Array.isArray(b.data.riwayat)
      ? (b.data.riwayat as { ai?: unknown; teks?: unknown }[]).slice(-12).map((m) => `${m?.ai ? "Kamu (AI)" : "Pelanggan"}: ${String(m?.teks ?? "").replace(/\s*\n\s*/g, " / ").slice(0, 500)}`)
      : [];
    const [ai, katalog] = await Promise.all([aiUntukAkun(nomor.user_id), daftarProduk(nomor.id)]);
    const lengkap = tanpaIngatan(ai.penyedia);
    const { sistem } = await susunSistem(nomor, pertanyaan, { riwayat: lengkap ? riwayat : [], riwayatLengkap: lengkap, saringSpam: nomor.saring_spam, katalog });
    let j;
    try {
      j = await tanyaAiTerjaga(
        { sessionId: `api-${nomor.id}-${sesi}`, sistem, pesan: pertanyaan, paksa: { penyedia: ai.penyedia }, cadanganHermes: ai.cadanganHermes },
        [sistem, pertanyaan, ...riwayat].join("\n"),
        { saringSpam: nomor.saring_spam, katalog: katalog.length > 0, gaya: true },
      );
    } catch (e) {
      console.error(`[api ${k.id}] AI tidak menjawab nomor=${nomor.id}: ${e instanceof Error ? e.message : e}`);
      return galat("ai_tidak_tersedia", "AI sedang tidak bisa menjawab. Coba lagi sebentar lagi.", k.id, k.kepala);
    }
    const token = { masuk: j.tokenMasuk, keluar: j.tokenKeluar };
    if (j.abaikan) return ok({ jawaban: "", ms: j.ms, token, abaikan: j.abaikan.jenis }, k);
    const jawaban = adaKode(j.teks) ? TOLAK_KODE : formatWa(j.teks);
    return ok({ jawaban, ms: j.ms, token }, k);
  });
}

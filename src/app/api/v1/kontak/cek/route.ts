import { rapikanNomorWa } from "@/lib/format";
import { nomorById } from "@/lib/numbers";
import { WaError, cekTerdaftar } from "@/lib/wa";
import { aman, bacaJson, bukanKonteks, galat, hitungLaju, idJalur, ok, otorisasi } from "@/lib/mesin/api";
import { sandboxAktif, tujuanNomorUji } from "@/lib/mesin/lisensi";

/** Maks nomor per panggilan & per menit per key: cek massal = pola yang dicurigai WhatsApp (risiko blokir). */
const MAKS_PER_PANGGILAN = 20;
const MAKS_PER_MENIT = Math.max(1, Number(process.env.API_CEK_KONTAK_PER_MENIT) || 60);

/**
 * POST /api/v1/kontak/cek {nomor_id, nomor: ["0812…", "6281…"]}
 *   -> {data: [{nomor, terdaftar}]} (urutan sama dengan masukan; nomor tidak sah = terdaftar false + sah false).
 * Dicek lewat nomor WhatsApp `nomor_id` yang sedang terhubung.
 */
export async function POST(req: Request) {
  const k = await otorisasi(req, "kontak.cek");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const salah = (pesan: string) => galat("isian_tidak_sah", pesan, k.id, k.kepala);
    const id = idJalur(String(b.data.nomor_id ?? ""));
    const nomor = id ? await nomorById(id) : undefined;
    if (!nomor) return galat("tidak_ditemukan", "Nomor tidak ditemukan.", k.id, k.kepala);
    const masuk = b.data.nomor;
    if (!Array.isArray(masuk) || !masuk.length || masuk.length > MAKS_PER_PANGGILAN) return salah(`\`nomor\` wajib larik berisi 1–${MAKS_PER_PANGGILAN} nomor HP.`);
    // Dihitung per nomor, bukan per panggilan.
    const laju = hitungLaju(`cek:${k.awalan}`, MAKS_PER_MENIT, 60_000, masuk.length);
    if (!laju.boleh) return galat("terlalu_sering", `Maks ${MAKS_PER_MENIT} nomor dicek per menit per key.`, k.id, laju.kepala);
    const rapi = masuk.map((x) => ({ asli: String(x ?? "").slice(0, 40), digit: rapikanNomorWa(String(x ?? "")) }));
    // Sandbox: hanya nomor uji (sandbox tidak boleh dipakai menyaring daftar nomor).
    if (sandboxAktif() && rapi.some((r) => !r.digit || !tujuanNomorUji(r.digit))) return galat("bukan_nomor_uji", "Sandbox hanya boleh mengecek nomor uji yang terverifikasi.", k.id, k.kepala);
    const sah = [...new Set(rapi.map((r) => r.digit).filter((d): d is string => !!d))];
    let hasil: Map<string, string | null>;
    try {
      hasil = await cekTerdaftar(nomor.sesi, sah);
    } catch (e) {
      if (e instanceof WaError) return galat("nomor_belum_terhubung", e.message, k.id, k.kepala);
      throw e;
    }
    return ok({ data: rapi.map((r) => ({ nomor: r.digit ?? r.asli, sah: !!r.digit, terdaftar: !!(r.digit && hasil.get(r.digit)) })) }, k);
  });
}

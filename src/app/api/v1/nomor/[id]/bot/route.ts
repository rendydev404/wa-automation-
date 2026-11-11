import {
  BATAS_JEDA_DETIK,
  BATAS_TUNGGU_BACA_DETIK,
  BATAS_TUNGGU_DETIK,
  type Nomor,
  nomorById,
  setBelajar,
  setBotAktif,
  setSaringProspek,
  setSaringSpam,
  ubahNomor,
} from "@/lib/numbers";
import { MAKS_INSTRUKSI } from "@/lib/templat-ai-def";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { fiturBoleh } from "@/lib/mesin/lisensi";

/** Sakelar yang dikunci fitur katalognya sendiri (spam/belajar/ml berdiri sendiri, terpisah dari `bot`). */
const FITUR_SAKELAR = { saring_spam: "spam", saring_prospek: "ml", belajar: "belajar" } as const;

type Ctx = { params: Promise<{ id: string }> };

const bentukBot = (n: Nomor) => ({
  nomor_id: String(n.id),
  bot_aktif: n.bot_aktif,
  instruksi: n.instruksi,
  tunggu_detik: n.tunggu_detik,
  tunggu_baca_detik: n.tunggu_baca_detik,
  jeda_detik: n.jeda_detik,
  // Nilai efektif: fitur yang tidak dibuka = false, walau tersimpan menyala (dipakai lagi begitu fitur dibuka).
  saring_spam: n.saring_spam && fiturBoleh("spam"),
  saring_prospek: n.saring_prospek && fiturBoleh("ml"),
  belajar: n.belajar && fiturBoleh("belajar"),
});

/** GET /api/v1/nomor/{id}/bot: pengaturan bot AI nomor ini. */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "bot");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    return ok(bentukBot(n), k);
  });
}

const angkaDalam = (v: unknown, b: { min: number; maks: number }): number | null => {
  const x = Number(v);
  return Number.isInteger(x) && x >= b.min && x <= b.maks ? x : null;
};

const SAKELAR = ["bot_aktif", "saring_spam", "saring_prospek", "belajar"] as const;

/**
 * PATCH /api/v1/nomor/{id}/bot {bot_aktif?, instruksi?, tunggu_detik?, tunggu_baca_detik?, jeda_detik?, saring_spam?,
 * saring_prospek?, belajar?}: hanya kolom yang dikirim yang diubah.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "bot");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const d = b.data;
    const salah = (pesan: string) => galat("isian_tidak_sah", pesan, k.id, k.kepala);
    for (const s of SAKELAR) if (d[s] !== undefined && typeof d[s] !== "boolean") return salah(`${s} harus true/false.`);
    for (const [kolom, fitur] of Object.entries(FITUR_SAKELAR) as [keyof typeof FITUR_SAKELAR, (typeof FITUR_SAKELAR)[keyof typeof FITUR_SAKELAR]][])
      if (d[kolom] !== undefined && !fiturBoleh(fitur)) return galat("fitur_tidak_dibuka", `Fitur '${fitur}' belum dibuka untuk aplikasi ini (kolom ${kolom}).`, k.id, k.kepala);
    if (d.instruksi !== undefined && typeof d.instruksi !== "string") return salah(`instruksi harus teks (maks ${MAKS_INSTRUKSI.toLocaleString("id-ID")} karakter).`);
    const instruksi = d.instruksi === undefined ? n.instruksi : String(d.instruksi).trim().slice(0, MAKS_INSTRUKSI);
    const tunggu = d.tunggu_detik === undefined ? n.tunggu_detik : angkaDalam(d.tunggu_detik, BATAS_TUNGGU_DETIK);
    const tungguBaca = d.tunggu_baca_detik === undefined ? n.tunggu_baca_detik : angkaDalam(d.tunggu_baca_detik, BATAS_TUNGGU_BACA_DETIK);
    const jeda = d.jeda_detik === undefined ? n.jeda_detik : angkaDalam(d.jeda_detik, BATAS_JEDA_DETIK);
    if (tunggu === null) return salah(`tunggu_detik harus bilangan bulat ${BATAS_TUNGGU_DETIK.min}–${BATAS_TUNGGU_DETIK.maks}.`);
    if (tungguBaca === null) return salah(`tunggu_baca_detik harus bilangan bulat ${BATAS_TUNGGU_BACA_DETIK.min}–${BATAS_TUNGGU_BACA_DETIK.maks}.`);
    if (jeda === null) return salah(`jeda_detik harus bilangan bulat ${BATAS_JEDA_DETIK.min}–${BATAS_JEDA_DETIK.maks}.`);
    if (instruksi !== n.instruksi || tunggu !== n.tunggu_detik || tungguBaca !== n.tunggu_baca_detik || jeda !== n.jeda_detik)
      await ubahNomor(n.id, { label: n.label, instruksi, tungguDetik: tunggu, tungguBacaDetik: tungguBaca, jedaDetik: jeda });
    const ubah = (v: unknown, lama: boolean) => typeof v === "boolean" && v !== lama;
    if (ubah(d.bot_aktif, n.bot_aktif)) await setBotAktif(n.id, d.bot_aktif as boolean);
    if (ubah(d.saring_spam, n.saring_spam)) await setSaringSpam(n.id, d.saring_spam as boolean);
    if (ubah(d.saring_prospek, n.saring_prospek)) await setSaringProspek(n.id, d.saring_prospek as boolean);
    if (ubah(d.belajar, n.belajar)) await setBelajar(n.id, d.belajar as boolean);
    return ok(bentukBot((await nomorById(n.id)) ?? n), k);
  });
}

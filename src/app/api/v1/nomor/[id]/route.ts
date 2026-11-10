import { BATAS_JEDA_DETIK, BATAS_TUNGGU_BACA_DETIK, BATAS_TUNGGU_DETIK, hapusNomor, nomorById, setBotAktif, ubahNomor } from "@/lib/numbers";
import { hapusSesi, infoSesi } from "@/lib/wa";
import { aman, bacaJson, bentukNomor, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "nomor");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    return ok(bentukNomor(n, infoSesi(n.sesi).status), k);
  });
}

const angkaDalam = (v: unknown, b: { min: number; maks: number }): number | null => {
  const x = Number(v);
  return Number.isInteger(x) && x >= b.min && x <= b.maks ? x : null;
};

/** PATCH /api/v1/nomor/{id} {label?, bot_aktif?, instruksi?, tunggu_detik?, tunggu_baca_detik?, jeda_detik?} */
export async function PATCH(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "nomor");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const d = b.data;
    const salah = (pesan: string) => galat("isian_tidak_sah", pesan, k.id, k.kepala);
    const label = d.label === undefined ? n.label : String(d.label).trim().slice(0, 60);
    if (!label) return salah("`label` tidak boleh kosong.");
    const instruksi = d.instruksi === undefined ? n.instruksi : String(d.instruksi).trim().slice(0, 2000);
    const tunggu = d.tunggu_detik === undefined ? n.tunggu_detik : angkaDalam(d.tunggu_detik, BATAS_TUNGGU_DETIK);
    const tungguBaca = d.tunggu_baca_detik === undefined ? n.tunggu_baca_detik : angkaDalam(d.tunggu_baca_detik, BATAS_TUNGGU_BACA_DETIK);
    const jeda = d.jeda_detik === undefined ? n.jeda_detik : angkaDalam(d.jeda_detik, BATAS_JEDA_DETIK);
    if (tunggu === null) return salah(`tunggu_detik harus bilangan bulat ${BATAS_TUNGGU_DETIK.min}–${BATAS_TUNGGU_DETIK.maks}.`);
    if (tungguBaca === null) return salah(`tunggu_baca_detik harus bilangan bulat ${BATAS_TUNGGU_BACA_DETIK.min}–${BATAS_TUNGGU_BACA_DETIK.maks}.`);
    if (jeda === null) return salah(`jeda_detik harus bilangan bulat ${BATAS_JEDA_DETIK.min}–${BATAS_JEDA_DETIK.maks}.`);
    if (d.bot_aktif !== undefined && typeof d.bot_aktif !== "boolean") return salah("bot_aktif harus true/false.");
    await ubahNomor(n.id, { label, instruksi, tungguDetik: tunggu, tungguBacaDetik: tungguBaca, jedaDetik: jeda });
    if (typeof d.bot_aktif === "boolean" && d.bot_aktif !== n.bot_aktif) await setBotAktif(n.id, d.bot_aktif);
    const baru = (await nomorById(n.id)) ?? n;
    return ok(bentukNomor(baru, infoSesi(baru.sesi).status), k);
  });
}

/** DELETE /api/v1/nomor/{id}: hapus nomor beserta sesi WhatsApp & knowledge-nya. */
export async function DELETE(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "nomor");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    // Sesi dicabut dulu; bila gagal, nomor tidak dihapus (tidak ada sesi yatim).
    await hapusSesi(n.sesi);
    await hapusNomor(n.id);
    return ok({ ok: true }, k);
  });
}

import { type Nomor, semuaNomor, tambahNomor } from "@/lib/numbers";
import { hubungkan, infoSesi } from "@/lib/wa";
import { aman, bacaJson, bentukNomor, bukanKonteks, denganIdempotensi, ok, otorisasi, paginasi, pemilikMesin } from "@/lib/mesin/api";
import { lisensiSekarang } from "@/lib/mesin/lisensi";

const MAKS_NOMOR = Math.max(1, Number(process.env.MAKS_NOMOR) || 250);

/** GET /api/v1/nomor?batas=50&setelah=<id>: daftar nomor (kursor id, urut naik). */
export async function GET(req: Request) {
  const k = await otorisasi(req, "nomor");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const { batas, setelah } = paginasi(new URL(req.url));
    // semuaNomor() dibaca dari cache di memori (numbers.ts): tanpa query tambahan.
    const urut = (await semuaNomor()).filter((n) => setelah === null || n.id > setelah).sort((a, b) => a.id - b.id);
    const daftar = urut.slice(0, batas);
    return ok({ data: daftar.map((n) => bentukNomor(n, infoSesi(n.sesi).status)), berikutnya: urut.length > batas ? String(daftar.at(-1)!.id) : null }, k);
  });
}

/** POST /api/v1/nomor {label}: buat nomor baru dan langsung siapkan QR (GET /nomor/{id}/qr). */
export async function POST(req: Request) {
  const k = await otorisasi(req, "nomor");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, () =>
    denganIdempotensi(req, k, b.teks, async () => {
      const label = String(b.data.label ?? "").trim().slice(0, 60);
      if (!label) return { status: 400, body: { galat: { kode: "isian_tidak_sah", pesan: "`label` wajib diisi (maks 60 karakter).", id_permintaan: k.id } } };
      const batas = lisensiSekarang()?.batas.nomor ?? 1;
      const jumlah = (await semuaNomor()).length;
      if (jumlah >= Math.min(batas, MAKS_NOMOR))
        return { status: 403, body: { galat: { kode: "batas_nomor", pesan: `Batas ${Math.min(batas, MAKS_NOMOR)} nomor untuk mesin ini sudah tercapai.`, id_permintaan: k.id } } };
      const pemilik = await pemilikMesin();
      if (!pemilik) return { status: 500, body: { galat: { kode: "galat_server", pesan: "Mesin belum punya akun admin (isi ADMIN_EMAIL & ADMIN_PASSWORD).", id_permintaan: k.id } } };
      const n: Nomor = await tambahNomor(label, pemilik);
      // Sesi dinyalakan di latar: QR biasanya siap dalam beberapa detik.
      void hubungkan(n.sesi).catch(() => {});
      return { status: 201, body: bentukNomor(n, infoSesi(n.sesi).status) };
    }),
  );
}

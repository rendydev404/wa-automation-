/**
 * Bus peristiwa kecil di dalam proses (tanpa I/O). Modul inti (percakapan, wa) memancarkan peristiwa; pendengar
 * (mis. webhook aplikasi di mesin self-host) mendaftar sendiri. Tanpa pendengar biayanya nol: pancarkan() langsung
 * kembali. Pendengar tidak boleh memperlambat atau menggagalkan pemancar: galat & janji yang ditolak ditelan.
 */
export type Peristiwa =
  | { jenis: "pesan.masuk"; numberId: number; kunci: string; alamat: string | null; telepon: string | null; nama: string | null; teks: string; waktu: number }
  | { jenis: "pesan.dibalas_ai"; numberId: number; kunci: string; teks: string; waktu: number }
  | { jenis: "pesan.manusia"; numberId: number; kunci: string; teks: string; waktu: number }
  | { jenis: "pesan.status"; sesi: string; waId: string; status: number }
  | { jenis: "nomor.terhubung"; sesi: string; waId: string; nama: string | null }
  | { jenis: "nomor.terputus"; sesi: string; kode: number | null; keluar: boolean }
  | { jenis: "lisensi.peringatan"; sisaDetik: number; berlakuSampai: number; status: string };

type Pendengar = (p: Peristiwa) => void | Promise<void>;

const g = globalThis as unknown as { __waPeristiwa?: Set<Pendengar> };
const pendengar = (g.__waPeristiwa ??= new Set());

export function dengar(fn: Pendengar): () => void {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

export function pancarkan(p: Peristiwa): void {
  if (!pendengar.size) return;
  for (const fn of pendengar) {
    try {
      const r = fn(p);
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => {});
    } catch {
      // pendengar rusak tidak boleh mengganggu alur WhatsApp
    }
  }
}

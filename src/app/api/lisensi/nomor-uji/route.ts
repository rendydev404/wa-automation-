import { verifikasiNomorUji } from "@/lib/developer-api";
import { tanganiLisensi } from "@/lib/developer-api-http";

/**
 * Mesin sandbox menerima pesan WA "UJI <kode>": verifikasi nomor uji. Jawabannya lisensi baru berisi nomor uji
 * (sandbox tidak punya webhook lisensi). Dipanggil hanya saat ada pesan berkode, bukan polling.
 */
export async function POST(req: Request) {
  return tanganiLisensi(req, "nomor-uji", async (b) => ({
    lisensi: await verifikasiNomorUji({
      key: String(b.key ?? ""),
      id_instalasi: String(b.id_instalasi ?? ""),
      kode: String(b.kode ?? ""),
      telepon: typeof b.telepon === "string" ? b.telepon : null,
      alamat: typeof b.alamat === "string" ? b.alamat : null,
      versi: String(b.versi ?? ""),
    }),
  }));
}

import { aktivasi } from "@/lib/developer-api";
import { tanganiLisensi } from "@/lib/developer-api-http";

/**
 * Aktivasi mesin self-host (dipanggil mesin saat pertama menyala). Key + alamat HTTPS publik + tantangan ke alamat itu;
 * jawabannya token lisensi bertanda tangan. Publik (tanpa cookie): keabsahan dicek lewat key & tantangan.
 */
export async function POST(req: Request) {
  return tanganiLisensi(req, "aktivasi", async (b) => ({
    lisensi: await aktivasi({ key: String(b.key ?? ""), id_instalasi: String(b.id_instalasi ?? ""), alamat: String(b.alamat ?? ""), versi: String(b.versi ?? "") }),
  }));
}

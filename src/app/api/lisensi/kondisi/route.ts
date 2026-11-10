import { kondisi } from "@/lib/developer-api";
import { tanganiLisensi } from "@/lib/developer-api-http";

/** Cek sekali saat mesin menyala (bukan polling): lisensi terbaru untuk instalasi yang sudah diaktivasi. */
export async function POST(req: Request) {
  return tanganiLisensi(req, "kondisi", async (b) => ({
    lisensi: await kondisi({ key: String(b.key ?? ""), id_instalasi: String(b.id_instalasi ?? ""), versi: String(b.versi ?? "") }),
  }));
}

"use server";

import { revalidatePath } from "next/cache";
import { modeMesin } from "@/lib/mode";
import { perbaruiLisensi } from "@/lib/mesin/lisensi";

/**
 * Tombol "Perbarui lisensi" di dashboard mesin self-host: sekali bertanya ke pusat (tindakan pemilik, bukan polling).
 * Dipakai sandbox (tanpa webhook lisensi) sesudah perpanjang di portal, ganti nomor penguji, atau menghapus nomor lebih.
 */
export async function perbaruiLisensiAction(): Promise<{ ok: boolean; pesan: string }> {
  if (!modeMesin()) return { ok: false, pesan: "Hanya tersedia di mesin self-host." };
  // Tanpa login: halaman /mode-api (dashboard ditutup) juga memakainya. Aman: hanya bertanya sekali ke pusat, jeda 15 dtk.
  const r = await perbaruiLisensi();
  revalidatePath("/", "layout");
  return r;
}

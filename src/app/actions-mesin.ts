"use server";

import { revalidatePath } from "next/cache";
import { modeMesin } from "@/lib/mode";
import { perbaruiLisensi } from "@/lib/mesin/lisensi";
import { requireUser } from "@/lib/session";

/**
 * Tombol "Perbarui lisensi" di dashboard mesin self-host: sekali bertanya ke pusat (tindakan pemilik, bukan polling).
 * Dipakai sandbox (tanpa webhook lisensi) sesudah perpanjang di portal, ganti nomor penguji, atau menghapus nomor lebih.
 */
export async function perbaruiLisensiAction(): Promise<{ ok: boolean; pesan: string }> {
  if (!modeMesin()) return { ok: false, pesan: "Hanya tersedia di mesin self-host." };
  await requireUser();
  const r = await perbaruiLisensi();
  revalidatePath("/", "layout");
  return r;
}

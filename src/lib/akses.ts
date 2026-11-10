import "server-only";
import { type Nomor, nomorById } from "./numbers";
import type { User } from "./session";
import { staf } from "./peran";

/**
 * Satu-satunya pintu membaca nomor atas nama pengguna: pemiliknya, atau admin.
 * Nomor milik orang lain diperlakukan sama dengan nomor yang tidak ada (tidak membocorkan keberadaannya).
 */
export function bolehAkses(user: User, nomor: Nomor | undefined): nomor is Nomor {
  return !!nomor && (nomor.user_id === user.id || staf(user.peran));
}

export async function nomorUntuk(user: User, id: unknown): Promise<Nomor | undefined> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  const nomor = await nomorById(n);
  return bolehAkses(user, nomor) ? nomor : undefined;
}

/** Untuk route handler: pengguna sah + nomor yang boleh diaksesnya. */
export async function sesiDanNomor(id: unknown): Promise<{ user: User | null; nomor: Nomor | undefined }> {
  // Dimuat saat dipakai: modul ini juga diuji langsung di Node, tempat next/headers tidak tersedia.
  const user = await (await import("./session")).getUser();
  return { user, nomor: user ? await nomorUntuk(user, id) : undefined };
}

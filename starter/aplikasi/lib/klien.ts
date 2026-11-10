import "server-only";
import { ChatGerCep, GalatChatGerCep } from "./sdk";

/** Dilempar bila .env.local belum diisi; halaman menampilkannya sebagai petunjuk, bukan galat. */
export class KonfigurasiKurang extends Error {}

let simpan: ChatGerCep | null = null;

/** Klien SDK dari variabel lingkungan. Hanya di server: API key tidak pernah dikirim ke browser. */
export function klien(): ChatGerCep {
  if (simpan) return simpan;
  const alamat = process.env.CHATGERCEP_ALAMAT?.trim();
  const key = process.env.CHATGERCEP_KEY?.trim();
  if (!alamat || !key) throw new KonfigurasiKurang("Isi CHATGERCEP_ALAMAT dan CHATGERCEP_KEY di .env.local, lalu jalankan ulang aplikasi.");
  simpan = new ChatGerCep({ alamat, key, batasWaktuMs: 20_000 });
  return simpan;
}

/** Alamat aplikasi ini seperti dilihat mesin (untuk URL webhook). */
export const alamatAplikasi = (): string => (process.env.ALAMAT_APLIKASI?.trim() || "http://localhost:3000").replace(/\/+$/, "");
export const urlWebhook = (): string => `${alamatAplikasi()}/api/webhook`;

const tunggu = (ms: number) => new Promise((selesai) => setTimeout(selesai, ms));

/**
 * Jalankan `fn` dengan satu kunci idempotensi; bila mesin sibuk (429/503) atau jaringan putus, coba lagi sampai 2 kali
 * dengan kunci yang SAMA, jadi pesan tidak pernah terkirim dua kali.
 */
export async function denganCobaUlang<T>(kunci: string, fn: (kunci: string) => Promise<T>): Promise<T> {
  for (let coba = 0; ; coba++) {
    try {
      return await fn(kunci);
    } catch (e) {
      if (!(e instanceof GalatChatGerCep) || !e.bolehDicobaUlang || coba >= 2) throw e;
      await tunggu(Math.min(e.cobaLagiDetik ?? 1, 3) * 1000);
    }
  }
}

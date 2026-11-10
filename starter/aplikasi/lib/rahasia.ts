import "server-only";

/**
 * Rahasia penanda tangan webhook. Sumber utama: CHATGERCEP_RAHASIA_WEBHOOK di .env.local. Rahasia yang baru saja
 * didapat dari halaman /pengaturan juga diingat di memori supaya webhook langsung bisa diverifikasi tanpa menunggu
 * aplikasi dijalankan ulang (hilang saat proses berhenti, jadi tetap wajib disimpan ke .env.local).
 */
const g = globalThis as unknown as { __cgRahasiaWebhook?: string };

export const rahasiaWebhook = (): string => g.__cgRahasiaWebhook ?? process.env.CHATGERCEP_RAHASIA_WEBHOOK?.trim() ?? "";
export function ingatRahasiaWebhook(rahasia: string): void {
  g.__cgRahasiaWebhook = rahasia;
}

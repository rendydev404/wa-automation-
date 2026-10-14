/** Dijalankan sekali saat server Next.js mulai. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    // Jembatan mendaftarkan diri sebagai penerima event WhatsApp saat dimuat.
    await import("@/lib/bridge");
    const { mulaiGerbang } = await import("@/lib/wa");
    // Tidak ditunggu: database dan koneksi ke WhatsApp disiapkan di latar, tidak menahan start server.
    void mulaiGerbang();
  } catch (e) {
    console.error("[wa] gagal memulai gerbang WhatsApp:", e);
  }
}

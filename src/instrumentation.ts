/** Dijalankan sekali saat server Next.js mulai. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    // Sebelum Baileys dimuat: libsignal mencetak objek sesi berisi kunci privat ke console.
    const { pasangLogAman } = await import("@/lib/log-aman");
    pasangLogAman();
    // Jembatan mendaftarkan diri sebagai penerima event WhatsApp saat dimuat.
    await import("@/lib/bridge");
    const { mulaiGerbang } = await import("@/lib/wa");
    // Tidak ditunggu: database dan koneksi ke WhatsApp disiapkan di latar, tidak menahan start server.
    void mulaiGerbang();
    // Sinkron data Suka Shawarma: satu tarikan awal + pemeriksaan pengaman berkala (hanya bila dikonfigurasi).
    const { mulaiSinkron } = await import("@/lib/sinkron");
    mulaiSinkron();
  } catch (e) {
    console.error("[wa] gagal memulai gerbang WhatsApp:", e);
  }
}

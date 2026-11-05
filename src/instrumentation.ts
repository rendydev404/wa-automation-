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
    // SIGTERM saat deploy: tutup koneksi WhatsApp & tuntaskan tulisan kunci sebelum keluar.
    const { pasangPenanganMati } = await import("@/lib/mati");
    pasangPenanganMati();
    // Sinkron data Suka Shawarma: satu tarikan awal + pemeriksaan pengaman berkala (hanya bila dikonfigurasi).
    const { mulaiSinkron } = await import("@/lib/sinkron");
    mulaiSinkron();
    // Data sistem ChatGerCep (paket, harga, komisi, metode bayar) untuk nomor yang dinyalakan admin.
    const { mulaiSinkronCg } = await import("@/lib/sinkron-cg");
    mulaiSinkronCg();
    // Admin pertama dari env (instalasi baru) dibuat sebelum ada yang sempat mendaftar; gagal = dicoba lagi saat login/daftar.
    const { pastikanAdminAwal } = await import("@/lib/session");
    void pastikanAdminAwal().catch(() => {});
    // Penyaring prospek: model ML dipanaskan di latar & ujian tiap malam (src/lib/prospek.ts).
    const { mulaiPenyaringProspek } = await import("@/lib/prospek");
    mulaiPenyaringProspek();
    // Histori percakapan yang lebih lama dari 30 hari dihapus berkala.
    const { mulaiPembersihanHistori } = await import("@/lib/percakapan");
    mulaiPembersihanHistori();
    // Notifikasi in-app: pengingat paket akan/sudah berakhir & pembersihan notifikasi lama, tiap jam.
    const { mulaiPengingat } = await import("@/lib/notifikasi");
    mulaiPengingat();
  } catch (e) {
    console.error("[wa] gagal memulai gerbang WhatsApp:", e);
  }
}

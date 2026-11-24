/** Dijalankan sekali saat server Next.js mulai. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    // Sebelum Baileys dimuat: libsignal mencetak objek sesi berisi kunci privat ke console.
    const { pasangLogAman } = await import("@/lib/log-aman");
    pasangLogAman();
    // Jembatan mendaftarkan diri sebagai penerima event WhatsApp saat dimuat.
    await import("@/lib/bridge");
    // Jalur WhatsApp resmi (Cloud API Meta) mendaftar ke wa.ts saat dimuat; kredensial nomor resmi dimuat di latar.
    const { muatResmi } = await import("@/lib/wa-resmi");
    void muatResmi().catch((e) => console.error("[wa-resmi] gagal memuat nomor resmi:", e instanceof Error ? e.message : e));
    const { mulaiGerbang } = await import("@/lib/wa");
    // Tidak ditunggu: database dan koneksi ke WhatsApp disiapkan di latar, tidak menahan start server.
    void mulaiGerbang();
    // SIGTERM saat deploy: tutup koneksi WhatsApp & tuntaskan tulisan kunci sebelum keluar.
    const { pasangPenanganMati } = await import("@/lib/mati");
    pasangPenanganMati();
    // Mesin self-host (MODE=mesin): tanpa pekerja khusus chatgercep.com; lisensi dari pusat, webhook aplikasi, antrean API.
    const { modeMesin } = await import("@/lib/mode");
    const mesin = modeMesin();
    if (mesin) {
      const { mulaiMesin } = await import("@/lib/mesin/mulai");
      mulaiMesin();
    } else {
      // Sinkron data Suka Shawarma: satu tarikan awal + pemeriksaan pengaman berkala (hanya bila dikonfigurasi).
      const { mulaiSinkron } = await import("@/lib/sinkron");
      mulaiSinkron();
      // Data sistem ChatGerCep (paket, harga, komisi, metode bayar) untuk nomor yang dinyalakan admin.
      const { mulaiSinkronCg } = await import("@/lib/sinkron-cg");
      mulaiSinkronCg();
      // Developer API di pusat: pengirim lisensi lewat webhook + perpanjangan & pengingat bayar (hanya bila kunci lisensi dipasang).
      const { mulaiDeveloperApi } = await import("@/lib/developer-api");
      mulaiDeveloperApi();
    }
    // Admin pertama dari env (instalasi baru) dibuat sebelum ada yang sempat mendaftar; gagal = dicoba lagi saat login/daftar.
    const { pastikanAdminAwal } = await import("@/lib/session");
    void pastikanAdminAwal().catch(() => {});
    // Penyaring prospek: model ML dipanaskan di latar & ujian tiap malam (src/lib/prospek.ts).
    const { mulaiPenyaringProspek } = await import("@/lib/prospek");
    mulaiPenyaringProspek();
    // Histori percakapan yang lebih lama dari 30 hari dihapus berkala.
    const { mulaiPembersihanHistori } = await import("@/lib/percakapan");
    mulaiPembersihanHistori();
    if (!mesin) {
      // Follow-up WhatsApp nomor CS ke akun gratis yang kuotanya habis (mati sampai admin menyalakannya).
      const { mulaiFollowup } = await import("@/lib/followup");
      mulaiFollowup();
      // Notifikasi in-app: pengingat paket akan/sudah berakhir & pembersihan notifikasi lama, tiap jam.
      const { mulaiPengingat } = await import("@/lib/notifikasi");
      mulaiPengingat();
      // Sapaan email untuk pembayaran paket yang tidak selesai, tiap 5 menit (tanpa WhatsApp: lihat sapa-bayar.ts).
      const { mulaiSapaBayar } = await import("@/lib/sapa-bayar");
      mulaiSapaBayar();
    }
    // Analitik perilaku pengguna: event di memori ditulis berkelompok tiap ~10 dtk & baris lama dihapus tiap 6 jam.
    const { mulaiAnalitik } = await import("@/lib/analitik");
    mulaiAnalitik();
  } catch (e) {
    console.error("[wa] gagal memulai gerbang WhatsApp:", e);
  }
}

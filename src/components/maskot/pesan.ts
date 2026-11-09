import type { RingkasAktivitas } from "@/lib/aktivitas";
import type { Bahasa, T } from "@/lib/bahasa";
import { angka, rupiahRingkas } from "@/lib/format";
import type { SesiNomor } from "@/lib/types";
import type { Pose } from "./pose";

/**
 * "Otak" maskot dashboard: menyusun isi gelembung dari data asli (dikirim server saat halaman dimuat) ditambah data
 * hidup dari poller status bersama (koneksi nomor, kesehatan AI, detak balasan). Murni (tanpa efek), jadi mudah diuji.
 */

export interface HitungHari {
  masuk: number;
  dibalas: number;
}

export interface DataPengguna {
  jenis: "pengguna";
  nama: string;
  hariIni: HitungHari;
  kemarin: HitungHari;
  pekan: HitungHari;
  nomor: { id: number; label: string; botAktif: boolean; knowledge: boolean }[];
  /** Kuota balasan AI: `aktif` = ada paket/kuota berjalan; `batas` null = tanpa batas. */
  kuota: { aktif: boolean; sisa: number | null; batas: number | null };
}

export interface DataAdmin {
  jenis: "admin";
  nama: string;
  pendapatan: { kini: number; lalu: number; transaksi: number };
  berbayar: { kini: number; lalu: number };
  balasan: { kini: number; lalu: number; masuk: number };
  hariIni: HitungHari;
  biaya: number;
  laba: number;
  margin: number | null;
  menunggu: { jumlah: number; nilai: number };
  berakhir: number;
  kuotaMenipis: number;
  nomor: { total: number; tertaut: number; terputus: number };
  akunBaru: { kini: number; lalu: number };
  pengguna: number;
}

export type DataMaskot = DataPengguna | DataAdmin;

export interface Langsung {
  /** null = belum ada data poller. */
  ai: boolean | null;
  status: Record<number, SesiNomor> | null;
  aktivitas: RingkasAktivitas | null;
  /** Tambahan masuk/dibalas sejak halaman dimuat (dari detak), supaya angka hari ini ikut hidup. */
  tambah: HitungHari;
}

export type Aksi = { label: string; href: string } | { label: string; tur: true } | { label: string; klik: string };

export type Nada = "info" | "baik" | "waspada" | "bahaya";

export interface Pesan {
  id: string;
  pose: Pose;
  nada: Nada;
  teks: string;
  aksi?: Aksi;
}

export type Topik = "hari" | "masalah" | "tips" | "ringkas" | "tindak" | "ai";

export interface Keadaan {
  pose: Pose;
  label: string;
  nada: Nada;
}

const persen = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);

/** Jam WIB sekarang (0–23). */
export const jamWib = (): number => (new Date().getUTCHours() + 7) % 24;

function salam(t: T): string {
  const j = jamWib();
  return j < 11 ? t("Selamat pagi", "Good morning") : j < 15 ? t("Selamat siang", "Good afternoon") : j < 19 ? t("Selamat sore", "Good evening") : t("Selamat malam", "Good evening");
}

const malam = (): boolean => {
  const j = jamWib();
  return j >= 21 || j < 5;
};

/** Detak terbaru: sedang menyusun balasan (pesan masuk belum terbalas) atau baru saja membalas. */
export function detak(l: Langsung): "menyusun" | "terkirim" | null {
  const a = l.aktivitas;
  if (!a) return null;
  if (a.tMasuk > a.tDibalas && a.kini - a.tMasuk < 90) return "menyusun";
  if (a.tDibalas && a.kini - a.tDibalas < 45) return "terkirim";
  return null;
}

function namaNomor(d: DataMaskot, id: number | null | undefined): string | null {
  if (d.jenis !== "pengguna" || id == null) return null;
  return d.nomor.find((n) => n.id === id)?.label ?? null;
}

// ---------- Pengguna ----------

function hariIni(d: DataPengguna | DataAdmin, l: Langsung): HitungHari {
  return { masuk: d.hariIni.masuk + l.tambah.masuk, dibalas: d.hariIni.dibalas + l.tambah.dibalas };
}

/** Daftar masalah akun pengguna, paling mendesak dulu. Kosong = semua aman. */
function masalahPengguna(d: DataPengguna, l: Langsung, t: T): Pesan[] {
  const out: Pesan[] = [];
  if (l.ai === false)
    out.push({
      id: "ai-mati",
      pose: "kaget",
      nada: "bahaya",
      teks: t(
        "Waduh, mesin AI sedang tidak terjangkau, jadi chat pelanggan belum bisa saya balas. Tim kami sedang menanganinya.",
        "Uh-oh, the AI engine is unreachable right now, so I can't reply to customers yet. Our team is on it.",
      ),
    });
  if (!d.kuota.aktif)
    out.push({
      id: "tanpa-paket",
      pose: "sedih",
      nada: "waspada",
      teks: t(
        "Saya sudah siap kerja, tapi belum ada paket aktif, jadi chat pelanggan belum saya balas. Pilih paket supaya saya bisa mulai.",
        "I'm ready to work, but there's no active plan, so I'm not replying to customers yet. Pick a plan so I can start.",
      ),
      aksi: { label: t("Pilih paket", "Choose a plan"), href: "/langganan" },
    });
  else if (d.kuota.sisa === 0)
    out.push({
      id: "kuota-habis",
      pose: "sedih",
      nada: "bahaya",
      teks: t("Kuota balasan AI habis, jadi saya berhenti membalas. Perpanjang paket supaya saya kerja lagi.", "Your AI reply quota is used up, so I've stopped replying. Renew your plan to put me back to work."),
      aksi: { label: t("Perpanjang", "Renew"), href: "/langganan" },
    });
  else if (d.kuota.sisa !== null && d.kuota.batas && d.kuota.sisa / d.kuota.batas <= 0.2)
    out.push({
      id: "kuota-tipis",
      pose: "bingung",
      nada: "waspada",
      teks: t(
        `Kuota balasan tinggal ${angka(d.kuota.sisa)} dari ${angka(d.kuota.batas)}. Siapkan perpanjangan supaya saya tidak berhenti di tengah jalan.`,
        `Only ${angka(d.kuota.sisa, "en")} of ${angka(d.kuota.batas, "en")} replies left. Plan a renewal so I don't stop halfway.`,
      ),
      aksi: { label: t("Lihat paket", "See plans"), href: "/langganan" },
    });
  if (d.nomor.length === 0)
    out.push({
      id: "tanpa-nomor",
      pose: "bingung",
      nada: "waspada",
      teks: t("Belum ada nomor WhatsApp yang bisa saya jaga. Yuk sambungkan satu, cukup scan QR seperti WhatsApp Web!", "There's no WhatsApp number for me to look after yet. Let's connect one, just scan a QR code like WhatsApp Web!"),
      aksi: { label: t("Tambah nomor", "Add a number"), klik: '[data-tur="tambah-nomor"]' },
    });
  if (l.status)
    for (const n of d.nomor) {
      const s = l.status[n.id];
      if (!s || s.status === "WORKING" || s.status === "STARTING") continue;
      const qr = s.status === "SCAN_QR_CODE" || s.status === "BELUM_ADA";
      out.push({
        id: `putus-${n.id}`,
        pose: qr ? "tunjuk" : "kaget",
        nada: qr ? "waspada" : "bahaya",
        teks: qr
          ? t(`Nomor "${n.label}" belum tersambung. Scan kode QR-nya dulu ya, setelah itu saya langsung jaga.`, `"${n.label}" isn't connected yet. Scan its QR code and I'll start looking after it right away.`)
          : t(`Nomor "${n.label}" terputus${s.alasan ? `: ${s.alasan}` : ""}. Sambungkan lagi supaya chat di sana tetap terbalas.`, `"${n.label}" got disconnected${s.alasan ? `: ${s.alasan}` : ""}. Reconnect it so chats there keep getting replies.`),
        aksi: { label: t("Sambungkan", "Connect"), href: `/nomor/${n.id}` },
      });
    }
  for (const n of d.nomor)
    if (!n.knowledge)
      out.push({
        id: `knowledge-${n.id}`,
        pose: "knowledge",
        nada: "waspada",
        teks: t(
          `Saya belum punya catatan usaha untuk "${n.label}". Isi base knowledge-nya supaya saya bisa menjawab dengan benar, tanpa mengarang.`,
          `I don't have any business notes for "${n.label}" yet. Add its product knowledge so I can answer correctly, without making things up.`,
        ),
        aksi: { label: t("Isi knowledge", "Add knowledge"), href: `/nomor/${n.id}#knowledge` },
      });
  for (const n of d.nomor)
    if (!n.botAktif)
      out.push({
        id: `bot-mati-${n.id}`,
        pose: "tunjuk",
        nada: "info",
        teks: t(`Balasan AI di "${n.label}" sedang dimatikan, jadi chat di sana kamu balas sendiri.`, `AI replies are switched off for "${n.label}", so you're answering chats there yourself.`),
        aksi: { label: t("Nyalakan", "Turn on"), href: `/nomor/${n.id}` },
      });
  return out;
}

function pesanHari(d: DataPengguna, l: Langsung, t: T, b: Bahasa): Pesan {
  const h = hariIni(d, l);
  const r = persen(h.dibalas, h.masuk);
  const banding =
    d.kemarin.masuk === 0
      ? ""
      : h.masuk > d.kemarin.masuk
        ? t(` Lebih ramai dari kemarin (${angka(d.kemarin.masuk)}) 🚀`, ` Busier than yesterday (${angka(d.kemarin.masuk, b)}) 🚀`)
        : t(` Kemarin ${angka(d.kemarin.masuk)} chat.`, ` Yesterday: ${angka(d.kemarin.masuk, b)} chats.`);
  if (h.masuk === 0)
    return {
      id: "hari-kosong",
      pose: malam() ? "malam" : "bekerja",
      nada: "info",
      teks: t(
        `Belum ada chat masuk hari ini. Saya standby, siap membalas begitu pelanggan menyapa.${d.pekan.masuk ? ` Seminggu ini sudah ${angka(d.pekan.masuk)} chat.` : ""}`,
        `No chats yet today. I'm on standby, ready to reply the moment a customer says hi.${d.pekan.masuk ? ` ${angka(d.pekan.masuk, b)} chats this week.` : ""}`,
      ),
    };
  return {
    id: "hari",
    pose: r !== null && r >= 90 ? "jempol" : "analitik",
    nada: r !== null && r >= 90 ? "baik" : "info",
    teks: t(
      `Hari ini ${angka(h.masuk)} chat masuk, ${angka(h.dibalas)} sudah saya balas${r === null ? "" : ` (${r}%)`}.${banding}`,
      `${angka(h.masuk, b)} chats came in today and I've replied to ${angka(h.dibalas, b)}${r === null ? "" : ` (${r}%)`}.${banding}`,
    ),
  };
}

const TIPS_PENGGUNA = (t: T, d: DataPengguna): Pesan[] => {
  const n = d.nomor[0];
  return [
    {
      id: "tip-harga",
      pose: "knowledge",
      nada: "info",
      teks: t(
        "Tips: tulis harga, jam buka, alamat, dan cara pesan di base knowledge. Makin lengkap catatannya, makin jarang saya bilang \"belum tahu\".",
        "Tip: put prices, opening hours, address, and how to order in your product knowledge. The more complete it is, the less I have to say \"I don't know yet\".",
      ),
      aksi: n ? { label: t("Buka knowledge", "Open knowledge"), href: `/nomor/${n.id}#knowledge` } : undefined,
    },
    {
      id: "tip-uji",
      pose: "membalas",
      nada: "info",
      teks: t("Tips: coba saya dulu di Uji bot. Ketik pertanyaan seperti pelanggan, jawabannya sama persis dengan yang akan terkirim.", "Tip: try me in the bot test first. Ask like a customer would; my answer is exactly what would be sent."),
      aksi: n ? { label: t("Uji bot", "Bot test"), href: `/nomor/${n.id}#uji` } : undefined,
    },
    {
      id: "tip-ambil-alih",
      pose: "tunjuk",
      nada: "info",
      teks: t(
        "Tips: begitu kamu membalas sendiri dari HP, saya otomatis diam di chat itu. Kamu tetap pegang kendali penuh.",
        "Tip: as soon as you reply from your phone, I go quiet in that chat automatically. You stay fully in control.",
      ),
    },
    {
      id: "tip-malam",
      pose: "malam",
      nada: "info",
      teks: t("Tips: saya tetap jaga di malam hari dan hari libur, jadi calon pembeli jam 11 malam tidak kabur ke toko sebelah.", "Tip: I keep watch at night and on holidays, so an 11 pm buyer doesn't drift off to the shop next door."),
    },
    {
      id: "tip-foto",
      pose: "tablet",
      nada: "info",
      teks: t("Tips: tambahkan foto produk di katalog, saya bisa mengirimkannya saat pelanggan bertanya.", "Tip: add product photos to the catalog and I can send them when customers ask."),
      aksi: n ? { label: t("Buka nomor", "Open number"), href: `/nomor/${n.id}` } : undefined,
    },
  ];
};

// ---------- Admin ----------

function arah(kini: number, lalu: number, fmt: (n: number) => string): string {
  if (lalu === 0) return kini > 0 ? "naik dari nol" : "masih nol";
  const p = Math.round(((kini - lalu) / Math.abs(lalu)) * 100);
  return p === 0 ? `sama dengan periode lalu (${fmt(lalu)})` : `${p > 0 ? "naik" : "turun"} ${Math.abs(p)}% dari ${fmt(lalu)}`;
}

function tindakAdmin(d: DataAdmin, l: Langsung): Pesan[] {
  const out: Pesan[] = [];
  if (l.ai === false) out.push({ id: "ai-mati", pose: "kaget", nada: "bahaya", teks: "Mesin AI sedang tidak terjangkau! Semua nomor pelanggan berhenti dibalas. Cek pengaturan AI sekarang.", aksi: { label: "Pengaturan AI", href: "/admin/ai" } });
  if (d.nomor.terputus)
    out.push({ id: "terputus", pose: "kaget", nada: "bahaya", teks: `${angka(d.nomor.terputus)} nomor pelanggan tertaut tapi terputus. Chat di nomor itu tidak terbalas sampai disambungkan lagi.`, aksi: { label: "Lihat pengguna", href: "/admin/pengguna" } });
  if (d.menunggu.jumlah)
    out.push({ id: "menunggu", pose: "pesanan", nada: "waspada", teks: `${angka(d.menunggu.jumlah)} pembayaran masih menunggu, total Rp${angka(d.menunggu.nilai)}. Bisa jadi calon pelanggan butuh bantuan menyelesaikan bayar.`, aksi: { label: "Buka transaksi", href: "/admin/transaksi" } });
  if (d.berakhir)
    out.push({ id: "berakhir", pose: "tablet", nada: "waspada", teks: `${angka(d.berakhir)} langganan berakhir dalam 7 hari dan belum diperpanjang. Saat yang pas untuk mengingatkan mereka.`, aksi: { label: "Lihat pengguna", href: "/admin/pengguna" } });
  if (d.kuotaMenipis)
    out.push({ id: "menipis", pose: "bingung", nada: "info", teks: `${angka(d.kuotaMenipis)} pelanggan sudah memakai ≥80% kuota balasan. Peluang upgrade paket!`, aksi: { label: "Lihat pengguna", href: "/admin/pengguna" } });
  return out;
}

function ringkasAdmin(d: DataAdmin, l: Langsung): Pesan[] {
  const h = hariIni(d, l);
  const r = persen(d.balasan.kini, d.balasan.masuk);
  return [
    {
      id: "pendapatan",
      pose: d.pendapatan.kini >= d.pendapatan.lalu ? "analitik" : "berpikir",
      nada: d.pendapatan.kini >= d.pendapatan.lalu ? "baik" : "waspada",
      teks: `Pendapatan 30 hari ${rupiahRingkas(d.pendapatan.kini)} dari ${angka(d.pendapatan.transaksi)} transaksi, ${arah(d.pendapatan.kini, d.pendapatan.lalu, rupiahRingkas)}.`,
      aksi: { label: "Transaksi", href: "/admin/transaksi" },
    },
    {
      id: "pelanggan",
      pose: d.berbayar.kini >= d.berbayar.lalu ? "jempol" : "sedih",
      nada: d.berbayar.kini >= d.berbayar.lalu ? "baik" : "waspada",
      teks: `${angka(d.berbayar.kini)} pelanggan berbayar (${d.berbayar.kini - d.berbayar.lalu >= 0 ? "+" : ""}${angka(d.berbayar.kini - d.berbayar.lalu)} dari 30 hari lalu) dan ${angka(d.akunBaru.kini)} pendaftar baru, ${arah(d.akunBaru.kini, d.akunBaru.lalu, (n) => angka(n))}.`,
      aksi: { label: "Pengguna", href: "/admin/pengguna" },
    },
    {
      id: "balasan",
      pose: "membalas",
      nada: "info",
      teks: `AI membalas ${angka(d.balasan.kini)} chat dalam 30 hari${r === null ? "" : ` (${r}% dari pesan masuk)`}. Hari ini ${angka(h.masuk)} masuk, ${angka(h.dibalas)} dibalas.`,
    },
  ];
}

function aiAdmin(d: DataAdmin, l: Langsung): Pesan[] {
  return [
    {
      id: "biaya",
      pose: d.margin !== null && d.margin < 20 ? "kaget" : "tablet",
      nada: d.margin === null ? "info" : d.margin >= 50 ? "baik" : d.margin >= 20 ? "waspada" : "bahaya",
      teks:
        d.margin === null
          ? `Biaya AI 30 hari ${rupiahRingkas(d.biaya)}, belum ada pendapatan untuk menutupnya.`
          : `Biaya AI 30 hari ${rupiahRingkas(d.biaya)}. Laba kotor ${rupiahRingkas(d.laba)}, margin ${d.margin}%${d.margin >= 50 ? ". Sehat!" : ". Perlu dipantau."}`,
      aksi: { label: "Pengaturan AI", href: "/admin/ai" },
    },
    {
      id: "mesin",
      pose: l.ai === false ? "kaget" : "bekerja",
      nada: l.ai === false ? "bahaya" : "baik",
      teks: l.ai === null ? "Sedang memeriksa kesehatan mesin AI…" : l.ai ? "Mesin AI sehat dan siap membalas semua nomor pelanggan." : "Mesin AI tidak terjangkau! Pesan pelanggan tidak akan terbalas.",
    },
  ];
}

// ---------- Umum ----------

/** Pose & label status saat gelembung tertutup (keadaan sehari-hari maskot). */
export function keadaan(d: DataMaskot, l: Langsung, t: T): Keadaan {
  const dk = detak(l);
  const nama = namaNomor(d, l.aktivitas?.nomor);
  if (l.ai === false) return { pose: "kaget", label: t("AI tidak terjangkau", "AI unreachable"), nada: "bahaya" };
  if (dk === "menyusun") return { pose: "membalas", label: nama ? t(`Membalas chat di ${nama}…`, `Replying in ${nama}…`) : t("Sedang membalas chat…", "Replying to a chat…"), nada: "baik" };
  if (dk === "terkirim") return { pose: "jempol", label: t("Balasan terkirim ✓", "Reply sent ✓"), nada: "baik" };
  if (d.jenis === "pengguna") {
    // Hanya yang gawat (AI mati, nomor terputus, kuota habis) mengganti pose sehari-hari; yang perlu dicek cukup
    // ditandai titik kuning + lencana jumlah, supaya robot tetap terlihat bekerja / jaga malam.
    const m = masalahPengguna(d, l, t);
    const gawat = m.find((x) => x.nada === "bahaya");
    if (gawat) return { pose: gawat.pose, label: t("Butuh bantuanmu", "Needs your help"), nada: "bahaya" };
    const cek = m.some((x) => x.nada === "waspada");
    if (malam()) return { pose: "malam", label: cek ? t("Jaga malam · ada yang perlu dicek", "On night watch · something to check") : t("Jaga malam", "On night watch"), nada: cek ? "waspada" : "baik" };
    return { pose: "bekerja", label: cek ? t("Siaga · ada yang perlu dicek", "Ready · something to check") : t("Siaga membalas", "Ready to reply"), nada: cek ? "waspada" : "baik" };
  }
  const m = tindakAdmin(d, l)[0];
  if (m && m.nada === "bahaya") return { pose: m.pose, label: "Perlu dicek", nada: m.nada };
  if (malam()) return { pose: "malam", label: "Jaga malam", nada: "baik" };
  return { pose: "analitik", label: "Memantau layanan", nada: "baik" };
}

/** Sapaan pertama saat halaman dibuka: salam + hal terpenting saat ini. */
export function sapaan(d: DataMaskot, l: Langsung, t: T, b: Bahasa): Pesan[] {
  const halo = `${salam(t)}${d.nama ? `, ${d.nama}` : ""}! 👋`;
  if (d.jenis === "pengguna") {
    const m = masalahPengguna(d, l, t).filter((x) => x.nada !== "info");
    if (m.length) return [{ ...m[0], id: `sapa-${m[0].id}`, teks: `${halo} ${m[0].teks}` }, ...m.slice(1)];
    const h = pesanHari(d, l, t, b);
    return [{ id: "sapa", pose: "sapa", nada: "baik", teks: `${halo} ${t("Saya GerCep, robot yang membalas chat pelangganmu.", "I'm GerCep, the robot answering your customers' chats.")}` }, h];
  }
  const m = tindakAdmin(d, l);
  const awal: Pesan = {
    id: "sapa",
    pose: "sapa",
    nada: "baik",
    teks: `${halo} ${m.length ? `Ada ${m.length} hal yang perlu perhatian hari ini.` : "Semua berjalan lancar, tidak ada yang perlu ditindak."}`,
  };
  return [awal, ...(m.length ? m : ringkasAdmin(d, l).slice(0, 1))];
}

/** Jawaban tombol cepat. */
export function jawab(topik: Topik, d: DataMaskot, l: Langsung, t: T, b: Bahasa, putaran: number): Pesan[] {
  if (d.jenis === "pengguna") {
    if (topik === "hari") {
      const a = l.aktivitas;
      const nama = namaNomor(d, a?.nomor);
      const out = [pesanHari(d, l, t, b)];
      if (a?.tDibalas && a.kini - a.tDibalas < 3600) {
        const mnt = Math.max(1, Math.round((a.kini - a.tDibalas) / 60));
        out.push({
          id: "terakhir",
          pose: "membalas",
          nada: "baik",
          teks: t(`Balasan terakhir saya kirim ${mnt} menit lalu${nama ? ` di ${nama}` : ""}.`, `My last reply went out ${mnt} min ago${nama ? ` in ${nama}` : ""}.`),
        });
      }
      return out;
    }
    if (topik === "masalah") {
      const m = masalahPengguna(d, l, t);
      if (m.length) return m;
      const ok = l.status ? Object.values(l.status).filter((s) => s.status === "WORKING").length : d.nomor.length;
      return [
        {
          id: "aman",
          pose: "jempol",
          nada: "baik",
          teks: t(`Semua aman! ${ok} nomor tersambung, base knowledge terisi, dan saya siap membalas 24 jam.`, `All good! ${ok} ${ok === 1 ? "number" : "numbers"} connected, knowledge filled in, and I'm ready to reply 24/7.`),
        },
      ];
    }
    if (topik === "tips") {
      const tips = TIPS_PENGGUNA(t, d);
      // Mulai dari tips yang berbeda tiap kali ditanya.
      return tips.map((_, i) => tips[(i + putaran) % tips.length]);
    }
    return [];
  }
  if (topik === "ringkas") return ringkasAdmin(d, l);
  if (topik === "tindak") {
    const m = tindakAdmin(d, l);
    return m.length ? m : [{ id: "aman", pose: "jempol", nada: "baik", teks: "Tidak ada yang perlu ditindak: semua nomor tersambung, tidak ada tagihan tertunda atau langganan yang akan berakhir." }];
  }
  if (topik === "ai") return aiAdmin(d, l);
  return [];
}

/** Celoteh saat robot ditekan berkali-kali. */
export function celoteh(t: T, n: number): Pesan {
  const daftar: [Pose, string, string][] = [
    ["senang", "Hehe, geli! 😆", "Hehe, that tickles! 😆"],
    ["kaget", "Eh eh, pelan-pelan, saya lagi kerja! 😳", "Whoa, easy, I'm working here! 😳"],
    ["jempol", "Oke oke, semangat saya jadi penuh lagi! ⚡", "Okay okay, my battery's full again! ⚡"],
    ["sapa", "Halo lagi! Saya tetap di sini kok 👋", "Hi again! I'm still right here 👋"],
  ];
  const [pose, id, en] = daftar[n % daftar.length];
  return { id: `celoteh-${n}`, pose, nada: "baik", teks: t(id, en) };
}

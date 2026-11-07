"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Zap } from "lucide-react";
import Link from "@/components/link";
import { useBahasa } from "@/components/bahasa";
import type { T } from "@/lib/bahasa";
import { MASA_ID, MASA_EN_ADJ } from "@/lib/jaminan-def";

type Pendaftar = { nama: string; detik: number };

const WARNA_AVATAR = ["from-[#3ddc97] to-[#0ea5e9]", "from-[#a7f3d0] to-[#3ddc97]", "from-[#fbbf24] to-[#3ddc97]", "from-[#38bdf8] to-[#818cf8]"];

/** Ajakan coba (hard selling) yang diselipkan di antara kartu pendaftar; urutannya diacak tiap kunjungan. */
const PROMO = (t: T): { judul: string; isi: string }[] => [
  { judul: t("Beneran nggak mau coba ChatGerCep?", "Sure you don't want to try ChatGerCep?"), isi: t("Kamu santai, semua customer tetap dibalas AI.", "Relax, every customer still gets an AI reply.") },
  { judul: t("Chat masuk jam 2 pagi?", "A chat at 2 AM?"), isi: t("AI yang balas, kamu tetap tidur nyenyak.", "AI replies, you keep sleeping.") },
  { judul: t("Telat balas = pembeli kabur.", "Slow reply = lost buyer."), isi: t("Biar AI balas tiap chat dalam hitungan detik.", "Let AI answer every chat in seconds.") },
  { judul: t("Masih balas chat satu-satu?", "Still replying one by one?"), isi: t("AI ChatGerCep layani semua chat sekaligus.", "ChatGerCep's AI handles them all at once.") },
  { judul: t("Pesaingmu sudah pakai AI.", "Your competitors already use AI."), isi: t("Jangan sampai pembelimu pindah ke sebelah.", "Don't let your buyers walk next door.") },
  { judul: t("Nggak gercep? Duit balik 100%.", "Not fast? 100% money back."), isi: t(`Garansi uang kembali ${MASA_ID}.`, `Backed by a ${MASA_EN_ADJ} money-back guarantee.`) },
  { judul: t("Admin libur? Toko tetap jalan.", "Admin off? Store keeps running."), isi: t("AI jawab harga, stok, dan pertanyaan pelanggan.", "AI answers prices, stock, and customer questions.") },
  { judul: t("Closing lebih banyak, capek lebih sedikit.", "More closings, less fatigue."), isi: t("Pertanyaan yang itu-itu lagi? Biar AI yang jawab.", "Same questions again? Let AI answer.") },
  { judul: t("Pelanggan nanya, AI langsung jawab.", "Customers ask, AI answers instantly."), isi: t("Kamu tinggal fokus kirim pesanan.", "You just focus on shipping orders.") },
];

const JUMLAH_PROMO = PROMO((id) => id).length;

function lalu(detik: number, t: T): string {
  const selisih = Math.max(0, Date.now() / 1000 - detik);
  if (selisih < 3600) return t("Baru saja", "Just now");
  if (selisih < 86400) {
    const n = Math.floor(selisih / 3600);
    return t(`${n} jam lalu`, `${n}h ago`);
  }
  if (selisih < 30 * 86400) {
    const n = Math.floor(selisih / 86400);
    return t(`${n} hari lalu`, `${n}d ago`);
  }
  const n = Math.max(1, Math.floor(selisih / (30 * 86400)));
  return t(`${n} bulan lalu`, `${n}mo ago`);
}

/** Urutan acak (Fisher–Yates); dipanggil di klien setelah data dimuat, jadi tidak membuat beda render server/klien. */
function acak(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Kartu di pojok kiri bawah hero yang bergantian tanpa henti: pendaftar terbaru, lalu satu ajakan coba (teks acak),
 * lalu pendaftar berikutnya, dan seterusnya. Pergantian mengikuti akhir animasi CSS (globals.css, .kartu-pendaftar),
 * jadi tanpa timer, dan hover cukup menjedakan animasinya. Selama tempat aslinya di hero tidak terlihat (sudah lewat
 * saat di-scroll, atau di bawah lipatan layar), kartu menempel di pojok kiri bawah layar; di HP di atas tombol WhatsApp. Data dimuat setelah halaman tampil supaya landing tetap
 * statis. Gerakan dikurangi: animasi mati, kartu diam menampilkan kartu pertama.
 */
export function PendaftarLoop() {
  const { t } = useBahasa();
  const [daftar, setDaftar] = useState<Pendaftar[] | null>(null);
  const [urutan, setUrutan] = useState<number[]>([]);
  const [ke, setKe] = useState(0);
  const [menempel, setMenempel] = useState(false);
  const jangkar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const henti = new AbortController();
    const tunda = setTimeout(() => {
      fetch("/api/pendaftar", { signal: henti.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { daftar?: Pendaftar[] } | null) => d?.daftar ?? [])
        .catch(() => [] as Pendaftar[])
        .then((d) => {
          if (henti.signal.aborted) return;
          setUrutan(acak(JUMLAH_PROMO));
          setDaftar(d);
        });
    }, 1200);
    return () => {
      clearTimeout(tunda);
      henti.abort();
    };
  }, []);

  // Tempat asli kartu (pojok kiri bawah hero) tidak terlihat, entah belum sampai (desktop: di bawah lipatan) atau sudah
  // lewat: kartu menempel di pojok layar. Dicek saat scroll/ubah ukuran, paling sering sekali per frame. (Bukan
  // IntersectionObserver: lompatan scroll jauh dari bawah layar langsung ke atasnya tidak memicu callback.)
  useEffect(() => {
    const el = jangkar.current;
    if (!el) return;
    let bingkai = 0;
    const cek = () => {
      bingkai = 0;
      const r = el.getBoundingClientRect();
      setMenempel(r.top < 0 || r.bottom > window.innerHeight);
    };
    const jadwal = () => {
      if (!bingkai) bingkai = requestAnimationFrame(cek);
    };
    cek();
    window.addEventListener("scroll", jadwal, { passive: true });
    window.addEventListener("resize", jadwal, { passive: true });
    return () => {
      if (bingkai) cancelAnimationFrame(bingkai);
      window.removeEventListener("scroll", jadwal);
      window.removeEventListener("resize", jadwal);
    };
  }, []);

  const promo = PROMO(t);
  const adaPendaftar = !!daftar && daftar.length > 0;
  // Genap = pendaftar, ganjil = ajakan. Tanpa data pendaftar: ajakan saja.
  const giliranPromo = !adaPendaftar || ke % 2 === 1;
  const p = adaPendaftar ? daftar[Math.floor(ke / 2) % daftar.length] : null;
  const ajakan = promo[urutan[Math.floor(ke / (adaPendaftar ? 2 : 1)) % promo.length] ?? 0];

  return (
    <>
      <div ref={jangkar} aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-px w-px" />
      {daftar && (
        <div
          className={`pointer-events-none z-40 ${
            menempel
              ? "fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 max-w-[min(20rem,calc(100%-1.5rem))] sm:left-6 sm:max-w-sm lg:bottom-6"
              : "absolute bottom-2.5 left-4 max-w-[calc(100%-2rem)] sm:left-6 lg:bottom-8"
          }`}
        >
          <div
            key={ke}
            className="kartu-pendaftar pointer-events-auto"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && e.animationName === "pendaftar-siklus") setKe((n) => n + 1);
            }}
          >
            {giliranPromo ? (
              <Link href="/daftar" data-analitik="Kartu ajakan: daftar" className="relative flex items-center gap-2 rounded-[15px] bg-ink-raised py-1.5 pr-3 pl-1.5 transition-colors hover:bg-ink sm:gap-3 sm:py-2.5 sm:pr-4 sm:pl-2.5">
                <span className="pendaftar-avatar relative grid size-8 shrink-0 place-items-center rounded-full bg-ink-signal text-ink sm:size-10">
                  <Zap className="size-4 sm:size-5" strokeWidth={2.5} aria-hidden />
                </span>
                <div className="min-w-0">
                  {/* HP: judul satu baris + "Daftar sekarang" saja, supaya kartu yang menempel tidak menutupi isi halaman. */}
                  <p className="pendaftar-baris truncate text-[12.5px] leading-snug font-bold text-white sm:overflow-visible sm:text-[13.5px] sm:whitespace-normal">{ajakan.judul}</p>
                  <p className="pendaftar-baris pendaftar-baris-2 text-[11px] leading-snug text-ink-muted sm:mt-0.5 sm:text-[11.5px]">
                    <span className="hidden sm:inline">{ajakan.isi} </span>
                    <span className="inline-flex items-center gap-0.5 font-bold whitespace-nowrap text-ink-signal">
                      {t("Daftar sekarang", "Sign up now")} <ArrowRight className="size-3" aria-hidden />
                    </span>
                  </p>
                </div>
                <span aria-hidden className="pendaftar-kilau" />
                <span aria-hidden className="pendaftar-durasi" />
              </Link>
            ) : (
              p && (
                <div data-analitik-privat className="relative flex items-center gap-2 rounded-[15px] bg-ink-raised py-1.5 pr-3.5 pl-1.5 sm:gap-3 sm:py-2.5 sm:pr-5 sm:pl-2.5">
                  <span className={`pendaftar-avatar relative grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[13px] font-extrabold text-ink sm:size-10 sm:text-[15px] ${WARNA_AVATAR[Math.floor(ke / 2) % WARNA_AVATAR.length]}`}>
                    {p.nama.charAt(0)}
                    <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full border-2 border-ink-raised bg-ink-signal">
                      <Check className="size-2.5 text-ink" strokeWidth={4} aria-hidden />
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="pendaftar-baris truncate text-[12.5px] leading-snug font-bold text-white sm:text-[13.5px]">
                      {p.nama} <span className="font-medium text-ink-muted">{t("mendaftar", "signed up")}</span>
                    </p>
                    <p className="pendaftar-baris pendaftar-baris-2 flex items-center gap-1.5 text-[11px] leading-snug text-ink-muted sm:mt-0.5 sm:text-[11.5px]">
                      <span className="relative flex size-1.5">
                        <span className="absolute inset-0 animate-ping rounded-full bg-ink-signal opacity-70" />
                        <span className="relative size-1.5 rounded-full bg-ink-signal" />
                      </span>
                      {lalu(p.detik, t)}
                    </p>
                  </div>
                  <span aria-hidden className="pendaftar-kilau" />
                  <span aria-hidden className="pendaftar-durasi" />
                </div>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

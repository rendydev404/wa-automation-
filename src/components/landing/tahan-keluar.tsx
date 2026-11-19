"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, ShieldCheck, X } from "lucide-react";
import { useBahasa } from "@/components/bahasa";
import Link from "@/components/link";
import { MASA_EN, MASA_ID } from "@/lib/jaminan-def";
import { MEREK } from "@/lib/merek";

/**
 * Tawaran terakhir saat pengunjung mau meninggalkan halaman publik (landing, /panduan).
 *
 * Browser tidak mengizinkan apa pun tampil saat tab sedang ditutup atau sedang di tab lain, dan teks dialog
 * "Tinggalkan situs?" tidak bisa diubah. Jadi modal ini muncul pada saat-saat paling dekat dengan "mau pergi":
 *   - desktop: kursor keluar lewat tepi atas (menuju tab, bilah alamat, atau tombol tutup);
 *   - pindah tab / aplikasi (desktop & HP): saat pengunjung kembali ke tab ini;
 *   - HP: tombol Kembali ditekan (satu entri riwayat tambahan, dipasang lagi setelah tiap interaksi);
 *   - tutup tab / Ctrl+W / muat ulang: dialog bawaan browser (hanya bila pengunjung pernah klik/ketuk/mengetik di
 *     halaman; itu aturan browser), lalu modal ini menyusul bila pengunjung memilih tetap di halaman.
 * Tidak dibatasi sekali per sesi: tiap kali pengunjung mau pergi, tawarannya muncul lagi. Supaya tidak berulang terus
 * saat kursor masih di tepi atas, pemicu kursor diberi jeda setelah modal ditutup. Tautan & form di halaman (pindah
 * halaman yang disengaja) tidak memicu apa pun.
 */

const PENANDA = "__tahanKeluar";
/** Semua pemicu baru aktif setelah pengunjung sesaat di halaman (bukan langsung saat halaman terbuka). */
const JEDA_MS = 2000;
/** Tab harus tersembunyi minimal selama ini supaya dihitung "pergi" (kedip fokus sesaat tidak dihitung). */
const PERGI_MIN_MS = 400;
/** Tab tersembunyi dalam rentang ini setelah klik tautan = membuka tautan itu (mis. tombol WhatsApp), bukan pergi. */
const SETELAH_KLIK_MS = 2000;
/** Setelah modal ditutup, pemicu kursor-ke-atas diam sebentar (kursor biasanya masih di dekat tepi atas). */
const JEDA_KURSOR_MS = 8000;
/** Kursor dianggap menuju tab/tombol tutup bila keluar jendela pada jarak ini dari tepi atas. */
const TEPI_ATAS_PX = 40;

export function TahanKeluar({ harga, kedua }: { harga: ReactNode; kedua: { href: string; label: string; luar?: boolean } }) {
  const { t } = useBahasa();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [buka, setBuka] = useState(false);
  const terbuka = useRef(false);
  const ditutupPada = useRef(0);

  const munculkan = useCallback(() => {
    if (terbuka.current) return;
    terbuka.current = true;
    setBuka(true);
  }, []);

  useEffect(() => {
    if (buka) ref.current?.showModal();
  }, [buka]);

  useEffect(() => {
    const mulai = Date.now();
    let pergiSah = false;
    let riwayatTerpasang = false;
    let klikTautanTerakhir = 0;
    let tersembunyiSejak = 0;
    const baruBuka = () => Date.now() - mulai < JEDA_MS;

    // Klik tautan / kirim form = pindah halaman yang disengaja: jangan dihalangi dialog bawaan browser.
    const klik = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      klikTautanTerakhir = Date.now();
      const href = a.getAttribute("href") ?? "";
      // Jangkar di halaman yang sama: gulir tanpa menambah riwayat, supaya tombol Kembali tetap berarti "keluar".
      if (href.startsWith("#") && href.length > 1 && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const tujuan = document.getElementById(decodeURIComponent(href.slice(1)));
        if (tujuan) {
          e.preventDefault();
          tujuan.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          history.replaceState(history.state, "", href);
          return;
        }
      }
      pergiSah = true;
      setTimeout(() => (pergiSah = false), 1500);
    };
    const kirim = () => {
      pergiSah = true;
    };

    const sebelumTutup = (e: BeforeUnloadEvent) => {
      if (pergiSah || baruBuka()) return;
      e.preventDefault();
      e.returnValue = "";
      // Pengunjung memilih "Tetap di sini": halaman masih hidup, tawaran menyusul.
      setTimeout(munculkan, 600);
    };

    const keluarAtas = (e: MouseEvent) => {
      if (e.relatedTarget || e.clientY > TEPI_ATAS_PX || baruBuka()) return;
      if (Date.now() - ditutupPada.current < JEDA_KURSOR_MS) return;
      munculkan();
    };

    // Pindah tab/aplikasi: browser tidak mengizinkan apa pun tampil di tab lain, jadi tawaran menunggu saat kembali.
    const gantiTab = () => {
      const sekarang = Date.now();
      if (document.visibilityState === "hidden") {
        const bukaTautan = sekarang - klikTautanTerakhir < SETELAH_KLIK_MS;
        tersembunyiSejak = pergiSah || bukaTautan || baruBuka() ? 0 : sekarang;
        return;
      }
      const pergi = tersembunyiSejak;
      tersembunyiSejak = 0;
      if (pergi && sekarang - pergi >= PERGI_MIN_MS) munculkan();
    };

    // HP: entri riwayat tambahan supaya tombol Kembali memunculkan tawaran, bukan langsung keluar. Dipasang lagi pada
    // interaksi berikutnya setelah terpakai. Hanya saat interaksi yang dihitung browser sebagai aktivasi pengguna
    // (ketuk/klik/tombol, bukan gulir): entri tanpa aktivasi dilompati tombol Kembali oleh Chrome.
    const pasangRiwayat = () => {
      if (riwayatTerpasang || !matchMedia("(pointer: coarse)").matches) return;
      riwayatTerpasang = true;
      // Salin state router Next supaya entri tambahan ini dianggap halaman yang sama (tanpa muat ulang).
      history.pushState({ ...(history.state ?? {}), [PENANDA]: 1 }, "", location.href);
    };
    const kembali = () => {
      if (!riwayatTerpasang || (history.state as Record<string, unknown> | null)?.[PENANDA]) return;
      riwayatTerpasang = false;
      munculkan();
    };

    document.addEventListener("click", klik, true);
    document.addEventListener("submit", kirim, true);
    document.addEventListener("mouseout", keluarAtas);
    window.addEventListener("beforeunload", sebelumTutup);
    window.addEventListener("popstate", kembali);
    document.addEventListener("visibilitychange", gantiTab);
    window.addEventListener("pointerup", pasangRiwayat, { passive: true });
    window.addEventListener("keydown", pasangRiwayat, { passive: true });
    return () => {
      document.removeEventListener("click", klik, true);
      document.removeEventListener("submit", kirim, true);
      document.removeEventListener("mouseout", keluarAtas);
      window.removeEventListener("beforeunload", sebelumTutup);
      window.removeEventListener("popstate", kembali);
      document.removeEventListener("visibilitychange", gantiTab);
      window.removeEventListener("pointerup", pasangRiwayat);
      window.removeEventListener("keydown", pasangRiwayat);
    };
  }, [munculkan]);

  if (!buka) return null;
  const tutup = () => ref.current?.close();
  const kelasKedua =
    "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-ink-line px-5 py-3 text-[14px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.06]";

  return (
    <dialog
      ref={ref}
      onClose={() => {
        terbuka.current = false;
        ditutupPada.current = Date.now();
        setBuka(false);
      }}
      aria-labelledby={`${id}-judul`}
      aria-describedby={`${id}-isi`}
      onClick={(e) => e.target === e.currentTarget && tutup()}
      className="m-auto w-[min(480px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-3xl bg-ink p-0 text-ink-fg shadow-pop backdrop:bg-black/60 backdrop:backdrop-blur-sm max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none"
    >
      <div className="relative animate-masuk px-5 pt-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-7 sm:pt-7 sm:pb-7">
        <div aria-hidden className="kisi-tinta pointer-events-none absolute inset-0 opacity-50" />
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-ink-signal/20 blur-3xl" />
        <button
          type="button"
          onClick={tutup}
          aria-label={t("Tutup", "Close")}
          className="absolute top-3 right-3 grid size-9 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" aria-hidden />
        </button>

        <div className="relative">
          <p className="text-[12.5px] font-bold tracking-[0.08em] text-ink-signal uppercase">{t("Tunggu dulu…", "Wait a moment…")}</p>
          <h2 id={`${id}-judul`} className="mt-2 pr-8 text-[22px] leading-tight font-extrabold tracking-tight text-white sm:text-[26px]">
            {t(`Yakin nggak mau cobain ${MEREK}?`, `Sure you don't want to try ${MEREK}?`)}
          </h2>
          <p id={`${id}-isi`} className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">
            {t(
              "Chat WhatsApp pelanggan dibalas otomatis pakai AI, 24 jam tanpa istirahat, bahkan saat Anda tidur. Mulai ",
              "Your customers' WhatsApp chats answered automatically by AI, 24/7 with no breaks, even while you sleep. From ",
            )}
            <b className="font-bold text-ink-fg">{harga}</b>
            {t(", jauh lebih hemat dari gaji admin.", ", far cheaper than paying an admin.")}
          </p>
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-ink-signal/30 bg-ink-signal/10 px-4 py-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink-signal" aria-hidden />
            <p className="text-[13.5px] leading-snug text-ink-fg">
              <b className="block text-[14.5px] font-bold text-white">{t("Jaminan uang kembali 100%", "100% money-back guarantee")}</b>
              {t(
                `Kalau tidak sesuai harapan, ajukan dalam ${MASA_ID} dan uang Anda kembali utuh.*`,
                `Not what you hoped for? Request it within ${MASA_EN} and get every rupiah back.*`,
              )}
            </p>
          </div>
          <ul className="mt-4 space-y-2 text-[14px] text-ink-fg">
            {[
              t("Siap dalam hitungan menit: scan QR, isi info usaha, selesai", "Ready in minutes: scan a QR, add your business info, done"),
              t("Nomor dan HP tetap dipakai seperti biasa", "Keep using your number and phone as usual"),
            ].map((x) => (
              <li key={x} className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink-signal/15 text-ink-signal">
                  <Check className="size-3.5" aria-hidden />
                </span>
                {x}
              </li>
            ))}
          </ul>

          <div className="mt-6 space-y-2.5">
            <Link
              href="/daftar"
              data-analitik="Tahan keluar: daftar"
              onClick={tutup}
              className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink-signal px-5 py-3 text-center text-[15px] leading-snug font-bold text-ink shadow-[0_12px_40px_-12px_rgba(61,220,151,0.7)] transition-transform hover:-translate-y-0.5"
            >
              {t("Oke, saya mau cobain sekarang", "OK, I want to try it now")}
              <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            {kedua.luar ? (
              <a href={kedua.href} target="_blank" rel="noopener noreferrer" data-analitik="Tahan keluar: pilihan kedua" onClick={tutup} className={kelasKedua}>
                {kedua.label}
              </a>
            ) : (
              <Link href={kedua.href} data-analitik="Tahan keluar: pilihan kedua" onClick={tutup} className={kelasKedua}>
                {kedua.label}
              </Link>
            )}
            <button type="button" onClick={tutup} data-analitik="Tahan keluar: nanti saja" className="block w-full rounded-xl py-2 text-[13.5px] font-semibold text-ink-muted transition-colors hover:text-ink-fg">
              {t("Nanti saja", "Maybe later")}
            </button>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-ink-muted/80">
            {t("*Syarat berlaku: pembayaran pertama lewat GoPay, ShopeePay, atau QRIS.", "*Terms apply: first payment made with GoPay, ShopeePay, or QRIS.")}
          </p>
        </div>
      </div>
    </dialog>
  );
}

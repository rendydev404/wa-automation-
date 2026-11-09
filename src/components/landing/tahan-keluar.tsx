"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { useBahasa } from "@/components/bahasa";
import Link from "@/components/link";
import { MASA_EN, MASA_ID } from "@/lib/jaminan-def";
import { MEREK } from "@/lib/merek";

/**
 * Tawaran terakhir saat pengunjung mau meninggalkan halaman publik (landing, /panduan). Sekali per sesi tab.
 *
 * Browser tidak mengizinkan teks sendiri di dialog "Tinggalkan situs?", jadi teks persuasifnya ada di modal ini, yang
 * muncul saat:
 *   - desktop: kursor keluar lewat tepi atas (menuju tab/tombol tutup), setelah beberapa detik di halaman;
 *   - HP: tombol Kembali ditekan (satu entri riwayat tambahan dipasang setelah interaksi pertama);
 *   - tutup tab / Ctrl+W / muat ulang: dialog bawaan browser dulu; bila pengunjung memilih tetap, modal ini menyusul.
 * Tautan & form di halaman tidak memicu apa pun.
 */

const KUNCI = "cg-tahan-keluar";
const PENANDA = "__tahanKeluar";
const JEDA_MS = 5000;

const sudahTampil = () => {
  try {
    return sessionStorage.getItem(KUNCI) === "1";
  } catch {
    return false;
  }
};
const tandaiTampil = () => {
  try {
    sessionStorage.setItem(KUNCI, "1");
  } catch {}
};

export function TahanKeluar({ harga, kedua }: { harga: ReactNode; kedua: { href: string; label: string; luar?: boolean } }) {
  const { t } = useBahasa();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [buka, setBuka] = useState(false);
  const tampil = useRef(false);

  const munculkan = useCallback(() => {
    if (tampil.current || sudahTampil()) return;
    tampil.current = true;
    tandaiTampil();
    setBuka(true);
  }, []);

  useEffect(() => {
    if (buka) ref.current?.showModal();
  }, [buka]);

  useEffect(() => {
    if (sudahTampil()) return;
    const mulai = Date.now();
    let pergiSah = false;
    let riwayatTerpasang = false;

    // Klik tautan / kirim form = pindah halaman yang disengaja: jangan dihalangi dialog bawaan browser.
    const klik = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
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
      if (pergiSah || tampil.current || sudahTampil()) return;
      e.preventDefault();
      e.returnValue = "";
      // Pengunjung memilih "Tetap di sini": halaman masih hidup, tawaran menyusul.
      setTimeout(munculkan, 600);
    };

    const keluarAtas = (e: MouseEvent) => {
      if (e.relatedTarget || e.clientY > 8 || Date.now() - mulai < JEDA_MS) return;
      munculkan();
    };

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
    // Riwayat tambahan hanya saat interaksi yang dihitung browser sebagai aktivasi pengguna (ketuk/klik/tombol, bukan
    // gulir): entri yang dipasang tanpa aktivasi dilompati tombol Kembali oleh Chrome.
    window.addEventListener("pointerup", pasangRiwayat, { once: true, passive: true });
    window.addEventListener("keydown", pasangRiwayat, { once: true, passive: true });
    return () => {
      document.removeEventListener("click", klik, true);
      document.removeEventListener("submit", kirim, true);
      document.removeEventListener("mouseout", keluarAtas);
      window.removeEventListener("beforeunload", sebelumTutup);
      window.removeEventListener("popstate", kembali);
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
      onClose={() => setBuka(false)}
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
          <p className="text-[12.5px] font-bold tracking-[0.08em] text-ink-signal uppercase">{t("Tunggu sebentar…", "Wait a second…")}</p>
          <h2 id={`${id}-judul`} className="mt-2 pr-8 text-[22px] leading-tight font-extrabold tracking-tight text-white sm:text-[26px]">
            {t("Malam ini, berapa pembeli yang kabur karena chat-nya telat dibalas?", "Tonight, how many buyers will walk away because their chat got a late reply?")}
          </h2>
          <p id={`${id}-isi`} className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">
            {t(
              `Pembeli yang tidak dibalas cepat langsung chat toko sebelah. ${MEREK} membalas WhatsApp Anda dalam hitungan detik, 24 jam, bahkan saat Anda tidur. Mulai `,
              `Buyers who don't get a quick reply just message the shop next door. ${MEREK} answers your WhatsApp in seconds, 24/7, even while you sleep. From `,
            )}
            <b className="font-bold text-ink-fg">{harga}</b>
            {t(", jauh lebih hemat dari gaji admin.", ", far cheaper than paying an admin.")}
          </p>
          <ul className="mt-4 space-y-2 text-[14px] text-ink-fg">
            {[
              t("Siap dalam hitungan menit: scan QR, isi info usaha, selesai", "Ready in minutes: scan a QR, add your business info, done"),
              t("Nomor dan HP tetap dipakai seperti biasa", "Keep using your number and phone as usual"),
              t(`Tidak cocok? Uang kembali 100% dalam ${MASA_ID}*`, `Not a fit? 100% money back within ${MASA_EN}*`),
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
              {t("Ya, saya mau pelanggan dibalas otomatis", "Yes, I want my customers answered automatically")}
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
            {t("*Pembayaran pertama lewat GoPay, ShopeePay, atau QRIS.", "*First payment made with GoPay, ShopeePay, or QRIS.")}
          </p>
        </div>
      </div>
    </dialog>
  );
}

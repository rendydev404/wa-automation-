"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useBahasa } from "@/components/bahasa";

/**
 * Maskot robot lari di samping HP demo hero. Animasinya komposisi Remotion (src/remotion/robot-lari.tsx) lewat
 * @remotion/player yang SAMA dengan pemutar chat demo (pemutar.tsx), jadi tidak ada pustaka tambahan yang diunduh.
 * Ringan: sampai halaman tenang (requestIdleCallback) yang tampil gambar diam di posisi persis frame pertama, lalu
 * pemutar dimuat dan menggantikannya tanpa lompatan. Gerak dikurangi = gambar diam saja, pemutar tidak dimuat.
 * Kursor (desktop) membuat robot sedikit condong ke arahnya.
 */

const PemutarRobot = dynamic(() => import("./pemutar").then((m) => m.PemutarRobot), { ssr: false, loading: () => <Diam /> });

const KUERI_GERAK = "(prefers-reduced-motion: reduce)";

/** Pose pertama sprite di posisi yang sama dengan komposisi (robot 326x280 di x=170, y=88 dari kanvas 760x400). */
function Diam() {
  return (
    <div aria-hidden className="absolute overflow-hidden" style={{ left: "22.37%", top: "22%", width: "42.89%", height: "70%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- satu sel sprite dipotong lewat lebar 400% */}
      <img src="/maskot/robot-lari.webp" alt="" width={1304} height={280} decoding="async" fetchPriority="low" draggable={false} style={{ width: "400%", maxWidth: "none", height: "100%" }} />
    </div>
  );
}

export function RobotLari({ className = "" }: { className?: string }) {
  const { t } = useBahasa();
  const [siap, setSiap] = useState(false);
  const [condong, setCondong] = useState(0);
  const kurangi = useSyncExternalStore(
    (ubah) => {
      const m = window.matchMedia(KUERI_GERAK);
      m.addEventListener("change", ubah);
      return () => m.removeEventListener("change", ubah);
    },
    () => window.matchMedia(KUERI_GERAK).matches,
    () => true,
  );

  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setSiap(true), { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setSiap(true), 800);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (kurangi || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    const gerak = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCondong(Math.max(-1, Math.min(1, (e.clientX / window.innerWidth - 0.6) * 2.5))));
    };
    window.addEventListener("pointermove", gerak, { passive: true });
    return () => {
      window.removeEventListener("pointermove", gerak);
      cancelAnimationFrame(raf);
    };
  }, [kurangi]);

  return (
    <div className={`aspect-[760/400] transition-transform duration-300 ease-out ${className}`} style={{ transform: `translateX(${condong * 8}px) rotate(${condong * 4}deg)` }}>
      {siap && !kurangi ? <PemutarRobot label={t("Maskot robot ChatGerCep: ketuk supaya melesat", "ChatGerCep robot mascot: tap to make it dash")} /> : <Diam />}
    </div>
  );
}

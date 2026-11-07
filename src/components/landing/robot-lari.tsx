"use client";

import { useEffect, useRef, useState } from "react";
import { useBahasa } from "@/components/bahasa";

/**
 * Maskot robot ChatGerCep berlari kencang di samping HP demo (hero landing). Sprite 4 pose (public/maskot/robot-lari.webp,
 * 4 sel 315x280) diputar lewat transform + steps() di CSS (GPU, tanpa JavaScript per frame), ditambah badan naik-turun,
 * bayangan, dan garis kecepatan. Interaksi:
 *   - kursor mendekat (desktop): robot condong ke arah kursor;
 *   - hover / sentuh: TURBO (langkah 2x lebih cepat, kilat lebih terang, gelembung "Gercep!");
 *   - klik / ketuk: melesat maju lalu kembali, gelembung "Dibalas < 5 detik!".
 * Hemat: gambar baru dimuat setelah halaman tampil (requestIdleCallback), jadi tidak berebut dengan konten utama;
 * animasi berhenti saat tidak terlihat (IntersectionObserver) dan untuk prefers-reduced-motion.
 */
export function RobotLari({ className = "" }: { className?: string }) {
  const { t } = useBahasa();
  const ref = useRef<HTMLButtonElement>(null);
  const [siap, setSiap] = useState(false);
  const [terlihat, setTerlihat] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const [melesat, setMelesat] = useState(0);
  const [condong, setCondong] = useState({ x: 0, y: 0 });

  // Muat sprite setelah halaman tenang, lalu tampilkan dengan pudar masuk.
  useEffect(() => {
    let batal = false;
    const muat = () => {
      const img = new Image();
      img.decoding = "async";
      img.src = "/maskot/robot-lari.webp";
      img.decode().then(
        () => !batal && setSiap(true),
        () => !batal && setSiap(true),
      );
    };
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(muat, { timeout: 1500 }) : window.setTimeout(muat, 600);
    return () => {
      batal = true;
      if (!w.requestIdleCallback) window.clearTimeout(id);
    };
  }, []);

  // Animasi dijeda saat robot keluar layar (hemat baterai HP).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setTerlihat(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Condong mengikuti kursor (hanya perangkat dengan kursor), dibatasi kecil supaya tetap halus.
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    const gerak = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const b = el.getBoundingClientRect();
        const dx = (e.clientX - (b.left + b.width / 2)) / window.innerWidth;
        const dy = (e.clientY - (b.top + b.height / 2)) / window.innerHeight;
        setCondong({ x: Math.max(-1, Math.min(1, dx * 2)), y: Math.max(-1, Math.min(1, dy * 2)) });
      });
    };
    window.addEventListener("pointermove", gerak, { passive: true });
    return () => {
      window.removeEventListener("pointermove", gerak);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Sentuhan (HP): turbo sebentar lalu kembali normal.
  useEffect(() => {
    if (!turbo || window.matchMedia("(hover: hover)").matches) return;
    const id = window.setTimeout(() => setTurbo(false), 1600);
    return () => window.clearTimeout(id);
  }, [turbo, melesat]);

  const gelembung = melesat ? t("Dibalas < 5 detik!", "Replied in < 5 sec!") : turbo ? t("Gercep!", "Lightning fast!") : null;

  return (
    <button
      ref={ref}
      type="button"
      aria-label={t("Maskot robot ChatGerCep: ketuk supaya lari makin kencang", "ChatGerCep robot mascot: tap to make it sprint")}
      data-analitik="Hero: robot lari"
      onPointerEnter={() => setTurbo(true)}
      onPointerLeave={() => setTurbo(false)}
      onClick={() => {
        setTurbo(true);
        setMelesat((n) => n + 1);
      }}
      className={`robot-lari group select-none ${siap ? "opacity-100" : "opacity-0"} ${turbo ? "robot-turbo" : ""} ${terlihat ? "" : "robot-jeda"} ${className}`}
      style={{ "--condong-x": condong.x, "--condong-y": condong.y } as React.CSSProperties}
    >
      {gelembung && (
        <span key={`${gelembung}-${melesat}`} className="robot-gelembung">
          {gelembung}
        </span>
      )}
      <span aria-hidden className="robot-garis">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span aria-hidden className="robot-bayangan" />
      <span aria-hidden key={melesat} className={`robot-tubuh ${melesat ? "robot-melesat" : ""}`}>
        <span className="robot-bingkai">
          {siap && (
            // eslint-disable-next-line @next/next/no-img-element -- sprite dipotong lewat transform; next/image tidak perlu di sini
            <img src="/maskot/robot-lari.webp" alt="" width={1260} height={280} decoding="async" draggable={false} className="robot-sprite" />
          )}
        </span>
      </span>
    </button>
  );
}

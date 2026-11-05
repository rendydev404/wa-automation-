"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { useBahasa } from "@/components/bahasa";
import { ALUR_DURASI, ALUR_FPS, AlurDemo, PANJANG_BABAK } from "@/remotion/alur-demo";
import { CHAT_FPS, CHAT_LEBAR, CHAT_TINGGI, ChatDemo, type PropsChatDemo, durasiChat } from "@/remotion/chat-demo";

/**
 * Pemutar Remotion untuk landing page. Modul ini (beserta remotion & @remotion/player) dimuat terpisah
 * lewat next/dynamic, jadi tidak membebani bundel awal halaman. Bahasa halaman diteruskan ke komposisi sebagai
 * input prop `bahasa` (komposisi Remotion tidak membaca konteks React).
 */

const KUERI_GERAK = "(prefers-reduced-motion: reduce)";

function useGerakDikurangi(): boolean {
  return useSyncExternalStore(
    (ubah) => {
      const m = window.matchMedia(KUERI_GERAK);
      m.addEventListener("change", ubah);
      return () => m.removeEventListener("change", ubah);
    },
    () => window.matchMedia(KUERI_GERAK).matches,
    () => false,
  );
}

/** Putar hanya selagi terlihat di layar: hemat CPU/baterai saat pengunjung menggulir ke bagian lain. */
function usePutarSaatTerlihat(ref: React.RefObject<PlayerRef | null>, wadah: React.RefObject<HTMLDivElement | null>, aktif: boolean) {
  useEffect(() => {
    const el = wadah.current;
    if (!el || !aktif) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? ref.current?.play() : ref.current?.pause()), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, wadah, aktif]);
}

export function PemutarChat({ skenario }: { skenario: PropsChatDemo }) {
  const ref = useRef<PlayerRef>(null);
  const wadah = useRef<HTMLDivElement>(null);
  const kurangi = useGerakDikurangi();
  const { b } = useBahasa();
  const props = useMemo(() => ({ ...skenario, bahasa: b }), [skenario, b]);
  const durasi = durasiChat(skenario.pesan);
  usePutarSaatTerlihat(ref, wadah, !kurangi);

  return (
    <div ref={wadah} className="w-full" style={{ aspectRatio: `${CHAT_LEBAR} / ${CHAT_TINGGI}` }}>
      <Player
        ref={ref}
        component={ChatDemo}
        inputProps={props}
        durationInFrames={durasi}
        fps={CHAT_FPS}
        compositionWidth={CHAT_LEBAR}
        compositionHeight={CHAT_TINGGI}
        style={{ width: "100%", height: "100%" }}
        loop
        autoPlay={!kurangi}
        initialFrame={kurangi ? durasi - 100 : 0}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        acknowledgeRemotionLicense
      />
    </div>
  );
}

/** Pemutar "cara kerja": `minta` = babak yang diklik pengunjung; `onBabak` melaporkan babak yang sedang tampil. */
export function PemutarAlur({ minta, onBabak }: { minta: { babak: number; n: number }; onBabak: (i: number) => void }) {
  const ref = useRef<PlayerRef>(null);
  const wadah = useRef<HTMLDivElement>(null);
  const kurangi = useGerakDikurangi();
  const { b } = useBahasa();
  const props = useMemo(() => ({ bahasa: b }), [b]);
  usePutarSaatTerlihat(ref, wadah, !kurangi);

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    let lalu = -1;
    const saatFrame = (e: { detail: { frame: number } }) => {
      const b = Math.min(2, Math.floor(e.detail.frame / PANJANG_BABAK));
      if (b !== lalu) onBabak((lalu = b));
    };
    p.addEventListener("frameupdate", saatFrame);
    return () => p.removeEventListener("frameupdate", saatFrame);
  }, [onBabak]);

  useEffect(() => {
    if (minta.n === 0) return;
    // Gerak dikurangi: langsung ke akhir babak (keadaan selesai), tanpa animasi.
    ref.current?.seekTo(minta.babak * PANJANG_BABAK + (kurangi ? PANJANG_BABAK - 5 : 0));
    if (!kurangi) ref.current?.play();
    else onBabak(minta.babak);
  }, [minta, kurangi, onBabak]);

  return (
    <div ref={wadah} className="aspect-[1200/700] w-full overflow-hidden rounded-[28px] ring-1 ring-ink-line">
      <Player
        ref={ref}
        component={AlurDemo}
        inputProps={props}
        durationInFrames={ALUR_DURASI}
        fps={ALUR_FPS}
        compositionWidth={1200}
        compositionHeight={700}
        style={{ width: "100%", height: "100%" }}
        loop
        autoPlay={!kurangi}
        initialFrame={kurangi ? PANJANG_BABAK - 5 : 0}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        acknowledgeRemotionLicense
      />
    </div>
  );
}

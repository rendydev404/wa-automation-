"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BarChart3, ChevronLeft, ChevronRight, ClipboardList, Compass, Cpu, Lightbulb, Minus, Stethoscope, X } from "lucide-react";
import Link from "@/components/link";
import { useBahasa } from "@/components/bahasa";
import { type IsiTur, useTurOpsional } from "@/components/tur";
import { useFiturBaruTampil } from "@/components/kartu-fitur-baru";
import { useWaStatus } from "@/components/wa-status";
import type { RingkasAktivitas } from "@/lib/aktivitas";
import { EfekPose, GambarPose, type Pose, siapkanPose } from "./pose";
import { type Aksi, type DataMaskot, type Langsung, type Nada, type Pesan, type Topik, celoteh, jawab, keadaan, sapaan } from "./pesan";

/**
 * Maskot robot interaktif di Ringkasan (dashboard pengguna & panel admin), melayang di pojok kanan bawah.
 * - Pose & efek mengikuti keadaan asli: membalas chat (detak balasan dari poller status), bekerja/siaga, jaga malam,
 *   kaget saat nomor terputus / AI mati, sedih saat kuota habis, berpikir saat menyusun jawaban, memandu tur.
 * - Gelembung berisi data asli (dari server saat halaman dimuat + poller status yang sudah ada, tanpa permintaan
 *   tambahan), diketik seperti chat, dengan tombol tindakan dan tombol tanya cepat.
 * - Interaktif: condong ke arah kursor, melompat saat disentuh, bereaksi saat ditekan berkali-kali, bisa dikecilkan
 *   (diingat per perangkat). Gerak dikurangi = tanpa animasi & tanpa efek ketik.
 */

const KUNCI_KECIL = "maskot:kecil";
const KUNCI_SAPA = "maskot:sapa";
const KUERI_GERAK = "(prefers-reduced-motion: reduce)";
const LAMA_RINGKAS_MS = 9000;
const LAMA_PIKIR_MS = 650;

const tanpaLangganan = () => () => {};

function simpan(jenis: "local" | "session", kunci: string, nilai: string | null): void {
  try {
    const s = jenis === "local" ? localStorage : sessionStorage;
    if (nilai === null) s.removeItem(kunci);
    else s.setItem(kunci, nilai);
  } catch {
    // penyimpanan diblokir (mode privat): maskot tetap jalan, hanya tidak ingat
  }
}
function baca(jenis: "local" | "session", kunci: string): string | null {
  try {
    return (jenis === "local" ? localStorage : sessionStorage).getItem(kunci);
  } catch {
    return null;
  }
}

function useKurangiGerak(): boolean {
  return useSyncExternalStore(
    (ubah) => {
      const m = window.matchMedia(KUERI_GERAK);
      m.addEventListener("change", ubah);
      return () => m.removeEventListener("change", ubah);
    },
    () => window.matchMedia(KUERI_GERAK).matches,
    () => true,
  );
}

/** Teks muncul huruf demi huruf seperti sedang diketik; gerak dikurangi = langsung utuh. */
function useKetik(teks: string, mati: boolean): string {
  const [n, setN] = useState(0);
  const [asal, setAsal] = useState(teks);
  if (asal !== teks) {
    setAsal(teks);
    setN(0);
  }
  useEffect(() => {
    if (mati || n >= teks.length) return;
    const id = window.setTimeout(() => setN((x) => Math.min(teks.length, x + 2)), 14);
    return () => window.clearTimeout(id);
  }, [n, teks, mati]);
  return mati ? teks : teks.slice(0, n);
}

const WARNA_NADA: Record<Nada, string> = {
  baik: "bg-accent",
  info: "bg-[#6c8fd6]",
  waspada: "bg-warning",
  bahaya: "bg-danger",
};

interface Tombol {
  label: string;
  ikon: ReactNode;
  topik?: Topik;
  tur?: true;
}

/**
 * Detak AI langsung (Server-Sent Events /api/wa/detak): nomor akun ini sedang mengetik / balasan baru terkirim, saat
 * itu juga. Aliran hanya dibuka selama tab terlihat (tab di latar = koneksi ditutup, tanpa beban server); putus =
 * EventSource menyambung lagi sendiri. Polling status 20 detik tetap jadi cadangan.
 */
function useDetakLangsung(): RingkasAktivitas | null {
  const [nilai, setNilai] = useState<RingkasAktivitas | null>(null);
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    const buka = () => {
      if (es || document.visibilityState !== "visible") return;
      es = new EventSource("/api/wa/detak");
      es.onmessage = (e) => {
        try {
          setNilai(JSON.parse(e.data) as RingkasAktivitas);
        } catch {
          // kiriman rusak diabaikan
        }
      };
    };
    const tutup = () => {
      es?.close();
      es = null;
    };
    const ubah = () => (document.visibilityState === "visible" ? buka() : tutup());
    buka();
    document.addEventListener("visibilitychange", ubah);
    return () => {
      document.removeEventListener("visibilitychange", ubah);
      tutup();
    };
  }, []);
  return nilai;
}

export function Maskot({ data, tur }: { data: DataMaskot; tur?: { nama: string; langkah: IsiTur } }) {
  const { b, t } = useBahasa();
  const { data: status } = useWaStatus();
  const turK = useTurOpsional();
  const fiturBaru = useFiturBaruTampil();
  const kurangi = useKurangiGerak();
  const terhidrasi = useSyncExternalStore(tanpaLangganan, () => true, () => false);

  // ---- Data hidup: detak balasan sejak halaman dimuat ----
  const langsungSse = useDetakLangsung();
  // Yang terbaru (jam server) antara polling status dan aliran langsung.
  const ap = status?.aktivitas ?? null;
  const a = langsungSse && (!ap || langsungSse.kini >= ap.kini) ? langsungSse : ap;
  // Hitungan detak pertama yang terlihat = titik nol; selisih berikutnya ditambahkan ke angka hari ini dari server.
  const [dasar, setDasar] = useState<{ masuk: number; dibalas: number } | null>(null);
  if (a && !dasar) setDasar({ masuk: a.masuk, dibalas: a.dibalas });
  const langsung: Langsung = useMemo(
    () => ({
      ai: status ? status.ai : null,
      status: status ? status.nomor : null,
      aktivitas: a,
      tambah: a && dasar ? { masuk: Math.max(0, a.masuk - dasar.masuk), dibalas: Math.max(0, a.dibalas - dasar.dibalas) } : { masuk: 0, dibalas: 0 },
    }),
    [status, a, dasar],
  );
  const kini = useMemo(() => keadaan(data, langsung, t), [data, langsung, t]);
  const jumlahMasalah = useMemo(() => {
    if (data.jenis === "admin") return jawab("tindak", data, langsung, t, b, 0).filter((p) => p.id !== "aman").length;
    return jawab("masalah", data, langsung, t, b, 0).filter((p) => p.nada === "bahaya" || p.nada === "waspada").length;
  }, [data, langsung, t, b]);

  // ---- Keadaan tampilan ----
  // Dibaca saat render pertama di klien; selama hidrasi komponen belum menggambar apa pun, jadi tanpa selisih HTML.
  const [kecil, setKecil] = useState(() => typeof window !== "undefined" && baca("local", KUNCI_KECIL) === "1");
  const [buka, setBuka] = useState<false | "ringkas" | "penuh">(false);
  const [antrean, setAntrean] = useState<Pesan[]>([]);
  const [idx, setIdx] = useState(0);
  const [pikir, setPikir] = useState(false);
  const [reaksi, setReaksi] = useState<Pose | null>(null);
  const [gerak, setGerak] = useState<{ kelas: string; n: number }>({ kelas: "", n: 0 });
  const [hati, setHati] = useState<{ id: number; x: number }[]>([]);
  const [condong, setCondong] = useState(0);
  const [arah, setArah] = useState(false); // kursor di atas robot
  const putaran = useRef(0);
  const klik = useRef<number[]>([]);
  const nCeloteh = useRef(0);
  const timerReaksi = useRef<number | undefined>(undefined);
  const timerTutup = useRef<number | undefined>(undefined);
  const tahan = useRef(false); // kursor/fokus di gelembung: jangan tutup otomatis
  const robot = useRef<HTMLButtonElement>(null);

  const pesan = antrean[Math.min(idx, antrean.length - 1)] as Pesan | undefined;
  const pose: Pose = pikir ? "berpikir" : reaksi ?? (buka && pesan ? pesan.pose : kini.pose);
  const teks = useKetik(pikir ? "" : (pesan?.teks ?? ""), kurangi);

  const animasi = useCallback((kelas: string) => setGerak((g) => ({ kelas, n: g.n + 1 })), []);
  const beriReaksi = useCallback((p: Pose, ms = 2200) => {
    window.clearTimeout(timerReaksi.current);
    setReaksi(p);
    timerReaksi.current = window.setTimeout(() => setReaksi(null), ms);
  }, []);

  const jadwalTutup = useCallback(() => {
    window.clearTimeout(timerTutup.current);
    timerTutup.current = window.setTimeout(() => {
      if (!tahan.current) setBuka((x) => (x === "ringkas" ? false : x));
    }, LAMA_RINGKAS_MS);
  }, []);

  const tampilkan = useCallback(
    (daftar: Pesan[], mode: "ringkas" | "penuh") => {
      if (!daftar.length) return;
      setAntrean(daftar);
      setIdx(0);
      setBuka((x) => (x === "penuh" ? "penuh" : mode));
      if (mode === "ringkas") jadwalTutup();
    },
    [jadwalTutup],
  );

  // Sapa sekali per tab (selanjutnya hanya bila ada yang mendesak), setelah status pertama tiba supaya sapaan langsung
  // menyebut masalah yang benar (nomor terputus, AI mati).
  const sudahSapa = useRef(false);
  const sapa = useEffectEvent(() => {
    const daftar = sapaan(data, langsung, t, b);
    const pernah = baca("session", KUNCI_SAPA) === "1";
    // Sudah disapa di tab ini dan tidak ada yang mendesak: diam (menekan robot tetap memunculkan sapaan).
    if (pernah && daftar[0].nada !== "bahaya" && daftar[0].nada !== "waspada") return;
    simpan("session", KUNCI_SAPA, "1");
    tampilkan(daftar, "ringkas");
    animasi("maskot-lambai");
  });
  const adaStatus = status !== null;
  const turAktif = !!turK?.aktif;
  useEffect(() => {
    if (!terhidrasi || !adaStatus || turAktif || sudahSapa.current) return;
    sudahSapa.current = true;
    const id = window.setTimeout(sapa, 700);
    return () => {
      window.clearTimeout(id);
      sudahSapa.current = false; // dibatalkan sebelum sempat menyapa (mis. StrictMode): coba lagi di putaran berikutnya
    };
  }, [terhidrasi, adaStatus, turAktif]);

  // Reaksi pada kejadian hidup: balasan baru terkirim, nomor terputus, AI mati.
  const reaksiKejadian = useEffectEvent((masalah: boolean, baru: number) => {
    if (masalah) {
      animasi("maskot-goyang");
      const m = data.jenis === "admin" ? jawab("tindak", data, langsung, t, b, 0) : jawab("masalah", data, langsung, t, b, 0);
      if (buka !== "penuh") tampilkan(m, "ringkas");
    } else if (baru > 0) {
      animasi("maskot-lompat");
      beriReaksi("jempol", 2600);
      if (!buka)
        tampilkan(
          [
            {
              id: `baru-${langsung.tambah.dibalas}`,
              pose: "membalas",
              nada: "baik",
              teks: t(`Barusan saya membalas ${baru} chat pelanggan 💬`, `I just replied to ${baru} customer ${baru === 1 ? "chat" : "chats"} 💬`),
            },
          ],
          "ringkas",
        );
    }
  });

  const lalu = useRef<{ dibalas: number; putus: Set<number>; ai: boolean | null } | null>(null);
  useEffect(() => {
    if (!status) return;
    const putus = new Set(
      Object.entries(status.nomor)
        .filter(([, s]) => s.status === "STOPPED" || s.status === "FAILED")
        .map(([id]) => Number(id)),
    );
    const sebelum = lalu.current;
    lalu.current = { dibalas: langsung.tambah.dibalas, putus, ai: status.ai };
    if (!sebelum) return;
    const baru = langsung.tambah.dibalas - sebelum.dibalas;
    const putusBaru = [...putus].some((id) => !sebelum.putus.has(id));
    const aiMati = sebelum.ai !== false && status.ai === false;
    if (!aiMati && !putusBaru && baru <= 0) return;
    // Dijadwalkan (bukan langsung di badan efek): reaksi berjalan setelah render data baru selesai.
    const id = window.setTimeout(() => reaksiKejadian(aiMati || putusBaru, baru), 0);
    return () => window.clearTimeout(id);
  }, [status, langsung]);

  // Condong ke arah kursor (desktop saja).
  useEffect(() => {
    if (kurangi || kecil || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    const gerakKursor = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = robot.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        setCondong(Math.max(-1, Math.min(1, dx / 420)));
      });
    };
    window.addEventListener("pointermove", gerakKursor, { passive: true });
    return () => {
      window.removeEventListener("pointermove", gerakKursor);
      cancelAnimationFrame(raf);
    };
  }, [kurangi, kecil]);

  // Esc menutup gelembung.
  useEffect(() => {
    if (!buka) return;
    const tombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBuka(false);
    };
    document.addEventListener("keydown", tombol);
    return () => document.removeEventListener("keydown", tombol);
  }, [buka]);

  useEffect(
    () => () => {
      window.clearTimeout(timerReaksi.current);
      window.clearTimeout(timerTutup.current);
    },
    [],
  );

  const tekanRobot = () => {
    const now = Date.now();
    klik.current = [...klik.current.filter((x) => now - x < 1600), now];
    animasi("maskot-lompat");
    if (klik.current.length >= 4) {
      klik.current = [];
      const c = celoteh(t, nCeloteh.current++);
      beriReaksi(c.pose, 2400);
      setHati((h) => [...h.slice(-6), ...[0, 1, 2].map((i) => ({ id: now + i, x: (i - 1) * 14 + Math.round(Math.random() * 8 - 4) }))]);
      tampilkan([c], "ringkas");
      return;
    }
    if (buka === "penuh") {
      setBuka(false);
      return;
    }
    void siapkanPose("berpikir");
    setAntrean((x) => (x.length ? x : sapaan(data, langsung, t, b)));
    setBuka("penuh");
    window.clearTimeout(timerTutup.current);
  };

  const tanya = (tb: Tombol) => {
    if (tb.tur) {
      if (tur && turK) {
        setBuka(false);
        turK.mulai(tur.nama, tur.langkah(t));
      }
      return;
    }
    if (!tb.topik) return;
    const topik = tb.topik;
    setBuka("penuh");
    setPikir(true);
    window.clearTimeout(timerTutup.current);
    window.setTimeout(
      () => {
        const daftar = jawab(topik, data, langsung, t, b, putaran.current++);
        setAntrean(daftar);
        setIdx(0);
        setPikir(false);
        animasi("maskot-lompat");
      },
      kurangi ? 0 : LAMA_PIKIR_MS,
    );
  };

  const kecilkan = (ya: boolean) => {
    setKecil(ya);
    setBuka(false);
    simpan("local", KUNCI_KECIL, ya ? "1" : null);
  };

  const tombol: Tombol[] =
    data.jenis === "pengguna"
      ? [
          { topik: "hari", label: t("Gimana hari ini?", "How's today going?"), ikon: <BarChart3 className="size-3.5" aria-hidden /> },
          { topik: "masalah", label: t("Ada masalah?", "Any problems?"), ikon: <Stethoscope className="size-3.5" aria-hidden /> },
          { topik: "tips", label: t("Kasih tips", "Give me a tip"), ikon: <Lightbulb className="size-3.5" aria-hidden /> },
          ...(tur && turK ? [{ tur: true as const, label: t("Ajak keliling", "Show me around"), ikon: <Compass className="size-3.5" aria-hidden /> }] : []),
        ]
      : [
          { topik: "ringkas", label: "Ringkas 30 hari", ikon: <BarChart3 className="size-3.5" aria-hidden /> },
          { topik: "tindak", label: "Perlu ditindak?", ikon: <ClipboardList className="size-3.5" aria-hidden /> },
          { topik: "ai", label: "Biaya & mesin AI", ikon: <Cpu className="size-3.5" aria-hidden /> },
          ...(tur && turK ? [{ tur: true as const, label: "Ajak keliling", ikon: <Compass className="size-3.5" aria-hidden /> }] : []),
        ];

  if (!terhidrasi || turK?.aktif || fiturBaru) return null;

  const membalas = !buka && kini.pose === "membalas" && !reaksi;

  if (kecil)
    return (
      <div className="fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[35] lg:right-6 lg:bottom-6">
        <button
          type="button"
          onClick={() => kecilkan(false)}
          aria-label={t(`Tampilkan maskot GerCep (${kini.label})`, `Show the GerCep mascot (${kini.label})`)}
          className="maskot-piringan group relative grid size-14 place-items-center overflow-hidden rounded-full ring-2 ring-white transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <GambarPose pose={kini.pose} className="absolute top-0.5 left-1/2 w-[120%] max-w-none -translate-x-1/2" />
          <TitikStatus nada={kini.nada} className="right-1 bottom-1" />
          {jumlahMasalah > 0 && <Lencana n={jumlahMasalah} />}
        </button>
      </div>
    );

  return (
    <div className="pointer-events-none fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[35] flex flex-col items-end lg:right-6 lg:bottom-5">
      {buka && (pesan || pikir) && (
        <Gelembung
          penuh={buka === "penuh"}
          pesan={pesan}
          teks={teks}
          pikir={pikir}
          idx={idx}
          total={antrean.length}
          status={kini}
          tombol={tombol}
          onIdx={setIdx}
          onTanya={tanya}
          onPenuh={() => {
            setBuka("penuh");
            window.clearTimeout(timerTutup.current);
          }}
          onTutup={() => setBuka(false)}
          onKecil={() => kecilkan(true)}
          onTahan={(ya) => {
            tahan.current = ya;
            if (!ya && buka === "ringkas") jadwalTutup();
          }}
          onAksi={(x) => {
            if ("klik" in x) {
              document.querySelector<HTMLElement>(x.klik)?.click();
              setBuka(false);
            } else if ("tur" in x && tur && turK) {
              setBuka(false);
              turK.mulai(tur.nama, tur.langkah(t));
            }
          }}
        />
      )}

      {membalas && (
        <div aria-hidden className="pointer-events-none mr-2 mb-1 flex animate-masuk items-center gap-2 rounded-full rounded-br-sm bg-surface px-3 py-1.5 text-[12px] font-semibold text-fg shadow-pop ring-1 ring-line">
          <span className="flex gap-0.5">
            {[0, 0.15, 0.3].map((d) => (
              <span key={d} className="maskot-titik block size-1.5 rounded-full bg-accent" style={{ animationDelay: `${d}s` }} />
            ))}
          </span>
          <span className="max-w-[200px] truncate">{kini.label}</span>
        </div>
      )}

      {!buka && !membalas && arah && (
        <div aria-hidden className="pointer-events-none mr-2 mb-1 animate-masuk rounded-full bg-ink px-3 py-1 text-[11.5px] font-semibold text-ink-fg shadow-pop">
          {kini.label} · {t("ketuk saya", "tap me")}
        </div>
      )}

      <button
        ref={robot}
        type="button"
        onClick={tekanRobot}
        onPointerEnter={() => {
          setArah(true);
          if (!buka) animasi("maskot-lompat");
        }}
        onPointerLeave={() => setArah(false)}
        aria-expanded={buka === "penuh"}
        aria-label={t(`Maskot GerCep: ${kini.label}. Tekan untuk mengobrol.`, `GerCep mascot: ${kini.label}. Press to chat.`)}
        className="group pointer-events-auto relative h-[114px] w-[104px] touch-manipulation rounded-full outline-none [--maskot-r:42px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lg:h-[140px] lg:w-[128px] lg:[--maskot-r:52px]"
      >
        {/* Piringan tempat robot "berdiri" + bayangan */}
        <span aria-hidden className="maskot-piringan absolute bottom-0 left-1/2 size-[84px] -translate-x-1/2 rounded-full ring-2 ring-white lg:size-[104px]" />
        {/* Badan: condong (kursor) > apung (terus) > lompat/goyang (sekali) */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 block transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${condong * 4}px) rotate(${condong * 7}deg)`, transformOrigin: "50% 100%" }}
        >
          <span className={`block ${kurangi ? "" : "maskot-apung"}`}>
            <span key={gerak.n} className={`relative block ${gerak.kelas}`} style={{ transformOrigin: "50% 90%" }}>
              <span className="maskot-badan relative block aspect-[256/250] w-full">
                <GambarPose pose={pose} prioritas className="absolute inset-0 size-full" />
              </span>
              <EfekPose pose={pose} />
            </span>
          </span>
        </span>
        <TitikStatus nada={kini.nada} className="right-[14px] bottom-1.5 lg:right-[18px] lg:bottom-2" />
        {jumlahMasalah > 0 && !buka && <Lencana n={jumlahMasalah} />}
        {hati.map((h) => (
          <span
            key={h.id}
            aria-hidden
            className="maskot-hati pointer-events-none absolute top-6 left-1/2 text-lg"
            style={{ ["--x" as string]: `${h.x}px` }}
            onAnimationEnd={() => setHati((x) => x.filter((y) => y.id !== h.id))}
          >
            💚
          </span>
        ))}
      </button>
    </div>
  );
}

function TitikStatus({ nada, className = "" }: { nada: Nada; className?: string }) {
  return (
    <span aria-hidden className={`absolute grid size-3.5 place-items-center rounded-full bg-white ${className}`}>
      <span className={`size-2.5 rounded-full ${WARNA_NADA[nada]} ${nada === "baik" ? "animate-denyut" : ""}`} />
    </span>
  );
}

function Lencana({ n }: { n: number }) {
  return (
    <span aria-hidden className="maskot-pop absolute top-7 left-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white shadow ring-2 ring-white lg:top-9 lg:left-2" style={{ animationIterationCount: 1, animationFillMode: "forwards" }}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

function Gelembung(p: {
  penuh: boolean;
  pesan: Pesan | undefined;
  teks: string;
  pikir: boolean;
  idx: number;
  total: number;
  status: { label: string; nada: Nada };
  tombol: Tombol[];
  onIdx: (i: number) => void;
  onTanya: (tb: Tombol) => void;
  onPenuh: () => void;
  onTutup: () => void;
  onKecil: () => void;
  onTahan: (ya: boolean) => void;
  onAksi: (a: Aksi) => void;
}) {
  const { t } = useBahasa();
  const { pesan, teks, pikir } = p;
  const selesai = !!pesan && teks.length >= pesan.teks.length;
  return (
    <div
      role="dialog"
      aria-label={t("Obrolan maskot GerCep", "GerCep mascot chat")}
      onPointerEnter={() => p.onTahan(true)}
      onPointerLeave={() => p.onTahan(false)}
      onFocus={() => p.onTahan(true)}
      onBlur={() => p.onTahan(false)}
      className="pointer-events-auto relative mr-1 mb-2 w-[min(330px,calc(100vw-24px))] animate-masuk overflow-hidden rounded-2xl rounded-br-md bg-surface text-fg shadow-pop ring-1 ring-line"
    >
      <span aria-hidden className={`block h-1 w-full ${pesan ? WARNA_NADA[pesan.nada] : "bg-accent"} transition-colors`} />
      <div className="flex items-center gap-2 px-4 pt-3">
        <p className="text-[13px] font-extrabold tracking-tight">
          Ger<span className="text-accent">Cep</span>
        </p>
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">
          <span className={`size-1.5 shrink-0 rounded-full ${WARNA_NADA[p.status.nada]}`} />
          <span className="truncate">{p.status.label}</span>
        </span>
        <span className="ml-auto flex shrink-0 gap-0.5">
          <button type="button" onClick={p.onKecil} aria-label={t("Kecilkan maskot", "Minimize mascot")} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg">
            <Minus className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={p.onTutup} aria-label={t("Tutup obrolan", "Close chat")} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg">
            <X className="size-4" aria-hidden />
          </button>
        </span>
      </div>

      <div className="px-4 pt-1.5 pb-3">
        {/* Teks utuh untuk pembaca layar; yang terlihat diketik bertahap. */}
        <p className="sr-only" aria-live="polite">
          {pikir ? t("Sedang berpikir…", "Thinking…") : pesan?.teks}
        </p>
        {pikir ? (
          <p aria-hidden className="flex h-[42px] items-center gap-1">
            {[0, 0.15, 0.3].map((d) => (
              <span key={d} className="maskot-titik block size-2 rounded-full bg-accent" style={{ animationDelay: `${d}s` }} />
            ))}
          </p>
        ) : (
          <p aria-hidden className={`min-h-[42px] text-[13.5px] leading-relaxed ${selesai ? "" : "maskot-kursor"}`}>
            {teks}
          </p>
        )}

        {!pikir && pesan?.aksi && selesai && (
          <div className="mt-2.5 animate-masuk">
            {"href" in pesan.aksi ? (
              <Link href={pesan.aksi.href} className="btn btn-primary h-9 px-3.5 text-[12.5px]">
                {pesan.aksi.label} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : (
              <button type="button" onClick={() => p.onAksi(pesan.aksi!)} className="btn btn-primary h-9 px-3.5 text-[12.5px]">
                {pesan.aksi.label} <ArrowRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}

        {!pikir && p.total > 1 && (
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={p.idx === 0}
              onClick={() => p.onIdx(p.idx - 1)}
              aria-label={t("Pesan sebelumnya", "Previous message")}
              className="grid size-7 place-items-center rounded-lg border border-line text-muted hover:bg-subtle disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="flex gap-1" aria-hidden>
              {Array.from({ length: p.total }, (_, k) => (
                <span key={k} className={`h-1.5 rounded-full transition-all ${k === p.idx ? "w-4 bg-accent" : "w-1.5 bg-line-strong"}`} />
              ))}
            </span>
            <span className="sr-only">{t(`Pesan ${p.idx + 1} dari ${p.total}`, `Message ${p.idx + 1} of ${p.total}`)}</span>
            <button
              type="button"
              disabled={p.idx >= p.total - 1}
              onClick={() => p.onIdx(p.idx + 1)}
              aria-label={t("Pesan berikutnya", "Next message")}
              className="grid size-7 place-items-center rounded-lg border border-line text-muted hover:bg-subtle disabled:opacity-40"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {p.penuh ? (
        <div className="flex flex-wrap gap-1.5 border-t border-line bg-subtle/60 px-3 py-2.5">
          {p.tombol.map((tb) => (
            <button
              key={tb.label}
              type="button"
              onClick={() => p.onTanya(tb)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-fg transition-colors hover:border-accent hover:text-accent active:scale-95"
            >
              <span className="text-accent">{tb.ikon}</span>
              {tb.label}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" onClick={p.onPenuh} className="flex w-full items-center justify-between border-t border-line bg-subtle/60 px-4 py-2 text-[12px] font-semibold text-accent hover:bg-subtle">
          {t("Tanya saya sesuatu", "Ask me something")}
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

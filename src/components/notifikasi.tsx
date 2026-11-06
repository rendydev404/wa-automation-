"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CalendarClock, CheckCheck, CreditCard, Gauge, Gift, HandCoins, Loader2, MessageCircleWarning, Package, Share2, Unplug, UserPlus, Wallet } from "lucide-react";
import Link from "@/components/link";
import { waktuSingkatWib } from "@/lib/format";
import { useBahasa, useRouterBahasa } from "./bahasa";
import { PengaturPush, useSinkronPush } from "./push-admin";
import { useWaStatus } from "./wa-status";

/** Bentuk notifikasi dari /api/notifikasi (lihat src/lib/notifikasi.ts). */
export interface NotifKlien {
  id: number;
  jenis: string;
  judul: string;
  judul_en: string | null;
  isi: string;
  isi_en: string | null;
  tautan: string | null;
  dibaca: number | null;
  dibuat: number;
}

const IKON: Record<string, { ikon: typeof Bell; warna: string }> = {
  pembayaran: { ikon: CreditCard, warna: "bg-success-soft text-success" },
  paket: { ikon: Package, warna: "bg-success-soft text-success" },
  paket_berakhir: { ikon: CalendarClock, warna: "bg-warning-soft text-warning" },
  kuota: { ikon: Gauge, warna: "bg-warning-soft text-warning" },
  bonus: { ikon: Gift, warna: "bg-accent-soft text-accent" },
  afiliasi: { ikon: Share2, warna: "bg-accent-soft text-accent" },
  nomor: { ikon: Unplug, warna: "bg-danger-soft text-danger" },
  admin_daftar: { ikon: UserPlus, warna: "bg-accent-soft text-accent" },
  admin_bayar: { ikon: Wallet, warna: "bg-success-soft text-success" },
  admin_afiliasi: { ikon: HandCoins, warna: "bg-warning-soft text-warning" },
  admin_followup: { ikon: MessageCircleWarning, warna: "bg-danger-soft text-danger" },
};

/** Satu baris notifikasi: dipakai di panel lonceng dan halaman /notifikasi. */
export function ItemNotif({ n, kini, onBuka }: { n: NotifKlien; kini: number; onBuka: (n: NotifKlien) => void }) {
  const { b } = useBahasa();
  const { ikon: Ikon, warna } = IKON[n.jenis] ?? { ikon: Bell, warna: "bg-subtle text-muted" };
  const judul = b === "en" && n.judul_en ? n.judul_en : n.judul;
  const isi = b === "en" && n.isi_en ? n.isi_en : n.isi;
  return (
    <button
      type="button"
      onClick={() => onBuka(n)}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle/70 ${n.dibaca ? "" : "bg-accent-soft/40"}`}
    >
      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${warna}`}>
        <Ikon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] leading-snug ${n.dibaca ? "font-medium text-fg" : "font-bold text-fg"}`}>{judul}</span>
        {isi && <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-muted">{isi}</span>}
        <span className="mt-1 block text-[11.5px] text-faint">{waktuSingkatWib(n.dibuat, kini, b)}</span>
      </span>
      {!n.dibaca && <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
    </button>
  );
}

/** Buka notifikasi: tandai dibaca (tanpa menunggu) lalu menuju tautannya. */
export function useBukaNotif(setelah?: (belum: number) => void) {
  const router = useRouterBahasa();
  return useCallback(
    (n: NotifKlien) => {
      if (!n.dibaca) {
        void fetch("/api/notifikasi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id }) })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { belum: number } | null) => d && setelah?.(d.belum))
          .catch(() => {});
      }
      if (n.tautan) router.push(n.tautan);
    },
    [router, setelah],
  );
}

/**
 * Lonceng notifikasi di bilah atas (HP) dan sidebar (desktop). Jumlah belum dibaca ikut di polling status WhatsApp
 * yang sudah berjalan; di panel admin (tanpa polling itu) ditanyakan sendiri tiap 60 dtk selama tab terlihat.
 * Daftar baru dimuat saat panel dibuka. `push` (panel admin): pengaturan push notification di perangkat ini.
 */
export function LoncengNotifikasi({ gelap = false, awal = 0, push = false }: { gelap?: boolean; awal?: number; push?: boolean }) {
  const { t } = useBahasa();
  useSinkronPush(push);
  const { data } = useWaStatus();
  const [buka, setBuka] = useState(false);
  // Hitungan lokal (setelah membaca / dari polling sendiri) berlaku sampai polling status berikutnya membawa data baru.
  const [lokal, setLokal] = useState<{ nilai: number; dasar: unknown } | null>(null);
  const [daftar, setDaftar] = useState<NotifKlien[] | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [kini, setKini] = useState(0);
  const wadah = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const belum = lokal && lokal.dasar === data ? lokal.nilai : (data?.notif ?? lokal?.nilai ?? awal);
  const setBelumSendiri = useCallback((nilai: number) => setLokal({ nilai, dasar: data }), [data]);

  // Tanpa penyedia status WhatsApp (panel admin): tanyakan jumlahnya sendiri.
  const tanpaPoll = !data;
  useEffect(() => {
    if (!tanpaPoll) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hidup = true;
    const ambil = async () => {
      try {
        const r = await fetch("/api/notifikasi?hanya=jumlah", { cache: "no-store" });
        if (r.ok && hidup) setLokal({ nilai: ((await r.json()) as { belum: number }).belum, dasar: null });
      } catch {
        // jaringan putus sesaat
      }
      if (hidup && !document.hidden) timer = setTimeout(ambil, 60_000);
    };
    const saatTerlihat = () => !document.hidden && void ambil();
    timer = setTimeout(ambil, 1500);
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => {
      hidup = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", saatTerlihat);
    };
  }, [tanpaPoll]);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const r = await fetch("/api/notifikasi", { cache: "no-store" });
      if (r.ok) {
        const d = (await r.json()) as { daftar: NotifKlien[]; belum: number };
        setDaftar(d.daftar);
        setBelumSendiri(d.belum);
        setKini(Math.floor(Date.now() / 1000));
      }
    } finally {
      setMemuat(false);
    }
  }, [setBelumSendiri]);

  useEffect(() => {
    if (!buka) return;
    const luar = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wadah.current?.contains(t) && !panel.current?.contains(t)) setBuka(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    document.addEventListener("pointerdown", luar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", luar);
      document.removeEventListener("keydown", esc);
    };
  }, [buka]);

  const bukaNotif = useBukaNotif(setBelumSendiri);
  const semuaDibaca = async () => {
    setDaftar((d) => d?.map((n) => ({ ...n, dibaca: n.dibaca ?? 1 })) ?? d);
    setBelumSendiri(0);
    await fetch("/api/notifikasi", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {});
  };

  return (
    <div ref={wadah} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!buka) void muat();
          setBuka(!buka);
        }}
        aria-expanded={buka}
        aria-haspopup="dialog"
        aria-label={belum > 0 ? t(`Notifikasi, ${belum} belum dibaca`, `Notifications, ${belum} unread`) : t("Notifikasi", "Notifications")}
        className={`relative grid size-10 place-items-center rounded-xl transition-colors ${gelap ? "text-ink-muted hover:bg-white/[0.06] hover:text-ink-fg" : "text-muted hover:bg-subtle hover:text-fg"}`}
      >
        <Bell className="size-[18px]" aria-hidden />
        {belum > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-white tabular-nums ring-2 ring-ink">
            {belum > 99 ? "99+" : belum}
          </span>
        )}
      </button>
      {/* Lewat portal ke <body>: sidebar & bilah atas yang sticky membuat lapisan tumpukan sendiri, jadi panel yang
          dirender di dalamnya bisa tertutup kartu di area utama. */}
      {buka &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={t("Notifikasi", "Notifications")}
            className="fixed inset-x-3 top-14 z-50 flex max-h-[min(70svh,560px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-pop lg:inset-x-auto lg:top-4 lg:left-[276px] lg:w-[380px]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="text-[14px] font-bold">{t("Notifikasi", "Notifications")}</p>
              {belum > 0 && (
                <button type="button" onClick={semuaDibaca} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-accent hover:bg-accent-soft">
                  <CheckCheck className="size-3.5" aria-hidden /> {t("Tandai semua dibaca", "Mark all as read")}
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {daftar === null ? (
                <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {t("Memuat…", "Loading…")}
                </p>
              ) : daftar.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <Bell className="mx-auto size-6 text-faint" aria-hidden />
                  <p className="mt-2 text-[13px] font-semibold">{t("Belum ada notifikasi", "No notifications yet")}</p>
                  <p className="mt-1 text-[12.5px] text-muted">{t("Pembayaran, kuota AI, paket, dan aktivitas penting lain akan muncul di sini.", "Payments, AI quota, plans, and other important activity will show up here.")}</p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {daftar.map((n) => (
                    <li key={n.id}>
                      <ItemNotif
                        n={n}
                        kini={kini}
                        onBuka={(x) => {
                          setDaftar((d) => d?.map((y) => (y.id === x.id ? { ...y, dibaca: y.dibaca ?? 1 } : y)) ?? d);
                          if (!x.dibaca) setBelumSendiri(Math.max(0, belum - 1));
                          if (x.tautan) setBuka(false);
                          bukaNotif(x);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {memuat && daftar !== null && <p className="sr-only">{t("Memuat…", "Loading…")}</p>}
            </div>
            {push && <PengaturPush />}
            <Link href="/notifikasi" onClick={() => setBuka(false)} className="block border-t border-line px-4 py-3 text-center text-[12.5px] font-semibold text-accent hover:bg-subtle/60">
              {t("Lihat semua notifikasi", "View all notifications")}
            </Link>
          </div>,
          document.body,
        )}
    </div>
  );
}

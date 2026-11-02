"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  COOKIE_PIXEL_REG,
  EVENT_META_PIXEL,
  type KonfigMetaPixelPublik,
  type KunciEventMeta,
} from "@/lib/meta-pixel-def";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: (...args: unknown[]) => void;
    };
    _fbq?: unknown;
    __waMetaPixelCfg?: KonfigMetaPixelPublik;
  }
}

/** Pastikan objek antrean `window.fbq` dan skrip `fbevents.js` sudah dimuat di browser. */
function siapkanFbq(pixelId: string) {
  if (typeof window === "undefined" || !pixelId) return;

  if (!window.fbq) {
    const n: NonNullable<Window["fbq"]> = function (...args: unknown[]) {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue?.push(args);
      }
    };
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
  }

  if (!document.getElementById("wa-meta-pixel-script")) {
    const s = document.createElement("script");
    s.id = "wa-meta-pixel-script";
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
}

/**
 * Pancarkan event Meta Pixel dari browser bila Pixel aktif dan jenis event tersebut diizinkan admin.
 */
export function lacakMetaEvent(
  kunci: KunciEventMeta,
  parameter?: Record<string, unknown>,
  eventId?: string
): boolean {
  if (typeof window === "undefined") return false;
  const cfg = window.__waMetaPixelCfg;
  if (!cfg || !cfg.aktif || !cfg.pixelId || !cfg.event[kunci]) return false;

  siapkanFbq(cfg.pixelId);
  const namaEvent = EVENT_META_PIXEL[kunci].kode;
  if (eventId) {
    window.fbq?.("track", namaEvent, parameter ?? {}, { eventID: eventId });
  } else if (parameter) {
    window.fbq?.("track", namaEvent, parameter);
  } else {
    window.fbq?.("track", namaEvent);
  }
  return true;
}

/**
 * Pancarkan event uji langsung dari browser admin (walaupun saklar sedang diuji).
 */
export function lacakUjiBrowserPixel(pixelId: string): boolean {
  if (typeof window === "undefined" || !pixelId) return false;
  siapkanFbq(pixelId);
  window.fbq?.("init", pixelId);
  window.fbq?.("track", "PageView");
  return true;
}

function bacaDanHapusCookieReg(): boolean {
  if (typeof document === "undefined") return false;
  const ada = document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${COOKIE_PIXEL_REG}=1`));
  if (ada) {
    document.cookie = `${COOKIE_PIXEL_REG}=; Max-Age=0; path=/; SameSite=Lax`;
  }
  return ada;
}

export function MetaPixelClient({ konfig }: { konfig: KonfigMetaPixelPublik }) {
  const jalur = usePathname();
  const inisialisasiId = useRef<string>("");
  const jalurTerakhir = useRef<string>("");

  useEffect(() => {
    window.__waMetaPixelCfg = konfig;
    if (!konfig.aktif || !konfig.pixelId) return;

    siapkanFbq(konfig.pixelId);
    if (inisialisasiId.current !== konfig.pixelId) {
      window.fbq?.("init", konfig.pixelId);
      inisialisasiId.current = konfig.pixelId;
    }

    if (konfig.event.page_view && jalurTerakhir.current !== jalur) {
      jalurTerakhir.current = jalur;
      window.fbq?.("track", "PageView");
    }

    if (bacaDanHapusCookieReg() && konfig.event.complete_registration) {
      lacakMetaEvent("complete_registration", { status: true });
    }
  }, [konfig, jalur]);

  // Delegasi klik otomatis untuk semua tautan WhatsApp (wa.me / api.whatsapp.com) -> event Lead
  useEffect(() => {
    if (!konfig.aktif || !konfig.pixelId || !konfig.event.lead_wa) return;
    const saatKlik = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!target) return;
      const href = target.getAttribute("href") ?? "";
      if (href.includes("wa.me/") || href.includes("api.whatsapp.com/")) {
        lacakMetaEvent("lead_wa", {
          content_name: target.textContent?.trim().slice(0, 80) || "Klik WhatsApp",
          content_category: "WhatsApp",
        });
      }
    };
    document.addEventListener("click", saatKlik, { capture: true });
    return () => document.removeEventListener("click", saatKlik, { capture: true });
  }, [konfig]);

  if (!konfig.aktif || !konfig.pixelId) return null;

  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${encodeURIComponent(konfig.pixelId)}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}

/**
 * Komponen pelacak Purchase otomatis saat halaman pembayaran lunas dibuka.
 * Deduplikasi per `orderId` di localStorage + eventID agar tidak tercatat ganda saat refresh.
 */
export function LacakPurchaseMeta({
  orderId,
  jumlah,
  namaPaket,
}: {
  orderId: string;
  jumlah: number;
  namaPaket: string;
}) {
  useEffect(() => {
    if (!orderId || jumlah <= 0) return;
    const kunciSimpan = `wa_px_pur_${orderId}`;
    try {
      if (localStorage.getItem(kunciSimpan) === "1") return;
      const terkirim = lacakMetaEvent(
        "purchase",
        {
          value: jumlah,
          currency: "IDR",
          content_name: namaPaket,
          content_type: "product",
        },
        orderId
      );
      if (terkirim) localStorage.setItem(kunciSimpan, "1");
    } catch {
      lacakMetaEvent(
        "purchase",
        {
          value: jumlah,
          currency: "IDR",
          content_name: namaPaket,
          content_type: "product",
        },
        orderId
      );
    }
  }, [orderId, jumlah, namaPaket]);

  return null;
}

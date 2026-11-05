"use client";

import { useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useBahasa } from "./bahasa";
import { ItemNotif, type NotifKlien, useBukaNotif } from "./notifikasi";
import { useWaStatus } from "./wa-status";

/** Isi halaman /notifikasi: daftar awal dari server, "Muat lagi" lewat keyset (?sebelum=id), tandai semua dibaca. */
export function DaftarNotifikasi({ awal, adaLagiAwal, kini }: { awal: NotifKlien[]; adaLagiAwal: boolean; kini: number }) {
  const { t } = useBahasa();
  const { muatUlang } = useWaStatus();
  const [daftar, setDaftar] = useState(awal);
  const [adaLagi, setAdaLagi] = useState(adaLagiAwal);
  const [memuat, setMemuat] = useState(false);
  const buka = useBukaNotif(() => muatUlang());
  const belum = daftar.filter((n) => !n.dibaca).length;

  const lagi = async () => {
    setMemuat(true);
    try {
      const r = await fetch(`/api/notifikasi?sebelum=${daftar[daftar.length - 1].id}`, { cache: "no-store" });
      if (r.ok) {
        const d = (await r.json()) as { daftar: NotifKlien[]; adaLagi: boolean };
        setDaftar((x) => [...x, ...d.daftar]);
        setAdaLagi(d.adaLagi);
      }
    } finally {
      setMemuat(false);
    }
  };
  const semuaDibaca = async () => {
    setDaftar((d) => d.map((n) => ({ ...n, dibaca: n.dibaca ?? kini })));
    await fetch("/api/notifikasi", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {});
    muatUlang();
  };

  if (!daftar.length) {
    return (
      <div className="card px-6 py-14 text-center">
        <Bell className="mx-auto size-7 text-faint" aria-hidden />
        <p className="mt-3 text-[15px] font-semibold">{t("Belum ada notifikasi", "No notifications yet")}</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
          {t("Pembayaran, kuota AI, paket, bonus dari admin, afiliasi, dan nomor yang terputus akan muncul di sini.", "Payments, AI quota, plans, admin bonuses, affiliate activity, and disconnected numbers will show up here.")}
        </p>
      </div>
    );
  }
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <p className="text-[13px] text-muted">{belum > 0 ? t(`${belum} belum dibaca`, `${belum} unread`) : t("Semua sudah dibaca", "All caught up")}</p>
        {belum > 0 && (
          <button type="button" onClick={semuaDibaca} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-accent-soft">
            <CheckCheck className="size-4" aria-hidden /> {t("Tandai semua dibaca", "Mark all as read")}
          </button>
        )}
      </div>
      <ul className="divide-y divide-line">
        {daftar.map((n) => (
          <li key={n.id}>
            <ItemNotif
              n={n}
              kini={kini}
              onBuka={(x) => {
                setDaftar((d) => d.map((y) => (y.id === x.id ? { ...y, dibaca: y.dibaca ?? kini } : y)));
                buka(x);
              }}
            />
          </li>
        ))}
      </ul>
      {adaLagi && (
        <div className="border-t border-line p-3 text-center">
          <button type="button" onClick={lagi} disabled={memuat} className="btn btn-ghost border border-line">
            {memuat && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Muat lagi", "Load more")}
          </button>
        </div>
      )}
    </section>
  );
}

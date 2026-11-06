"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2, Send, Smartphone } from "lucide-react";

/**
 * Push notification di perangkat admin (lihat src/lib/push.ts). Service worker /sw.js hanya didaftarkan saat admin
 * menekan "Aktifkan", jadi pengguna biasa dan admin yang tidak memakainya tidak memuat apa pun.
 */

type Keadaan = "memuat" | "tidak-didukung" | "ios-pasang" | "diblokir" | "mati" | "aktif";

const KUNCI_SINKRON = "wa_push_sinkron";
let sudahSinkron = false;

function base64KeBytes(b64: string): Uint8Array<ArrayBuffer> {
  const isi = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const mentah = atob(isi);
  const hasil = new Uint8Array(new ArrayBuffer(mentah.length));
  for (let i = 0; i < mentah.length; i++) hasil[i] = mentah.charCodeAt(i);
  return hasil;
}

const didukung = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const iosBelumDipasang = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone);

async function langgananSaatIni(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const kirimKeServer = (s: PushSubscription) =>
  fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ langganan: s.toJSON() }) });

/**
 * Dipanggil sekali per sesi browser dari lonceng admin: perangkat yang sudah mengizinkan push didaftarkan ulang ke akun
 * yang sedang masuk (keluar dari akun menghapusnya di server, masuk lagi = aktif lagi tanpa menekan tombol).
 */
export function useSinkronPush(aktif: boolean) {
  useEffect(() => {
    if (!aktif || sudahSinkron || !didukung() || Notification.permission !== "granted") return;
    sudahSinkron = true;
    if (sessionStorage.getItem(KUNCI_SINKRON)) return;
    void langgananSaatIni()
      .then((s) => s && kirimKeServer(s))
      .then((r) => r?.ok && sessionStorage.setItem(KUNCI_SINKRON, "1"))
      .catch(() => {});
  }, [aktif]);
}

/** Baris pengaturan push di panel lonceng admin. */
export function PengaturPush() {
  const [keadaan, setKeadaan] = useState<Keadaan>("memuat");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    (async () => {
      let k: Keadaan;
      if (!didukung()) k = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios-pasang" : "tidak-didukung";
      else if (iosBelumDipasang()) k = "ios-pasang";
      else if (Notification.permission === "denied") k = "diblokir";
      else k = Notification.permission === "granted" && (await langgananSaatIni().catch(() => null)) ? "aktif" : "mati";
      if (hidup) setKeadaan(k);
    })();
    return () => {
      hidup = false;
    };
  }, []);

  const aktifkan = async () => {
    setSibuk(true);
    setPesan(null);
    try {
      const izin = await Notification.requestPermission();
      if (izin !== "granted") {
        setKeadaan(izin === "denied" ? "diblokir" : "mati");
        return;
      }
      const r = await fetch("/api/push", { cache: "no-store" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Gagal mengambil kunci push.");
      const { kunci } = (await r.json()) as { kunci: string };
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const opsi = { userVisibleOnly: true, applicationServerKey: base64KeBytes(kunci) };
      let s: PushSubscription;
      try {
        s = await reg.pushManager.subscribe(opsi);
      } catch {
        // Langganan lama dengan kunci berbeda: lepas dulu lalu daftar ulang.
        await (await reg.pushManager.getSubscription())?.unsubscribe();
        s = await reg.pushManager.subscribe(opsi);
      }
      const simpan = await kirimKeServer(s);
      if (!simpan.ok) throw new Error(((await simpan.json().catch(() => ({}))) as { error?: string }).error ?? "Gagal menyimpan perangkat.");
      sessionStorage.setItem(KUNCI_SINKRON, "1");
      setKeadaan("aktif");
      setPesan("Push aktif. Tekan Uji untuk mencoba.");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Gagal mengaktifkan push.");
    } finally {
      setSibuk(false);
    }
  };

  const matikan = async () => {
    setSibuk(true);
    setPesan(null);
    try {
      const s = await langgananSaatIni();
      await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: s?.endpoint }) });
      await s?.unsubscribe();
      sessionStorage.removeItem(KUNCI_SINKRON);
      setKeadaan("mati");
    } catch {
      setPesan("Gagal mematikan push.");
    } finally {
      setSibuk(false);
    }
  };

  const uji = async () => {
    setSibuk(true);
    setPesan(null);
    try {
      const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uji: true }) });
      const d = (await r.json().catch(() => ({}))) as { terkirim?: number; error?: string };
      setPesan(!r.ok ? (d.error ?? "Gagal mengirim uji.") : d.terkirim ? `Terkirim ke ${d.terkirim} perangkat.` : "Belum ada perangkat yang terdaftar.");
    } catch {
      setPesan("Gagal mengirim uji.");
    } finally {
      setSibuk(false);
    }
  };

  if (keadaan === "memuat" || keadaan === "tidak-didukung") return null;

  const tombol = "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold disabled:opacity-60";
  return (
    <div className="border-t border-line bg-subtle/50 px-4 py-2.5 text-[12.5px]">
      {keadaan === "ios-pasang" ? (
        <p className="flex items-start gap-2 text-muted">
          <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Untuk push di iPhone: buka di Safari, ketuk Bagikan lalu Tambahkan ke Layar Utama, kemudian buka panel admin dari ikon itu.</span>
        </p>
      ) : keadaan === "diblokir" ? (
        <p className="flex items-start gap-2 text-muted">
          <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Notifikasi diblokir di browser ini. Izinkan lewat ikon gembok di bilah alamat, lalu muat ulang halaman.</span>
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium text-fg">
            {keadaan === "aktif" ? <BellRing className="size-4 text-accent" aria-hidden /> : <BellOff className="size-4 text-muted" aria-hidden />}
            {keadaan === "aktif" ? "Push aktif di perangkat ini" : "Push di perangkat ini"}
          </span>
          <span className="flex items-center gap-1">
            {sibuk && <Loader2 className="size-3.5 animate-spin text-muted" aria-hidden />}
            {keadaan === "aktif" ? (
              <>
                <button type="button" disabled={sibuk} onClick={uji} className={`${tombol} text-accent hover:bg-accent-soft`}>
                  <Send className="size-3.5" aria-hidden /> Uji
                </button>
                <button type="button" disabled={sibuk} onClick={matikan} className={`${tombol} text-muted hover:bg-subtle hover:text-fg`}>
                  Matikan
                </button>
              </>
            ) : (
              <button type="button" disabled={sibuk} onClick={aktifkan} className={`${tombol} bg-accent text-white hover:opacity-90`}>
                Aktifkan
              </button>
            )}
          </span>
        </div>
      )}
      {pesan && (
        <p role="status" className="mt-1.5 text-[12px] text-muted">
          {pesan}
        </p>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import Link from "@/components/link";
import { CircleHelp, CreditCard, LayoutDashboard, LogOut, MessageCircle, Share2, ShieldCheck, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions";
import type { T } from "@/lib/bahasa";
import { formatNomor } from "@/lib/format";
import type { StatusSesiWa } from "@/lib/types";
import { useBahasa, useJalur } from "./bahasa";
import { BilahBawah, TabBawah, TabLembar } from "./bilah-bawah";
import { GantiBahasa } from "./ganti-bahasa";
import { TUR_DASHBOARD, TUR_NOMOR } from "./isi-tur";
import { TombolTambahNomor } from "./tambah-nomor";
import { TombolTur } from "./tur";
import { useSesiNomor, useWaStatus } from "./wa-status";

export interface ItemNomorNav {
  id: number;
  label: string;
  wa_id: string | null;
}

const JUDUL_KECIL = "px-3 text-[11px] font-semibold tracking-[0.08em] text-ink-muted/80 uppercase";

function teksStatus(s: StatusSesiWa | undefined, t: T): string {
  if (!s) return t("Memeriksa…", "Checking…");
  if (s === "WORKING") return t("Terhubung", "Connected");
  if (s === "SCAN_QR_CODE") return t("Menunggu scan QR", "Waiting for QR scan");
  if (s === "STARTING") return t("Menyiapkan", "Starting up");
  if (s === "FAILED") return t("Perlu dimulai ulang", "Needs a restart");
  return t("Belum terhubung", "Not connected");
}

function warnaStatus(s: StatusSesiWa | undefined): string {
  if (s === "WORKING") return "bg-ink-signal";
  if (s === "SCAN_QR_CODE" || s === "STARTING") return "animate-denyut bg-amber-400";
  if (s === "FAILED") return "bg-amber-400";
  return "bg-ink-muted/45";
}

function kelasTautan(aktif: boolean): string {
  return `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors pendek:py-1.5 ${
    aktif ? "bg-ink-raised text-white" : "text-ink-fg/80 hover:bg-ink-raised/60 hover:text-white"
  }`;
}

/** Garis sinyal di tepi kiri item yang sedang dibuka. */
const Penanda = () => <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-ink-signal" />;

/** `analitik`: label klik analitik bila isi tautan memuat data pribadi (mis. nama pengguna). */
function TautanNav({ href, aktif, ikon, children, tur, analitik }: { href: string; aktif: boolean; ikon: ReactNode; children: ReactNode; tur?: string; analitik?: string }) {
  return (
    <Link href={href} aria-current={aktif ? "page" : undefined} className={kelasTautan(aktif)} data-tur={tur} data-analitik={analitik}>
      {aktif && <Penanda />}
      <span className={`grid size-8 place-items-center rounded-lg ${aktif ? "bg-ink-signal/15 text-ink-signal" : "bg-white/[0.05] text-ink-muted group-hover:text-ink-fg"}`}>
        {ikon}
      </span>
      <span className="min-w-0 text-[13.5px] font-semibold">{children}</span>
    </Link>
  );
}

function ItemNomor({ n, aktif }: { n: ItemNomorNav; aktif: boolean }) {
  const { t } = useBahasa();
  const sesi = useSesiNomor(n.id);
  const wa = sesi?.status === "WORKING" && sesi.waId ? sesi.waId : n.wa_id;
  const status = teksStatus(sesi?.status, t);
  return (
    <li>
      <Link href={`/nomor/${n.id}`} aria-current={aktif ? "page" : undefined} className={kelasTautan(aktif)}>
        {aktif && <Penanda />}
        <span className={`relative grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold uppercase ${aktif ? "bg-ink-signal/15 text-ink-signal" : "bg-white/[0.06] text-ink-fg/90"}`}>
          {n.label.trim().charAt(0) || "#"}
          <span title={status} className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ${aktif ? "ring-ink-raised" : "ring-ink"} ${warnaStatus(sesi?.status)}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] leading-tight font-semibold">{n.label}</span>
          <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-ink-muted tabular-nums">{wa ? formatNomor(wa) : status}</span>
        </span>
        <span className="sr-only">({status})</span>
      </Link>
    </li>
  );
}

export function NavUtama({ nomor, admin, pengguna }: { nomor: ItemNomorNav[]; admin: boolean; pengguna: { nama: string; email: string } }) {
  const jalur = useJalur();
  const { t } = useBahasa();
  return (
    <>
      <div className="space-y-0.5 px-3 pt-3 pendek:pt-2">
        <p className={`${JUDUL_KECIL} pb-2 pendek:pb-1`}>Menu</p>
        <TautanNav href="/dashboard" aktif={jalur === "/dashboard"} ikon={<LayoutDashboard className="size-4" aria-hidden />}>
          {t("Ringkasan", "Overview")}
        </TautanNav>
        <TautanNav href="/akun" aktif={jalur === "/akun"} ikon={<UserRound className="size-4" aria-hidden />} analitik="Akun saya">
          <span className="block leading-tight">{t("Akun saya", "My account")}</span>
          <span className="block max-w-40 truncate text-[11.5px] leading-tight font-medium text-ink-muted">{pengguna.nama}</span>
        </TautanNav>
        <TautanNav href="/langganan" aktif={jalur === "/langganan"} ikon={<CreditCard className="size-4" aria-hidden />} tur="nav-langganan">
          {t("Langganan", "Subscription")}
        </TautanNav>
        <TautanNav href="/afiliasi" aktif={jalur === "/afiliasi"} ikon={<Share2 className="size-4" aria-hidden />}>
          {t("Afiliasi", "Affiliate")}
        </TautanNav>
        {admin && (
          <TautanNav href="/admin" aktif={jalur.startsWith("/admin")} ikon={<ShieldCheck className="size-4" aria-hidden />}>
            {t("Panel admin", "Admin panel")}
          </TautanNav>
        )}
        {/* Panduan: tur halaman yang sedang dibuka (halaman nomor punya tur sendiri). */}
        <span data-tur="nav-panduan" className="block">
          <TombolTur
            nama={jalur.startsWith("/nomor/") ? "nomor" : "dashboard"}
            langkah={jalur.startsWith("/nomor/") ? TUR_NOMOR : TUR_DASHBOARD}
            className={`${kelasTautan(false)} w-full text-left`}
          >
            <span className="grid size-8 place-items-center rounded-lg bg-white/[0.05] text-ink-muted group-hover:text-ink-fg">
              <CircleHelp className="size-4" aria-hidden />
            </span>
            <span className="text-[13.5px] font-semibold">{t("Panduan", "Guide")}</span>
          </TombolTur>
        </span>
      </div>
      <div data-tur="nav-nomor" className="mt-6 flex items-center justify-between pr-6 pb-2 pl-3 pendek:mt-3 pendek:pb-1">
        <p className={JUDUL_KECIL}>{t("Nomor WhatsApp", "WhatsApp numbers")}</p>
        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted tabular-nums">{nomor.length}</span>
      </div>
      {/* Daftar tidak pernah dijepit di bawah tinggi 3 nomor (atau sebanyak nomor yang ada); selebihnya digulir di dalam daftar. */}
      <ul
        style={{ minHeight: `calc(${Math.min(Math.max(nomor.length, 1), 3)} * 3.375rem + 0.75rem)` }}
        className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3 [scrollbar-color:var(--c-ink-raised)_transparent]"
      >
        {nomor.map((n) => (
          <ItemNomor key={n.id} n={n} aktif={jalur === `/nomor/${n.id}`} />
        ))}
        {nomor.length === 0 && <li className="px-3 py-2 text-[12.5px] text-ink-muted">{t("Belum ada nomor.", "No numbers yet.")}</li>}
      </ul>
      <div className="px-3 pb-3">
        <TombolTambahNomor varian="nav" />
      </div>
    </>
  );
}

/** Tur halaman yang sedang dibuka (halaman nomor punya tur sendiri). */
function turHalaman(jalur: string) {
  return jalur.startsWith("/nomor/") ? { nama: "nomor", langkah: TUR_NOMOR } : { nama: "dashboard", langkah: TUR_DASHBOARD };
}

/** Tombol pindah bahasa + Panduan di bilah atas HP: selalu terlihat tanpa membuka menu. */
export function TombolPanduanAtas() {
  const tur = turHalaman(useJalur());
  const { t } = useBahasa();
  return (
    <>
      {/* HP sangat sempit: "EN" tanpa ikon, supaya nama merek di bilah atas tidak terpotong. */}
      <GantiBahasa gelap className="h-10 max-[359px]:px-1.5 max-[359px]:[&>svg]:hidden" />
      <span data-tur="nav-panduan" className="block">
        <TombolTur
          nama={tur.nama}
          langkah={tur.langkah}
          className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg"
        >
          <CircleHelp className="size-[18px]" aria-hidden />
          {/* HP sempit (<400 px): ikon saja supaya nama ChatGerCep di bilah atas tidak terpotong. */}
          <span className="max-[399px]:sr-only">{t("Panduan", "Guide")}</span>
        </TombolTur>
      </span>
    </>
  );
}

const KELAS_KELUAR =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg";

/** Menu bawah HP untuk workspace pengguna: Ringkasan, Nomor (lembar), Langganan, Afiliasi, Akun (lembar). */
export function NavBawah({ nomor, admin, pengguna }: { nomor: ItemNomorNav[]; admin: boolean; pengguna: { nama: string; email: string } }) {
  const jalur = useJalur();
  const { t } = useBahasa();
  const tur = turHalaman(jalur);
  return (
    <BilahBawah label={t("Menu utama", "Main menu")}>
      <TabBawah href="/dashboard" label={t("Ringkasan", "Overview")} aktif={jalur === "/dashboard"} ikon={<LayoutDashboard className="size-5" aria-hidden />} />
      <TabLembar
        label={t("Nomor", "Numbers")}
        judul={t("Nomor WhatsApp", "WhatsApp numbers")}
        tur="nav-nomor"
        aktif={jalur.startsWith("/nomor/")}
        ikon={<MessageCircle className="size-5" aria-hidden />}
        lencana={
          nomor.length > 0 && (
            <span className="absolute -top-1 right-1 min-w-4 rounded-full bg-ink-raised px-1 text-center text-[10px] leading-4 font-bold text-ink-fg tabular-nums ring-2 ring-ink">
              {nomor.length}
            </span>
          )
        }
      >
        <ul className="space-y-0.5">
          {nomor.map((n) => (
            <ItemNomor key={n.id} n={n} aktif={jalur === `/nomor/${n.id}`} />
          ))}
          {nomor.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-ink-muted">{t("Belum ada nomor. Tambahkan nomor WhatsApp pertama Anda.", "No numbers yet. Add your first WhatsApp number.")}</li>
          )}
        </ul>
        <div className="pt-3">
          <TombolTambahNomor varian="nav" />
        </div>
      </TabLembar>
      <TabBawah
        href="/langganan"
        label={t("Langganan", "Plan")}
        tur="nav-langganan"
        aktif={jalur === "/langganan" || jalur.startsWith("/langganan/")}
        ikon={<CreditCard className="size-5" aria-hidden />}
      />
      <TabBawah href="/afiliasi" label={t("Afiliasi", "Affiliate")} aktif={jalur === "/afiliasi"} ikon={<Share2 className="size-5" aria-hidden />} />
      <TabLembar label={t("Akun", "Account")} judul={t("Akun", "Account")} aktif={jalur === "/akun"} ikon={<UserRound className="size-5" aria-hidden />}>
        <div data-analitik-privat className="mb-2 flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-signal/15 text-[15px] font-bold text-ink-signal uppercase">{pengguna.nama.trim().charAt(0) || "#"}</span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-white">{pengguna.nama}</span>
            <span className="block truncate text-[12px] text-ink-muted">{pengguna.email}</span>
          </span>
        </div>
        <div className="space-y-0.5">
          <TautanNav href="/akun" aktif={jalur === "/akun"} ikon={<UserRound className="size-4" aria-hidden />} analitik="Akun saya">
            {t("Akun saya", "My account")}
          </TautanNav>
          {admin && (
            <TautanNav href="/admin" aktif={false} ikon={<ShieldCheck className="size-4" aria-hidden />}>
              {t("Panel admin", "Admin panel")}
            </TautanNav>
          )}
          <span data-tutup-laci className="block">
            <TombolTur nama={tur.nama} langkah={tur.langkah} className={`${kelasTautan(false)} w-full text-left`}>
              <span className="grid size-8 place-items-center rounded-lg bg-white/[0.05] text-ink-muted group-hover:text-ink-fg">
                <CircleHelp className="size-4" aria-hidden />
              </span>
              <span className="text-[13.5px] font-semibold">{t("Panduan", "Guide")}</span>
            </TombolTur>
          </span>
        </div>
        <div className="mt-3 space-y-2 border-t border-ink-line pt-3">
          <StatusLayanan />
          <form action={logoutAction}>
            <button type="submit" className={KELAS_KELUAR}>
              <LogOut className="size-4" aria-hidden />
              {t("Keluar", "Sign out")}
            </button>
          </form>
        </div>
      </TabLembar>
    </BilahBawah>
  );
}

/** Kerangka bilah bawah selagi data menu dimuat (tinggi sama, tanpa lompatan tata letak). */
export function NavBawahKerangka() {
  return <div aria-hidden className="fixed inset-x-0 bottom-0 z-40 h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-ink-line bg-ink lg:hidden" />;
}

/** Kerangka daftar selagi data sidebar dimuat. */
export function NavKerangka() {
  return (
    <div aria-hidden className="space-y-2 px-6 pt-5">
      <div className="h-9 animate-denyut rounded-xl bg-ink-raised" />
      <div className="!mt-8 h-3 w-28 rounded bg-ink-raised" />
      <div className="h-11 animate-denyut rounded-xl bg-ink-raised" />
      <div className="h-11 animate-denyut rounded-xl bg-ink-raised" />
    </div>
  );
}

/** Kesehatan layanan di kaki sidebar: dari poller status bersama, tanpa permintaan tambahan. */
export function StatusLayanan() {
  const { data } = useWaStatus();
  const { t } = useBahasa();
  const semua = data ? Object.values(data.nomor) : [];
  const terhubung = semua.filter((s) => s.status === "WORKING").length;
  const ok = !!data?.ai;
  return (
    <div className="rounded-xl border border-ink-line bg-white/[0.03] p-3 pendek:px-3 pendek:py-2">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2.5 shrink-0">
          {ok && <span className="absolute inset-0 animate-ping rounded-full bg-ink-signal opacity-60" />}
          <span className={`relative size-2.5 rounded-full ${!data ? "bg-ink-muted/50" : ok ? "bg-ink-signal" : "bg-amber-400"}`} />
        </span>
        <p className="text-[12.5px] font-semibold">{!data ? t("Memeriksa layanan…", "Checking service…") : ok ? t("AI aktif", "AI active") : t("AI tidak terjangkau", "AI unreachable")}</p>
      </div>
      <p className="mt-1 pl-5 text-[11.5px] text-ink-muted">
        {data ? t(`${terhubung} dari ${semua.length} nomor terhubung`, `${terhubung} of ${semua.length} ${semua.length === 1 ? "number" : "numbers"} connected`) : " "}
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ArrowRight, Banknote, Check, Copy, Link2, MousePointerClick, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import { useBahasa } from "@/components/bahasa";
import Link from "@/components/link";
import type { Bahasa, T } from "@/lib/bahasa";
import { uang } from "@/lib/format";
import { KURS_CADANGAN } from "@/lib/kurs-def";
import { hitungKomisiPaket, type JenisKomisi, type SiklusKomisi } from "@/lib/afiliasi-def";

export type PaketSimulasiAfiliasi = {
  id: string;
  nama: string;
  harga: number;
  durasiHari: number;
  komisiJenis: JenisKomisi;
  komisiNilai: number;
  unggulan?: boolean;
};

const JUMLAH_CEPAT = [5, 10, 25, 50, 100];

/** Sama dengan labelKomisiPaket() (lib/afiliasi-def), tetapi mengikuti bahasa & menampilkan USD untuk "en". */
function labelKomisi(jenis: JenisKomisi, nilai: number, b: Bahasa, t: T, kurs?: number): string {
  if (nilai <= 0) return t("Tanpa komisi", "No commission");
  return jenis === "persen" ? `${nilai}%` : uang(nilai, b, kurs);
}

const pembeli = (n: number, t: T) => t(`${n} pembeli`, `${n} ${n === 1 ? "buyer" : "buyers"}`);

/** `kurs` (Rp per 1 USD) membuat nominal tampil dalam USD di versi Inggris. */
export function KalkulatorAfiliasi({
  paketList,
  siklus,
  minTarik,
  kurs,
}: {
  paketList: PaketSimulasiAfiliasi[];
  siklus: SiklusKomisi;
  minTarik: number;
  kurs?: number;
}) {
  const { b, t } = useBahasa();
  const rp = (n: number) => uang(n, b, kurs);
  const daftar = paketList.length > 0
    ? paketList
    : [
        { id: "starter", nama: "Starter", harga: 99_000, durasiHari: 30, komisiJenis: "persen" as const, komisiNilai: 15 },
        { id: "bisnis", nama: "Bisnis", harga: 144_000, durasiHari: 30, komisiJenis: "persen" as const, komisiNilai: 20, unggulan: true },
        { id: "pro", nama: "Pro", harga: 401_000, durasiHari: 30, komisiJenis: "persen" as const, komisiNilai: 20 },
      ];

  const defaultIdx = Math.max(0, daftar.findIndex((p) => p.unggulan));
  const [idxPaket, setIdxPaket] = useState(defaultIdx);
  const [jumlahPembeli, setJumlahPembeli] = useState(15);

  const paketAktif = daftar[idxPaket] ?? daftar[0];
  const komisiPerPembeli = hitungKomisiPaket(paketAktif.harga, paketAktif.komisiJenis, paketAktif.komisiNilai);
  const labelAktif = labelKomisi(paketAktif.komisiJenis, paketAktif.komisiNilai, b, t, kurs);
  const totalKomisi = komisiPerPembeli * jumlahPembeli;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      {/* Panel Kontrol Kiri */}
      <div className="flex flex-col justify-between rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8">
        <div>
          <span className="text-[12.5px] font-bold tracking-[0.08em] text-muted uppercase">
            {t("1. Pilih Paket yang Dibeli Pelanggan Referral", "1. Choose the plan your referral buys")}
          </span>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {daftar.map((p, idx) => {
              const aktif = idx === idxPaket;
              const komisiRp = hitungKomisiPaket(p.harga, p.komisiJenis, p.komisiNilai);
              const badge = labelKomisi(p.komisiJenis, p.komisiNilai, b, t, kurs);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setIdxPaket(idx)}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                    aktif
                      ? "border-accent bg-accent-soft/60 ring-2 ring-accent/20"
                      : "border-line bg-canvas hover:border-accent/40 hover:bg-subtle/60"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-[14.5px] font-bold text-fg">{p.nama}</span>
                    {badge && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${aktif ? "bg-accent text-on-accent" : "bg-subtle text-muted"}`}>
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="mt-1 text-[12.5px] text-muted tabular-nums">{t(`Harga ${rp(p.harga)}`, `Price ${rp(p.harga)}`)}</span>
                  <span className="mt-2.5 text-[13px] font-extrabold text-accent tabular-nums">
                    +{rp(komisiRp)} <span className="font-normal text-muted">{t("/ pembeli", "/ buyer")}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-7 border-t border-line pt-6">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="slider-referral" className="min-w-0 text-[12.5px] font-bold tracking-[0.08em] text-muted uppercase">
                {t("2. Jumlah Pelanggan yang Membeli Paket", "2. Number of customers who buy")}
              </label>
              <span className="shrink-0 text-2xl font-extrabold text-accent tabular-nums">
                {jumlahPembeli} <span className="text-[13.5px] font-semibold text-muted">{t("pembeli", jumlahPembeli === 1 ? "buyer" : "buyers")}</span>
              </span>
            </div>

            <input
              id="slider-referral"
              type="range"
              min={1}
              max={100}
              step={1}
              value={jumlahPembeli}
              onChange={(e) => setJumlahPembeli(Number(e.target.value))}
              className="mt-4 w-full cursor-pointer accent-[var(--c-accent)]"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-muted">{t("Pilih cepat:", "Quick pick:")}</span>
              {JUMLAH_CEPAT.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setJumlahPembeli(n)}
                  className={`rounded-xl border px-3 py-1.5 text-[12.5px] font-bold tabular-nums transition-colors ${
                    jumlahPembeli === n
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-canvas text-muted hover:border-accent/40 hover:text-fg"
                  }`}
                >
                  {pembeli(n, t)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-7 rounded-2xl border border-line bg-subtle/40 px-4 py-3.5 text-[12.5px] leading-relaxed text-muted">
          <strong className="font-bold text-fg">{t("Ketentuan Komisi:", "Commission terms:")}</strong> {t("Komisi diberikan", "Commission is paid")}{" "}
          {siklus === "berulang"
            ? t("setiap kali pelanggan referral membeli atau memperpanjang paket", "every time a referred customer buys or renews a plan")
            : t("1 kali saat pelanggan yang mendaftar lewat link Anda melakukan pembelian paket", "once, when a customer who signed up through your link buys a plan")}
          {t(
            ". Besaran komisi per paket dan aturan pencairan dapat diatur oleh Admin sesuai ketentuan dari pihak aplikasi.",
            ". Commission rates per plan and payout rules are set by the admin under the app's terms.",
          )}
        </div>
      </div>

      {/* Panel Hasil Kanan */}
      <div className="flex flex-col justify-between rounded-3xl border border-ink-line bg-ink p-5 text-ink-fg shadow-card sm:p-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-ink-signal/30 bg-ink-signal/10 px-3 py-1 text-[12px] font-bold text-ink-signal">
            <TrendingUp className="size-3.5 shrink-0" aria-hidden /> {t("Estimasi Komisi yang Anda Dapatkan", "Your estimated commission")}
          </div>

          <div className="mt-6">
            <p className="text-[13px] font-semibold text-ink-muted">
              {t(
                `Total Komisi dari ${jumlahPembeli} Pembeli Paket ${paketAktif.nama}`,
                `Total commission from ${pembeli(jumlahPembeli, t)} of the ${paketAktif.nama} plan`,
              )}
            </p>
            <p className="mt-1.5 text-[32px] leading-tight font-extrabold tracking-tight break-words text-white tabular-nums sm:text-[44px]">
              {rp(totalKomisi)}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-ink-line bg-white/[0.03] p-3.5 sm:gap-4 sm:p-4">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-ink-muted">{t("Komisi / 1 Pembeli", "Commission per buyer")}</p>
              <p className="mt-1 text-base font-extrabold text-ink-signal tabular-nums sm:text-lg">
                +{rp(komisiPerPembeli)}
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {labelAktif ? t(`Tarif ${labelAktif} dari paket`, `Rate: ${labelAktif} of the plan`) : t("Sesuai pengaturan paket", "Per plan settings")}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-ink-muted">{t(`Harga Paket ${paketAktif.nama}`, `${paketAktif.nama} plan price`)}</p>
              <p className="mt-1 text-base font-extrabold text-white tabular-nums sm:text-lg">
                {rp(paketAktif.harga)}
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {t(`Masa aktif ${paketAktif.durasiHari} hari`, `Active for ${paketAktif.durasiHari} ${paketAktif.durasiHari === 1 ? "day" : "days"}`)}
              </p>
            </div>
          </div>

          <ul className="mt-6 space-y-2.5 text-[13px] text-ink-muted">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-ink-signal" aria-hidden />
              <span>
                {t("Skema komisi:", "Commission scheme:")}{" "}
                <strong className="text-white">
                  {siklus === "berulang"
                    ? t("Dapat komisi setiap pembelian / perpanjangan paket", "Earn commission on every purchase or renewal")
                    : t("Dapat 1x komisi saat pembelian paket oleh pelanggan referral", "Earn a one-time commission when a referred customer buys a plan")}
                </strong>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-ink-signal" aria-hidden />
              <span>
                {t("Minimum penarikan saldo mulai", "Minimum payout starts at")} <strong className="text-white">{rp(minTarik)}</strong>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-ink-signal" aria-hidden />
              <span>{t("Sesuai syarat & ketentuan resmi dari pihak aplikasi", "Subject to the app's official terms & conditions")}</span>
            </li>
          </ul>
        </div>

        <div className="mt-8 border-t border-ink-line pt-5">
          <Link
            href="/daftar"
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-signal px-5 py-3.5 text-[14.5px] font-bold text-ink transition-transform hover:-translate-y-0.5"
          >
            {t("Mulai Jadi Afiliator Gratis", "Become an affiliate for free")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

const KODE_ACAK_CONTOH = ["af8k3m9x", "r7p4n2qx", "k9m2v6wz", "x4t8b3np", "m5h9q2kc"];

const langkahInteraktif = (t: T) => [
  {
    nomor: "01",
    judul: t("Dapatkan Kode Referral Acak Otomatis", "Get your referral code automatically"),
    ringkas: t(
      "Daftar akun gratis, buka menu Afiliasi, isi rekening pencairan, dan sistem otomatis membuat kode referral unik acak untuk Anda.",
      "Sign up for free, open the Affiliate menu, add your payout account, and the system creates a unique random referral code for you.",
    ),
    ikon: Link2,
    sorotan: t("Kode referral dibuat acak otomatis oleh sistem (tanpa perlu repot memilih)", "Your referral code is generated for you (no need to come up with one)"),
  },
  {
    nomor: "02",
    judul: t("Bagikan Link ke Komunitas & Relasi", "Share your link with your network"),
    ringkas: t(
      "Sebarkan link afiliasi ke grup bisnis, media sosial, atau klien UMKM yang membutuhkan admin WhatsApp AI 24/7.",
      "Share your affiliate link in business groups, on social media, or with small-business clients who need a 24/7 AI assistant on WhatsApp.",
    ),
    ikon: MousePointerClick,
    sorotan: t("Pelacakan otomatis: daftar via Email maupun Google tetap tercatat", "Automatic tracking: sign-ups by email or Google both count"),
  },
  {
    nomor: "03",
    judul: t("Komisi Masuk Saat Paket Dibeli", "Earn commission when they buy a plan"),
    ringkas: t(
      "Saat pengguna yang mendaftar lewat link Anda membeli paket langganan, komisi langsung masuk ke saldo afiliasi Anda sesuai ketentuan aplikasi.",
      "When someone who signed up through your link buys a subscription plan, the commission goes straight to your affiliate balance under the app's terms.",
    ),
    ikon: Sparkles,
    sorotan: t("Transparan: lihat rincian transaksi, nama paket, dan nominal komisi real-time", "Transparent: see each transaction, plan name, and commission amount in real time"),
  },
  {
    nomor: "04",
    judul: t("Tarik Saldo ke Bank atau E-Wallet", "Withdraw to a bank or e-wallet"),
    ringkas: t(
      "Ajukan pencairan kapan saja saat saldo mencapai batas minimum. Didukung transfer bank utama dan e-wallet populer.",
      "Request a payout anytime once your balance reaches the minimum. Major Indonesian banks and popular e-wallets are supported.",
    ),
    ikon: Wallet,
    sorotan: t("Mendukung BCA, Mandiri, BRI, BNI, BSI, Jago, SeaBank, GoPay, OVO, DANA, ShopeePay", "Supports BCA, Mandiri, BRI, BNI, BSI, Jago, SeaBank, GoPay, OVO, DANA, ShopeePay"),
  },
];

/** `kurs`: untuk nominal contoh di versi Inggris; tanpa kurs dipakai kurs cadangan (angka simulasi, bukan tagihan). */
export function AlurAfiliasiInteraktif({ domainContoh, kurs = KURS_CADANGAN }: { domainContoh: string; kurs?: number }) {
  const { b, t } = useBahasa();
  const rp = (n: number) => uang(n, b, kurs);
  const LANGKAH_INTERAKTIF = langkahInteraktif(t);
  const [langkahAktif, setLangkahAktif] = useState(0);
  const [idxKode, setIdxKode] = useState(0);
  const [tersalin, setTersalin] = useState(false);

  const kodeDemo = KODE_ACAK_CONTOH[idxKode];
  const linkDemo = `${domainContoh}/?ref=${kodeDemo}`;

  function acakKodeContoh() {
    setIdxKode((s) => (s + 1) % KODE_ACAK_CONTOH.length);
  }

  function salinDemo() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(linkDemo).catch(() => {});
    }
    setTersalin(true);
    setTimeout(() => setTersalin(false), 1800);
  }

  // Pratinjau yang sama dipakai di dua tempat: di bawah langkah yang diketuk (mobile, supaya perubahannya langsung
  // terlihat tanpa menggulir) dan di kolom kanan (layar lebar).
  const pratinjau = (
      <div className="rounded-3xl border border-ink-line bg-ink p-5 text-ink-fg shadow-card sm:p-8">
        <div className="flex items-center justify-between gap-3 border-b border-ink-line pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full bg-ink-signal" />
            <span className="text-[12.5px] font-bold text-white">
              {t(`Simulasi Dashboard Afiliasi · Langkah 0${langkahAktif + 1}`, `Affiliate dashboard preview · Step 0${langkahAktif + 1}`)}
            </span>
          </div>
          <span className="hidden shrink-0 rounded-lg border border-ink-line bg-white/[0.04] px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted sm:inline">
            {t("Interaktif", "Interactive")}
          </span>
        </div>

        {langkahAktif === 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-[13px] text-ink-muted">
              {t(
                "Sistem otomatis membangkitkan kode referral unik acak untuk akun Anda begitu mendaftar:",
                "The system generates a unique random referral code for your account as soon as you sign up:",
              )}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-line bg-white/[0.04] px-4 py-3">
              <div>
                <span className="text-[11px] font-bold text-ink-muted uppercase">{t("Kode Referral Acak Sistem", "Your generated referral code")}</span>
                <p className="mt-0.5 font-mono text-lg font-extrabold text-white">{kodeDemo}</p>
              </div>
              <button
                type="button"
                onClick={acakKodeContoh}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink-line bg-white/[0.06] px-3 py-2 text-[12px] font-bold text-ink-fg transition-colors hover:bg-white/[0.12]"
              >
                <RefreshCw className="size-3.5" aria-hidden /> {t("Contoh Kode Lain", "Show another example")}
              </button>
            </div>
            <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4">
              <span className="text-[11.5px] font-semibold text-ink-muted">{t("Link Siap Bagikan", "Ready-to-share link")}</span>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <code className="min-w-0 truncate text-[13px] font-bold text-ink-signal sm:text-[13.5px]">{linkDemo}</code>
                <button
                  type="button"
                  onClick={salinDemo}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ink-signal px-3 py-1.5 text-[12px] font-bold text-ink"
                >
                  {tersalin ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {tersalin ? t("Tersalin", "Copied") : t("Salin", "Copy")}
                </button>
              </div>
            </div>
          </div>
        )}

        {langkahAktif === 1 && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-3.5 sm:p-4">
                <MousePointerClick className="size-4 text-ink-signal" aria-hidden />
                <p className="mt-2 text-2xl font-extrabold text-white tabular-nums">428</p>
                <p className="text-[11.5px] text-ink-muted">{t("Klik Link Referral", "Referral link clicks")}</p>
              </div>
              <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-3.5 sm:p-4">
                <Users className="size-4 text-ink-signal" aria-hidden />
                <p className="mt-2 text-2xl font-extrabold text-white tabular-nums">64</p>
                <p className="text-[11.5px] text-ink-muted">{t("User Mendaftar", "Sign-ups")}</p>
              </div>
              <div className="col-span-2 rounded-2xl border border-ink-line bg-white/[0.03] p-3.5 sm:col-span-1 sm:p-4">
                <ShieldCheck className="size-4 text-ink-signal" aria-hidden />
                <p className="mt-2 text-2xl font-extrabold text-ink-signal tabular-nums">{t("Otomatis", "Automatic")}</p>
                <p className="text-[11.5px] text-ink-muted">{t("Atribusi Referral", "Referral attribution")}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4 text-[13px] text-ink-muted">
              {t("Saat calon pengguna membuka", "When a prospect opens")} <code className="font-bold break-all text-white">{linkDemo}</code>
              {t(
                ", sistem melacak referral secara otomatis. Baik daftar via Email maupun Google OAuth, akun mereka langsung terhubung ke kode Anda.",
                ", the referral is tracked automatically. Whether they sign up by email or with Google, their account is linked to your code right away.",
              )}
            </div>
          </div>
        )}

        {langkahAktif === 2 && (
          <div className="mt-6 space-y-3">
            {[
              { email: "tok***@gmail.com", paket: t("Paket Bisnis", "Business plan"), harga: 246_000, komisi: 49_200, waktu: t("Baru saja", "Just now") },
              { email: "kli***@usaha.id", paket: t("Paket Pro", "Pro plan"), harga: 602_000, komisi: 120_400, waktu: t("2 jam lalu", "2 hours ago") },
              { email: "kop***@mail.com", paket: t("Paket Starter", "Starter plan"), harga: 79_000, komisi: 15_800, waktu: t("Kemarin", "Yesterday") },
            ].map((item) => (
              <div
                key={item.email}
                className="flex items-center justify-between gap-3 rounded-2xl border border-ink-line bg-white/[0.03] px-3.5 py-3 sm:px-4"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-white">{item.paket}</p>
                  <p className="text-[12px] text-ink-muted">
                    {t(`Oleh ${item.email} · Transaksi ${rp(item.harga)} · ${item.waktu}`, `By ${item.email} · Purchase ${rp(item.harga)} · ${item.waktu}`)}
                  </p>
                </div>
                <span className="shrink-0 rounded-xl bg-ink-signal/15 px-2.5 py-1.5 text-[12.5px] font-extrabold text-ink-signal tabular-nums sm:px-3 sm:text-[13px]">
                  +{rp(item.komisi)}
                </span>
              </div>
            ))}
          </div>
        )}

        {langkahAktif === 3 && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-line bg-white/[0.03] p-4">
              <div>
                <p className="text-[12px] font-semibold text-ink-muted">{t("Saldo Siap Dicairkan", "Available for payout")}</p>
                <p className="mt-1 text-2xl font-extrabold text-white tabular-nums">{rp(1_450_000)}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-ink-signal px-3.5 py-2 text-[12.5px] font-bold text-ink">
                <Banknote className="size-4" aria-hidden /> {t("Siap Tarik", "Ready to withdraw")}
              </span>
            </div>
            <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]">
                <span className="font-semibold text-ink-muted">{t("Metode Pencairan Terdaftar", "Registered payout method")}</span>
                <span className="font-bold text-ink-signal">{t("Terverifikasi", "Verified")}</span>
              </div>
              <p className="mt-1.5 text-[14px] font-bold text-white">{t("BCA · 8720••••91 a.n. Mitra Usaha", "BCA · 8720••••91 · Mitra Usaha")}</p>
              <p className="mt-1 text-[12px] text-ink-muted">
                {t(
                  "Pencairan diproses ke rekening Bank atau E-Wallet sesuai ketentuan dari pihak aplikasi.",
                  "Payouts are sent to your bank account or e-wallet under the app's terms.",
                )}
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink-line pt-4 text-[12px] text-ink-muted">
          <span className="min-w-0">{LANGKAH_INTERAKTIF[langkahAktif].sorotan}</span>
          <div className="flex shrink-0 gap-1.5">
            {LANGKAH_INTERAKTIF.map((l, i) => (
              <button
                key={l.nomor}
                type="button"
                aria-label={t(`Pilih langkah ${l.nomor}`, `Go to step ${l.nomor}`)}
                onClick={() => setLangkahAktif(i)}
                className={`h-2 rounded-full transition-all ${
                  i === langkahAktif ? "w-6 bg-ink-signal" : "w-2 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
  );

  return (
    // grid-cols-1 (= minmax(0,1fr)) di mobile: tanpa itu kolom ikut lebar alami isinya (link contoh satu baris) dan
    // halaman bisa digeser ke samping.
    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Daftar Langkah */}
      <div className="space-y-3">
        {LANGKAH_INTERAKTIF.map((l, idx) => {
          const aktif = idx === langkahAktif;
          const Ikon = l.ikon;
          return (
            <div key={l.nomor}>
              <button
                type="button"
                onClick={() => setLangkahAktif(idx)}
                aria-pressed={aktif}
                className={`w-full rounded-3xl border p-4 text-left transition-all sm:p-5 ${
                  aktif
                    ? "border-accent bg-surface shadow-pop"
                    : "border-line bg-surface/60 hover:border-accent/30 hover:bg-surface"
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-2xl text-[13.5px] font-extrabold transition-colors sm:size-11 ${
                      aktif ? "bg-accent text-on-accent" : "bg-subtle text-muted"
                    }`}
                  >
                    <Ikon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] font-extrabold tracking-[0.08em] text-accent uppercase">
                        {t("Langkah", "Step")} {l.nomor}
                      </span>
                      {aktif && (
                        <span className="hidden rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent lg:inline">
                          {t("Sedang dilihat", "Viewing")}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-[15.5px] font-bold text-fg sm:text-[16.5px]">{l.judul}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{l.ringkas}</p>
                  </div>
                </div>
              </button>
              {aktif && <div className="mt-3 lg:hidden">{pratinjau}</div>}
            </div>
          );
        })}
      </div>

      {/* Pratinjau Interaktif Ringan (layar lebar) */}
      <div className="hidden lg:block">{pratinjau}</div>
    </div>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowDown, CheckCircle2, ChevronRight, Code2, Download, FlaskConical, Server, ShieldCheck, Wallet } from "lucide-react";
import Link from "@/components/link";
import { Pill } from "@/components/ui";
import { labelFitur, samarkanNomor } from "@/lib/api-def";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { aiSandbox, aplikasiMilik, daftarInstalasi, daftarKunci, pengaturanApi, pengaturanSandbox, sandboxMilik } from "@/lib/developer-api";
import { sekarang } from "@/lib/db";
import { angka, jamWib, tanggal } from "@/lib/format";
import { sembunyikanKunci } from "@/lib/lisensi-def";
import { MEREK } from "@/lib/merek";
import { modeMesin } from "@/lib/mode";
import { requireAksesApi } from "@/lib/session";
import { FormAjukan } from "./form-developer";
import { TombolKeySandbox, TombolNomorUji, TombolPerpanjangSandbox } from "./kartu-sandbox";
import { PillStatus } from "./umum";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Developer API", "Developer API")} · ${MEREK}` };
}

/** Portal developer luar: ajukan aplikasi, lihat status, lalu kelola key & mesin di halaman detailnya. */
export default async function HalamanDeveloper() {
  if (modeMesin()) notFound();
  const { t } = await teksHalaman();
  const poin = [
    { ikon: Code2, judul: t("Satu API key", "One API key"), isi: t("Semua fitur yang dibuka untuk aplikasi Anda dipanggil dengan satu key.", "Every feature opened for your app is called with a single key.") },
    {
      ikon: Server,
      judul: t("Jalan di server Anda", "Runs on your server"),
      isi: t("Mesin ChatGerCep dipasang di server Anda (Docker). Server, nomor WA, database, dan kunci AI milik Anda.", "The ChatGerCep engine runs on your server (Docker). Server, WhatsApp numbers, database, and AI keys are yours."),
    },
    { ikon: ShieldCheck, judul: t("Data tetap di Anda", "Your data stays with you"), isi: t("Isi chat & Informasi Usaha tidak pernah dikirim ke server kami.", "Chats & Business Info are never sent to our servers.") },
    { ikon: Wallet, judul: t("Gratis secara bawaan", "Free by default"), isi: t("Biaya (bila ada) ditentukan saat pengajuan disetujui.", "Pricing (if any) is set when your application is approved.") },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Developer API</h1>
        <p className="mt-1 max-w-2xl text-muted">
          {t(
            "Pakai fitur ChatGerCep (WhatsApp, bot AI, Informasi Usaha) di aplikasi Anda sendiri tanpa membangun dari nol.",
            "Use ChatGerCep features (WhatsApp, AI bot, Business Info) in your own app without building them from scratch.",
          )}{" "}
          <Link href="/docs/api" className="font-semibold text-accent hover:underline">
            {t("Baca dokumentasi", "Read the docs")}
          </Link>
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {poin.map((p) => (
          <li key={p.judul} className="card flex gap-3 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <p.ikon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold">{p.judul}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{p.isi}</span>
            </span>
          </li>
        ))}
      </ul>
      <Suspense fallback={<div aria-hidden className="card h-56 animate-denyut" />}>
        <KartuSandbox />
      </Suspense>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section id="ajukan" className="card scroll-mt-6 p-4 sm:p-6">
          <h2 className="text-[15px] font-bold">{t("Ajukan akses API production", "Apply for production API access")}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {t("Tim kami meninjau setiap pengajuan dan membuka fitur yang sesuai.", "Our team reviews every application and opens the matching features.")}
          </p>
          <div className="mt-5">
            <Suspense fallback={<div aria-hidden className="h-96 animate-denyut rounded-xl bg-subtle" />}>
              <Ajukan />
            </Suspense>
          </div>
        </section>
        <Suspense fallback={<div aria-hidden className="card h-64 animate-denyut" />}>
          <DaftarAplikasi />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Kartu Sandbox: key cg_test_ untuk mencoba API dengan WhatsApp asli sebelum production. Sandbox milik akun ini lewat
 * indeks unik parsial; key & instalasi hanya dibaca bila sandbox ada (paling banyak 4 query kecil).
 */
async function KartuSandbox() {
  const user = await requireAksesApi();
  const { b, t } = await teksHalaman();
  const [sb, umum] = await Promise.all([sandboxMilik(user.id), pengaturanSandbox()]);
  const [kunci, instalasi] = sb ? await Promise.all([daftarKunci(sb.id), daftarInstalasi(sb.id)]) : [[], []];
  const kini = sekarang();
  const kunciAktif = kunci.find((k) => !k.dicabut_pada);
  const mesin = instalasi[0];
  const habis = !!sb && (sb.sandbox_sampai ?? 0) <= kini;
  const aktif = !!sb && sb.status === "disetujui";
  const kodeMenunggu = !!sb?.uji_kode_sampai && sb.uji_kode_sampai > kini;
  const langkah = [
    t("Buat key sandbox (cg_test_…) dan unduh .env sandbox.", "Create a sandbox key (cg_test_…) and download the sandbox .env."),
    t("Jalankan mesin (docker compose up -d), boleh di laptop. Tidak perlu domain/HTTPS.", "Start the engine (docker compose up -d), even on a laptop. No domain/HTTPS needed."),
    t("Scan QR dengan nomor WhatsApp khusus testing (1 nomor).", "Scan the QR with a WhatsApp number reserved for testing (1 number)."),
    t("Daftarkan 1 nomor penguji: kirim WA berisi kode UJI ke nomor bot.", "Register 1 tester number: send the UJI code over WhatsApp to the bot number."),
    t("Coba kirim pesan, webhook, dan bot AI antara dua nomor itu.", "Try sending messages, webhooks, and the AI bot between those two numbers."),
  ];
  return (
    <section id="sandbox" className="card scroll-mt-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:p-6">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
            <FlaskConical className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
              Sandbox
              {sb ? (
                sb.status !== "disetujui" ? (
                  <PillStatus status={sb.status} t={t} />
                ) : habis ? (
                  <Pill nada="merah">{t("Kedaluwarsa", "Expired")}</Pill>
                ) : (
                  <Pill nada="hijau">{t("Aktif", "Active")}</Pill>
                )
              ) : (
                <Pill nada="abu">{t("Gratis, langsung aktif", "Free, instant")}</Pill>
              )}
            </h2>
            <p className="mt-0.5 max-w-2xl text-[13px] text-muted">
              {t(
                "Coba API dengan WhatsApp asli sebelum production, tanpa menunggu pengajuan disetujui. Sandbox hanya bisa berkomunikasi dengan 1 nomor penguji milik Anda.",
                "Try the API with real WhatsApp before production, without waiting for approval. The sandbox can only talk to 1 tester number of yours.",
              )}
            </p>
          </div>
        </div>
        <Link href="#ajukan" className="btn btn-ghost shrink-0 border border-line">
          <ArrowDown className="size-4" aria-hidden /> {t("Ajukan production", "Apply for production")}
        </Link>
      </div>

      {!umum.aktif && !sb ? (
        <p className="p-4 text-[13.5px] text-muted sm:p-6">{t("Sandbox sedang dimatikan oleh ChatGerCep. Coba lagi nanti.", "The sandbox is currently turned off by ChatGerCep. Please try again later.")}</p>
      ) : (
        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <div>
              <h3 className="text-[13px] font-bold text-muted uppercase">{t("Key sandbox", "Sandbox key")}</h3>
              {kunciAktif && <code className="mt-1.5 block font-mono text-[13px]">{sembunyikanKunci(kunciAktif.awalan, "sandbox")}</code>}
              <div className="mt-2.5">{(aktif || !sb) && <TombolKeySandbox ada={!!sb} />}</div>
            </div>
            {sb && (
              <div>
                <h3 className="text-[13px] font-bold text-muted uppercase">{t("Berlaku sampai", "Valid until")}</h3>
                <p className={`mt-1 text-[14px] font-semibold ${habis ? "text-danger" : ""}`}>{sb.sandbox_sampai ? tanggal(sb.sandbox_sampai, b) : "-"}</p>
                <p className="text-[12.5px] text-muted">
                  {t(`Perpanjang menambah ${umum.hari} hari dari sekarang.`, `Extending adds ${umum.hari} days from now.`)}
                </p>
                {aktif && (
                  <div className="mt-2.5">
                    <TombolPerpanjangSandbox />
                  </div>
                )}
              </div>
            )}
            {sb && (
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="rounded-xl bg-subtle/60 p-3">
                  <dt className="text-[12px] text-muted">{t("Balasan AI per hari", "AI replies per day")}</dt>
                  <dd className="mt-0.5 font-bold tabular-nums">{angka(aiSandbox(sb, umum), b)}</dd>
                </div>
                <div className="rounded-xl bg-subtle/60 p-3">
                  <dt className="text-[12px] text-muted">{t("Mesin sandbox", "Sandbox engine")}</dt>
                  <dd className="mt-0.5 font-bold">
                    {mesin?.terakhir_sukses ? t(`Menyala ${tanggal(mesin.terakhir_sukses)} ${jamWib(mesin.terakhir_sukses)}`, `Started ${tanggal(mesin.terakhir_sukses, b)} ${jamWib(mesin.terakhir_sukses, b)}`) : t("Belum pernah menyala", "Never started")}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="min-w-0 space-y-5">
            {sb && (
              <div>
                <h3 className="text-[13px] font-bold text-muted uppercase">{t("Nomor penguji (maks 1)", "Tester number (max 1)")}</h3>
                {sb.uji_diverifikasi ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-semibold">
                    <CheckCircle2 className="size-4 text-success" aria-hidden />
                    {sb.uji_telepon ? samarkanNomor(sb.uji_telepon) : t("Terverifikasi", "Verified")}
                    <span className="text-[12px] font-normal text-muted">· {t(`sejak ${tanggal(sb.uji_diverifikasi)}`, `since ${tanggal(sb.uji_diverifikasi, b)}`)}</span>
                  </p>
                ) : (
                  <p className="mt-1.5 text-[13.5px] text-muted">
                    {kodeMenunggu ? t("Menunggu pesan kode UJI dari HP penguji.", "Waiting for the UJI code message from the tester's phone.") : t("Belum ada. Mesin sandbox belum bisa mengirim pesan ke siapa pun.", "None yet. The sandbox engine can't message anyone yet.")}
                  </p>
                )}
                <p className="mt-1 text-[12.5px] text-muted">
                  {t(
                    "Hanya nomor ini yang boleh dikirimi pesan dan dilayani bot. Chat dari nomor lain diabaikan.",
                    "Only this number can receive messages and be served by the bot. Chats from other numbers are ignored.",
                  )}
                </p>
                <div className="mt-2.5">
                  <TombolNomorUji ada={!!sb.uji_diverifikasi} boleh={aktif && !habis} />
                </div>
              </div>
            )}
            {sb ? (
              <div className="flex flex-wrap gap-2">
                <a href={`/api/developer/${sb.id}/berkas?nama=.env.contoh`} className="btn btn-ghost border border-line" download>
                  <Download className="size-4" aria-hidden /> .env sandbox
                </a>
                <a href={`/api/developer/${sb.id}/berkas?nama=docker-compose.yml`} className="btn btn-ghost border border-line" download>
                  <Download className="size-4" aria-hidden /> docker-compose.yml
                </a>
              </div>
            ) : null}
            <ol className="space-y-2 text-[13px]">
              {langkah.map((l, i) => (
                <li key={l} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-ink-signal">{i + 1}</span>
                  <span className="text-muted">{l}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

/** Formulir pengajuan dengan fitur yang sedang dibagikan developer internal (getSetting dimemo: tanpa query tambahan). */
async function Ajukan() {
  await requireAksesApi();
  return <FormAjukan fitur={(await pengaturanApi()).fitur} />;
}

async function DaftarAplikasi() {
  const user = await requireAksesApi();
  const { b, t } = await teksHalaman();
  const daftar = await aplikasiMilik(user.id);
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4 sm:p-5">
        <h2 className="text-[15px] font-bold">{t("Aplikasi saya", "My applications")}</h2>
        <p className="text-[13px] text-muted">{t(`${daftar.length} aplikasi`, `${daftar.length} ${daftar.length === 1 ? "application" : "applications"}`)}</p>
      </div>
      {daftar.length ? (
        <ul className="divide-y divide-line">
          {daftar.map((a) => (
            <li key={a.id}>
              <Link href={`/developer/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/50 sm:px-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-[15px] font-bold text-ink-signal uppercase">{a.nama.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{a.nama}</span>
                    <PillStatus status={a.status} t={t} />
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {(a.status === "menunggu" ? a.fitur_diminta : a.fitur).map(labelFitur).join(" · ") || "-"}
                  </span>
                  <span className="block text-[12px] text-faint">{t(`Diajukan ${tanggal(a.created_at)}`, `Applied ${tanggal(a.created_at, b)}`)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-[13px] text-muted">{t("Belum ada pengajuan. Isi formulir di samping untuk mulai.", "No applications yet. Fill in the form to get started.")}</p>
      )}
    </section>
  );
}

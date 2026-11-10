import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Download, FileText, Server } from "lucide-react";
import Link from "@/components/link";
import { RENTANG_BATAS, type BatasApi, labelFitur } from "@/lib/api-def";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { aplikasiMilikById, biayaEfektif, daftarInstalasi, daftarKunci, hargaEfektif, pengaturanApi, statusLisensi } from "@/lib/developer-api";
import { angka, tanggal, waktuSingkatWib } from "@/lib/format";
import { sembunyikanKunci } from "@/lib/lisensi-def";
import { MEREK } from "@/lib/merek";
import { modeMesin } from "@/lib/mode";
import { sekarang } from "@/lib/db";
import { requireAksesApi } from "@/lib/session";
import { KelolaKunci, TombolLepasInstalasi } from "../form-developer";
import { PillLisensi, PillStatus } from "../umum";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Aplikasi", "Application")} · Developer API · ${MEREK}` };
}

export default async function HalamanAplikasi(props: { params: Promise<{ id: string }> }) {
  if (modeMesin()) notFound();
  const { t } = await teksHalaman();
  return (
    <div>
      <nav aria-label={t("Jejak halaman", "Breadcrumb")} className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/developer" className="font-medium text-muted transition-colors hover:text-fg">
              Developer API
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            {t("Aplikasi", "Application")}
          </li>
        </ol>
      </nav>
      <Suspense fallback={<div aria-hidden className="card h-[34rem] animate-denyut" />}>
        <Isi params={props.params} />
      </Suspense>
    </div>
  );
}

const LABEL_BATAS_EN: Record<keyof BatasApi, string> = {
  nomor: "Max numbers per engine",
  pesan_menit: "Messages per minute per number",
  kontak_baru_hari: "New contacts per day per number",
  instalasi: "Max engine installations",
  ai_hari: "AI replies per day (0 = unlimited)",
};

async function Isi({ params }: { params: Promise<{ id: string }> }) {
  const [user, { b, t }] = await Promise.all([requireAksesApi(), teksHalaman()]);
  const id = Number((await params).id);
  const a = await aplikasiMilikById(user.id, id);
  if (!a || a.mode === "sandbox") notFound(); // sandbox dikelola di kartu Sandbox / tab Sandbox
  const disetujui = a.status === "disetujui" || a.status === "ditangguhkan";
  const [umum, kunci, instalasi] = await Promise.all([pengaturanApi(), disetujui ? daftarKunci(a.id) : [], disetujui ? daftarInstalasi(a.id) : []]);
  const kini = sekarang();
  const lisensi = statusLisensi(a, umum, kini);
  const biaya = biayaEfektif(a, umum);
  const harga = hargaEfektif(a, umum);
  const kunciAktif = kunci.filter((k) => !k.dicabut_pada && (k.berlaku_sampai === null || k.berlaku_sampai > kini));
  const fitur = a.status === "menunggu" || a.status === "ditolak" ? a.fitur_diminta : a.fitur;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink text-xl font-bold text-ink-signal uppercase">{a.nama.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight">{a.nama}</h1>
            <PillStatus status={a.status} t={t} />
            {lisensi && lisensi !== "aktif" && <PillLisensi status={lisensi} t={t} />}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{t(`Diajukan ${tanggal(a.created_at)} · ${a.pemilik}`, `Applied ${tanggal(a.created_at, b)} · ${a.pemilik}`)}</p>
        </div>
      </header>

      {a.status === "menunggu" && (
        <p className="card border-warning/30 bg-warning-soft p-4 text-[13.5px] text-warning">
          {t("Pengajuan sedang ditinjau tim kami. Anda akan mendapat notifikasi begitu ada keputusan.", "Your application is being reviewed. You'll be notified as soon as there's a decision.")}
        </p>
      )}
      {a.alasan && a.status !== "disetujui" && (
        <p className="card border-danger/30 bg-danger-soft p-4 text-[13.5px] text-danger">
          <span className="font-semibold">{t("Alasan: ", "Reason: ")}</span>
          {a.alasan}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {disetujui && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">API key</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                {t(
                  "Satu key untuk aktivasi mesin dan untuk memanggil API dari aplikasi Anda. Simpan di server, jangan di aplikasi browser/HP.",
                  "One key to activate the engine and to call the API from your app. Keep it on your server, never in browser/mobile code.",
                )}
              </p>
              {kunci.length > 0 && (
                <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                  {kunci.map((k) => {
                    const aktif = !k.dicabut_pada && (k.berlaku_sampai === null || k.berlaku_sampai > kini);
                    return (
                      <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[13px]">
                        <code className={`font-mono text-[12.5px] ${aktif ? "" : "text-faint line-through"}`}>{sembunyikanKunci(k.awalan)}</code>
                        <span className="text-[12px] text-muted">
                          {k.dicabut_pada
                            ? t(`Dicabut ${tanggal(k.dicabut_pada)}`, `Revoked ${tanggal(k.dicabut_pada, b)}`)
                            : k.berlaku_sampai
                              ? k.berlaku_sampai > kini
                                ? t(`Berlaku sampai ${waktuSingkatWib(k.berlaku_sampai, kini)}`, `Valid until ${waktuSingkatWib(k.berlaku_sampai, kini, b)}`)
                                : t("Kedaluwarsa", "Expired")
                              : t(`Aktif · dibuat ${tanggal(k.dibuat)}`, `Active · created ${tanggal(k.dibuat, b)}`)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4">
                <KelolaKunci aplikasiId={a.id} adaKunci={kunciAktif.length > 0} boleh={a.status === "disetujui"} />
              </div>
            </section>
          )}

          {disetujui && (
            <section className="card p-4 sm:p-6">
              <h2 className="flex items-center gap-2 text-[15px] font-bold">
                <Server className="size-4 text-accent" aria-hidden /> {t("Pasang mesin di server Anda", "Install the engine on your server")}
              </h2>
              <ol className="mt-4 space-y-3 text-[13.5px]">
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">1</span>
                  <span>
                    {t("Unduh berkas pemasangan ke folder kosong di server (Linux + Docker).", "Download the install files into an empty folder on your server (Linux + Docker).")}
                    <span className="mt-2 flex flex-wrap gap-2">
                      <a href={`/api/developer/${a.id}/berkas?nama=docker-compose.yml`} className="btn btn-ghost border border-line" download>
                        <Download className="size-4" aria-hidden /> docker-compose.yml
                      </a>
                      <a href={`/api/developer/${a.id}/berkas?nama=.env.contoh`} className="btn btn-ghost border border-line" download>
                        <Download className="size-4" aria-hidden /> .env.contoh
                      </a>
                    </span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">2</span>
                  <span>
                    {t("Salin .env.contoh menjadi .env, lalu isi ", "Copy .env.contoh to .env, then fill in ")}
                    <code className="rounded bg-subtle px-1 font-mono text-[12px]">CHATGERCEP_KEY</code>, <code className="rounded bg-subtle px-1 font-mono text-[12px]">ALAMAT_PUBLIK</code>{" "}
                    {t("(HTTPS), dan kunci AI Anda.", "(HTTPS), and your AI key.")}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">3</span>
                  <span>
                    {t("Jalankan", "Run")} <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px]">docker compose up -d</code>.{" "}
                    {t("Mesin mengaktivasi diri dan muncul di daftar instalasi di bawah.", "The engine activates itself and shows up in the installations list below.")}
                  </span>
                </li>
              </ol>
              <Link href="/docs/api" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
                <FileText className="size-4" aria-hidden /> {t("Dokumentasi API lengkap", "Full API documentation")}
              </Link>
            </section>
          )}

          {disetujui && (
            <section className="card overflow-hidden">
              <div className="border-b border-line p-4 sm:p-5">
                <h2 className="text-[15px] font-bold">{t("Instalasi mesin", "Engine installations")}</h2>
                <p className="text-[13px] text-muted">
                  {t(`${instalasi.length} dari maks ${a.batas.instalasi} mesin`, `${instalasi.length} of max ${a.batas.instalasi} ${a.batas.instalasi === 1 ? "engine" : "engines"}`)}
                </p>
              </div>
              {instalasi.length ? (
                <ul className="divide-y divide-line">
                  {instalasi.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0 flex-1 text-[13px]">
                        <p className="truncate font-semibold">{i.alamat}</p>
                        <p className="text-[12.5px] text-muted">
                          {t(`Versi ${i.versi_mesin ?? "-"} · ${angka(i.jumlah_nomor)} nomor`, `Version ${i.versi_mesin ?? "-"} · ${angka(i.jumlah_nomor, b)} ${i.jumlah_nomor === 1 ? "number" : "numbers"}`)}
                          {i.terakhir_sukses && t(` · terhubung ${waktuSingkatWib(i.terakhir_sukses, kini)}`, ` · reached ${waktuSingkatWib(i.terakhir_sukses, kini, b)}`)}
                        </p>
                        {i.gagal_sejak && (
                          <p className="mt-1 text-[12.5px] text-danger">
                            {t(`Webhook lisensi gagal sejak ${waktuSingkatWib(i.gagal_sejak, kini)}`, `License webhook failing since ${waktuSingkatWib(i.gagal_sejak, kini, b)}`)}
                            {i.galat_terakhir && `: ${i.galat_terakhir}`}
                          </p>
                        )}
                      </div>
                      <TombolLepasInstalasi aplikasiId={a.id} instalasiId={i.id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-[13px] text-muted">{t("Belum ada mesin yang aktif.", "No engine activated yet.")}</p>
              )}
            </section>
          )}

          <section className="card p-4 sm:p-6">
            <h2 className="text-[15px] font-bold">{t("Detail pengajuan", "Application details")}</h2>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div>
                <dt className="text-muted">{t("Kegunaan", "Purpose")}</dt>
                <dd className="mt-0.5 whitespace-pre-line">{a.kegunaan}</dd>
              </div>
              {a.situs && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("Situs", "Website")}</dt>
                  <dd className="truncate font-semibold">{a.situs}</dd>
                </div>
              )}
              {a.alamat_mesin && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("Domain aplikasi", "App domain")}</dt>
                  <dd className="truncate font-semibold">{a.alamat_mesin}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section className="card p-4 sm:p-6">
            <h2 className="text-[15px] font-bold">{t("Fitur", "Features")}</h2>
            <p className="text-[12.5px] text-muted">{a.status === "menunggu" || a.status === "ditolak" ? t("Yang diminta", "Requested") : t("Yang dibuka untuk aplikasi ini", "Opened for this app")}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {fitur.map((f) => (
                <li key={f} className="rounded-lg bg-accent-soft px-2 py-1 text-[12px] font-semibold text-accent">
                  {labelFitur(f)}
                </li>
              ))}
            </ul>
          </section>

          {disetujui && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">{t("Biaya", "Pricing")}</h2>
              {biaya === "gratis" ? (
                <p className="mt-2 text-2xl font-bold">{t("Gratis", "Free")}</p>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-bold tabular-nums">
                    Rp{angka(harga)}
                    <span className="text-[13px] font-medium text-muted"> / {t("30 hari", "30 days")}</span>
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    {a.dibayar_sampai && a.dibayar_sampai > kini
                      ? t(`Dibayar sampai ${tanggal(a.dibayar_sampai)}`, `Paid until ${tanggal(a.dibayar_sampai, b)}`)
                      : t("Belum dibayar: mesin berhenti melayani sampai pembayaran diterima (WhatsApp tetap tersambung).", "Unpaid: the engine stops serving until payment is received (WhatsApp stays connected).")}
                  </p>
                  {a.status === "disetujui" && (
                    <Link href={`/developer/${a.id}/bayar`} className="btn btn-primary mt-4 w-full">
                      {a.dibayar_sampai && a.dibayar_sampai > kini ? t("Perpanjang 30 hari", "Extend 30 days") : t("Bayar sekarang", "Pay now")} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  )}
                </>
              )}
            </section>
          )}

          {disetujui && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">{t("Batas", "Limits")}</h2>
              <dl className="mt-3 space-y-2 text-[13px]">
                {(Object.keys(RENTANG_BATAS) as (keyof BatasApi)[]).map((k) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted">{b === "en" ? LABEL_BATAS_EN[k] : RENTANG_BATAS[k].label}</dt>
                    <dd className="font-semibold tabular-nums">{k === "ai_hari" && !a.batas[k] ? t("Tanpa batas", "Unlimited") : angka(a.batas[k], b)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

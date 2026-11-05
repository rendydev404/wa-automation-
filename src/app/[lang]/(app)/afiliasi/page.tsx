import { Suspense } from "react";
import type { Metadata } from "next";
import { Banknote, CheckCircle2, Clock, MousePointerClick, Package, Share2, ShieldAlert, TrendingUp, Users, Wallet, XCircle } from "lucide-react";
import { hitungKomisiPaket, labelKomisiPaket, namaBankTampil, ringkasanAfiliasiUser } from "@/lib/afiliasi";
import type { JenisKomisi } from "@/lib/afiliasi-def";
import type { T } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { asalAplikasi } from "@/lib/batas";
import { angka, uang, waktuSingkatWib } from "@/lib/format";
import { kursUsd } from "@/lib/kurs";
import { daftarPaket } from "@/lib/langganan";
import { MEREK } from "@/lib/merek";
import { customTampil, paketCustom } from "@/lib/paket-custom";
import { requireUser } from "@/lib/session";
import { FormGabungAfiliasi, FormTarikKomisi, KartuTautanReferral } from "./form-afiliasi";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Program Afiliasi", "Affiliate Program")} · ${MEREK}` };
}

const BADGE_PENARIKAN = (t: T): Record<string, { label: string; kelas: string }> => ({
  menunggu: { label: t("Menunggu diproses", "Pending"), kelas: "bg-warning-soft text-warning" },
  selesai: { label: t("Sudah ditransfer", "Paid out"), kelas: "bg-success-soft text-success" },
  ditolak: { label: t("Ditolak (Saldo kembali)", "Rejected (balance returned)"), kelas: "bg-danger-soft text-danger" },
});

async function IsiAfiliasi() {
  const [user, { b, t, href }] = await Promise.all([requireUser(), teksHalaman()]);
  const [data, daftarPkt, custom, asal, kurs] = await Promise.all([
    ringkasanAfiliasiUser(user.id),
    daftarPaket(),
    paketCustom(),
    asalAplikasi(),
    b === "en" ? kursUsd() : Promise.resolve(undefined),
  ]);
  const u = (rp: number) => uang(rp, b, kurs);
  const hari = (n: number) => t(`${n} hari`, `${n} ${n === 1 ? "day" : "days"}`);
  /** Acuan komisi tercatat: "10%" atau nominal tetap (versi Indonesia memakai labelKomisiPaket apa adanya). */
  const labelKomisi = (jenis: JenisKomisi, nilai: number) =>
    b === "en" ? (nilai <= 0 ? "No commission" : jenis === "persen" ? `${nilai}%` : u(nilai)) : labelKomisiPaket(jenis, nilai);

  const semuaPaket = [
    ...daftarPkt.filter((p) => p.harga > 0),
    ...(customTampil(custom) && custom.harga > 0
      ? [
          {
            id: -1,
            kode: "_custom",
            nama: custom.nama,
            harga: custom.harga,
            durasi_hari: custom.durasi_hari,
            kuota_nomor: custom.kuota_nomor,
            kuota_balasan: custom.kuota_balasan,
            deskripsi: custom.deskripsi,
            aktif: true,
            unggulan: false,
            urutan: 9999,
            komisi_jenis: custom.komisi_jenis,
            komisi_nilai: custom.komisi_nilai,
          },
        ]
      : []),
  ];

  const { pengaturan, profil } = data;

  // 1. Belum bergabung -> Tampilan Onboarding seperti Shopee / TikTok Affiliate versi simpel
  if (!profil) {
    return (
      <div className="space-y-6">
        <section className="card p-6 sm:p-8">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12px] font-bold text-accent">
              <Share2 className="size-3.5" aria-hidden /> {t("Program Mitra Afiliasi", "Affiliate Partner Program")}
            </span>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight sm:text-2xl">
              {t("Bagikan tautan, dapatkan komisi dari setiap pembelian paket", "Share your link, earn commission on every plan purchase")}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              {t(
                "Daftar menjadi afiliator hanya dalam 1 langkah. Setiap kali ada pelanggan baru yang mendaftar lewat tautan Anda dan membeli paket langganan, komisi langsung masuk otomatis ke saldo Anda",
                "Become an affiliate in just 1 step. Every time a new customer signs up through your link and buys a subscription plan, the commission is added to your balance automatically",
              )}{" "}
              {pengaturan.siklus === "berulang"
                ? t("(berlaku juga saat perpanjangan paket sesuai pengaturan admin).", "(renewals count too, as set by the admin).")
                : t(
                    "pada pembelian paket mereka (1 kali per pelanggan referral sesuai ketentuan pihak aplikasi).",
                    "on their plan purchase (once per referred customer, under the program terms).",
                  )}
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-subtle/40 p-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                <Share2 className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[13.5px] font-bold">{t("1. Bagikan Tautan Unik", "1. Share Your Unique Link")}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {t(
                  "Sistem membuat kode referral acak otomatis untuk akun Anda yang siap langsung dibagikan ke calon pelanggan.",
                  "We automatically generate a random referral code for your account, ready to share with potential customers.",
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-subtle/40 p-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                <TrendingUp className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[13.5px] font-bold">{t("2. Komisi Masuk Otomatis", "2. Commission Added Automatically")}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {t(
                  "Begitu pembayaran paket pelanggan referral lunas, komisi langsung dihitung dan ditambahkan ke saldo Anda sesuai ketentuan aplikasi.",
                  "As soon as a referred customer's plan payment is complete, the commission is calculated and added to your balance under the program terms.",
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-subtle/40 p-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                <Wallet className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[13.5px] font-bold">{t("3. Tarik ke Bank / E-Wallet", "3. Withdraw to Bank / E-Wallet")}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {t(
                  `Ajukan pencairan kapan saja setelah mencapai minimal Rp${angka(pengaturan.minTarik)}.`,
                  `Request a payout any time once you reach the ${u(pengaturan.minTarik)} minimum.`,
                )}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="card p-6">
            <h3 className="text-[16px] font-bold">{t("Formulir Pendaftaran Afiliasi", "Affiliate Sign-up Form")}</h3>
            <p className="mt-0.5 text-[13px] text-muted">
              {pengaturan.persetujuan === "otomatis"
                ? t("Langsung aktif setelah disimpan tanpa perlu menunggu verifikasi.", "Active right after you save, no verification wait.")
                : t("Pendaftaran akan ditinjau dan diaktifkan oleh admin.", "Your application will be reviewed and activated by the admin.")}
            </p>
            <div className="mt-5">
              {pengaturan.aktif ? (
                <FormGabungAfiliasi />
              ) : (
                <p className="rounded-xl border border-line bg-subtle p-4 text-[13px] text-muted">
                  {t("Pendaftaran program afiliasi baru sedang ditutup sementara oleh admin.", "New affiliate sign-ups are temporarily closed by the admin.")}
                </p>
              )}
            </div>
          </section>

          <section className="card p-6">
            <h3 className="flex items-center gap-2 text-[15px] font-bold">
              <Package className="size-4 text-accent" aria-hidden /> {t("Rincian Komisi per Paket", "Commission per Plan")}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {t("Ketentuan komisi saat ini:", "Current commission terms:")}{" "}
              <strong className="font-semibold text-fg">
                {pengaturan.siklus === "berulang"
                  ? t("Berulang setiap pembelian / perpanjangan", "Recurring on every purchase / renewal")
                  : t("1x per pelanggan referral yang membeli paket", "Once per referred customer who buys a plan")}
              </strong>
            </p>
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {semuaPaket.map((p) => {
                const nominal = hitungKomisiPaket(p.harga, p.komisi_jenis, p.komisi_nilai);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                    <div>
                      <span className="font-bold">{p.nama}</span>
                      <span className="block text-[12px] text-muted tabular-nums">
                        {t(`Harga paket Rp${angka(p.harga)} / ${p.durasi_hari} hari`, `Plan price ${u(p.harga)} / ${hari(p.durasi_hari)}`)}
                      </span>
                    </div>
                    <div className="text-right tabular-nums">
                      {nominal > 0 ? (
                        <>
                          <span className="rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success">+{u(nominal)}</span>
                          {p.komisi_jenis === "persen" && (
                            <span className="mt-0.5 block text-[11px] text-muted">{t(`(${p.komisi_nilai}% dari harga)`, `(${p.komisi_nilai}% of the price)`)}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-muted">{t("Tanpa komisi", "No commission")}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              {t(
                "* Besaran komisi per paket, siklus pemberian komisi, serta proses pencairan saldo dapat diatur sewaktu-waktu oleh admin dan mengikuti ketentuan dari pihak aplikasi.",
                "* Commission amounts per plan, the commission cycle, and the payout process may be changed by the admin at any time and follow the program terms.",
              )}
              {b === "en" && " Amounts in USD are approximate; commissions are credited and paid out in Indonesian rupiah (IDR)."}
            </p>
          </section>
        </div>
      </div>
    );
  }

  // 2. Sudah terdaftar
  const tautanUtama = `${asal}${href(`/?ref=${encodeURIComponent(profil.kode)}`)}`;
  const tautanDaftar = `${asal}${href(`/daftar?ref=${encodeURIComponent(profil.kode)}`)}`;
  const badge = BADGE_PENARIKAN(t);
  const waktu = (d: number) => waktuSingkatWib(d, undefined, b);

  return (
    <div className="space-y-6">
      {profil.status === "menunggu" && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-[13.5px] text-warning">
          <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">{t("Menunggu Persetujuan Admin", "Awaiting Admin Approval")}</p>
            <p className="mt-0.5 text-[12.5px]">
              {t(
                "Pendaftaran afiliasi Anda sedang ditinjau oleh admin. Tautan Anda akan langsung aktif mencatat komisi begitu disetujui.",
                "Your affiliate application is being reviewed by the admin. Your link will start tracking commissions as soon as it's approved.",
              )}
            </p>
          </div>
        </div>
      )}

      {profil.status === "nonaktif" && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger-soft p-4 text-[13.5px] text-danger">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">{t("Akun Afiliasi Dinonaktifkan", "Affiliate Account Deactivated")}</p>
            <p className="mt-0.5 text-[12.5px]">
              {t(
                "Status afiliasi Anda sedang dinonaktifkan oleh admin. Hubungi admin untuk informasi lebih lanjut.",
                "Your affiliate status has been deactivated by the admin. Contact the admin for more information.",
              )}
            </p>
          </div>
        </div>
      )}

      <KartuTautanReferral
        tautanUtama={tautanUtama}
        tautanDaftar={tautanDaftar}
        kode={profil.kode}
        bankNama={profil.bank_nama}
        bankNomor={profil.bank_nomor}
        bankPemilik={profil.bank_pemilik}
      />

      {/* Metrik Utama */}
      <section aria-label={t("Statistik Afiliasi", "Affiliate statistics")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">{t("Saldo Bisa Ditarik", "Available Balance")}</span>
            <Wallet className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-2xl tabular-nums">{u(profil.saldo)}</p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {data.sedangMenungguCair > 0
              ? t(`Rp${angka(data.sedangMenungguCair)} sedang diproses cair`, `${u(data.sedangMenungguCair)} payout in progress`)
              : t(`Sudah dicairkan Rp${angka(profil.total_ditarik)}`, `${u(profil.total_ditarik)} paid out so far`)}
          </p>
        </div>

        <div className="card min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">{t("Total Komisi Diperoleh", "Total Commission Earned")}</span>
            <Banknote className="size-4 text-success" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-2xl text-success tabular-nums">{u(profil.total_komisi)}</p>
          <p className="mt-1 text-[12px] text-muted">
            {pengaturan.siklus === "berulang" ? t("Komisi berulang tiap perpanjangan", "Recurring commission on every renewal") : t("Komisi pembelian pertama", "First-purchase commission")}
          </p>
        </div>

        <div className="card min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">{t("Klik Tautan & Pendaftar", "Link Clicks & Sign-ups")}</span>
            <MousePointerClick className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-2xl tabular-nums">
            {angka(data.totalPendaftar, b)}{" "}
            <span className="text-[14px] font-semibold text-muted">{t("akun", data.totalPendaftar === 1 ? "account" : "accounts")}</span>
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {t(`Dari ${angka(profil.klik)} klik tautan unik`, `From ${angka(profil.klik, b)} unique link ${profil.klik === 1 ? "click" : "clicks"}`)}
          </p>
        </div>

        <div className="card min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">{t("Pembeli Paket", "Plan Buyers")}</span>
            <Users className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-2xl tabular-nums">
            {angka(data.totalPembeli, b)}{" "}
            <span className="text-[14px] font-semibold text-muted">{t("pembeli", data.totalPembeli === 1 ? "buyer" : "buyers")}</span>
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {t(
              `${data.riwayatKomisi.length} transaksi komisi tercatat`,
              `${data.riwayatKomisi.length} commission ${data.riwayatKomisi.length === 1 ? "transaction" : "transactions"} recorded`,
            )}
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <FormTarikKomisi
          saldo={profil.saldo}
          minTarik={pengaturan.minTarik}
          sedangMenunggu={data.sedangMenungguCair}
          bankNama={profil.bank_nama}
          bankNomor={profil.bank_nomor}
          bankPemilik={profil.bank_pemilik}
          kurs={kurs}
        />

        <section className="card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Package className="size-4 text-accent" aria-hidden /> {t("Besaran Komisi per Paket", "Commission per Plan")}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {t("Komisi yang Anda terima setiap kali referral membeli paket di bawah ini.", "The commission you earn each time a referral buys one of the plans below.")}
          </p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {semuaPaket.map((p) => {
              const nominal = hitungKomisiPaket(p.harga, p.komisi_jenis, p.komisi_nilai);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                  <span className="font-semibold">
                    {p.nama} <span className="font-normal text-muted tabular-nums">({u(p.harga)})</span>
                  </span>
                  <span className="font-bold text-success tabular-nums">
                    {nominal > 0 ? `+${u(nominal)}` : "–"}
                    {nominal > 0 && p.komisi_jenis === "persen" && <span className="ml-1 font-normal text-muted">({p.komisi_nilai}%)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            {b === "en"
              ? `* Commission amounts per plan, the commission cycle (${pengaturan.siklus === "berulang" ? "recurring" : "once per customer"}), and payouts are set by the admin and follow the program terms. Amounts in USD are approximate; commissions are credited and paid out in Indonesian rupiah (IDR).`
              : `* Besaran komisi per paket, siklus komisi (${pengaturan.siklus === "berulang" ? "berulang" : "1 kali per pelanggan"}), serta pencairan saldo diatur oleh admin dan mengikuti ketentuan dari pihak aplikasi.`}
          </p>
        </section>
      </div>

      {/* Riwayat Komisi & Riwayat Penarikan */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">{t("Riwayat Komisi Masuk", "Commission History")}</h2>
            <p className="text-[12px] text-muted">{t("Otomatis tercatat saat referral Anda melunasi paket.", "Recorded automatically when your referral pays for a plan.")}</p>
          </div>
          {data.riwayatKomisi.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">
              {t("Belum ada komisi masuk. Bagikan tautan afiliasi Anda untuk mulai menghasilkan komisi.", "No commission yet. Share your affiliate link to start earning.")}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.riwayatKomisi.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {t(`Paket ${k.nama_paket}`, `${k.nama_paket} plan`)} · <span className="text-muted">{k.referred_email}</span>
                    </p>
                    <p className="text-[12px] text-faint tabular-nums">
                      {waktu(k.created_at)} · {t(`Pembelian Rp${angka(k.jumlah_bayar)}`, `Purchase ${u(k.jumlah_bayar)}`)} ({labelKomisi(k.komisi_jenis, k.komisi_acuan)})
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success tabular-nums">+{u(k.nominal)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">{t("Riwayat Penarikan Dana", "Payout History")}</h2>
            <p className="text-[12px] text-muted">{t("Status pencairan saldo komisi ke rekening Anda.", "Status of commission payouts to your account.")}</p>
          </div>
          {data.riwayatPenarikan.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">{t("Belum ada riwayat penarikan komisi.", "No payouts yet.")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.riwayatPenarikan.map((p) => {
                const infoStatus = badge[p.status] ?? badge.menunggu;
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[13px]">
                    <div className="min-w-0">
                      <p className="font-bold tabular-nums">
                        {u(p.nominal)}{" "}
                        <span className="font-normal text-muted">
                          → {namaBankTampil(p.bank_nama)} {p.bank_nomor}
                        </span>
                      </p>
                      <p className="text-[12px] text-faint">
                        {t(`Diajukan ${waktu(p.dibuat)}`, `Requested ${waktu(p.dibuat)}`)}
                        {p.diproses ? t(` · Diproses ${waktu(p.diproses)}`, ` · Processed ${waktu(p.diproses)}`) : ""}
                        {p.referensi ? ` · Ref: ${p.referensi}` : ""}
                        {p.catatan ? ` · ${p.catatan}` : ""}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${infoStatus.kelas}`}>
                      {p.status === "selesai" ? (
                        <CheckCircle2 className="size-3.5" aria-hidden />
                      ) : p.status === "ditolak" ? (
                        <XCircle className="size-3.5" aria-hidden />
                      ) : (
                        <Clock className="size-3.5" aria-hidden />
                      )}
                      {infoStatus.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default async function HalamanAfiliasi() {
  const { t } = await teksHalaman();
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">{t("Afiliasi", "Affiliate")}</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">{t("Program Afiliasi & Komisi", "Affiliate Program & Commissions")}</h1>
        <p className="mt-1 max-w-2xl text-muted">
          {t(
            "Rekomendasikan layanan ini kepada pemilik usaha lain dan dapatkan komisi dari setiap pembelian paket.",
            "Recommend this service to other business owners and earn commission on every plan purchase.",
          )}
        </p>
      </div>
      <Suspense fallback={<div aria-hidden className="h-96 animate-denyut rounded-2xl bg-subtle" />}>
        <IsiAfiliasi />
      </Suspense>
    </div>
  );
}

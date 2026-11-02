import { Suspense } from "react";
import type { Metadata } from "next";
import { Banknote, CheckCircle2, Clock, MousePointerClick, Package, Share2, ShieldAlert, TrendingUp, Users, Wallet, XCircle } from "lucide-react";
import { hitungKomisiPaket, labelKomisiPaket, namaBankTampil, ringkasanAfiliasiUser } from "@/lib/afiliasi";
import { asalAplikasi } from "@/lib/batas";
import { angka, waktuSingkatWib } from "@/lib/format";
import { daftarPaket } from "@/lib/langganan";
import { MEREK } from "@/lib/merek";
import { customTampil, paketCustom } from "@/lib/paket-custom";
import { requireUser } from "@/lib/session";
import { FormGabungAfiliasi, FormTarikKomisi, KartuTautanReferral } from "./form-afiliasi";

export const metadata: Metadata = { title: `Program Afiliasi · ${MEREK}` };

const BADGE_PENARIKAN: Record<string, { label: string; kelas: string }> = {
  menunggu: { label: "Menunggu diproses", kelas: "bg-warning-soft text-warning" },
  selesai: { label: "Sudah ditransfer", kelas: "bg-success-soft text-success" },
  ditolak: { label: "Ditolak (Saldo kembali)", kelas: "bg-danger-soft text-danger" },
};

async function IsiAfiliasi() {
  const user = await requireUser();
  const [data, daftarPkt, custom, asal] = await Promise.all([
    ringkasanAfiliasiUser(user.id),
    daftarPaket(),
    paketCustom(),
    asalAplikasi(),
  ]);

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
              <Share2 className="size-3.5" aria-hidden /> Program Mitra Afiliasi
            </span>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight sm:text-2xl">
              Bagikan tautan, dapatkan komisi dari setiap pembelian paket
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Daftar menjadi afiliator hanya dalam 1 langkah. Setiap kali ada pelanggan baru yang mendaftar lewat tautan Anda dan membeli paket langganan, komisi langsung masuk otomatis ke saldo Anda{" "}
              {pengaturan.siklus === "berulang"
                ? "(berlaku juga saat perpanjangan paket sesuai pengaturan admin)."
                : "pada pembelian paket mereka (1 kali per pelanggan referral sesuai ketentuan pihak aplikasi)."}
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-subtle/40 p-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                <Share2 className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[13.5px] font-bold">1. Bagikan Tautan Unik</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Sistem membuat kode referral acak otomatis untuk akun Anda. Cookie tersimpan otomatis selama 30 hari di perangkat pengunjung.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-subtle/40 p-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                <TrendingUp className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[13.5px] font-bold">2. Komisi Masuk Otomatis</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Begitu pembayaran paket pelanggan referral lunas, komisi langsung dihitung dan ditambahkan ke saldo Anda sesuai ketentuan aplikasi.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-subtle/40 p-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                <Wallet className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[13.5px] font-bold">3. Tarik ke Bank / E-Wallet</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Ajukan pencairan kapan saja setelah mencapai minimal Rp{angka(pengaturan.minTarik)}.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="card p-6">
            <h3 className="text-[16px] font-bold">Formulir Pendaftaran Afiliasi</h3>
            <p className="mt-0.5 text-[13px] text-muted">
              {pengaturan.persetujuan === "otomatis"
                ? "Langsung aktif setelah disimpan tanpa perlu menunggu verifikasi."
                : "Pendaftaran akan ditinjau dan diaktifkan oleh admin."}
            </p>
            <div className="mt-5">
              {pengaturan.aktif ? (
                <FormGabungAfiliasi />
              ) : (
                <p className="rounded-xl border border-line bg-subtle p-4 text-[13px] text-muted">
                  Pendaftaran program afiliasi baru sedang ditutup sementara oleh admin.
                </p>
              )}
            </div>
          </section>

          <section className="card p-6">
            <h3 className="flex items-center gap-2 text-[15px] font-bold">
              <Package className="size-4 text-accent" aria-hidden /> Rincian Komisi per Paket
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Ketentuan komisi saat ini:{" "}
              <strong className="font-semibold text-fg">
                {pengaturan.siklus === "berulang" ? "Berulang setiap pembelian / perpanjangan" : "1x per pelanggan referral yang membeli paket"}
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
                        Harga paket Rp{angka(p.harga)} / {p.durasi_hari} hari
                      </span>
                    </div>
                    <div className="text-right tabular-nums">
                      {nominal > 0 ? (
                        <>
                          <span className="rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success">
                            +Rp{angka(nominal)}
                          </span>
                          {p.komisi_jenis === "persen" && (
                            <span className="mt-0.5 block text-[11px] text-muted">({p.komisi_nilai}% dari harga)</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-muted">Tanpa komisi</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              * Besaran komisi per paket, siklus pemberian komisi, serta proses pencairan saldo dapat diatur sewaktu-waktu oleh admin dan mengikuti ketentuan dari pihak aplikasi.
            </p>
          </section>
        </div>
      </div>
    );
  }

  // 2. Sudah terdaftar
  const tautanUtama = `${asal}/?ref=${encodeURIComponent(profil.kode)}`;
  const tautanDaftar = `${asal}/daftar?ref=${encodeURIComponent(profil.kode)}`;

  return (
    <div className="space-y-6">
      {profil.status === "menunggu" && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-[13.5px] text-warning">
          <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">Menunggu Persetujuan Admin</p>
            <p className="mt-0.5 text-[12.5px]">
              Pendaftaran afiliasi Anda sedang ditinjau oleh admin. Tautan Anda akan langsung aktif mencatat komisi begitu disetujui.
            </p>
          </div>
        </div>
      )}

      {profil.status === "nonaktif" && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger-soft p-4 text-[13.5px] text-danger">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">Akun Afiliasi Dinonaktifkan</p>
            <p className="mt-0.5 text-[12.5px]">
              Status afiliasi Anda sedang dinonaktifkan oleh admin. Hubungi admin untuk informasi lebih lanjut.
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
      <section aria-label="Statistik Afiliasi" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Saldo Bisa Ditarik</span>
            <Wallet className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">Rp{angka(profil.saldo)}</p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {data.sedangMenungguCair > 0
              ? `Rp${angka(data.sedangMenungguCair)} sedang diproses cair`
              : `Sudah dicairkan Rp${angka(profil.total_ditarik)}`}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Total Komisi Diperoleh</span>
            <Banknote className="size-4 text-success" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-success tabular-nums">
            Rp{angka(profil.total_komisi)}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {pengaturan.siklus === "berulang" ? "Komisi berulang tiap perpanjangan" : "Komisi pembelian pertama"}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Klik Tautan & Pendaftar</span>
            <MousePointerClick className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
            {angka(data.totalPendaftar)} <span className="text-[14px] font-semibold text-muted">akun</span>
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">Dari {angka(profil.klik)} klik tautan unik</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Pembeli Paket</span>
            <Users className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
            {angka(data.totalPembeli)} <span className="text-[14px] font-semibold text-muted">pembeli</span>
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {data.riwayatKomisi.length} transaksi komisi tercatat
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
        />

        <section className="card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Package className="size-4 text-accent" aria-hidden /> Besaran Komisi per Paket
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Komisi yang Anda terima setiap kali referral membeli paket di bawah ini.
          </p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {semuaPaket.map((p) => {
              const nominal = hitungKomisiPaket(p.harga, p.komisi_jenis, p.komisi_nilai);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                  <span className="font-semibold">
                    {p.nama} <span className="font-normal text-muted tabular-nums">(Rp{angka(p.harga)})</span>
                  </span>
                  <span className="font-bold text-success tabular-nums">
                    {nominal > 0 ? `+Rp${angka(nominal)}` : "–"}
                    {nominal > 0 && p.komisi_jenis === "persen" && (
                      <span className="ml-1 font-normal text-muted">({p.komisi_nilai}%)</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            * Besaran komisi per paket, siklus komisi ({pengaturan.siklus === "berulang" ? "berulang" : "1 kali per pelanggan"}), serta pencairan saldo diatur oleh admin dan mengikuti ketentuan dari pihak aplikasi.
          </p>
        </section>
      </div>

      {/* Riwayat Komisi & Riwayat Penarikan */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">Riwayat Komisi Masuk</h2>
            <p className="text-[12px] text-muted">Otomatis tercatat saat referral Anda melunasi paket.</p>
          </div>
          {data.riwayatKomisi.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">
              Belum ada komisi masuk. Bagikan tautan afiliasi Anda untuk mulai menghasilkan komisi.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.riwayatKomisi.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      Paket {k.nama_paket} · <span className="text-muted">{k.referred_email}</span>
                    </p>
                    <p className="text-[12px] text-faint tabular-nums">
                      {waktuSingkatWib(k.created_at)} · Pembelian Rp{angka(k.jumlah_bayar)} (
                      {labelKomisiPaket(k.komisi_jenis, k.komisi_acuan)})
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success tabular-nums">
                    +Rp{angka(k.nominal)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">Riwayat Penarikan Dana</h2>
            <p className="text-[12px] text-muted">Status pencairan saldo komisi ke rekening Anda.</p>
          </div>
          {data.riwayatPenarikan.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Belum ada riwayat penarikan komisi.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.riwayatPenarikan.map((p) => {
                const infoStatus = BADGE_PENARIKAN[p.status] ?? BADGE_PENARIKAN.menunggu;
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[13px]">
                    <div className="min-w-0">
                      <p className="font-bold tabular-nums">
                        Rp{angka(p.nominal)}{" "}
                        <span className="font-normal text-muted">
                          → {namaBankTampil(p.bank_nama)} {p.bank_nomor}
                        </span>
                      </p>
                      <p className="text-[12px] text-faint">
                        Diajukan {waktuSingkatWib(p.dibuat)}
                        {p.diproses ? ` · Diproses ${waktuSingkatWib(p.diproses)}` : ""}
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

export default function HalamanAfiliasi() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Afiliasi</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Program Afiliasi & Komisi</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Rekomendasikan layanan ini kepada pemilik usaha lain dan dapatkan komisi dari setiap pembelian paket.
        </p>
      </div>
      <Suspense fallback={<div aria-hidden className="h-96 animate-denyut rounded-2xl bg-subtle" />}>
        <IsiAfiliasi />
      </Suspense>
    </div>
  );
}

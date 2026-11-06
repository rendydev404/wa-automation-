import { Suspense } from "react";
import type { Metadata } from "next";
import { Activity, CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";
import { pengaturanMetaPixel } from "@/lib/meta-pixel";
import { MEREK } from "@/lib/merek";
import { requireAdmin } from "@/lib/session";
import { FormMetaPixel } from "./form-pixel";

export const metadata: Metadata = { title: `Meta Pixel · Admin · ${MEREK}` };

const LANGKAH_PASANG = [
  {
    judul: "Buka Meta Events Manager",
    isi: "Masuk ke Pengelola Peristiwa (Events Manager) di akun Meta Business Suite Anda, lalu pilih sumber data (Dataset / Pixel).",
  },
  {
    judul: "Salin ID Pixel atau Kode Script",
    isi: "Anda bisa menyalin angka Dataset ID (15–16 digit) di tab Pengaturan, atau langsung salin kode HTML Meta Pixel.",
  },
  {
    judul: "Tempel & Simpan di Halaman Ini",
    isi: "Tempel di kolom samping lalu klik Simpan. Pelacakan PageView, Klik WA, Pendaftaran, Checkout, dan Pembelian langsung aktif tanpa perlu deploy ulang.",
  },
];

async function IsiMetaPixelAdmin() {
  await requireAdmin();
  const awal = await pengaturanMetaPixel();
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Activity className="size-4 text-accent" aria-hidden /> Konfigurasi Meta Ads Pixel
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Perubahan langsung berlaku di seluruh halaman publik dan dashboard tanpa perlu me-restart server.
          </p>
        </div>
      </div>
      <div className="mt-5">
        <FormMetaPixel awal={awal} />
      </div>
    </section>
  );
}

export default function HalamanAdminMetaPixel() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Meta Ads Pixel</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Pasang Meta Pixel dan Conversions API untuk melacak efektivitas iklan Meta Ads (Facebook &amp; Instagram) dari kunjungan sampai pembelian paket.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Suspense fallback={<div aria-hidden className="card h-[640px] animate-denyut" />}>
          <IsiMetaPixelAdmin />
        </Suspense>

        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <HelpCircle className="size-4 text-accent" aria-hidden /> Cara Memasang
            </h2>
            <ol className="mt-4 space-y-3.5 text-[12.5px]">
              {LANGKAH_PASANG.map((l, i) => (
                <li key={l.judul} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-[11.5px] font-bold text-accent">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-fg">{l.judul}</p>
                    <p className="mt-0.5 leading-relaxed text-muted">{l.isi}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <ShieldCheck className="size-4 text-accent" aria-hidden /> Keunggulan Integrasi Ini
            </h2>
            <ul className="mt-3.5 space-y-2.5 text-[12.5px] text-muted">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>
                  <strong className="text-fg">Anti Duplikasi Purchase:</strong> Setiap transaksi memiliki ID pesanan unik sehingga refresh halaman tidak menggandakan nilai konversi iklan.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>
                  <strong className="text-fg">Deteksi Otomatis Klik WA:</strong> Semua tombol tes WhatsApp dan widget WA di halaman depan otomatis mengirim sinyal <code className="font-mono text-fg">Lead</code>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>
                  <strong className="text-fg">Dukungan Conversions API:</strong> Bila token CAPI diisi, pendaftaran dan pelunasan paket juga dikirim dari server dengan deduplikasi otomatis.
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

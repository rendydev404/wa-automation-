import Link from "next/link";
import { connection } from "next/server";
import { Check, Sparkles } from "lucide-react";
import { angka, UMUR_HISTORI_HARI } from "@/lib/format";
import { daftarPaket, kuotaBalasanGratis } from "@/lib/langganan";
import { customTampil, paketCustom, tautanCustom } from "@/lib/paket-custom";
import { KartuCustom } from "../kartu-custom";

/**
 * Daftar harga di landing page, langsung dari paket yang dikelola admin (harga di sini = harga yang bisa dibeli).
 * Dibaca saat permintaan dan dialirkan setelah kerangka halaman statis tampil; database tak terjangkau = bagian
 * ini tidak tampil, bukan halaman gagal.
 */
export async function HargaLanding() {
  await connection();
  let paket, gratis, custom;
  try {
    [paket, gratis, custom] = await Promise.all([daftarPaket(), kuotaBalasanGratis(), paketCustom()]);
  } catch {
    return null;
  }
  const dijual = paket.filter((p) => p.harga > 0);
  const adaCustom = customTampil(custom);
  if (!dijual.length && !adaCustom) return null;
  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {dijual.map((p) => (
        <article key={p.id} className={`relative flex flex-col rounded-3xl border bg-surface p-7 shadow-card ${p.unggulan ? "border-accent ring-2 ring-accent" : "border-line"}`}>
          {p.unggulan && (
            <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11.5px] font-bold text-on-accent">
              <Sparkles className="size-3" aria-hidden /> Paling banyak dipilih
            </span>
          )}
          <h3 className="text-xl font-bold">{p.nama}</h3>
          {p.deskripsi && <p className="mt-1 text-[14px] text-muted">{p.deskripsi}</p>}
          <p className="mt-5 text-4xl font-extrabold tracking-tight tabular-nums">
            Rp{angka(p.harga)}
            <span className="text-[14px] font-semibold text-muted"> / {p.durasi_hari} hari</span>
          </p>
          <ul className="mt-5 flex-1 space-y-2.5 text-[14px]">
            {[`${angka(p.kuota_nomor)} nomor WhatsApp`, `${angka(p.kuota_balasan)} balasan AI`, "Base knowledge & belajar dari balasanmu", `Histori percakapan ${UMUR_HISTORI_HARI} hari & statistik`].map((x) => (
              <li key={x} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
              </li>
            ))}
          </ul>
          <Link href="/daftar" className={`mt-6 ${p.unggulan ? "btn btn-primary" : "btn btn-ghost border border-line"} w-full justify-center`}>
            Mulai sekarang
          </Link>
        </article>
      ))}
      {adaCustom && <KartuCustom p={custom} href={tautanCustom(custom)} varian="landing" />}
      <p className="text-[13px] text-muted md:col-span-2 xl:col-span-3">
        Coba gratis dulu: setiap akun baru mendapat {angka(gratis)} balasan AI per bulan tanpa kartu kredit. Bayar lewat QRIS, transfer bank, e-wallet, atau kartu.
      </p>
    </div>
  );
}

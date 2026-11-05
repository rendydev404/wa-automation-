import Link from "next/link";
import { sekarang } from "@/lib/db";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Clock, Download, Receipt, Search, Users, Wallet } from "lucide-react";
import { LencanaPaket } from "@/components/lencana-paket";
import { TombolSalin } from "@/components/tombol-salin";
import { angka, tanggal, waktuSingkatWib } from "@/lib/format";
import { daftarPaket } from "@/lib/langganan";
import { requireAdmin } from "@/lib/session";
import { tingkatPaket } from "@/lib/tingkat-paket";
import { FILTER_STATUS_TRX, cariTransaksi, hitungTransaksi, labelMetode, opsiDariParam, ringkasanTransaksi, satu } from "@/lib/transaksi-admin";

export { labelMetode };

type Cari = Record<string, string | string[] | undefined>;

export const STATUS_TRX: Record<string, { label: string; kelas: string }> = {
  menunggu: { label: "Menunggu", kelas: "bg-warning-soft text-warning" },
  lunas: { label: "Lunas", kelas: "bg-success-soft text-success" },
  gagal: { label: "Gagal", kelas: "bg-danger-soft text-danger" },
  kedaluwarsa: { label: "Kedaluwarsa", kelas: "bg-subtle text-muted" },
  dibatalkan: { label: "Dibatalkan", kelas: "bg-subtle text-muted" },
  dikembalikan: { label: "Dikembalikan", kelas: "bg-subtle text-muted" },
};

export const rp = (n: number) => `Rp${angka(n)}`;

function Kartu({ ikon: Ikon, label, nilai, sub, nada }: { ikon: typeof Wallet; label: string; nilai: string; sub: React.ReactNode; nada?: "naik" | "turun" }) {
  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
        <Ikon className="size-4 text-accent" aria-hidden /> {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{nilai}</p>
      <p className={`mt-1 flex items-center gap-1 text-[12.5px] ${nada === "naik" ? "text-success" : nada === "turun" ? "text-danger" : "text-muted"}`}>{sub}</p>
    </div>
  );
}

export async function RingkasanTransaksi() {
  await requireAdmin();
  const r = await ringkasanTransaksi();
  const selisih = r.bulanLalu > 0 ? Math.round(((r.bulanIni - r.bulanLalu) / r.bulanLalu) * 100) : null;
  const maks = Math.max(1, ...r.perPaket.map((p) => p.total));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kartu ikon={Wallet} label="Total pendapatan" nilai={rp(r.pendapatan)} sub={`${angka(r.lunas)} transaksi lunas`} />
        <Kartu
          ikon={Receipt}
          label="Bulan ini (WIB)"
          nilai={rp(r.bulanIni)}
          nada={selisih === null ? undefined : selisih >= 0 ? "naik" : "turun"}
          sub={
            selisih === null ? (
              `${angka(r.bulanIniN)} transaksi lunas`
            ) : (
              <>
                {selisih >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                {selisih >= 0 ? "+" : ""}
                {selisih}% dari bulan lalu ({rp(r.bulanLalu)})
              </>
            )
          }
        />
        <Kartu ikon={Users} label="Pembeli unik" nilai={angka(r.pembeli)} sub="akun yang pernah membayar" />
        <Kartu ikon={Clock} label="Tagihan menunggu" nilai={angka(r.menunggu)} sub="belum dibayar & belum kedaluwarsa" />
      </div>
      {r.perPaket.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[13px] font-bold">Pendapatan per paket (lunas)</h2>
          <ul className="mt-3 space-y-2.5">
            {r.perPaket.map((p) => (
              <li key={p.nama_paket} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-[12.5px]">
                <span className="min-w-0 truncate">
                  <LencanaPaket tingkat={tingkatPaket(p.kode, p.nama_paket)} nama={p.nama_paket} ukuran="sm" />
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-subtle">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (p.total / maks) * 100)}%` }} />
                </span>
                <span className="text-right whitespace-nowrap tabular-nums">
                  <b className="font-semibold">{rp(p.total)}</b> <span className="text-muted">· {angka(p.n)}×</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export async function DaftarTransaksi({ searchParams }: { searchParams: Promise<Cari> }) {
  await requireAdmin();
  const sp = await searchParams;
  const opsi = opsiDariParam(sp);
  const [sb, sbId] = satu(sp.sebelum).split(".").map(Number);
  const sebelum = Number.isInteger(sb) && Number.isInteger(sbId) ? { dibuat: sb, id: sbId } : undefined;
  const [{ daftar, adaLagi }, jumlah, paket] = await Promise.all([cariTransaksi({ ...opsi, sebelum }), hitungTransaksi(opsi), daftarPaket({ semua: true, custom: true })]);
  const kini = sekarang();

  const param = (ubah: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const semua = { q: opsi.q || undefined, s: opsi.status === "semua" ? undefined : opsi.status, paket: satu(sp.paket) || undefined, dari: satu(sp.dari) || undefined, sampai: satu(sp.sampai) || undefined, ...ubah };
    for (const [k, v] of Object.entries(semua)) if (v) q.set(k, v);
    return q.toString();
  };
  const tautan = (ubah: Record<string, string | undefined>) => {
    const s = param(ubah);
    return s ? `/admin/transaksi?${s}` : "/admin/transaksi";
  };
  const adaSaring = !!(opsi.q || opsi.paketId || opsi.dari || opsi.sampai);

  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="space-y-3 border-b border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Receipt className="size-4 text-accent" aria-hidden /> Riwayat transaksi
          </h2>
          <a href={`/api/admin/transaksi?${param({ sebelum: undefined })}`} className="btn btn-ghost border border-line" download>
            <Download className="size-4" aria-hidden /> Ekspor CSV
          </a>
        </div>
        <form action="/admin/transaksi" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto_auto]">
          {opsi.status !== "semua" && <input type="hidden" name="s" value={opsi.status} />}
          <label className="relative">
            <span className="sr-only">Cari transaksi</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input name="q" defaultValue={opsi.q} placeholder="ID pembelian (WA-… / ADM-…), email, nama, atau ID pengguna" className="field pl-9" />
          </label>
          <label>
            <span className="sr-only">Paket</span>
            <select name="paket" defaultValue={satu(sp.paket)} className="field">
              <option value="">Semua paket</option>
              {paket.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                  {p.aktif ? "" : " (nonaktif)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="shrink-0">Dari</span>
            <input type="date" name="dari" defaultValue={satu(sp.dari)} className="field" />
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="shrink-0">s.d.</span>
            <input type="date" name="sampai" defaultValue={satu(sp.sampai)} className="field" />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">
              Terapkan
            </button>
            {adaSaring && (
              <Link href={opsi.status === "semua" ? "/admin/transaksi" : `/admin/transaksi?s=${opsi.status}`} className="btn btn-ghost border border-line">
                Reset
              </Link>
            )}
          </div>
        </form>
        <nav aria-label="Saring status" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-subtle p-1">
          {FILTER_STATUS_TRX.map((f) => (
            <Link
              key={f.nilai}
              href={tautan({ s: f.nilai === "semua" ? undefined : f.nilai, sebelum: undefined })}
              aria-current={opsi.status === f.nilai ? "page" : undefined}
              className={`inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${opsi.status === f.nilai ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {f.label}
              <span className={`ml-1.5 tabular-nums ${opsi.status === f.nilai ? "text-accent" : "text-faint"}`}>{angka(jumlah[f.nilai])}</span>
            </Link>
          ))}
        </nav>
      </div>

      {daftar.length === 0 ? (
        <p className="px-5 py-12 text-center text-[13px] text-muted">{adaSaring || opsi.status !== "semua" ? "Tidak ada transaksi yang cocok dengan saringan ini." : "Belum ada transaksi."}</p>
      ) : (
        <>
          {/* HP: kartu per transaksi. */}
          <ul className="divide-y divide-line lg:hidden">
            {daftar.map((t) => (
              <li key={t.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/transaksi/${encodeURIComponent(t.order_id)}`} className="block truncate font-mono text-[12.5px] font-semibold hover:underline">
                      {t.order_id}
                    </Link>
                    <Link href={`/admin/pengguna/${t.user_id}`} className="block truncate text-[13px] text-muted hover:underline">
                      {t.nama_user || t.email} · {t.email}
                    </Link>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_TRX[t.status]?.kelas ?? ""}`}>{STATUS_TRX[t.status]?.label ?? t.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
                  <LencanaPaket tingkat={tingkatPaket(t.kode_paket, t.nama_paket)} nama={t.nama_paket} ukuran="sm" />
                  <b className="font-semibold tabular-nums">{rp(t.jumlah)}</b>
                  <span className="text-muted">{labelMetode(t)}</span>
                  <span className="text-faint">{waktuSingkatWib(t.dibuat, kini)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className="bg-subtle/60 text-[11.5px] font-semibold tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-3">ID pembelian</th>
                  <th className="px-3 py-3">Pengguna</th>
                  <th className="px-3 py-3">Paket</th>
                  <th className="px-3 py-3 text-right">Jumlah</th>
                  <th className="px-3 py-3">Metode</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Dibuat / dibayar</th>
                  <th className="px-5 py-3 text-right">
                    <span className="sr-only">Detail</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {daftar.map((t) => (
                  <tr key={t.id} className="align-top transition-colors hover:bg-subtle/50">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1">
                        <Link href={`/admin/transaksi/${encodeURIComponent(t.order_id)}`} className="font-mono text-[12.5px] font-semibold hover:underline">
                          {t.order_id}
                        </Link>
                        <TombolSalin teks={t.order_id} />
                      </span>
                      <span className="text-[11.5px] text-faint">#{t.id}</span>
                    </td>
                    <td className="max-w-[220px] px-3 py-3">
                      <Link href={`/admin/pengguna/${t.user_id}`} className="block truncate font-semibold hover:underline">
                        {t.nama_user || "(tanpa nama)"}
                      </Link>
                      <span className="block truncate text-muted">{t.email}</span>
                    </td>
                    <td className="px-3 py-3">
                      <LencanaPaket tingkat={tingkatPaket(t.kode_paket, t.nama_paket)} nama={t.nama_paket} ukuran="sm" />
                      {t.langganan_mulai && t.langganan_sampai && (
                        <span className="mt-1 block text-[11.5px] text-faint">
                          {tanggal(t.langganan_mulai)} – {tanggal(t.langganan_sampai)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{rp(t.jumlah)}</td>
                    <td className="px-3 py-3 text-muted">
                      {labelMetode(t)}
                      {t.catatan && <span className="mt-0.5 block max-w-[180px] truncate text-[11.5px] text-faint" title={t.catatan}>{t.catatan}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap ${STATUS_TRX[t.status]?.kelas ?? ""}`}>{STATUS_TRX[t.status]?.label ?? t.status}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {waktuSingkatWib(t.dibuat, kini)}
                      <span className="block text-[11.5px] text-faint">{t.dibayar ? `Dibayar ${waktuSingkatWib(t.dibayar, kini)}` : t.status === "menunggu" && t.kedaluwarsa ? `Batas ${waktuSingkatWib(t.kedaluwarsa, kini)}` : "—"}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/transaksi/${encodeURIComponent(t.order_id)}`}
                        aria-label={`Detail ${t.order_id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-line-strong hover:bg-surface hover:text-fg"
                      >
                        Detail <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
        <p className="text-[12.5px] text-muted">
          Menampilkan <b className="font-semibold text-fg tabular-nums">{angka(daftar.length)}</b> dari <b className="font-semibold text-fg tabular-nums">{angka(jumlah[opsi.status])}</b> transaksi
          {opsi.q ? ` yang cocok dengan "${opsi.q}"` : ""} · lunas di saringan ini: <b className="font-semibold text-fg tabular-nums">{rp(jumlah.nominal)}</b>
        </p>
        {(adaLagi || sebelum) && (
          <div className="flex gap-2">
            <Link href={tautan({ sebelum: undefined })} className="btn btn-ghost border border-line">
              Ke awal
            </Link>
            {adaLagi && (
              <Link href={tautan({ sebelum: `${daftar[daftar.length - 1].dibuat}.${daftar[daftar.length - 1].id}` })} className="btn btn-ghost border border-line">
                Berikutnya
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

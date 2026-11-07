import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { namaBankTampil } from "@/lib/afiliasi-def";
import { tanggal } from "@/lib/format";
import { type BarisPengembalian, type StatusPengembalian, daftarPengembalian, modeRefund } from "@/lib/jaminan";
import { JAMINAN_MAKS_PAKAI_PERSEN, MASA_ID } from "@/lib/jaminan-def";
import { requireAdmin } from "@/lib/session";
import { rp } from "./bagian-transaksi";
import { AksiPengembalian, FormModeRefund } from "./tombol-pengembalian";

export const STATUS_PENGEMBALIAN: Record<StatusPengembalian, { label: string; kelas: string }> = {
  menunggu: { label: "Perlu ditransfer", kelas: "bg-warning-soft text-warning" },
  diproses: { label: "Diproses", kelas: "bg-warning-soft text-warning" },
  selesai: { label: "Selesai", kelas: "bg-success-soft text-success" },
  gagal: { label: "Gagal di Midtrans", kelas: "bg-danger-soft text-danger" },
  ditolak: { label: "Ditolak", kelas: "bg-subtle text-muted" },
};

const CARA = { manual: "Transfer manual admin", otomatis: "Refund API Midtrans", midtrans: "Dari dashboard Midtrans" } as const;

/** Satu pengajuan / refund: dipakai di daftar dan di halaman detail transaksi. */
export function BarisRefund({ r, tautan = true }: { r: BarisPengembalian; tautan?: boolean }) {
  const st = STATUS_PENGEMBALIAN[r.status];
  const perluAksi = r.status === "menunggu" || r.status === "gagal";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div data-analitik-privat className="min-w-0 space-y-1 text-[13px]">
        <p className="flex flex-wrap items-center gap-2">
          <b className="tabular-nums">{rp(r.jumlah)}</b>
          <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${st.kelas}`}>{st.label}</span>
          <span className="text-muted">{CARA[r.cara]}</span>
        </p>
        <p className="text-muted">
          {tautan ? (
            <Link href={`/admin/transaksi/${encodeURIComponent(r.order_id)}`} className="font-mono font-semibold text-fg hover:underline">
              {r.order_id}
            </Link>
          ) : (
            <span className="font-mono font-semibold text-fg">{r.order_id}</span>
          )}{" "}
          · {r.email} · diajukan {tanggal(r.dibuat)}
          {r.selesai ? ` · ${r.status === "ditolak" ? "ditolak" : "selesai"} ${tanggal(r.selesai)}` : ""}
          {r.dikonfirmasi ? ` · diterima bank ${tanggal(r.dikonfirmasi)}` : ""}
        </p>
        {r.tujuan_bank && r.tujuan_nomor && (
          <p className="text-fg">
            Transfer ke <b>{namaBankTampil(r.tujuan_bank)}</b> <span className="font-mono">{r.tujuan_nomor}</span> a.n. <b>{r.tujuan_nama}</b>
          </p>
        )}
        {r.cara !== "midtrans" && <p className="text-muted">Balasan AI terpakai saat diajukan: {r.terpakai.toLocaleString("id-ID")}</p>}
        {r.alasan && <p className="text-fg">Alasan pembeli: {r.alasan}</p>}
        {r.referensi && <p className="text-muted">Referensi transfer: {r.referensi}</p>}
        {r.catatan && <p className="text-muted">Catatan admin: {r.catatan}</p>}
        {r.galat && <p className="text-danger">{r.galat}</p>}
      </div>
      {perluAksi && <AksiPengembalian id={r.id} bisaUlangi={r.status === "gagal"} />}
    </div>
  );
}

/** Pengembalian dana: pilihan cara (manual/otomatis), antrean yang perlu ditangani, dan riwayat terbaru. */
export async function PengembalianDana() {
  await requireAdmin();
  const [{ berjalan, riwayat }, mode] = await Promise.all([daftarPengembalian(20), modeRefund()]);
  return (
    <section className="card overflow-hidden" aria-labelledby="judul-pengembalian">
      <div className="space-y-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="judul-pengembalian" className="flex items-center gap-2 text-[15px] font-bold">
            <ShieldCheck className="size-4 text-accent" aria-hidden /> Pengembalian dana
            {berjalan.length > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11.5px] font-semibold text-warning">{berjalan.length} perlu ditangani</span>}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Jaminan {MASA_ID} untuk pembayaran pertama lewat GoPay, ShopeePay, atau QRIS (pemakaian maks. {JAMINAN_MAKS_PAKAI_PERSEN}% kuota). Begitu selesai, paket
            pembeli dicabut dan komisi afiliasinya batal (komisi baru bisa ditarik setelah masa jaminan lewat).
          </p>
        </div>
        <FormModeRefund mode={mode} />
      </div>
      {berjalan.length > 0 && (
        <ul className="divide-y divide-line border-b border-line bg-warning-soft/30">
          {berjalan.map((r) => (
            <li key={r.id} className="px-5 py-4">
              <BarisRefund r={r} />
            </li>
          ))}
        </ul>
      )}
      {riwayat.length ? (
        <ul className="divide-y divide-line">
          {riwayat.map((r) => (
            <li key={r.id} className="px-5 py-4">
              <BarisRefund r={r} />
            </li>
          ))}
        </ul>
      ) : (
        !berjalan.length && <p className="px-5 py-6 text-[13px] text-muted">Belum ada pengajuan uang kembali.</p>
      )}
    </section>
  );
}

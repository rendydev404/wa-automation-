import { NextResponse } from "next/server";
import { catatFitur } from "@/lib/analitik";
import { getUser } from "@/lib/session";
import { cariTransaksi, labelMetode, opsiDariParam } from "@/lib/transaksi-admin";
import { staf } from "@/lib/peran";

/**
 * Ekspor CSV riwayat transaksi untuk admin, dengan saringan yang sama persis dengan halaman /admin/transaksi
 * (?q, ?s, ?paket, ?dari, ?sampai). Paling banyak 5.000 baris terbaru. Bukan admin = 404, sama seperti halaman admin.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !staf(user.peran)) return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { daftar } = await cariTransaksi({ ...opsiDariParam(sp), batas: 5000 });
  const iso = (d: number | null) => (d ? new Date((d + 7 * 3600) * 1000).toISOString().replace("T", " ").slice(0, 19) : "");
  // Sel diawali = + - @ diberi tanda kutip tunggal supaya tidak dijalankan sebagai rumus oleh Excel/Sheets.
  const sel = (v: string | number | null) => {
    let s = v === null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const kepala = ["id_pembelian", "status", "jumlah_rp", "paket", "metode", "user_id", "email", "nama", "dibuat_wib", "dibayar_wib", "aktif_mulai_wib", "aktif_sampai_wib", "catatan"];
  const baris = daftar.map((t) =>
    [t.order_id, t.status, t.jumlah, t.nama_paket, labelMetode(t), t.user_id, t.email, t.nama_user, iso(t.dibuat), iso(t.dibayar), iso(t.langganan_mulai), iso(t.langganan_sampai), t.catatan]
      .map(sel)
      .join(","),
  );
  const tgl = iso(Math.floor(Date.now() / 1000)).slice(0, 10);
  catatFitur(user.id, "admin.ekspor_transaksi");
  return new NextResponse(`﻿${[kepala.join(","), ...baris].join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transaksi-${tgl}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowRight, BellRing, Send, Smartphone } from "lucide-react";
import { teruskanAction, ujiTeruskanAction } from "@/app/actions";
import { Pesan, SubmitButton } from "./ui";

export interface RiwayatTeruskanUi {
  id: number;
  label: string;
  ikon: string;
  pelanggan: string;
  ringkasan: string;
  status: "terkirim" | "gagal";
  waktu: string;
}

const CONTOH = `🛒 *Pesanan baru*
Dari: Rina · +62 812-3456-7890

Nama: Rina
Pesanan: 2 Paket Hemat Ayam, 1 Es Teh
Diambil/dikirim: diantar ke Jl. Melati 5, Bekasi
Waktu: hari ini jam 12.00
Pembayaran: transfer BCA`;

const KAPAN = [
  ["🛒", "Pesanan siap diproses", "setelah AI mengumpulkan nama, pesanan, alamat/ambil, waktu, dan cara bayar"],
  ["💳", "Pelanggan sudah bayar", "kirim bukti transfer, perlu Anda cek"],
  ["⚠️", "Keluhan", "barang rusak/salah, minta refund atau garansi"],
  ["🙋", "Minta bicara dengan manusia", "atau AI sudah mencoba tapi tidak bisa membantu"],
  ["❓", "Pertanyaan yang tidak ada di base knowledge", "stok hari ini, ongkir ke daerah tertentu, harga khusus"],
] as const;

/**
 * Pengaturan "teruskan ke pemilik" per nomor. AI tidak bisa menyiapkan pesanan atau mengecek transfer; hal seperti
 * itu ia ringkas lalu kirim ke WhatsApp pribadi pemilik usaha, dari nomor bisnis ini.
 */
export function PanelTeruskan({
  numberId,
  teruskanKe,
  diizinkan,
  waBisnis,
  riwayat,
}: {
  numberId: number;
  teruskanKe: string | null;
  /** Admin mengizinkan penerusan (aturan sistem). */
  diizinkan: boolean;
  waBisnis: string | null;
  riwayat: RiwayatTeruskanUi[];
}) {
  const [hasil, aksi] = useActionState(teruskanAction, null);
  const [uji, setUji] = useState<{ ok: boolean; pesan?: string } | null>(null);
  const [mengirim, mulai] = useTransition();

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <BellRing className="size-4 text-accent" aria-hidden /> Teruskan ke WhatsApp Anda
          </h2>
          <p className="hint mt-0.5">AI membalas pelanggan, Anda menerima ringkasan hal yang perlu ditindaklanjuti.</p>
        </div>
      </div>

      {!diizinkan && (
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">Penerusan sedang dinonaktifkan pengelola layanan untuk semua akun.</p>
      )}

      <details className="mt-4 rounded-xl border border-line bg-subtle/40">
        <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] font-semibold">Apa ini dan bagaimana cara kerjanya?</summary>
        <div className="space-y-3 border-t border-line px-3.5 py-3 text-[12.5px] text-muted">
          <p>
            AI di nomor bisnis ini hanya bisa <b className="text-fg">membalas chat</b>. Ia tidak bisa memasak pesanan, mengecek mutasi rekening, atau menelepon pelanggan. Supaya tidak ada
            pesanan yang terlewat, setiap kali ada hal yang butuh Anda, AI mengirim <b className="text-fg">ringkasan rapi ke nomor WhatsApp pribadi Anda</b>:
          </p>
          <ol className="space-y-1.5">
            {[
              "Pelanggan chat ke nomor bisnis, misalnya mau pesan.",
              "AI menanyakan data yang kurang (nama, pesanan, alamat, waktu, cara bayar), lalu mengulang pesanan untuk dicek pelanggan.",
              "Setelah pelanggan setuju, AI bilang pesanannya sudah diteruskan, dan Anda langsung menerima ringkasannya.",
              "Anda tinggal memproses, lalu membalas pelanggan dari WhatsApp nomor bisnis (AI otomatis mundur saat Anda membalas).",
            ].map((t, i) => (
              <li key={t} className="flex gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-on-accent">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          <div>
            <p className="font-semibold text-fg">Yang diteruskan:</p>
            <ul className="mt-1 space-y-1">
              {KAPAN.map(([ikon, judul, ket]) => (
                <li key={judul}>
                  {ikon} <b className="text-fg">{judul}</b>: {ket}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-fg">Contoh pesan yang Anda terima:</p>
            <pre className="mt-1 rounded-lg border border-line bg-surface p-3 font-sans text-[12px] whitespace-pre-wrap text-fg">{CONTOH}</pre>
          </div>
          <p>
            Tips: tulis daftar <b className="text-fg">data pesanan</b> yang Anda butuhkan di base knowledge (templat sudah menyediakannya), supaya AI menanyakan semuanya sebelum
            meneruskan. Chat dari nomor pribadi Anda ke nomor bisnis tidak akan dibalas AI.
          </p>
        </div>
      </details>

      <form action={aksi} className="mt-4 space-y-3">
        <input type="hidden" name="number_id" value={numberId} />
        <label className="block">
          <span className="label flex items-center gap-1.5">
            <Smartphone className="size-3.5" aria-hidden /> Nomor WhatsApp penerima (pribadi / admin toko) <span className="text-danger">*wajib</span>
          </span>
          <input
            name="teruskan_ke"
            required
            type="tel"
            inputMode="tel"
            defaultValue={teruskanKe ? `+${teruskanKe}` : ""}
            placeholder="0812 3456 7890"
            autoComplete="tel"
            className="field tabular-nums"
          />
          <span className="mt-1 block text-[11.5px] text-faint">
            Wajib diisi: tanpa nomor ini AI tidak membalas di nomor bisnis ini. Harus nomor yang berbeda dari nomor bisnis{waBisnis ? ` (+${waBisnis})` : ""}. Boleh nomor
            karyawan/admin yang memproses pesanan.
          </span>
        </label>
        <p className="rounded-lg bg-subtle/50 p-3 text-[12.5px] text-muted">
          <b className="text-fg">Selalu aktif.</b> Pesanan yang datanya lengkap, bukti bayar, keluhan, permintaan servis, pelanggan yang minta bicara dengan orang, dan pertanyaan yang
          jawabannya belum ada di base knowledge selalu diteruskan ke nomor ini.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton>Simpan</SubmitButton>
          <button
            type="button"
            disabled={!teruskanKe || mengirim}
            onClick={() => mulai(async () => setUji(await ujiTeruskanAction(numberId)))}
            className="btn btn-ghost border border-line disabled:opacity-50"
            title={teruskanKe ? "Kirim pesan uji ke nomor penerima" : "Simpan nomor penerima dulu"}
          >
            <Send className="size-4" aria-hidden /> {mengirim ? "Mengirim…" : "Kirim pesan uji"}
          </button>
          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
          {uji && <Pesan ok={uji.ok}>{uji.pesan}</Pesan>}
        </div>
      </form>

      <div className="mt-5">
        <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Terakhir diteruskan</p>
        {riwayat.length ? (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {riwayat.map((r) => (
              <li key={r.id} className="px-3 py-2.5 text-[12.5px]">
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 truncate">
                      {r.ikon} <b>{r.label}</b> <span className="text-muted">· {r.pelanggan || "pelanggan"}</span>
                    </span>
                    <span className={`shrink-0 text-[11px] ${r.status === "gagal" ? "font-semibold text-danger" : "text-faint"}`}>{r.status === "gagal" ? "gagal terkirim" : r.waktu}</span>
                  </summary>
                  <p className="mt-1.5 whitespace-pre-line text-muted">{r.ringkasan}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-faint">
            Belum ada. Coba di Uji bot: pesan sesuatu sampai selesai <ArrowRight className="size-3" aria-hidden /> lihat kotak &ldquo;Diteruskan&rdquo;.
          </p>
        )}
      </div>
    </section>
  );
}

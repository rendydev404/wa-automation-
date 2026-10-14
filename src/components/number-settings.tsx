"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { hapusNomorAction, setBotAktifAction, setSinkronAction, ubahNomorAction } from "@/app/actions";
import { LencanaSesi } from "./connection-card";
import { Pesan, Saklar, SubmitButton, TombolKonfirmasi } from "./ui";
import { useSesiNomor } from "./wa-status";

export function LencanaTerhubung({ id }: { id: number }) {
  return <LencanaSesi status={useSesiNomor(id)?.status} />;
}

export function SaklarBot({ id, aktif: awal, label }: { id: number; aktif: boolean; label: string }) {
  const [aktif, setAktif] = useOptimistic(awal);
  const [, mulai] = useTransition();
  return (
    <label className="flex items-center gap-3">
      <span className="text-[13px] font-medium text-muted">Balasan otomatis</span>
      <Saklar
        aktif={aktif}
        label={`Balasan otomatis ${label}`}
        onUbah={(v) =>
          mulai(async () => {
            setAktif(v);
            await setBotAktifAction(id, v);
          })
        }
      />
    </label>
  );
}

export function SaklarSinkron({ id, aktif: awal, siap, keterangan }: { id: number; aktif: boolean; siap: boolean; keterangan: string }) {
  const [aktif, setAktif] = useOptimistic(awal);
  const [galat, setGalat] = useState<string | null>(null);
  const [menunggu, mulai] = useTransition();
  return (
    <section className="card px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Data Suka Shawarma otomatis</h2>
          <p className="hint mt-0.5">Menu, harga, promo &amp; outlet dari database kasir. Diperbarui sendiri setiap kali ada perubahan.</p>
        </div>
        <Saklar
          aktif={aktif}
          disabled={!siap || menunggu}
          label="Data Suka Shawarma otomatis"
          onUbah={(v) =>
            mulai(async () => {
              setAktif(v);
              setGalat(null);
              const h = await setSinkronAction(id, v);
              if (!h.ok) setGalat(h.pesan ?? "Gagal.");
            })
          }
        />
      </div>
      <p className="hint mt-2">{!siap ? "Belum dikonfigurasi di server (SINKRON_SS_*)." : menunggu ? "Mengambil data…" : (galat ?? keterangan)}</p>
    </section>
  );
}

export function NumberSettings({
  id,
  label,
  instruksi,
  tungguDetik,
  tungguBacaDetik,
  jedaMenit,
}: {
  id: number;
  label: string;
  instruksi: string;
  tungguDetik: number;
  tungguBacaDetik: number;
  jedaMenit: number;
}) {
  const [hasil, aksi] = useActionState(ubahNomorAction, null);
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-bold tracking-tight">Pengaturan nomor</h2>
      </div>
      <form action={aksi} className="space-y-5 px-5 py-5">
        <input type="hidden" name="id" value={id} />
        <div>
          <label htmlFor="label" className="label">
            Nama
          </label>
          <input id="label" name="label" required maxLength={60} defaultValue={label} className="field" />
        </div>

        <fieldset className="space-y-3 rounded-xl bg-subtle/70 p-4">
          <legend className="float-left mb-1 w-full text-[13px] font-bold">Serah-terima manusia ↔ AI</legend>
          <div className="clear-both flex items-center justify-between gap-3">
            <label htmlFor="tunggu_detik" className="text-[13px] text-fg">
              AI menjawab bila pesan belum dibuka manusia dalam
            </label>
            <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
              <input id="tunggu_detik" name="tunggu_detik" type="number" required min={2} max={120} step={1} defaultValue={tungguDetik} className="field w-[4.5rem] px-2 py-1.5 text-center tabular-nums" />
              detik
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="tunggu_baca_detik" className="text-[13px] text-fg">
              Chat sudah dibuka di HP tapi tidak dibalas: AI ambil alih setelah
            </label>
            <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
              <input
                id="tunggu_baca_detik"
                name="tunggu_baca_detik"
                type="number"
                required
                min={10}
                max={600}
                step={1}
                defaultValue={tungguBacaDetik}
                className="field w-[4.5rem] px-2 py-1.5 text-center tabular-nums"
              />
              detik
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="jeda_menit" className="text-[13px] text-fg">
              Setelah manusia membalas, AI diam di chat itu selama
            </label>
            <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
              <input id="jeda_menit" name="jeda_menit" type="number" required min={0} max={1440} step={1} defaultValue={jedaMenit} className="field w-[4.5rem] px-2 py-1.5 text-center tabular-nums" />
              menit
            </span>
          </div>
          <p className="hint">
            Begitu chat dibuka di HP, AI langsung menahan diri; tidak jadi dibalas, AI mengambil alih. WhatsApp tidak memberi tahu saat Anda
            mengetik, jadi tandanya adalah pesan terbaca di HP — &quot;Laporan dibaca&quot; di WhatsApp nomor ini harus aktif. Isi 0 menit bila
            AI hanya perlu mundur untuk pesan itu saja.
          </p>
        </fieldset>

        <div>
          <label htmlFor="instruksi" className="label">
            Instruksi khusus <span className="font-normal text-faint">(opsional)</span>
          </label>
          <textarea
            id="instruksi"
            name="instruksi"
            rows={4}
            maxLength={2000}
            defaultValue={instruksi}
            placeholder="Contoh: Sapa dengan 'Bang'. Jawab singkat dan santai. Untuk permintaan penawaran, minta dulu nama usaha dan kebutuhannya."
            className="field resize-y leading-relaxed"
          />
          <p className="hint mt-1.5">Gaya bicara dan alur khusus nomor ini. Siapa pemilik nomor dan faktanya (layanan, harga, jadwal) taruh di base knowledge.</p>
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton>Simpan</SubmitButton>
          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        </div>
      </form>
    </section>
  );
}

export function HapusNomor({ id }: { id: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-4">
      <div>
        <p className="text-[13.5px] font-semibold">Hapus nomor ini</p>
        <p className="hint">Koneksi WhatsApp-nya diputus dan seluruh base knowledge-nya terhapus. Tidak bisa dikembalikan.</p>
      </div>
      <TombolKonfirmasi label="Hapus nomor" tanya="Hapus nomor beserta knowledge-nya?" ya="Ya, hapus" aksi={() => hapusNomorAction(id)} ikon={<Trash2 className="size-4" aria-hidden />} />
    </div>
  );
}

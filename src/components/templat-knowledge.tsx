"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, Plus, Trash2 } from "lucide-react";
import { tambahTeksAction } from "@/app/actions";
import { type IsiTemplat, JENIS_USAHA, type KunciUsaha, isiAwal, masihContoh, rupiah, susunTemplat } from "@/lib/templat-usaha";
import { Pesan, SubmitButton } from "./ui";

/**
 * Templat base knowledge terpandu: pilih jenis usaha -> isi formulir yang sudah berisi contoh lengkap -> pratinjau
 * langsung -> simpan sebagai satu dokumen. Contoh yang belum diganti (harga, rekening, alamat) ditandai, dan harus
 * dikonfirmasi sebelum disimpan supaya AI tidak menyebut data contoh ke pelanggan.
 */
export function TemplatKnowledge({ numberId }: { numberId: number }) {
  const [jenis, setJenis] = useState<KunciUsaha | null>(null);
  if (!jenis)
    return (
      <div>
        <p className="text-[13px] text-muted">Pilih jenis usaha. Formulir berikutnya sudah berisi contoh lengkap; Anda tinggal mengganti nama produk, harga, jam, alamat, dan rekening.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(JENIS_USAHA) as KunciUsaha[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setJenis(k)}
              className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-accent/60 hover:bg-accent-soft/20"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {JENIS_USAHA[k].ikon}
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold">{JENIS_USAHA[k].label}</span>
                <span className="block text-[12px] text-muted">{JENIS_USAHA[k].contohUsaha}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  return <FormTemplat key={jenis} numberId={numberId} jenis={jenis} kembali={() => setJenis(null)} />;
}

function Bidang({ label, bantu, children }: { label: string; bantu?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {bantu && <span className="mt-1 block text-[11.5px] text-faint">{bantu}</span>}
    </label>
  );
}

function FormTemplat({ numberId, jenis, kembali }: { numberId: number; jenis: KunciUsaha; kembali: () => void }) {
  const j = JENIS_USAHA[jenis];
  const [isi, setIsi] = useState<IsiTemplat>(() => isiAwal(jenis));
  const [yakin, setYakin] = useState(false);
  const [lihat, setLihat] = useState(false);
  const [hasil, aksi] = useActionState(tambahTeksAction, null);
  const teks = useMemo(() => susunTemplat(jenis, isi), [jenis, isi]);
  const contoh = useMemo(() => masihContoh(jenis, isi), [jenis, isi]);
  const ubah = <K extends keyof IsiTemplat>(k: K, v: IsiTemplat[K]) => setIsi((x) => ({ ...x, [k]: v }));
  const teks1 = (k: "namaUsaha" | "namaAsisten" | "jam" | "alamat" | "maps" | "area") => ({ value: isi[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => ubah(k, e.target.value) });
  const area = (k: "tentang" | "caraPesan" | "dataPesanan" | "bayar" | "kirim" | "kebijakan" | "promo" | "serahkan" | "larangan") => ({
    value: isi[k],
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => ubah(k, e.target.value),
  });
  useEffect(() => {
    if (hasil?.ok) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [hasil]);

  if (hasil?.ok)
    return (
      <div className="rounded-xl border border-success/40 bg-success-soft/40 p-4 text-[13px]">
        <p className="font-semibold text-success">Base knowledge tersimpan.</p>
        <p className="mt-1 text-muted">Coba di &ldquo;Uji bot&rdquo;: tanyakan harga, jam buka, atau coba pesan sesuatu. Perlu mengubah? Hapus dokumennya lalu isi templat lagi.</p>
      </div>
    );

  return (
    <form action={aksi} className="space-y-5">
      <input type="hidden" name="number_id" value={numberId} />
      <input type="hidden" name="judul" value={`Profil ${isi.namaUsaha.trim() || "usaha"} (templat ${j.label.toLowerCase()})`} />
      <input type="hidden" name="isi" value={teks} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={kembali} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-fg">
          <ArrowLeft className="size-3.5" aria-hidden /> Ganti jenis usaha
        </button>
        <span className="rounded-lg bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent">
          {j.ikon} {j.label}
        </span>
      </div>
      <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
        Semua isian berisi <b>contoh</b>. Ganti dengan data usaha Anda; bagian yang tidak perlu boleh dikosongkan (tidak ikut disimpan).
      </p>

      <fieldset className="space-y-3">
        <legend className="text-[13.5px] font-bold">1. Identitas & gaya bicara</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Bidang label="Nama usaha">
            <input {...teks1("namaUsaha")} required maxLength={80} className="field" />
          </Bidang>
          <Bidang label="Nama asisten (opsional)" bantu="Kosongkan bila tidak perlu nama.">
            <input {...teks1("namaAsisten")} maxLength={40} className="field" />
          </Bidang>
        </div>
        <Bidang label="Tentang usaha (1–2 kalimat)">
          <textarea {...area("tentang")} rows={2} maxLength={500} className="field" />
        </Bidang>
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          {(
            [
              ["santai", 'Santai, panggil "Kak"'],
              ["sopan", 'Sopan, panggil "Bapak/Ibu"'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => ubah("gaya", k)}
              className={`rounded-lg border px-3 py-1.5 font-semibold ${isi.gaya === k ? "border-accent bg-accent text-on-accent" : "border-line text-muted hover:text-fg"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13.5px] font-bold">2. {j.istilah.charAt(0) + j.istilah.slice(1).toLowerCase()}</legend>
        <p className="text-[12px] text-muted">Harga ditulis angka saja (25000). Kosongkan harga bila harus ditanyakan dulu.</p>
        <div className="space-y-2">
          {isi.produk.map((p, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2 sm:grid-cols-[minmax(0,1.3fr)_120px_minmax(0,1fr)_auto]">
              <input
                aria-label={`Nama ${i + 1}`}
                value={p.nama}
                maxLength={120}
                placeholder="Nama"
                onChange={(e) => ubah("produk", isi.produk.map((x, k) => (k === i ? { ...x, nama: e.target.value } : x)))}
                className="field"
              />
              <input
                aria-label={`Harga ${i + 1}`}
                value={p.harga}
                inputMode="numeric"
                placeholder="Harga"
                onChange={(e) => ubah("produk", isi.produk.map((x, k) => (k === i ? { ...x, harga: e.target.value.replace(/\D/g, "").slice(0, 10) } : x)))}
                className="field tabular-nums"
                title={rupiah(p.harga) ?? ""}
              />
              <input
                aria-label={`Keterangan ${i + 1}`}
                value={p.ket}
                maxLength={120}
                placeholder="Varian / ukuran / durasi"
                onChange={(e) => ubah("produk", isi.produk.map((x, k) => (k === i ? { ...x, ket: e.target.value } : x)))}
                className="field col-span-2 sm:col-span-1"
              />
              <button
                type="button"
                aria-label={`Hapus baris ${i + 1}`}
                onClick={() => ubah("produk", isi.produk.filter((_, k) => k !== i))}
                className="row-start-1 grid size-10 place-items-center self-start rounded-lg text-muted hover:bg-danger-soft hover:text-danger sm:row-start-auto"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={isi.produk.length >= 60}
          onClick={() => ubah("produk", [...isi.produk, { nama: "", harga: "", ket: "" }])}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden /> Tambah baris
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13.5px] font-bold">3. Jam & lokasi</legend>
        <Bidang label="Jam buka / jam layanan">
          <input {...teks1("jam")} maxLength={200} className="field" />
        </Bidang>
        <div className="grid gap-3 sm:grid-cols-2">
          <Bidang label="Alamat">
            <input {...teks1("alamat")} maxLength={240} className="field" />
          </Bidang>
          <Bidang label="Link Google Maps (opsional)">
            <input {...teks1("maps")} maxLength={240} placeholder="https://maps.app.goo.gl/..." className="field" />
          </Bidang>
        </div>
        <Bidang label="Area layanan / pengiriman (opsional)">
          <input {...teks1("area")} maxLength={240} className="field" />
        </Bidang>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13.5px] font-bold">4. Cara {j.transaksi} & data yang dikumpulkan AI</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Bidang label={`Langkah ${j.transaksi} (satu per baris)`}>
            <textarea {...area("caraPesan")} rows={5} maxLength={1200} className="field" />
          </Bidang>
          <Bidang label={`Data ${j.transaksi} yang wajib ditanyakan (satu per baris)`} bantu="AI menanyakan semua ini sebelum meneruskan ke WhatsApp Anda.">
            <textarea {...area("dataPesanan")} rows={5} maxLength={1200} className="field" />
          </Bidang>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13.5px] font-bold">5. Pembayaran, pengiriman & kebijakan</legend>
        <Bidang label="Cara bayar (rekening, QRIS, COD)">
          <textarea {...area("bayar")} rows={2} maxLength={600} className="field" />
        </Bidang>
        <Bidang label="Pengiriman (opsional)">
          <textarea {...area("kirim")} rows={2} maxLength={800} className="field" />
        </Bidang>
        <Bidang label="Kebijakan: pembatalan, penukaran, garansi (opsional)">
          <textarea {...area("kebijakan")} rows={2} maxLength={800} className="field" />
        </Bidang>
        <Bidang label="Promo yang sedang berlaku (opsional)" bantu="Kosong = AI tidak akan menawarkan diskon apa pun.">
          <textarea {...area("promo")} rows={2} maxLength={600} placeholder="Contoh: Gratis es teh untuk pembelian 2 paket, berlaku sampai 31 Desember." className="field" />
        </Bidang>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13.5px] font-bold">6. Pertanyaan yang sering ditanya</legend>
        {isi.faq.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <input
              aria-label={`Pertanyaan ${i + 1}`}
              value={f.t}
              maxLength={200}
              placeholder="Pertanyaan"
              onChange={(e) => ubah("faq", isi.faq.map((x, k) => (k === i ? { ...x, t: e.target.value } : x)))}
              className="field"
            />
            <input
              aria-label={`Jawaban ${i + 1}`}
              value={f.j}
              maxLength={500}
              placeholder="Jawaban"
              onChange={(e) => ubah("faq", isi.faq.map((x, k) => (k === i ? { ...x, j: e.target.value } : x)))}
              className="field"
            />
            <button
              type="button"
              aria-label={`Hapus pertanyaan ${i + 1}`}
              onClick={() => ubah("faq", isi.faq.filter((_, k) => k !== i))}
              className="grid size-10 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={isi.faq.length >= 40}
          onClick={() => ubah("faq", [...isi.faq, { t: "", j: "" }])}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden /> Tambah pertanyaan
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13.5px] font-bold">7. Batasan AI</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Bidang label="Serahkan ke pemilik (satu per baris)" bantu="Diteruskan ke WhatsApp Anda bila fitur Teruskan aktif.">
            <textarea {...area("serahkan")} rows={4} maxLength={800} className="field" />
          </Bidang>
          <Bidang label="AI tidak boleh (satu per baris)">
            <textarea {...area("larangan")} rows={4} maxLength={800} className="field" />
          </Bidang>
        </div>
      </fieldset>

      <div className="rounded-xl border border-line">
        <button type="button" onClick={() => setLihat((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] font-semibold">
          <span className="flex items-center gap-1.5">
            <Eye className="size-4 text-accent" aria-hidden /> Pratinjau yang dibaca AI
          </span>
          <span className="text-[11.5px] font-normal text-faint tabular-nums">{teks.length.toLocaleString("id-ID")} karakter</span>
        </button>
        {lihat && <pre className="max-h-96 overflow-auto border-t border-line bg-subtle/40 p-3.5 font-sans text-[12px] leading-relaxed whitespace-pre-wrap">{teks}</pre>}
      </div>

      {contoh.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft/40 p-3 text-[12.5px]">
          <p className="font-semibold text-warning">Masih sama dengan contoh:</p>
          <p className="mt-0.5 text-muted">{contoh.join(", ")}. AI akan menyebut data ini ke pelanggan apa adanya.</p>
          <label className="mt-2 flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={yakin} onChange={(e) => setYakin(e.target.checked)} className="size-4 accent-[var(--c-accent)]" />
            Data di atas memang benar untuk usaha saya
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={contoh.length > 0 && !yakin}>Simpan sebagai base knowledge</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

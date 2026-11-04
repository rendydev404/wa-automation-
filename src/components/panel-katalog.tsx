"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Lock, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { geserProdukAction, hapusProdukAction, tersediaProdukAction } from "@/app/actions";
import { BATAS_KATALOG, type Produk } from "@/lib/katalog-def";
import { Pesan, Saklar } from "./ui";

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const urlFoto = (p: Produk) => `/api/katalog/foto?id=${p.id}&v=${p.diubah}`;

/** Perkecil foto di browser (sisi terpanjang 1080 px, JPEG): cukup tajam di WhatsApp, unggahan & database tetap kecil. */
async function perkecil(berkas: File): Promise<Blob> {
  const bmp = await createImageBitmap(berkas);
  const skala = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
  const kanvas = document.createElement("canvas");
  kanvas.width = Math.max(1, Math.round(bmp.width * skala));
  kanvas.height = Math.max(1, Math.round(bmp.height * skala));
  const ctx = kanvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // PNG transparan jadi latar putih, bukan hitam
  ctx.fillRect(0, 0, kanvas.width, kanvas.height);
  ctx.drawImage(bmp, 0, 0, kanvas.width, kanvas.height);
  bmp.close();
  return new Promise((ok, gagal) => kanvas.toBlob((b) => (b ? ok(b) : gagal(new Error("foto"))), "image/jpeg", 0.85));
}

/**
 * Katalog produk satu nomor (fitur paket berbayar). Produk berisi foto, nama, harga, dan keterangan; AI memakainya
 * sebagai sumber harga dan bisa mengirim daftar katalog atau foto produk ke pelanggan di WhatsApp.
 */
export function PanelKatalog({ numberId, produk, boleh }: { numberId: number; produk: Produk[]; boleh: boolean }) {
  const [edit, setEdit] = useState<Produk | "baru" | null>(null);
  const [cari, setCari] = useState("");
  const q = cari.trim().toLowerCase();
  const tampil = q ? produk.filter((p) => `${p.nama} ${p.deskripsi}`.toLowerCase().includes(q)) : produk;
  const penuh = produk.length >= BATAS_KATALOG.produk;

  if (!boleh)
    return (
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Package className="size-4 text-accent" aria-hidden /> Katalog produk
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1 text-[11.5px] font-semibold text-muted">
            <Lock className="size-3" aria-hidden /> Paket berbayar
          </span>
        </div>
        <p className="mt-2 text-[13px] text-muted">
          Tambahkan produk lengkap dengan foto dan harga. Saat pelanggan minta katalog atau menanyakan produk, AI langsung mengirim daftar dan foto produknya di WhatsApp.
        </p>
        <div aria-hidden className="mt-4 grid grid-cols-3 gap-2 opacity-60">
          {["Produk A", "Produk B", "Produk C"].map((n) => (
            <div key={n} className="rounded-xl border border-line p-2">
              <div className="aspect-square rounded-lg bg-subtle" />
              <p className="mt-1.5 truncate text-[12px] font-semibold">{n}</p>
              <p className="text-[11px] text-faint">Rp…</p>
            </div>
          ))}
        </div>
        {produk.length > 0 && <p className="mt-3 text-[12.5px] text-warning">{produk.length} produk tersimpan. AI tidak memakai katalog sampai paket aktif lagi.</p>}
        <Link href="/langganan" className="btn btn-primary mt-4">
          Lihat paket
        </Link>
      </section>
    );

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Package className="size-4 text-accent" aria-hidden /> Katalog produk
            <span className="text-[12px] font-semibold text-faint tabular-nums">
              {produk.length}/{BATAS_KATALOG.produk}
            </span>
          </h2>
          <p className="hint mt-0.5">AI mengirim daftar & foto produk saat pelanggan minta katalog atau menanyakan produk. Produk yang habis tidak ditawarkan.</p>
        </div>
        {!edit && (
          <button type="button" onClick={() => setEdit("baru")} disabled={penuh} className="btn btn-primary">
            <Plus className="size-4" aria-hidden /> Tambah produk
          </button>
        )}
      </div>

      {edit && (
        <div className="mt-4">
          <FormProduk key={edit === "baru" ? "baru" : edit.id} numberId={numberId} produk={edit === "baru" ? null : edit} selesai={() => setEdit(null)} />
        </div>
      )}

      {produk.length > 6 && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari produk…" aria-label="Cari produk" className="field pl-9" />
        </div>
      )}

      {produk.length === 0 && !edit ? (
        <div className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
          <ImagePlus className="mx-auto size-6 text-faint" aria-hidden />
          <p className="mt-2 text-[13px] font-semibold">Belum ada produk</p>
          <p className="mt-0.5 text-[12.5px] text-muted">Tambahkan foto, nama, dan harga. Coba lagi di Uji bot: &ldquo;kirim katalognya dong&rdquo;.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {tampil.map((p) => (
            <BarisProduk key={p.id} numberId={numberId} p={p} pertama={p.id === produk[0]?.id} terakhir={p.id === produk[produk.length - 1]?.id} bisaGeser={!q} ubah={() => setEdit(p)} />
          ))}
          {!tampil.length && <li className="px-4 py-6 text-center text-[13px] text-muted">Tidak ada produk yang cocok.</li>}
        </ul>
      )}
    </section>
  );
}

function BarisProduk({ numberId, p, pertama, terakhir, bisaGeser, ubah }: { numberId: number; p: Produk; pertama: boolean; terakhir: boolean; bisaGeser: boolean; ubah: () => void }) {
  const router = useRouter();
  const [sedang, mulai] = useTransition();
  const [tanyaHapus, setTanyaHapus] = useState(false);
  const jalankan = (fn: () => Promise<unknown>) =>
    mulai(async () => {
      await fn();
      router.refresh();
    });
  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 ${sedang ? "opacity-60" : ""}`}>
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-subtle">
        {p.adaFoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto privat dari API sendiri (perlu sesi), bukan aset publik
          <img src={urlFoto(p)} alt={p.nama} className="size-full object-cover" loading="lazy" />
        ) : (
          <ImagePlus className="size-5 text-faint" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold">{p.nama}</span>
          {!p.tersedia && <span className="shrink-0 rounded-md bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-bold text-warning uppercase">Habis</span>}
        </span>
        <span className="block text-[12.5px] font-semibold text-accent tabular-nums">{p.harga === null ? "Harga tanya admin" : rp(p.harga)}</span>
        {p.deskripsi && <span className="block truncate text-[12px] text-muted">{p.deskripsi}</span>}
      </span>
      {tanyaHapus ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <button type="button" disabled={sedang} onClick={() => jalankan(() => hapusProdukAction(numberId, p.id))} className="btn bg-danger px-2.5 text-white hover:opacity-90">
            Hapus
          </button>
          <button type="button" onClick={() => setTanyaHapus(false)} className="btn btn-ghost px-2.5">
            Batal
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          <Saklar aktif={p.tersedia} onUbah={(v) => jalankan(() => tersediaProdukAction(numberId, p.id, v))} label={`${p.nama} tersedia`} disabled={sedang} />
          {bisaGeser && (
            <span className="ml-1 flex flex-col">
              <button type="button" aria-label={`Naikkan ${p.nama}`} disabled={pertama || sedang} onClick={() => jalankan(() => geserProdukAction(numberId, p.id, -1))} className="grid size-7 place-items-center rounded text-faint hover:bg-subtle hover:text-fg disabled:opacity-30 sm:size-5">
                <ArrowUp className="size-3.5" aria-hidden />
              </button>
              <button type="button" aria-label={`Turunkan ${p.nama}`} disabled={terakhir || sedang} onClick={() => jalankan(() => geserProdukAction(numberId, p.id, 1))} className="grid size-7 place-items-center rounded text-faint hover:bg-subtle hover:text-fg disabled:opacity-30 sm:size-5">
                <ArrowDown className="size-3.5" aria-hidden />
              </button>
            </span>
          )}
          <button type="button" aria-label={`Ubah ${p.nama}`} onClick={ubah} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg sm:size-8">
            <Pencil className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label={`Hapus ${p.nama}`} onClick={() => setTanyaHapus(true)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger sm:size-8">
            <Trash2 className="size-4" aria-hidden />
          </button>
        </span>
      )}
    </li>
  );
}

function FormProduk({ numberId, produk, selesai }: { numberId: number; produk: Produk | null; selesai: () => void }) {
  const router = useRouter();
  const [nama, setNama] = useState(produk?.nama ?? "");
  const [harga, setHarga] = useState(produk?.harga === null || produk === null ? "" : String(produk.harga));
  const [deskripsi, setDeskripsi] = useState(produk?.deskripsi ?? "");
  const [tersedia, setTersedia] = useState(produk?.tersedia ?? true);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(produk?.adaFoto ? urlFoto(produk) : null);
  const [hapusFoto, setHapusFoto] = useState(false);
  const [galat, setGalat] = useState("");
  const [sedang, mulai] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const simpan = (e: React.FormEvent) => {
    e.preventDefault();
    setGalat("");
    mulai(async () => {
      const fd = new FormData();
      fd.set("number_id", String(numberId));
      if (produk) fd.set("id", String(produk.id));
      fd.set("nama", nama);
      fd.set("harga", harga);
      fd.set("deskripsi", deskripsi);
      fd.set("tersedia", tersedia ? "1" : "0");
      if (foto) fd.set("foto", foto, "foto.jpg");
      else if (hapusFoto) fd.set("hapus_foto", "1");
      try {
        const res = await fetch("/api/katalog", { method: "POST", body: fd });
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return setGalat(d.error ?? `Gagal menyimpan (HTTP ${res.status}).`);
        router.refresh();
        selesai();
      } catch {
        setGalat("Koneksi terputus. Coba lagi.");
      }
    });
  };

  return (
    <form onSubmit={simpan} className="animate-masuk rounded-xl border border-accent/40 bg-accent-soft/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13.5px] font-bold">{produk ? "Ubah produk" : "Produk baru"}</p>
        <button type="button" onClick={selesai} aria-label="Tutup" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        <div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="group relative grid aspect-square w-full max-w-[132px] place-items-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-surface text-muted hover:border-accent"
          >
            {pratinjau ? (
              // eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal / foto privat
              <img src={pratinjau} alt="Foto produk" className="size-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-[12px]">
                <ImagePlus className="size-5" aria-hidden /> Pilih foto
              </span>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Foto produk"
            tabIndex={-1}
            className="sr-only"
            onChange={async (e) => {
              const berkas = e.target.files?.[0];
              e.target.value = "";
              if (!berkas) return;
              try {
                const b = await perkecil(berkas);
                setFoto(b);
                setHapusFoto(false);
                setPratinjau(URL.createObjectURL(b));
              } catch {
                setGalat("Foto tidak bisa dibaca. Pakai JPG, PNG, atau WebP.");
              }
            }}
          />
          {pratinjau && (
            <button
              type="button"
              onClick={() => {
                setFoto(null);
                setPratinjau(null);
                setHapusFoto(true);
              }}
              className="mt-1.5 text-[12px] font-semibold text-danger hover:underline"
            >
              Hapus foto
            </button>
          )}
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="label">Nama produk</span>
            <input value={nama} onChange={(e) => setNama(e.target.value)} required minLength={2} maxLength={BATAS_KATALOG.nama} placeholder="Nama produk, mis. dengan ukuran atau varian" className="field" />
          </label>
          <label className="block">
            <span className="label">Harga</span>
            <span className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] font-semibold text-muted">Rp</span>
              <input
                value={harga ? Number(harga).toLocaleString("id-ID") : ""}
                onChange={(e) => setHarga(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))}
                inputMode="numeric"
                placeholder="Kosongkan bila harga ditanyakan ke admin"
                className="field pl-10 tabular-nums"
              />
            </span>
          </label>
          <label className="block">
            <span className="label">Keterangan (opsional)</span>
            <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} rows={2} maxLength={BATAS_KATALOG.deskripsi} placeholder="Ukuran, varian, bahan, isi paket…" className="field" />
          </label>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
            <span className="text-[13px] font-semibold">{tersedia ? "Tersedia" : "Habis (tidak ditawarkan AI)"}</span>
            <Saklar aktif={tersedia} onUbah={setTersedia} label="Produk tersedia" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={sedang} className="btn btn-primary">
          {sedang && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {produk ? "Simpan perubahan" : "Tambah ke katalog"}
        </button>
        <button type="button" onClick={selesai} className="btn btn-ghost">
          Batal
        </button>
        {harga && <span className="text-[12px] text-muted tabular-nums">Tampil ke pelanggan: {rp(Number(harga))}</span>}
        {galat && <Pesan ok={false}>{galat}</Pesan>}
      </div>
    </form>
  );
}

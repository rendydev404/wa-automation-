"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Check, Circle, Loader2, PencilLine, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { tambahTeksAction } from "@/app/actions";
import { JENIS_USAHA, KELENGKAPAN, type KunciUsaha, bersihkanKerangka, cekKelengkapan, infoUsaha, kerangka } from "@/lib/templat-usaha";
import { LoadingAi } from "./loading-ai";
import { Pesan } from "./ui";

/**
 * Editor base knowledge yang sederhana: tulis/tempel info usaha dengan bahasa bebas (boleh mulai dari kerangka per
 * jenis usaha) -> "Rapikan dengan AI" -> periksa & edit hasil -> simpan. `edit` = menyempurnakan dokumen yang sudah
 * ada: langsung dirapikan dari teks tersimpan dan, setelah disimpan, menggantikan dokumen lama.
 */

interface Hasil {
  asli: string;
  teks: string;
  kurang: string[];
  peringatan: string[];
}

type Tahap = "tulis" | "proses" | "hasil" | "tersimpan";

const CONTOH_BEBAS = "Tulis seperti chat biasa: nama usaha, apa yang dijual beserta harganya, jam buka, alamat atau area layanan, cara pesan, dan cara bayar.";

async function minta(body: object, sinyal: AbortSignal): Promise<Hasil> {
  const res = await fetch("/api/knowledge/rapikan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: sinyal });
  const d = (await res.json().catch(() => ({}))) as Partial<Hasil> & { error?: string };
  if (!res.ok || typeof d.teks !== "string") throw new Error(d.error ?? `Gagal (HTTP ${res.status}).`);
  return { asli: d.asli ?? "", teks: d.teks, kurang: d.kurang ?? [], peringatan: d.peringatan ?? [] };
}

/** Judul dokumen dari nama usaha yang tertulis (tulisan asli dulu, lalu hasil AI), bila ada. */
function judulDari(...teks: string[]): string {
  for (const t of teks) {
    const m = t.match(/nama usaha\s*:\s*([^\n,(]{2,60})/i) ?? t.match(/chat whatsapp untuk\s+(.{2,60}?)(?:\s+seperti\b|[\n.,(])/i);
    if (m) return `Info ${m[1].trim()}`;
  }
  return "Info usaha";
}

export function EditorKnowledge({ numberId, edit, tutup }: { numberId: number; edit?: { id: number; judul: string } | null; tutup?: () => void }) {
  const [tahap, setTahap] = useState<Tahap>(edit ? "proses" : "tulis");
  const [teks, setTeks] = useState("");
  const [jenis, setJenis] = useState<KunciUsaha | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [judul, setJudul] = useState(edit?.judul ?? "");
  const [galat, setGalat] = useState<string | null>(null);
  const batal = useRef<AbortController | null>(null);
  const [simpan, aksiSimpan, menyimpan] = useActionState(tambahTeksAction, null);
  const [, mulai] = useTransition();
  const lengkap = cekKelengkapan(teks);
  const bersih = bersihkanKerangka(teks);

  const rapikan = (body: object) => {
    batal.current?.abort();
    const c = (batal.current = new AbortController());
    setGalat(null);
    setTahap("proses");
    minta({ numberId, ...body }, c.signal)
      .then((h) => {
        setHasil(h);
        setJudul((j) => j || judulDari(h.asli, h.teks));
        setTahap("hasil");
      })
      .catch((e: Error) => {
        if (c.signal.aborted) return;
        setGalat(e.message);
        setTahap(edit && !hasil ? "hasil" : "tulis");
      });
  };

  // Menyempurnakan dokumen tersimpan: langsung dirapikan saat editor dibuka. Editor diberi key per dokumen, jadi
  // efek ini berjalan sekali per dokumen; permintaan dibatalkan bila editor ditutup sebelum selesai.
  useEffect(() => {
    if (!edit) return;
    const c = (batal.current = new AbortController());
    minta({ numberId, dokumenId: edit.id }, c.signal)
      .then((h) => {
        setHasil(h);
        setTeks(h.asli);
        setTahap("hasil");
      })
      .catch((e: Error) => {
        if (c.signal.aborted) return;
        setGalat(e.message);
        setTahap("hasil");
      });
    return () => c.abort();
  }, [edit, numberId]);

  // Tersimpan: tampilkan konfirmasi (sekali per hasil simpan), bukan form lagi.
  const [simpanLalu, setSimpanLalu] = useState(simpan);
  if (simpan !== simpanLalu) {
    setSimpanLalu(simpan);
    if (simpan?.ok) setTahap("tersimpan");
  }

  const simpanTeks = (isi: string, j: string) => {
    const fd = new FormData();
    fd.set("number_id", String(numberId));
    fd.set("judul", j.trim() || "Info usaha");
    fd.set("isi", isi);
    if (edit) fd.set("ganti_id", String(edit.id));
    mulai(() => aksiSimpan(fd));
  };

  if (tahap === "tersimpan")
    return (
      <div className="rounded-2xl border border-success/30 bg-success-soft/50 p-5">
        <p className="flex items-center gap-2 text-[14px] font-bold text-success">
          <Check className="size-4" aria-hidden /> {edit ? "Dokumen diperbarui" : "Tersimpan ke base knowledge"}
        </p>
        <p className="mt-1 text-[13px] text-muted">Coba di Uji bot: tanyakan harga, jam buka, atau coba pesan sesuatu seperti pelanggan.</p>
        <button
          type="button"
          className="btn btn-ghost mt-3 border border-line"
          onClick={() => {
            if (tutup) tutup();
            else {
              setTeks("");
              setJenis(null);
              setHasil(null);
              setJudul("");
              setTahap("tulis");
            }
          }}
        >
          {edit ? "Selesai" : "Tulis info lain"}
        </button>
      </div>
    );

  if (tahap === "proses")
    return (
      <LoadingAi
        judul={edit ? "AI sedang menyempurnakan dokumen…" : "AI sedang merapikan tulisan Anda…"}
        onBatal={() => {
          batal.current?.abort();
          if (edit && tutup) tutup();
          else setTahap("tulis");
        }}
      />
    );

  if (tahap === "hasil")
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[14px] font-bold">
            <span className="grid size-6 place-items-center rounded-full bg-accent text-[12px] text-on-accent">2</span>
            Periksa hasilnya, lalu simpan
          </p>
          {edit && tutup && (
            <button type="button" onClick={tutup} className="flex items-center gap-1 text-[12.5px] font-semibold text-muted hover:text-fg">
              <X className="size-3.5" aria-hidden /> Tutup
            </button>
          )}
        </div>

        {galat && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{galat}</p>}

        {hasil && hasil.peringatan.length > 0 && (
          <div className="flex gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-[13px]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <p>
              <b className="text-danger">Periksa angka ini:</b> AI menuliskannya, padahal tidak ada di tulisan Anda: {hasil.peringatan.join(", ")}. Betulkan atau hapus
              sebelum disimpan.
            </p>
          </div>
        )}

        {hasil && hasil.kurang.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-3 text-[13px]">
            <p className="font-semibold text-warning">Supaya AI bisa menjawab lebih banyak, lengkapi juga:</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-fg">
              {hasil.kurang.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline"
              onClick={() => {
                setTeks(`${hasil.teks}\n\n${hasil.kurang.map((k) => `${k} → `).join("\n")}`);
                setTahap("tulis");
              }}
            >
              <PencilLine className="size-3.5" aria-hidden /> Lengkapi lalu rapikan lagi
            </button>
          </div>
        )}

        {hasil && (
          <>
            <div>
              <label htmlFor={`judul-${numberId}`} className="label">
                Judul dokumen
              </label>
              <input id={`judul-${numberId}`} value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={120} className="field" />
            </div>
            <div>
              <label htmlFor={`hasil-${numberId}`} className="label">
                Isi yang dibaca AI <span className="font-normal text-faint">(boleh diedit langsung)</span>
              </label>
              <textarea
                id={`hasil-${numberId}`}
                value={hasil.teks}
                onChange={(e) => setHasil({ ...hasil, teks: e.target.value })}
                rows={16}
                className="field resize-y text-[13px] leading-relaxed"
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {hasil && (
            <button type="button" disabled={menyimpan || !hasil.teks.trim()} onClick={() => simpanTeks(hasil.teks, judul)} className="btn btn-primary">
              {menyimpan ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {edit ? "Simpan perubahan" : "Simpan ke base knowledge"}
            </button>
          )}
          <button type="button" onClick={() => setTahap("tulis")} className="btn btn-ghost border border-line">
            <ArrowLeft className="size-4" aria-hidden /> Ubah tulisan saya
          </button>
          {hasil && (
            <button type="button" onClick={() => rapikan({ teks: hasil.teks, jenis })} className="btn btn-ghost">
              <RotateCcw className="size-4" aria-hidden /> Rapikan ulang
            </button>
          )}
          <Pesan ok={!!simpan?.ok}>{simpan && !simpan.ok ? simpan.pesan : null}</Pesan>
        </div>
      </div>
    );

  // Tahap tulis
  // Belum ada info usaha (hanya kerangka / saran bawaan): tombol rapikan & simpan belum aktif.
  const kosong = infoUsaha(teks).length < 20;
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <span className="grid size-6 place-items-center rounded-full bg-accent text-[12px] text-on-accent">1</span>
        Ceritakan usaha Anda dengan bahasa sendiri
      </p>

      {kosong ? (
        <div>
          <p className="text-[12.5px] text-muted">Bingung mulai dari mana? Pilih jenis usaha untuk mendapat kerangka isian:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(JENIS_USAHA) as KunciUsaha[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setJenis(k);
                  setTeks(kerangka(k));
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  jenis === k ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:border-accent/50 hover:text-fg"
                }`}
              >
                <span aria-hidden>{JENIS_USAHA[k].ikon}</span>
                {JENIS_USAHA[k].label.split(/[\/&]/)[0].trim()}
              </button>
            ))}
          </div>
        </div>
      ) : (
        jenis && (
          <p className="text-[12.5px] text-muted">
            Kerangka: <b className="text-fg">{JENIS_USAHA[jenis].ikon} {JENIS_USAHA[jenis].label}</b>. Isi setelah tanda titik dua; tulisan &quot;(contoh: …)&quot; boleh
            dibiarkan, tidak ikut disimpan.
          </p>
        )
      )}

      <textarea
        aria-label="Info usaha"
        value={teks}
        onChange={(e) => setTeks(e.target.value)}
        rows={14}
        maxLength={20_000}
        placeholder={`${CONTOH_BEBAS}\n\nTidak perlu rapi atau lengkap: AI yang merapikan. Sudah punya daftar harga? Tempel saja di sini.`}
        className="field resize-y leading-relaxed"
      />

      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-muted">Yang paling sering ditanya pelanggan:</p>
        <ul className="flex flex-wrap gap-1.5">
          {KELENGKAPAN.map((k) => (
            <li
              key={k.kunci}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${lengkap[k.kunci] ? "bg-success-soft text-success" : "bg-subtle text-faint"}`}
            >
              {lengkap[k.kunci] ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
              {k.label}
              <span className="sr-only">{lengkap[k.kunci] ? "(sudah ditulis)" : "(belum ditulis)"}</span>
            </li>
          ))}
        </ul>
      </div>

      {galat && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{galat}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button type="button" disabled={kosong} onClick={() => rapikan({ teks, jenis })} className="btn btn-primary">
          <Sparkles className="size-4" aria-hidden /> Rapikan dengan AI
        </button>
        <button type="button" disabled={kosong || menyimpan} onClick={() => simpanTeks(bersih, judul || judulDari(bersih))} className="btn btn-ghost">
          {menyimpan && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan tanpa dirapikan
        </button>
        {edit && tutup && (
          <button type="button" onClick={tutup} className="btn btn-ghost">
            Batal
          </button>
        )}
        <span className="ml-auto text-[11.5px] text-faint tabular-nums">{bersih.length.toLocaleString("id-ID")} karakter</span>
        <Pesan ok={!!simpan?.ok}>{simpan && !simpan.ok ? simpan.pesan : null}</Pesan>
      </div>
    </div>
  );
}

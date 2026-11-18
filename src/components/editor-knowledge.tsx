"use client";

import { useActionState, useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Check, Circle, Loader2, PencilLine, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { tambahTeksAction } from "@/app/actions";
import type { T } from "@/lib/bahasa";
import { angka } from "@/lib/format";
import { JENIS_USAHA, KELENGKAPAN, type KunciUsaha, bersihkanKerangka, cekKelengkapan, infoUsaha, jenisUsahaSah, kerangka } from "@/lib/templat-usaha";
import { useBahasa } from "./bahasa";
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

const contohBebas = (t: T) =>
  t(
    "Tulis seperti chat biasa: nama usaha, apa yang dijual beserta harganya, jam buka, alamat atau area layanan, cara pesan, dan cara bayar.",
    "Write it like a normal chat: business name, what you sell and the prices, opening hours, address or service area, how to order, and how to pay.",
  );

export interface Progres {
  selesai: number;
  total: number;
}

/** Jawaban server dialirkan (NDJSON): baris progres per bagian, lalu satu baris hasil/galat. Galat awal = JSON biasa. */
async function minta(body: object, sinyal: AbortSignal, t: T, onProgres: (p: Progres) => void): Promise<Hasil> {
  const res = await fetch("/api/knowledge/rapikan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: sinyal });
  const gagal = (pesan?: string) => new Error(pesan ?? t(`Gagal (HTTP ${res.status}).`, `Failed (HTTP ${res.status}).`));
  if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    throw gagal(d.error);
  }
  const baca = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let sisa = "";
  for (;;) {
    const { value, done } = await baca.read();
    sisa += value ?? "";
    const baris = done ? [sisa] : sisa.split("\n");
    sisa = done ? "" : (baris.pop() ?? "");
    for (const b of baris) {
      if (!b.trim()) continue;
      const d = JSON.parse(b) as { progres?: Progres; hasil?: Partial<Hasil>; error?: string };
      if (d.progres) onProgres(d.progres);
      if (d.error) throw gagal(d.error);
      if (d.hasil && typeof d.hasil.teks === "string")
        return { asli: d.hasil.asli ?? "", teks: d.hasil.teks, kurang: d.hasil.kurang ?? [], peringatan: d.hasil.peringatan ?? [] };
    }
    if (done) throw gagal(t("Koneksi terputus sebelum AI selesai. Coba lagi.", "The connection dropped before the AI finished. Please try again."));
  }
}

/** Judul dokumen dari nama usaha yang tertulis (tulisan asli dulu, lalu hasil AI), bila ada. */
function judulDari(t: T, ...teks: string[]): string {
  for (const x of teks) {
    const m = x.match(/(?:nama usaha|business name)\s*:\s*([^\n,(]{2,60})/i) ?? x.match(/chat whatsapp untuk\s+(.{2,60}?)(?:\s+seperti\b|[\n.,(])/i);
    if (m) return t(`Info ${m[1].trim()}`, `${m[1].trim()} info`);
  }
  return t("Info usaha", "Business info");
}

export function EditorKnowledge({ numberId, edit, tutup }: { numberId: number; edit?: { id: number; judul: string } | null; tutup?: () => void }) {
  const [tahap, setTahap] = useState<Tahap>(edit ? "proses" : "tulis");
  const [teks, setTeks] = useState("");
  const [jenis, setJenis] = useState<KunciUsaha | null>(null);
  // Industri LP asal pengunjung (localStorage cg_industry, ditulis lp/aset/lp.js): pilihannya ditaruh paling depan.
  const [dariLp, setDariLp] = useState<KunciUsaha | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem("cg_industry");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hanya terbaca setelah hidrasi
      if (jenisUsahaSah(v)) setDariLp(v);
    } catch {
      /* penyimpanan diblokir: urutan bawaan */
    }
  }, []);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [judul, setJudul] = useState(edit?.judul ?? "");
  const [galat, setGalat] = useState<string | null>(null);
  const [progres, setProgres] = useState<Progres | null>(null);
  const batal = useRef<AbortController | null>(null);
  const [simpan, aksiSimpan, menyimpan] = useActionState(tambahTeksAction, null);
  const [, mulai] = useTransition();
  const { b, t } = useBahasa();
  // Tulisan bisa sampai 1 juta karakter: cek kelengkapan & hitung karakter memakai nilai tertunda supaya mengetik tetap
  // lancar. Yang disimpan selalu dihitung ulang dari `teks` terbaru saat tombol ditekan.
  const teksTunda = useDeferredValue(teks);
  const lengkap = cekKelengkapan(teksTunda);
  const bersih = bersihkanKerangka(teksTunda);

  const rapikan = (body: object) => {
    batal.current?.abort();
    const c = (batal.current = new AbortController());
    setGalat(null);
    setProgres(null);
    setTahap("proses");
    minta({ numberId, ...body }, c.signal, t, setProgres)
      .then((h) => {
        setHasil(h);
        setJudul((j) => j || judulDari(t, h.asli, h.teks));
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
    minta({ numberId, dokumenId: edit.id }, c.signal, t, setProgres)
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
  }, [edit, numberId, t]);

  // Tersimpan: tampilkan konfirmasi (sekali per hasil simpan), bukan form lagi.
  const [simpanLalu, setSimpanLalu] = useState(simpan);
  if (simpan !== simpanLalu) {
    setSimpanLalu(simpan);
    if (simpan?.ok) setTahap("tersimpan");
  }

  const simpanTeks = (isi: string, j: string) => {
    const fd = new FormData();
    fd.set("number_id", String(numberId));
    fd.set("judul", j.trim() || t("Info usaha", "Business info"));
    fd.set("isi", isi);
    if (edit) fd.set("ganti_id", String(edit.id));
    mulai(() => aksiSimpan(fd));
  };

  if (tahap === "tersimpan")
    return (
      <div className="rounded-2xl border border-success/30 bg-success-soft/50 p-5">
        <p className="flex items-center gap-2 text-[14px] font-bold text-success">
          <Check className="size-4" aria-hidden /> {edit ? t("Dokumen diperbarui", "Document updated") : t("Tersimpan ke Informasi Usaha", "Saved to Business Info")}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {t(
            "Coba di Uji bot: tanyakan harga, jam buka, atau coba pesan sesuatu seperti pelanggan.",
            "Try it in Test the bot: ask about prices or opening hours, or try ordering something like a customer would.",
          )}
        </p>
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
          {edit ? t("Selesai", "Done") : t("Tulis info lain", "Write more info")}
        </button>
      </div>
    );

  if (tahap === "proses")
    return (
      <LoadingAi
        judul={edit ? t("AI sedang menyempurnakan dokumen…", "AI is refining the document…") : t("AI sedang merapikan tulisan Anda…", "AI is tidying up your text…")}
        progres={progres}
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
            {t("Periksa hasilnya, lalu simpan", "Review the result, then save")}
          </p>
          {edit && tutup && (
            <button type="button" onClick={tutup} className="flex items-center gap-1 text-[12.5px] font-semibold text-muted hover:text-fg">
              <X className="size-3.5" aria-hidden /> {t("Tutup", "Close")}
            </button>
          )}
        </div>

        {galat && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{galat}</p>}

        {hasil && hasil.peringatan.length > 0 && (
          <div data-analitik-privat className="flex gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-[13px]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <p>
              <b className="text-danger">{t("Periksa angka ini:", "Check these numbers:")}</b>{" "}
              {t(
                `AI menuliskannya, padahal tidak ada di tulisan Anda: ${hasil.peringatan.join(", ")}. Betulkan atau hapus sebelum disimpan.`,
                `AI wrote them, but they aren't in your text: ${hasil.peringatan.join(", ")}. Fix or remove them before saving.`,
              )}
            </p>
          </div>
        )}

        {hasil && hasil.kurang.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-3 text-[13px]">
            <p className="font-semibold text-warning">{t("Supaya AI bisa menjawab lebih banyak, lengkapi juga:", "So AI can answer more, also add:")}</p>
            <ul data-analitik-privat className="mt-1.5 list-disc space-y-0.5 pl-5 text-fg">
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
              <PencilLine className="size-3.5" aria-hidden /> {t("Lengkapi lalu rapikan lagi", "Fill in, then tidy up again")}
            </button>
          </div>
        )}

        {hasil && (
          <>
            <div>
              <label htmlFor={`judul-${numberId}`} className="label">
                {t("Judul dokumen", "Document title")}
              </label>
              <input id={`judul-${numberId}`} value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={120} className="field" />
            </div>
            <div>
              <label htmlFor={`hasil-${numberId}`} className="label">
                {t("Isi yang dibaca AI", "Content AI reads")} <span className="font-normal text-faint">{t("(boleh diedit langsung)", "(you can edit it directly)")}</span>
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
              {edit ? t("Simpan perubahan", "Save changes") : t("Simpan ke Informasi Usaha", "Save to Business Info")}
            </button>
          )}
          <button type="button" onClick={() => setTahap("tulis")} className="btn btn-ghost border border-line">
            <ArrowLeft className="size-4" aria-hidden /> {t("Ubah tulisan saya", "Edit my text")}
          </button>
          {hasil && (
            <button type="button" onClick={() => rapikan({ teks: hasil.teks, jenis })} className="btn btn-ghost">
              <RotateCcw className="size-4" aria-hidden /> {t("Rapikan ulang", "Tidy up again")}
            </button>
          )}
          <Pesan ok={!!simpan?.ok}>{simpan && !simpan.ok ? simpan.pesan : null}</Pesan>
        </div>
      </div>
    );

  // Tahap tulis
  // Belum ada info usaha (hanya kerangka / saran bawaan): tombol rapikan & simpan belum aktif.
  const kosong = infoUsaha(teksTunda).length < 20;
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <span className="grid size-6 place-items-center rounded-full bg-accent text-[12px] text-on-accent">1</span>
        {t("Ceritakan usaha Anda dengan bahasa sendiri", "Describe your business in your own words")}
      </p>

      {kosong ? (
        <div>
          <p className="text-[12.5px] text-muted">
            {t("Bingung mulai dari mana? Pilih jenis usaha untuk mendapat kerangka isian:", "Not sure where to start? Pick a business type to get a template:")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(JENIS_USAHA) as KunciUsaha[]).sort((x, y) => Number(y === dariLp) - Number(x === dariLp)).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setJenis(k);
                  setTeks(kerangka(k, b));
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  jenis === k ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:border-accent/50 hover:text-fg"
                }`}
              >
                <span aria-hidden>{JENIS_USAHA[k].ikon}</span>
                {(b === "en" ? JENIS_USAHA[k].en.label : JENIS_USAHA[k].label).split(/[\/&]/)[0].trim()}
              </button>
            ))}
          </div>
        </div>
      ) : (
        jenis && (
          <p className="text-[12.5px] text-muted">
            {t("Kerangka:", "Template:")}{" "}
            <b className="text-fg">
              {JENIS_USAHA[jenis].ikon} {b === "en" ? JENIS_USAHA[jenis].en.label : JENIS_USAHA[jenis].label}
            </b>
            .{" "}
            {t(
              "Isi setelah tanda titik dua; tulisan \"(contoh: …)\" boleh dibiarkan, tidak ikut disimpan.",
              "Fill in after each colon; you can leave the \"(example: …)\" hints, they aren't saved.",
            )}
          </p>
        )
      )}

      <textarea
        aria-label={t("Info usaha", "Business info")}
        value={teks}
        onChange={(e) => setTeks(e.target.value)}
        rows={14}
        maxLength={1_000_000}
        placeholder={`${contohBebas(t)}\n\n${t(
          "Tidak perlu rapi atau lengkap: AI yang merapikan. Sudah punya daftar harga? Tempel saja di sini.",
          "It doesn't need to be neat or complete: AI tidies it up. Already have a price list? Just paste it here.",
        )}`}
        className="field resize-y leading-relaxed"
      />

      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-muted">{t("Yang paling sering ditanya pelanggan:", "What customers ask about most:")}</p>
        <ul className="flex flex-wrap gap-1.5">
          {KELENGKAPAN.map((k) => (
            <li
              key={k.kunci}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${lengkap[k.kunci] ? "bg-success-soft text-success" : "bg-subtle text-faint"}`}
            >
              {lengkap[k.kunci] ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
              {b === "en" ? k.labelEn : k.label}
              <span className="sr-only">{lengkap[k.kunci] ? t("(sudah ditulis)", "(written)") : t("(belum ditulis)", "(not written yet)")}</span>
            </li>
          ))}
        </ul>
      </div>

      {galat && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{galat}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button type="button" disabled={kosong} onClick={() => rapikan({ teks, jenis })} className="btn btn-primary">
          <Sparkles className="size-4" aria-hidden /> {t("Rapikan dengan AI", "Tidy up with AI")}
        </button>
        <button type="button" disabled={kosong || menyimpan} onClick={() => {
            const isi = bersihkanKerangka(teks);
            simpanTeks(isi, judul || judulDari(t, isi));
          }} className="btn btn-ghost">
          {menyimpan && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("Simpan tanpa dirapikan", "Save without tidying")}
        </button>
        {edit && tutup && (
          <button type="button" onClick={tutup} className="btn btn-ghost">
            {t("Batal", "Cancel")}
          </button>
        )}
        <span className="ml-auto text-[11.5px] text-faint tabular-nums">{t(`${bersih.length.toLocaleString("id-ID")} karakter`, `${angka(bersih.length, b)} characters`)}</span>
        <Pesan ok={!!simpan?.ok}>{simpan && !simpan.ok ? simpan.pesan : null}</Pesan>
      </div>
    </div>
  );
}

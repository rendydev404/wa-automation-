"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Download, FileText, Loader2, PencilLine, Sparkles, Trash2, Type, UploadCloud, X } from "lucide-react";
import { hapusDokumenAction, pratinjauAction } from "@/app/actions";
import { angka, ukuran } from "@/lib/format";
import { useBahasa } from "./bahasa";
import { EditorKnowledge } from "./editor-knowledge";

export interface ItemDokumen {
  id: number;
  judul: string;
  sumber: "pdf" | "berkas" | "teks";
  ukuran_byte: number;
  jumlah_karakter: number;
  tanggal: string;
}

interface Unggahan {
  nama: string;
  status: "proses" | "ok" | "gagal";
  pesan?: string;
}

const MAKS_BYTE = 10 * 1024 * 1024;

export function KnowledgePanel({ numberId, dokumen, total, batasUtuh }: { numberId: number; dokumen: ItemDokumen[]; total: number; batasUtuh: number }) {
  const [tab, setTab] = useState<"tulis" | "unggah">("tulis");
  // Dokumen yang sedang disempurnakan AI (editor dibuka dalam mode ganti).
  const [edit, setEdit] = useState<{ id: number; judul: string } | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const { b, t } = useBahasa();
  const sempurnakan = (d: ItemDokumen) => {
    setTab("tulis");
    setEdit({ id: d.id, judul: d.judul });
    editor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-bold tracking-tight">{t("Base knowledge", "Product knowledge")}</h2>
        <p className="hint mt-0.5">
          {total === 0
            ? t(
                "Catatan yang dipakai AI untuk menjawab pelanggan: produk, harga, jam buka, alamat, cara pesan. Yang tidak tertulis tidak akan dikarang AI.",
                "The notes AI uses to answer customers: products, prices, opening hours, address, how to order. AI never makes up what isn't written here.",
              )
            : total <= batasUtuh
              ? t(`${angka(total)} karakter · seluruh isi dibaca AI di setiap pesan.`, `${angka(total, b)} characters · AI reads all of it for every message.`)
              : t(
                  `${angka(total)} karakter · AI membaca bagian yang paling relevan dengan pertanyaan pelanggan.`,
                  `${angka(total, b)} characters · AI reads the parts most relevant to each customer question.`,
                )}
        </p>
      </div>

      <div ref={editor} className="scroll-mt-20 px-5 pt-5 sm:px-6">
        <div role="tablist" aria-label={t("Cara mengisi knowledge", "How to add product knowledge")} className="grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1 sm:inline-grid">
          {(
            [
              ["tulis", t("Tulis", "Write"), t("dengan bantuan AI", "with AI help"), Sparkles],
              ["unggah", t("Unggah", "Upload"), t("berkas", "files"), UploadCloud],
            ] as const
          ).map(([k, label, ekor, Ikon]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              type="button"
              onClick={() => setTab(k)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${tab === k ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              <Ikon className="size-4" aria-hidden /> {label}
              <span className="max-sm:hidden">{` ${ekor}`}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          {tab === "tulis" ? (
            <EditorKnowledge key={edit ? `edit-${edit.id}` : "baru"} numberId={numberId} edit={edit} tutup={edit ? () => setEdit(null) : undefined} />
          ) : (
            <Unggah numberId={numberId} />
          )}
        </div>
      </div>

      <div className="px-5 pt-6 pb-5 sm:px-6">
        <p className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
          {t("Tersimpan", "Saved")} ({dokumen.length})
        </p>
        {dokumen.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">
            {t(
              "Belum ada. Tulis info usaha Anda di atas, atau unggah daftar harga/menu dalam PDF.",
              "Nothing yet. Write your business info above, or upload a price list/menu as a PDF.",
            )}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {dokumen.map((d) => (
              <Baris key={d.id} d={d} numberId={numberId} sempurnakan={() => sempurnakan(d)} sedangDiedit={edit?.id === d.id} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Unggah({ numberId }: { numberId: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [seret, setSeret] = useState(false);
  const [daftar, setDaftar] = useState<Unggahan[]>([]);
  const sibuk = daftar.some((u) => u.status === "proses");
  const { b: bhs, t } = useBahasa();

  async function kirim(berkas: File[]) {
    if (!berkas.length || sibuk) return;
    setDaftar(berkas.map((b) => ({ nama: b.name, status: "proses" })));
    const tandai = (i: number, u: Partial<Unggahan>) => setDaftar((lama) => lama.map((x, j) => (j === i ? { ...x, ...u } : x)));
    let adaBerhasil = false;
    // Berurutan: satu PDF diproses sekali waktu supaya memori server tetap kecil.
    for (const [i, b] of berkas.entries()) {
      if (b.size > MAKS_BYTE) {
        tandai(i, { status: "gagal", pesan: t("Lebih dari 10 MB.", "Larger than 10 MB.") });
        continue;
      }
      const form = new FormData();
      form.set("number_id", String(numberId));
      form.set("berkas", b);
      try {
        const res = await fetch("/api/knowledge/upload", { method: "POST", body: form });
        const d = (await res.json().catch(() => ({}))) as { error?: string; karakter?: number };
        if (res.ok) {
          adaBerhasil = true;
          tandai(i, { status: "ok", pesan: t(`${angka(d.karakter ?? 0)} karakter terbaca`, `${angka(d.karakter ?? 0, bhs)} characters read`) });
        } else tandai(i, { status: "gagal", pesan: d.error ?? t(`Gagal (HTTP ${res.status}).`, `Failed (HTTP ${res.status}).`) });
      } catch {
        tandai(i, { status: "gagal", pesan: t("Koneksi terputus.", "Connection lost.") });
      }
    }
    if (adaBerhasil) router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setSeret(true))}
        onDragLeave={() => setSeret(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSeret(false);
          void kirim([...e.dataTransfer.files]);
        }}
        disabled={sibuk}
        className={`grid w-full place-items-center rounded-xl border-2 border-dashed px-4 py-9 text-center transition-colors ${
          seret ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent hover:bg-accent-soft/40"
        }`}
      >
        <UploadCloud className="mb-2 size-7 text-accent" aria-hidden />
        <span className="text-[14px] font-semibold">
          <span className="sm:hidden">{t("Ketuk untuk memilih berkas", "Tap to choose files")}</span>
          <span className="max-sm:hidden">{t("Seret berkas ke sini atau klik untuk memilih", "Drag files here or click to choose")}</span>
        </span>
        <span className="hint mt-1">{t("PDF atau teks (.txt, .md, .csv) · maks 10 MB per berkas", "PDF or text (.txt, .md, .csv) · max 10 MB per file")}</span>
      </button>
      <input
        ref={input}
        type="file"
        aria-label={t("Pilih berkas knowledge", "Choose product knowledge files")}
        tabIndex={-1}
        multiple
        accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,text/markdown,text/csv"
        className="sr-only"
        onChange={(e) => {
          void kirim([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {daftar.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {daftar.map((u, i) => (
            <li key={`${u.nama}-${i}`} className="flex items-center gap-2 text-[13px]">
              {u.status === "proses" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
              ) : u.status === "ok" ? (
                <Check className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <X className="size-4 shrink-0 text-danger" aria-hidden />
              )}
              <span className="truncate font-medium">{u.nama}</span>
              <span className={u.status === "gagal" ? "text-danger" : "text-muted"}>{u.status === "proses" ? t("membaca…", "reading…") : u.pesan}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Baris({ d, numberId, sempurnakan, sedangDiedit }: { d: ItemDokumen; numberId: number; sempurnakan: () => void; sedangDiedit: boolean }) {
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState<string | null>(null);
  const [tanya, setTanya] = useState(false);
  const [tunggu, mulai] = useTransition();
  const Ikon = d.sumber === "teks" ? Type : FileText;
  const { b, t } = useBahasa();

  const togglePratinjau = () => {
    setBuka((x) => !x);
    // Isi dokumen baru diambil saat pertama kali dibuka.
    if (isi === null) mulai(async () => setIsi((await pratinjauAction(d.id, numberId)) ?? ""));
  };

  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted max-sm:hidden">
          <Ikon className="size-4" aria-hidden />
        </span>
        <button type="button" onClick={togglePratinjau} className="min-w-0 flex-1 text-left" aria-expanded={buka}>
          <p className="truncate text-[13.5px] font-semibold">{d.judul}</p>
          <p className="hint">
            {d.sumber === "pdf" ? "PDF" : d.sumber === "berkas" ? t("Berkas teks", "Text file") : t("Teks", "Text")}
            {d.ukuran_byte > 0 && ` · ${ukuran(d.ukuran_byte)}`} · {angka(d.jumlah_karakter, b)} {t("karakter", "characters")} · {d.tanggal}
          </p>
        </button>
        {tanya ? (
          <div className="flex animate-masuk items-center gap-1.5">
            <button type="button" disabled={tunggu} className="btn h-8 bg-danger px-3 text-white" onClick={() => mulai(async () => void (await hapusDokumenAction(d.id, numberId)))}>
              {tunggu && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {t("Hapus", "Delete")}
            </button>
            <button type="button" disabled={tunggu} className="btn btn-ghost h-8 px-3" onClick={() => setTanya(false)}>
              {t("Batal", "Cancel")}
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={sempurnakan}
              disabled={sedangDiedit}
              title={t("Rapikan & lengkapi dokumen ini dengan AI", "Tidy up & complete this document with AI")}
              className="hidden h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-accent hover:bg-accent-soft disabled:opacity-50 sm:inline-flex"
            >
              <Sparkles className="size-4" aria-hidden /> {sedangDiedit ? t("Sedang dirapikan", "Being refined") : t("Sempurnakan", "Refine")}
            </button>
            <button type="button" onClick={sempurnakan} disabled={sedangDiedit} aria-label={t(`Sempurnakan ${d.judul} dengan AI`, `Refine ${d.judul} with AI`)} className="grid size-9 shrink-0 place-items-center rounded-lg text-accent hover:bg-accent-soft sm:hidden">
              <PencilLine className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={togglePratinjau} aria-label={t("Lihat isi", "View content")} className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-fg">
              <ChevronDown className={`size-4 transition-transform ${buka ? "rotate-180" : ""}`} aria-hidden />
            </button>
            <a
              href={`/api/knowledge/unduh?id=${d.id}&nomor=${numberId}`}
              download
              aria-label={t(`Unduh ${d.judul}`, `Download ${d.judul}`)}
              title={t("Unduh sebagai .txt", "Download as .txt")}
              className="hidden size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-fg sm:grid"
            >
              <Download className="size-4" aria-hidden />
            </a>
            <button type="button" onClick={() => setTanya(true)} aria-label={t(`Hapus ${d.judul}`, `Delete ${d.judul}`)} className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger">
              <Trash2 className="size-4" aria-hidden />
            </button>
          </>
        )}
      </div>
      {buka && (
        <div className="border-t border-line bg-subtle/50 px-4 py-3">
          {isi === null ? (
            <Loader2 className="size-4 animate-spin text-faint" aria-hidden />
          ) : (
            <p className="max-h-64 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{isi || t("(kosong)", "(empty)")}</p>
          )}
        </div>
      )}
    </li>
  );
}

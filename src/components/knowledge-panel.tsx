"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, ChevronDown, Download, FileText, Lightbulb, Loader2, Sparkles, Trash2, Type, UploadCloud, X } from "lucide-react";
import { hapusDokumenAction, pratinjauAction, tambahTeksAction } from "@/app/actions";
import { angka, ukuran } from "@/lib/format";
import { CONTOH_KNOWLEDGE } from "./isi-tur";
import { Pesan, SubmitButton } from "./ui";

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
  const [tab, setTab] = useState<"berkas" | "teks">(total === 0 ? "teks" : "berkas");
  // Naik setiap "Pakai contoh" diklik: formulir teks dibuat ulang berisi contoh.
  const [contoh, setContoh] = useState(0);
  const pakaiContoh = () => {
    setTab("teks");
    setContoh((n) => n + 1);
  };
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-bold tracking-tight">Base knowledge</h2>
        <p className="hint mt-0.5">
          {total === 0
            ? "Belum ada isi. Knowledge menentukan siapa AI di nomor ini dan apa yang ia tahu; tanpa itu ia hanya bisa bilang belum punya informasi."
            : total <= batasUtuh
              ? `${angka(total)} karakter · seluruh isi dibaca AI di setiap pesan.`
              : `${angka(total)} karakter · AI membaca bagian yang paling relevan dengan pertanyaan pelanggan.`}
        </p>
      </div>

      <PenjelasanKnowledge terbuka={total === 0} pakaiContoh={pakaiContoh} />

      <div className="px-5 pt-5 sm:px-6">
        <div role="tablist" className="inline-flex rounded-xl bg-subtle p-1">
          {(["berkas", "teks"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${tab === t ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {t === "berkas" ? "Unggah berkas" : "Tulis teks"}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {tab === "berkas" ? <Unggah numberId={numberId} /> : <FormTeks key={contoh} numberId={numberId} isiAwal={contoh ? CONTOH_KNOWLEDGE : undefined} />}
        </div>
      </div>

      <div className="px-5 pt-6 pb-5 sm:px-6">
        <p className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">Dokumen ({dokumen.length})</p>
        {dokumen.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
            Tulis dulu siapa pemilik nomor ini dan AI berperan sebagai apa, lalu fakta yang boleh disampaikan: layanan, harga, jadwal, alamat, dan
            jawaban atas pertanyaan yang sering masuk.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {dokumen.map((d) => (
              <Baris key={d.id} d={d} numberId={numberId} />
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

  async function kirim(berkas: File[]) {
    if (!berkas.length || sibuk) return;
    setDaftar(berkas.map((b) => ({ nama: b.name, status: "proses" })));
    const tandai = (i: number, u: Partial<Unggahan>) => setDaftar((lama) => lama.map((x, j) => (j === i ? { ...x, ...u } : x)));
    let adaBerhasil = false;
    // Berurutan: satu PDF diproses sekali waktu supaya memori server tetap kecil.
    for (const [i, b] of berkas.entries()) {
      if (b.size > MAKS_BYTE) {
        tandai(i, { status: "gagal", pesan: "Lebih dari 10 MB." });
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
          tandai(i, { status: "ok", pesan: `${angka(d.karakter ?? 0)} karakter terbaca` });
        } else tandai(i, { status: "gagal", pesan: d.error ?? `Gagal (HTTP ${res.status}).` });
      } catch {
        tandai(i, { status: "gagal", pesan: "Koneksi terputus." });
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
          <span className="sm:hidden">Ketuk untuk memilih berkas</span>
          <span className="max-sm:hidden">Seret berkas ke sini atau klik untuk memilih</span>
        </span>
        <span className="hint mt-1">PDF atau teks (.txt, .md, .csv) · maks 10 MB per berkas</span>
      </button>
      <input
        ref={input}
        type="file"
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
              <span className={u.status === "gagal" ? "text-danger" : "text-muted"}>{u.status === "proses" ? "membaca…" : u.pesan}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormTeks({ numberId, isiAwal }: { numberId: number; isiAwal?: string }) {
  const [hasil, aksi] = useActionState(tambahTeksAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (hasil?.ok) form.current?.reset();
  }, [hasil]);
  return (
    <form ref={form} action={aksi} className="space-y-3">
      <input type="hidden" name="number_id" value={numberId} />
      <div>
        <label htmlFor="judul" className="label">
          Judul
        </label>
        <input id="judul" name="judul" required maxLength={120} defaultValue={isiAwal ? "Info usaha" : undefined} placeholder="Tentang pemilik nomor & peran AI" className="field" />
      </div>
      <div>
        <label htmlFor="isi" className="label">
          Isi
        </label>
        {isiAwal && (
          <p className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
            Ganti semua tulisan di dalam <b>[kurung siku]</b> dengan data usahamu. Bagian yang tidak perlu boleh dihapus.
          </p>
        )}
        <textarea id="isi" name="isi" required rows={isiAwal ? 18 : 7} defaultValue={isiAwal} placeholder={"Kamu adalah asisten Budi, seorang desainer lepas. Balas pesan saat Budi sibuk.\nTarif desain logo: Rp …\nJam kerja: …"} className="field resize-y leading-relaxed" />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>Tambahkan</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

function Baris({ d, numberId }: { d: ItemDokumen; numberId: number }) {
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState<string | null>(null);
  const [tanya, setTanya] = useState(false);
  const [tunggu, mulai] = useTransition();
  const Ikon = d.sumber === "teks" ? Type : FileText;

  const togglePratinjau = () => {
    setBuka((b) => !b);
    // Isi dokumen baru diambil saat pertama kali dibuka.
    if (isi === null) mulai(async () => setIsi((await pratinjauAction(d.id, numberId)) ?? ""));
  };

  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
          <Ikon className="size-4" aria-hidden />
        </span>
        <button type="button" onClick={togglePratinjau} className="min-w-0 flex-1 text-left" aria-expanded={buka}>
          <p className="truncate text-[13.5px] font-semibold">{d.judul}</p>
          <p className="hint">
            {d.sumber === "pdf" ? "PDF" : d.sumber === "berkas" ? "Berkas teks" : "Teks"}
            {d.ukuran_byte > 0 && ` · ${ukuran(d.ukuran_byte)}`} · {angka(d.jumlah_karakter)} karakter · {d.tanggal}
          </p>
        </button>
        {tanya ? (
          <div className="flex animate-masuk items-center gap-1.5">
            <button type="button" disabled={tunggu} className="btn h-8 bg-danger px-3 text-white" onClick={() => mulai(async () => void (await hapusDokumenAction(d.id, numberId)))}>
              {tunggu && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Hapus
            </button>
            <button type="button" disabled={tunggu} className="btn btn-ghost h-8 px-3" onClick={() => setTanya(false)}>
              Batal
            </button>
          </div>
        ) : (
          <>
            <button type="button" onClick={togglePratinjau} aria-label="Lihat isi" className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-fg">
              <ChevronDown className={`size-4 transition-transform ${buka ? "rotate-180" : ""}`} aria-hidden />
            </button>
            <a
              href={`/api/knowledge/unduh?id=${d.id}&nomor=${numberId}`}
              download
              aria-label={`Unduh ${d.judul}`}
              title="Unduh sebagai .txt"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-fg"
            >
              <Download className="size-4" aria-hidden />
            </a>
            <button type="button" onClick={() => setTanya(true)} aria-label={`Hapus ${d.judul}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger">
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
            <p className="max-h-64 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{isi || "(kosong)"}</p>
          )}
        </div>
      )}
    </li>
  );
}

/** Penjelasan base knowledge untuk orang awam: perumpamaan, apa yang ditulis, dan contoh siap pakai. */
function PenjelasanKnowledge({ terbuka, pakaiContoh }: { terbuka: boolean; pakaiContoh: () => void }) {
  return (
    <details open={terbuka} className="group border-b border-line bg-accent-soft/40 px-5 py-4 sm:px-6">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13.5px] font-semibold text-accent [&::-webkit-details-marker]:hidden">
        <BookOpen className="size-4" aria-hidden />
        Apa itu base knowledge? (baca dulu, 1 menit)
        <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-fg">
        <p>
          Anggap AI ini <b>karyawan baru</b> yang menjaga WhatsApp kamu. Base knowledge adalah <b>buku catatan</b> yang kamu berikan kepadanya. AI hanya menjawab
          dari catatan ini. Yang tidak tertulis, ia akan bilang belum tahu dan menyerahkannya ke kamu, jadi ia tidak mengarang harga atau janji.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-surface p-3">
            <p className="flex items-center gap-1.5 font-semibold">
              <Check className="size-4 text-accent" aria-hidden /> Tulis ini
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
              <li>Nama usaha & AI berperan sebagai apa</li>
              <li>Produk/layanan beserta harganya</li>
              <li>Jam buka, alamat, link Google Maps</li>
              <li>Cara pesan, cara bayar, pengiriman</li>
              <li>Pertanyaan yang sering ditanya + jawabannya</li>
            </ul>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="flex items-center gap-1.5 font-semibold">
              <Lightbulb className="size-4 text-warning" aria-hidden /> Tips
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
              <li>Tulis seperti menjelaskan ke karyawan baru</li>
              <li>Satu info per baris, harga ditulis lengkap (Rp25.000)</li>
              <li>Harga/promo berubah? Perbarui di sini</li>
              <li>Jangan tulis password, PIN, atau data rahasia</li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={pakaiContoh} className="btn btn-primary">
            <Sparkles className="size-4" aria-hidden /> Pakai contoh
          </button>
          <span className="text-[12.5px] text-muted">Isi contoh langsung muncul di &quot;Tulis teks&quot;; tinggal ganti bagian [dalam kurung siku]. Sudah punya menu/daftar harga dalam PDF? Pakai &quot;Unggah berkas&quot;.</span>
        </div>
      </div>
    </details>
  );
}

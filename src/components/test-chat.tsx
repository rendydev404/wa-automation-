"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, Send, X } from "lucide-react";

interface Gelembung {
  dari: "saya" | "bot" | "galat";
  teks: string;
  meta?: string;
  foto?: string;
  /** Hal yang di WhatsApp akan diteruskan ke nomor pribadi pemilik. */
  teruskan?: { label: string; ringkasan: string } | null;
}

const sesiBaru = () => Math.random().toString(36).slice(2, 14).padEnd(8, "0");

const MODE = { kosong: "tanpa knowledge", utuh: "knowledge utuh", relevan: "potongan relevan" } as const;

/** Tebal ala WhatsApp (*teks*) dirender sebagai <b>. */
function TeksWa({ teks }: { teks: string }) {
  return (
    <>
      {teks.split(/(\*[^*\n]+\*)/g).map((bagian, i) =>
        bagian.length > 2 && bagian.startsWith("*") && bagian.endsWith("*") ? <b key={i}>{bagian.slice(1, -1)}</b> : <span key={i}>{bagian}</span>
      )}
    </>
  );
}

/** Perkecil foto di browser (sisi terpanjang 1568 px, JPEG) supaya unggahan kecil; model tidak memakai resolusi di atas itu. */
async function perkecil(berkas: File): Promise<string> {
  const bmp = await createImageBitmap(berkas);
  const skala = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const kanvas = document.createElement("canvas");
  kanvas.width = Math.max(1, Math.round(bmp.width * skala));
  kanvas.height = Math.max(1, Math.round(bmp.height * skala));
  kanvas.getContext("2d")!.drawImage(bmp, 0, 0, kanvas.width, kanvas.height);
  bmp.close();
  return kanvas.toDataURL("image/jpeg", 0.85);
}

export function TestChat({ numberId }: { numberId: number }) {
  const [pesan, setPesan] = useState<Gelembung[]>([]);
  const [teks, setTeks] = useState("");
  const [tunggu, setTunggu] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);
  const sesi = useRef(sesiBaru());
  const lalu = useRef("");
  const bawah = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bawah.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pesan, tunggu]);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    const isi = teks.trim();
    const lampiran = foto;
    if ((!isi && !lampiran) || tunggu) return;
    setTeks("");
    setFoto(null);
    setPesan((p) => [...p, { dari: "saya", teks: isi, foto: lampiran ?? undefined }]);
    setTunggu(true);
    try {
      const res = await fetch("/api/uji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberId,
          pesan: isi,
          sesi: sesi.current,
          kueriLalu: lalu.current,
          // Percakapan uji sejauh ini: dipakai penyedia AI tanpa ingatan sesi (Claude API).
          riwayat: pesan.filter((g) => g.dari !== "galat").slice(-12).map((g) => ({ ai: g.dari === "bot", teks: g.teks })),
          ...(lampiran ? { foto: lampiran } : {}),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { teks?: string; ms?: number; mode?: keyof typeof MODE; pelajaran?: number; diblokir?: boolean; error?: string; teruskan?: { label: string; ringkasan: string } | null };
      if (res.ok && d.teks) {
        lalu.current = isi;
        const meta = `${((d.ms ?? 0) / 1000).toFixed(1).replace(".", ",")} dtk · ${MODE[d.mode ?? "kosong"]}${d.pelajaran ? ` · ${d.pelajaran} balasan admin` : ""}${d.diblokir ? " · kode diblokir" : ""}`;
        setPesan((p) => [...p, { dari: "bot", teks: d.teks!, meta, teruskan: d.teruskan }]);
      } else setPesan((p) => [...p, { dari: "galat", teks: d.error ?? `Gagal (HTTP ${res.status}).` }]);
    } catch {
      setPesan((p) => [...p, { dari: "galat", teks: "Koneksi terputus." }]);
    } finally {
      setTunggu(false);
    }
  }

  return (
    <section className="card flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Uji bot</h2>
          <p className="hint mt-0.5">Sama persis dengan jawaban di WhatsApp, tanpa mengirim pesan.</p>
        </div>
        <button
          type="button"
          aria-label="Mulai percakapan baru"
          title="Mulai percakapan baru"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-fg"
          onClick={() => {
            sesi.current = sesiBaru();
            lalu.current = "";
            setPesan([]);
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex h-80 flex-col gap-2 overflow-y-auto bg-subtle/40 px-4 py-4 xl:h-96" aria-live="polite">
        {pesan.length === 0 && !tunggu && <p className="m-auto max-w-56 text-center text-[13px] text-faint">Coba tanyakan sesuatu yang ada di base knowledge, lalu yang tidak ada.</p>}
        {pesan.map((g, i) => (
          <div key={i} className={`max-w-[85%] animate-masuk ${g.dari === "saya" ? "self-end" : "self-start"}`}>
            <div
              className={`rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${
                g.dari === "saya" ? "rounded-br-md bg-accent text-on-accent" : g.dari === "bot" ? "rounded-bl-md border border-line bg-surface" : "bg-danger-soft text-danger"
              }`}
            >
              {g.foto && (
                // eslint-disable-next-line @next/next/no-img-element -- data URL lokal, bukan aset yang perlu dioptimasi
                <img src={g.foto} alt="Foto uji" className={`max-h-48 rounded-lg object-cover ${g.teks ? "mb-1.5" : ""}`} />
              )}
              {g.dari === "bot" ? <TeksWa teks={g.teks} /> : g.teks}
            </div>
            {g.teruskan && (
              <div className="mt-1.5 max-w-[85%] rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 px-3 py-2 text-[12px]">
                <p className="font-semibold text-accent">Diteruskan ke WhatsApp pribadi pemilik: {g.teruskan.label}</p>
                <p className="mt-0.5 whitespace-pre-line text-muted">{g.teruskan.ringkasan}</p>
              </div>
            )}
            {g.meta && <p className="mt-1 pl-1 text-[11px] text-faint">{g.meta}</p>}
          </div>
        ))}
        {tunggu && (
          <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2 text-[13px] text-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> mengetik…
          </div>
        )}
        <div ref={bawah} />
      </div>

      <form onSubmit={kirim} className="border-t border-line p-3">
        {foto && (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau data URL lokal */}
            <img src={foto} alt="Foto yang akan dikirim" className="size-14 rounded-lg object-cover" />
            <button type="button" onClick={() => setFoto(null)} aria-label="Batalkan foto" className="grid size-8 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-fg">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputFoto.current?.click()}
            disabled={tunggu}
            aria-label="Lampirkan foto"
            title="Lampirkan foto"
            className="btn btn-ghost h-auto w-11 shrink-0 px-0"
          >
            <ImagePlus className="size-4" aria-hidden />
          </button>
          <input
            ref={inputFoto}
            type="file"
            aria-label="Lampirkan foto"
            tabIndex={-1}
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const berkas = e.target.files?.[0];
              e.target.value = "";
              if (!berkas) return;
              try {
                setFoto(await perkecil(berkas));
              } catch {
                setPesan((p) => [...p, { dari: "galat", teks: "Foto tidak bisa dibaca." }]);
              }
            }}
          />
          <input value={teks} onChange={(e) => setTeks(e.target.value)} maxLength={2000} placeholder={foto ? "Keterangan foto (opsional)…" : "Tulis pesan seperti orang yang chat ke nomor ini…"} aria-label="Pesan uji" className="field" />
          <button type="submit" disabled={tunggu || (!teks.trim() && !foto)} aria-label="Kirim" className="btn btn-primary h-auto w-11 shrink-0 px-0">
            <Send className="size-4" aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}

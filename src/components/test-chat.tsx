"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Send } from "lucide-react";

interface Gelembung {
  dari: "saya" | "bot" | "galat";
  teks: string;
  meta?: string;
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

export function TestChat({ numberId }: { numberId: number }) {
  const [pesan, setPesan] = useState<Gelembung[]>([]);
  const [teks, setTeks] = useState("");
  const [tunggu, setTunggu] = useState(false);
  const sesi = useRef(sesiBaru());
  const lalu = useRef("");
  const bawah = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bawah.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pesan, tunggu]);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    const isi = teks.trim();
    if (!isi || tunggu) return;
    setTeks("");
    setPesan((p) => [...p, { dari: "saya", teks: isi }]);
    setTunggu(true);
    try {
      const res = await fetch("/api/uji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numberId, pesan: isi, sesi: sesi.current, kueriLalu: lalu.current }),
      });
      const d = (await res.json().catch(() => ({}))) as { teks?: string; ms?: number; mode?: keyof typeof MODE; error?: string };
      if (res.ok && d.teks) {
        lalu.current = isi;
        setPesan((p) => [...p, { dari: "bot", teks: d.teks!, meta: `${((d.ms ?? 0) / 1000).toFixed(1).replace(".", ",")} dtk · ${MODE[d.mode ?? "kosong"]}` }]);
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
              {g.dari === "bot" ? <TeksWa teks={g.teks} /> : g.teks}
            </div>
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

      <form onSubmit={kirim} className="flex gap-2 border-t border-line p-3">
        <input value={teks} onChange={(e) => setTeks(e.target.value)} maxLength={2000} placeholder="Tulis pesan seperti orang yang chat ke nomor ini…" aria-label="Pesan uji" className="field" />
        <button type="submit" disabled={tunggu || !teks.trim()} aria-label="Kirim" className="btn btn-primary h-auto w-11 shrink-0 px-0">
          <Send className="size-4" aria-hidden />
        </button>
      </form>
    </section>
  );
}

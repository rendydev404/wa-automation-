import { ImagePlus, RotateCcw, Send } from "lucide-react";
import { kedip } from "../kit/anim";
import { Spin } from "../kit/phone";

/* "Uji bot" (test-chat.tsx). */

export interface GelS {
  dari: "saya" | "bot";
  teks: string;
  meta?: string;
  /** 0..1 kemunculan. */
  muncul: number;
}

/** Tebal ala WhatsApp (*teks*) dirender sebagai <b>. */
function TeksWa({ teks }: { teks: string }) {
  return (
    <>
      {teks.split(/(\*[^*\n]+\*)/g).map((bagian, i) =>
        bagian.length > 2 && bagian.startsWith("*") && bagian.endsWith("*") ? <b key={i}>{bagian.slice(1, -1)}</b> : <span key={i}>{bagian}</span>,
      )}
    </>
  );
}

export function TestChatS({ t, pesan, mengetik, input, fokus, bawah, kirimAktif }: { t: number; pesan: GelS[]; mengetik: number; input: string; fokus: boolean; bawah: boolean; kirimAktif: boolean }) {
  const tampil = pesan.filter((g) => g.muncul > 0.001);
  return (
    <section className="card flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Uji bot</h2>
          <p className="hint mt-0.5">Sama persis dengan jawaban di WhatsApp, tanpa mengirim pesan.</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg text-faint">
          <RotateCcw className="size-4" />
        </span>
      </div>

      <div data-cur="area-chat" className="flex h-96 flex-col gap-2 overflow-hidden bg-subtle/40 px-4 py-4" style={{ justifyContent: bawah ? "flex-end" : "flex-start" }}>
        {tampil.length === 0 && mengetik < 0.01 && <p className="m-auto max-w-56 text-center text-[13px] text-faint">Coba tanyakan sesuatu yang ada di base knowledge, lalu yang tidak ada.</p>}
        {tampil.map((g, i) => (
          <div key={i} className={`max-w-[85%] shrink-0 ${g.dari === "saya" ? "self-end" : "self-start"}`} style={{ opacity: g.muncul, transform: `translateY(${(1 - g.muncul) * 8}px) scale(${0.985 + g.muncul * 0.015})` }}>
            <div className={`rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${g.dari === "saya" ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md border border-line bg-surface"}`}>
              {g.dari === "bot" ? <TeksWa teks={g.teks} /> : g.teks}
            </div>
            {g.meta && <p className="mt-1 pl-1 text-[11px] text-faint">{g.meta}</p>}
          </div>
        ))}
        {mengetik > 0.01 && (
          <div className="flex shrink-0 items-center gap-2 self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2 text-[13px] text-muted" style={{ opacity: mengetik }}>
            <Spin t={t} className="size-3.5" /> mengetik…
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        <div className="flex gap-2">
          <span className="btn btn-ghost h-auto w-11 shrink-0 px-0">
            <ImagePlus className="size-4" />
          </span>
          <div data-cur="input-uji" className={`field flex min-w-0 items-center overflow-hidden ${fokus ? "field-fokus" : ""}`}>
            {input ? <span className="whitespace-pre">{input.length > 34 ? input.slice(-34) : input}</span> : <span className="truncate text-faint">Tulis pesan seperti orang yang chat ke nomor ini…</span>}
            {fokus && <span className="inline-block h-[1.15em] w-px bg-fg" style={{ opacity: kedip(t) ? 1 : 0, marginLeft: 1 }} />}
          </div>
          <span data-cur="btn-kirim-uji" className="btn btn-primary h-auto w-11 shrink-0 px-0" style={kirimAktif ? undefined : { opacity: 0.55 }}>
            <Send className="size-4" />
          </span>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Copy, Play, Sparkles } from "lucide-react";

/** Sorotan cahaya hero mengikuti kursor (variabel CSS, satu pembaruan per frame). */
export function Sorot({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const gerak = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--x", `${e.clientX - r.left}px`);
        el.style.setProperty("--y", `${e.clientY - r.top}px`);
      });
    };
    el.addEventListener("pointermove", gerak, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", gerak);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Satu IntersectionObserver untuk semua .ld-muncul di halaman (tanpa pustaka animasi). */
export function PemicuMuncul() {
  useEffect(() => {
    const el = document.querySelectorAll(".ld-muncul");
    if (!("IntersectionObserver" in window)) {
      el.forEach((x) => x.classList.add("terlihat"));
      return;
    }
    const io = new IntersectionObserver(
      (isi) => {
        for (const e of isi)
          if (e.isIntersecting) {
            e.target.classList.add("terlihat");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    el.forEach((x) => io.observe(x));
    return () => io.disconnect();
  }, []);
  return null;
}

export function SalinPerintah({ teks, label }: { teks: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(teks).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1600);
        });
      }}
      className="group inline-flex max-w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pr-3 pl-4 font-mono text-[13px] text-[#e8f0ec] transition-colors hover:border-white/20 hover:bg-white/[0.06]"
      aria-label={label}
    >
      <span className="text-[#3ddc97]">$</span>
      <span className="truncate">{teks}</span>
      {ok ? <Check className="size-4 shrink-0 text-[#3ddc97]" aria-hidden /> : <Copy className="size-4 shrink-0 text-[#93a99f] group-hover:text-[#e8f0ec]" aria-hidden />}
    </button>
  );
}

// ---------- Demo: kode mengetik sendiri → dijalankan → pesan WA + webhook ----------

type Token = { t: string; k?: "k" | "s" | "n" | "c" | "f" | "p" };

/** Pewarna sintaks mini (cukup untuk contoh di demo; bukan parser). */
function warnai(kode: string, kunci: readonly string[]): Token[] {
  const pola = /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|(\b\d+\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|([{}()[\];,.:=>\\-]+)|(\s+)|(.)/g;
  const hasil: Token[] = [];
  for (const m of kode.matchAll(pola)) {
    const [s, kom, str, num, fn, kata, tanda] = m;
    if (kom) hasil.push({ t: s, k: "c" });
    else if (str) hasil.push({ t: s, k: "s" });
    else if (num) hasil.push({ t: s, k: "n" });
    else if (fn) hasil.push({ t: s, k: kunci.includes(fn) ? "k" : "f" });
    else if (kata) hasil.push({ t: s, k: kunci.includes(kata) ? "k" : undefined });
    else if (tanda) hasil.push({ t: s, k: "p" });
    else hasil.push({ t: s });
  }
  return hasil;
}

export interface ContohKode {
  label: string;
  berkas: string;
  kode: string;
}

const KUNCI = ["import", "from", "const", "await", "new", "async", "def", "return", "curl", "use", "true", "false", "null", "process", "env", "os", "requests", "Http", "fn"];

type Tahap = { log: { waktu: string; teks: string; nada: "ok" | "hook" | "ai" }[]; chat: { dari: "kita" | "pelanggan" | "ai"; teks: string; status?: 1 | 2 | 3 }[]; jawab: boolean };

export function DemoApi({ contoh, teks }: { contoh: ContohKode[]; teks: { jalankan: string; respons: string; langsung: string; pelanggan: string; balas: string; balasAi: string; pesan: string; online: string; menunggu: string } }) {
  const [tab, setTab] = useState(0);
  const [n, setN] = useState(0);
  const [tahap, setTahap] = useState<Tahap>({ log: [], chat: [], jawab: false });
  const [jalan, setJalan] = useState(false);
  const akar = useRef<HTMLDivElement>(null);
  const terlihat = useRef(true);
  const kode = contoh[tab].kode;
  const token = useRef<Token[]>([]);
  token.current = warnai(kode, KUNCI);

  useEffect(() => {
    const el = akar.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (terlihat.current = e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const kurang = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let batal = false;
    const timer: ReturnType<typeof setTimeout>[] = [];
    const tunda = (ms: number) =>
      new Promise<void>((r) => {
        const cek = () => (batal ? undefined : terlihat.current ? r() : timer.push(setTimeout(cek, 400)));
        timer.push(setTimeout(cek, ms));
      });
    const akhir: Tahap = {
      jawab: true,
      log: [
        { waktu: "12:04:31.208", teks: "200  POST /api/v1/pesan  38ms", nada: "ok" },
        { waktu: "12:04:32.114", teks: "webhook  pesan.status  terkirim", nada: "hook" },
        { waktu: "12:04:35.920", teks: "webhook  pesan.status  dibaca", nada: "hook" },
        { waktu: "12:04:41.502", teks: "webhook  pesan.masuk  dari 62898…", nada: "hook" },
        { waktu: "12:04:43.371", teks: "webhook  pesan.dibalas_ai  1,8 dtk", nada: "ai" },
      ],
      chat: [
        { dari: "kita", teks: teks.pesan, status: 3 },
        { dari: "pelanggan", teks: teks.balas },
        { dari: "ai", teks: teks.balasAi },
      ],
    };
    (async () => {
      setTahap({ log: [], chat: [], jawab: false });
      if (kurang) {
        setN(kode.length);
        setTahap(akhir);
        return;
      }
      for (;;) {
        setTahap({ log: [], chat: [], jawab: false });
        setJalan(false);
        for (let i = 0; i <= kode.length; i += 3) {
          setN(i);
          await tunda(14);
          if (batal) return;
        }
        setN(kode.length);
        await tunda(450);
        setJalan(true);
        await tunda(500);
        setTahap((t) => ({ ...t, jawab: true, log: [akhir.log[0]], chat: [{ ...akhir.chat[0], status: 1 }] }));
        await tunda(900);
        setTahap((t) => ({ ...t, log: akhir.log.slice(0, 2), chat: [{ ...akhir.chat[0], status: 2 }] }));
        await tunda(1300);
        setTahap((t) => ({ ...t, log: akhir.log.slice(0, 3), chat: [{ ...akhir.chat[0], status: 3 }] }));
        await tunda(1400);
        setTahap((t) => ({ ...t, log: akhir.log.slice(0, 4), chat: [...t.chat, akhir.chat[1]] }));
        await tunda(1600);
        setTahap((t) => ({ ...t, log: akhir.log, chat: [...t.chat, akhir.chat[2]] }));
        setJalan(false);
        await tunda(5200);
        if (batal) return;
      }
    })();
    return () => {
      batal = true;
      timer.forEach(clearTimeout);
    };
  }, [kode, teks]);

  // Potong token sampai n karakter (pewarnaan tetap benar saat mengetik).
  const tampil: Token[] = [];
  let sisa = n;
  for (const tk of token.current) {
    if (sisa <= 0) break;
    tampil.push(tk.t.length <= sisa ? tk : { ...tk, t: tk.t.slice(0, sisa) });
    sisa -= tk.t.length;
  }
  const selesai = n >= kode.length;

  return (
    <div ref={akar} className="ld-jendela overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-[#ff5f57]/80" />
          <span className="size-3 rounded-full bg-[#febc2e]/80" />
          <span className="size-3 rounded-full bg-[#28c840]/80" />
        </span>
        <div role="tablist" aria-label="Bahasa contoh" className="flex min-w-0 gap-1 overflow-x-auto">
          {contoh.map((c, i) => (
            <button
              key={c.label}
              type="button"
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
              className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-[12px] transition-colors ${i === tab ? "bg-white/[0.08] text-[#e8f0ec]" : "text-[#93a99f] hover:text-[#e8f0ec]"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="ml-auto hidden font-mono text-[11.5px] text-[#5f7a6e] sm:inline">{contoh[tab].berkas}</span>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="relative border-white/[0.08] lg:border-r">
          <pre className="ld-kode min-h-[300px] overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.75] text-[#e8f0ec] sm:min-h-[340px] sm:p-5 sm:text-[13px]">
            <code>
              {tampil.map((tk, i) => (
                <span key={i} className={tk.k}>
                  {tk.t}
                </span>
              ))}
              {!selesai && <span className="ld-kursor" aria-hidden />}
            </code>
          </pre>
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-2.5 sm:px-5">
            <span className={`font-mono text-[12px] transition-opacity ${tahap.jawab ? "text-[#a6f5cf] opacity-100" : "opacity-0"}`}>
              {teks.respons} {"{"} &quot;id&quot;: &quot;981&quot;, &quot;status&quot;: &quot;antre&quot; {"}"}
            </span>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-all ${jalan ? "scale-95 bg-[#3ddc97] text-[#0b1813] shadow-[0_0_24px_rgba(61,220,151,0.55)]" : "bg-white/[0.06] text-[#e8f0ec]"}`}
            >
              <Play className="size-3.5" aria-hidden />
              {teks.jalankan}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col border-t border-white/[0.08] lg:border-t-0">
          <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-2.5">
            <span className="grid size-7 place-items-center rounded-full bg-[#0aa878]/20 text-[11px] font-bold text-[#3ddc97]">TK</span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold">{teks.pelanggan}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-[#93a99f]">
                <span className="ld-titik-hidup size-1.5 rounded-full bg-[#3ddc97]" /> {teks.online}
              </span>
            </span>
            <span className="ml-auto rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-[#93a99f]">{teks.langsung}</span>
          </div>
          <div className="flex min-h-[176px] flex-1 flex-col justify-end gap-2 bg-[radial-gradient(circle_at_20%_0%,rgba(61,220,151,0.06),transparent_60%)] px-4 py-3" aria-live="polite">
            {tahap.chat.map((c, i) => (
              <div
                key={`${i}-${c.dari}`}
                className={`ld-gelembung max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug ${c.dari === "pelanggan" ? "self-start rounded-bl-md bg-white/[0.07] text-[#e8f0ec]" : "self-end rounded-br-md bg-[#0aa878] text-white"}`}
              >
                {c.dari === "ai" && (
                  <span className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-white/80">
                    <Sparkles className="size-3" aria-hidden /> AI
                  </span>
                )}
                {c.teks}
                {c.status && (
                  <span className="ml-1.5 inline-flex translate-y-0.5 text-white/80">
                    {c.status === 1 ? <Check className="size-3.5" aria-hidden /> : <CheckCheck className={`size-3.5 ${c.status === 3 ? "text-[#9fe2ff]" : ""}`} aria-hidden />}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-white/[0.08] bg-black/25 px-4 py-3 font-mono text-[11.5px] leading-[1.8]">
            {tahap.log.length ? (
              tahap.log.map((l) => (
                <div key={l.waktu} className="ld-gelembung flex gap-3 whitespace-nowrap">
                  <span className="text-[#5f7a6e]">{l.waktu}</span>
                  <span className={`truncate ${l.nada === "ok" ? "text-[#3ddc97]" : l.nada === "ai" ? "text-[#c792ea]" : "text-[#82aaff]"}`}>{l.teks}</span>
                </div>
              ))
            ) : (
              <div className="text-[#5f7a6e]">› {teks.menunggu}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

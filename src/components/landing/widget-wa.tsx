"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Send, Sparkles, X } from "lucide-react";
import { MEREK } from "@/lib/merek";

const NOMOR_WA_DEMO = "62895354873838";
const NOMOR_WA_TAMPIL = "+62 895-3548-73838";

const CONTOH_PESAN = [
  `Halo ${MEREK}, saya mau coba tes secepat apa AI membalas chat ini.`,
  `Halo, boleh jelaskan fitur dan pilihan paket ${MEREK}?`,
  `Halo, saya ingin konsultasi dan coba demo bot WA dulu sebelum daftar.`,
];

function IkonWhatsApp({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.82 14.12c-.24.68-1.41 1.3-1.95 1.38-.5.08-1.13.11-1.83-.11-.42-.13-.97-.31-1.66-.61-2.92-1.26-4.83-4.21-4.97-4.4-.15-.2-1.19-1.58-1.19-3.01 0-1.43.75-2.13 1.02-2.42.26-.29.58-.36.77-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.82 2.01.89 2.15.07.15.12.32.02.51-.1.2-.15.32-.29.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.35 1.45.29.15.46.12.63-.07.17-.2.73-.85.92-1.14.2-.29.39-.24.66-.15.27.1 1.7.8 1.99.95.29.15.49.22.56.34.07.12.07.7-.17 1.38Z" />
    </svg>
  );
}

export function buatUrlWaDemo(pesan?: string): string {
  const teks = (pesan ?? CONTOH_PESAN[0]).trim();
  return `https://wa.me/${NOMOR_WA_DEMO}?text=${encodeURIComponent(teks)}`;
}

export function WidgetWaLanding() {
  const [terbuka, setTerbuka] = useState(false);
  const [pesan, setPesan] = useState(CONTOH_PESAN[0]);

  const urlWa = buatUrlWaDemo(pesan);

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end sm:right-6 sm:bottom-6">
      {terbuka && (
        <div
          role="dialog"
          aria-label="Coba tes WhatsApp AI langsung"
          className="mb-3 w-[calc(100vw-2rem)] max-w-[360px] overflow-hidden rounded-3xl border border-line bg-surface shadow-pop animate-masuk"
        >
          {/* Header Solid */}
          <div className="flex items-start justify-between gap-3 bg-ink px-5 py-4 text-ink-fg">
            <div className="flex items-center gap-3">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-ink-signal text-ink">
                <IkonWhatsApp className="size-5" />
                <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-ink bg-ink-signal" />
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[14px] font-extrabold text-white">Coba Tes Bot WA</p>
                  <span className="rounded-full bg-ink-signal/15 px-2 py-0.5 text-[10.5px] font-bold text-ink-signal">
                    Online 24/7
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[12px] text-ink-muted">{NOMOR_WA_TAMPIL}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTerbuka(false)}
              aria-label="Tutup widget WhatsApp"
              className="rounded-xl p-1.5 text-ink-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {/* Isi Dialog */}
          <div className="space-y-3.5 p-5">
            <div className="rounded-2xl border border-line bg-subtle/60 p-3.5 text-[12.5px] leading-relaxed text-fg">
              <p className="flex items-center gap-1.5 font-bold text-accent">
                <Sparkles className="size-3.5 shrink-0" aria-hidden />
                Uji Coba & Testimoni Langsung
              </p>
              <p className="mt-1 text-muted">
                Ingin membuktikan secepat apa AI membalas pelanggan atau tanya-tanya dulu? Kirim pesan ke nomor WhatsApp resmi kami di bawah ini.
              </p>
            </div>

            <div>
              <p className="text-[11.5px] font-bold tracking-[0.06em] text-muted uppercase">
                Pilih pesan uji coba cepat:
              </p>
              <div className="mt-2 space-y-1.5">
                {CONTOH_PESAN.map((contoh) => {
                  const aktif = pesan === contoh;
                  return (
                    <button
                      key={contoh}
                      type="button"
                      onClick={() => setPesan(contoh)}
                      className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-[12px] transition-colors ${
                        aktif
                          ? "border-accent bg-accent-soft font-semibold text-fg"
                          : "border-line bg-canvas text-muted hover:border-accent/40 hover:text-fg"
                      }`}
                    >
                      <CheckCircle2
                        className={`mt-0.5 size-3.5 shrink-0 ${aktif ? "text-accent" : "text-line-strong"}`}
                        aria-hidden
                      />
                      <span className="leading-snug">{contoh}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="input-wa-landing" className="text-[11.5px] font-bold tracking-[0.06em] text-muted uppercase">
                Atau tulis pesan sendiri:
              </label>
              <textarea
                id="input-wa-landing"
                rows={2}
                value={pesan}
                onChange={(e) => setPesan(e.target.value)}
                placeholder="Ketik pesan untuk dikirim ke WhatsApp..."
                className="field mt-1.5 resize-none py-2 text-[12.5px]"
              />
            </div>

            <a
              href={urlWa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-[13.5px] font-bold text-on-accent transition-transform hover:-translate-y-0.5"
            >
              <Send className="size-4" aria-hidden />
              Kirim & Tes di WhatsApp Sekarang
              <ArrowUpRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      )}

      {/* Tombol Mengambang (Floating Action Button) */}
      <div className="flex items-center gap-2.5">
        {!terbuka && (
          <button
            type="button"
            onClick={() => setTerbuka(true)}
            className="hidden items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2 text-[12.5px] font-bold text-fg shadow-card transition-transform hover:-translate-y-0.5 sm:inline-flex"
          >
            <span className="size-2 rounded-full bg-accent" />
            Coba Tes WA AI · {NOMOR_WA_TAMPIL}
          </button>
        )}

        <button
          type="button"
          onClick={() => setTerbuka((v) => !v)}
          aria-expanded={terbuka}
          aria-label={terbuka ? "Tutup widget WhatsApp" : `Coba tes chat WhatsApp ${NOMOR_WA_TAMPIL}`}
          className="group inline-flex items-center gap-2.5 rounded-full bg-accent px-4 py-3.5 text-[13.5px] font-bold text-on-accent shadow-pop transition-transform hover:-translate-y-0.5"
        >
          {terbuka ? (
            <>
              <X className="size-5" aria-hidden />
              <span>Tutup</span>
            </>
          ) : (
            <>
              <IkonWhatsApp className="size-5" />
              <span>Coba Tes Bot WA</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export { NOMOR_WA_DEMO, NOMOR_WA_TAMPIL };

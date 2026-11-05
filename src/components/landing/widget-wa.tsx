"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Send, Sparkles, X } from "lucide-react";
import { useBahasa } from "@/components/bahasa";
import { IkonWhatsApp } from "@/components/ikon-whatsapp";
import type { T } from "@/lib/bahasa";
import { MEREK, NOMOR_WA_DEMO } from "@/lib/merek";

const contohPesan = (t: T) => [
  t(`Halo ${MEREK}, saya mau coba tes secepat apa AI membalas chat ini.`, `Hi ${MEREK}, I'd like to see how fast the AI replies to this chat.`),
  t(`Halo, boleh jelaskan fitur dan pilihan paket ${MEREK}?`, `Hi, could you walk me through ${MEREK}'s features and plans?`),
  t(`Halo, saya ingin konsultasi dan coba demo bot WA dulu sebelum daftar.`, `Hi, I'd like to ask a few questions and try the WhatsApp bot demo before signing up.`),
];

export function WidgetWaLanding() {
  const { t } = useBahasa();
  const CONTOH_PESAN = contohPesan(t);
  const [terbuka, setTerbuka] = useState(false);
  const [pesan, setPesan] = useState(CONTOH_PESAN[0]);

  const urlWa = `https://wa.me/${NOMOR_WA_DEMO}?text=${encodeURIComponent(pesan.trim() || CONTOH_PESAN[0])}`;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end sm:right-6 sm:bottom-6">
      {terbuka && (
        <div
          role="dialog"
          aria-label={t("Coba tes WhatsApp AI langsung", "Try the WhatsApp AI live")}
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
                  <p className="text-[14px] font-extrabold text-white">{t("Coba Tes Bot WA", "Try the WA Bot")}</p>
                  <span className="rounded-full bg-ink-signal/15 px-2 py-0.5 text-[10.5px] font-bold text-ink-signal">
                    Online 24/7
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-ink-muted">
                  <IkonWhatsApp className="size-3.5 text-ink-signal" /> Customer Service
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTerbuka(false)}
              aria-label={t("Tutup widget WhatsApp", "Close WhatsApp widget")}
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
                {t("Uji Coba & Testimoni Langsung", "Live test drive")}
              </p>
              <p className="mt-1 text-muted">
                {t(
                  "Ingin membuktikan secepat apa AI membalas pelanggan atau tanya-tanya dulu? Kirim pesan ke Customer Service WhatsApp kami.",
                  "Want to see for yourself how fast the AI replies, or just have a few questions? Message our WhatsApp customer service.",
                )}
              </p>
            </div>

            <div>
              <p className="text-[11.5px] font-bold tracking-[0.06em] text-muted uppercase">
                {t("Pilih pesan uji coba cepat:", "Pick a quick test message:")}
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
                {t("Atau tulis pesan sendiri:", "Or write your own:")}
              </label>
              <textarea
                id="input-wa-landing"
                rows={2}
                value={pesan}
                onChange={(e) => setPesan(e.target.value)}
                placeholder={t("Ketik pesan untuk dikirim ke WhatsApp...", "Type a message to send on WhatsApp...")}
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
              {t("Kirim & Tes di WhatsApp Sekarang", "Send & test on WhatsApp now")}
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
            <IkonWhatsApp className="size-4 text-accent" />
            Customer Service
          </button>
        )}

        <button
          type="button"
          onClick={() => setTerbuka((v) => !v)}
          aria-expanded={terbuka}
          aria-label={terbuka ? t("Tutup widget WhatsApp", "Close WhatsApp widget") : t("Chat Customer Service di WhatsApp", "Chat with customer service on WhatsApp")}
          className="group inline-flex items-center gap-2.5 rounded-full bg-accent px-4 py-3.5 text-[13.5px] font-bold text-on-accent shadow-pop transition-transform hover:-translate-y-0.5"
        >
          {terbuka ? (
            <>
              <X className="size-5" aria-hidden />
              <span>{t("Tutup", "Close")}</span>
            </>
          ) : (
            <>
              <IkonWhatsApp className="size-5" />
              <span>{t("Coba Tes Bot WA", "Try the WA Bot")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

import { Brain, GraduationCap, Hand, ShieldBan, Sparkles, Timer } from "lucide-react";
import { teksHalaman } from "@/lib/bahasa-halaman";

/**
 * Keunggulan mesin (fakta dari kode: penyaring prospek ML lokal ±6 ms/pesan, aktif setelah presisi ≥ 97%, "ragu =
 * balas"; spam judi dikenali tanpa AI; belajar dari balasan admin; antrean anti-blokir + Idempotency-Key; bot jeda saat
 * admin membalas). Visual murni CSS: batang skor terisi saat bagian terlihat (.ld-muncul.terlihat).
 */
export async function Keunggulan() {
  const { t } = await teksHalaman();
  const chat = [
    { teks: t("Kak, paket hemat buat 50 orang masih ada?", "Is the 50-person budget package still available?"), skor: 0.96, prospek: true },
    { teks: "wkwk p", skor: 0.06, prospek: false },
    { teks: t("Ongkir ke Bekasi berapa ya?", "How much is shipping to Bekasi?"), skor: 0.91, prospek: true },
    { teks: t("tes tes 123", "test test 123"), skor: 0.04, prospek: false },
  ];
  return (
    <section className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6 sm:pb-32">
      <div className="ld-muncul max-w-[760px]">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#3ddc97]/25 bg-[#3ddc97]/[0.07] px-3 py-1 font-mono text-[11.5px] text-[#3ddc97]">
          <Sparkles className="size-3.5" aria-hidden /> {t("Bukan bot WhatsApp biasa", "Not your average WhatsApp bot")}
        </span>
        <h2 className="mt-5 text-[36px] leading-[1.06] font-bold tracking-[-0.03em] sm:text-[52px]">
          <span className="ld-kilau">{t("Cukup pintar untuk menjawab.", "Smart enough to answer.")}</span>
          <br />
          <span className="ld-kilau-hijau">{t("Lebih pintar untuk tahu kapan diam.", "Smarter about when to stay quiet.")}</span>
        </h2>
        <p className="mt-5 max-w-[620px] text-[16px] leading-relaxed text-[#93a99f] sm:text-[17px]">
          {t(
            "Kecerdasan yang biasanya butuh tim data sendiri sudah tertanam di mesin: token AI dipakai hanya untuk calon pembeli, nomor tetap sehat, dan bot makin pintar setiap hari.",
            "Intelligence that usually needs its own data team is built into the engine: AI tokens go only to real buyers, numbers stay healthy, and the bot gets smarter every day.",
          )}
        </p>
      </div>

      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        {/* Penyaring prospek ML */}
        <article className="ld-muncul relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.035] to-transparent p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Brain className="size-5 text-[#3ddc97]" aria-hidden />
            <h3 className="text-[18px] font-semibold tracking-tight">{t("Penyaring prospek machine learning", "Machine-learning lead filter")}</h3>
            <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-[#93a99f]">{t("lokal · ±6 ms/pesan", "local · ~6 ms/msg")}</span>
          </div>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#93a99f]">
            {t(
              "Model ML berjalan langsung di mesin Anda dan menilai setiap chat sebelum AI bekerja. Calon pembeli langsung dilayani, chat iseng dan bot dibisukan otomatis. Tanpa panggilan API tambahan dan tanpa label manual: model belajar sendiri dari percakapan nyata, dan baru bertugas setelah lolos uji presisi 97%.",
              "An ML model runs right inside your engine and scores every chat before the AI kicks in. Real buyers get served instantly; idle chatter and bots are muted automatically. No extra API calls, no manual labels: it learns from real conversations and only goes live after passing a 97% precision test.",
            )}
          </p>
          <ul className="mt-6 space-y-2.5">
            {chat.map((c) => (
              <li key={c.teks} className="rounded-xl border border-white/[0.06] bg-black/25 px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="truncate text-[#e8f0ec]">{c.teks}</span>
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] ${c.prospek ? "bg-[#3ddc97]/15 text-[#3ddc97]" : "bg-white/[0.06] text-[#93a99f]"}`}>
                    {c.prospek ? t("dilayani AI", "served by AI") : t("dibisukan", "muted")}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className={`ld-batang block h-full rounded-full ${c.prospek ? "bg-[#3ddc97]" : "bg-[#5f7a6e]"}`} style={{ "--n": c.skor } as React.CSSProperties} />
                  </span>
                  <span className="w-9 text-right font-mono text-[11px] text-[#93a99f] tabular-nums">{c.skor.toFixed(2)}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[11px] text-[#5f7a6e]">{t("prinsip: ragu = tetap dibalas, pelanggan tidak pernah terlewat", "rule: when in doubt, reply. No customer is ever missed")}</p>
        </article>

        {/* Tameng spam judi */}
        <article className="ld-muncul relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.035] to-transparent p-6 sm:p-7" style={{ "--tunda": "90ms" } as React.CSSProperties}>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldBan className="size-5 text-[#3ddc97]" aria-hidden />
            <h3 className="text-[18px] font-semibold tracking-tight">{t("Tameng spam judi online", "Online-gambling spam shield")}</h3>
            <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-[#93a99f]">{t("tanpa AI · 0 token", "no AI · 0 tokens")}</span>
          </div>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#93a99f]">
            {t(
              "Promosi judi online dan pesan sampah dikenali sebelum menyentuh AI, lalu tidak pernah dibalas. Kuota token utuh untuk pelanggan sungguhan, dan setiap kasus tetap tercatat dengan tanda Spam untuk audit.",
              "Gambling promos and junk messages are caught before they touch the AI, and never get a reply. Your token budget stays for real customers, and every case is still logged with a Spam tag for auditing.",
            )}
          </p>
          <div className="mt-6 space-y-2.5">
            <div className="relative w-[88%] rounded-2xl rounded-bl-md border border-[#ff9aa9]/25 bg-[#ff9aa9]/[0.06] px-3.5 py-2.5 text-[13px] text-[#e8f0ec]/70">
              <span className="line-through decoration-[#ff9aa9]/70">SL0T GAC0R hari ini maxwin x500 💰 daftar sekarang bit.ly/…</span>
              <span className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-[#ff9aa9] no-underline">
                <ShieldBan className="size-3.5" aria-hidden /> {t("SPAM · tidak dibalas · 0 token", "SPAM · no reply · 0 tokens")}
              </span>
            </div>
            <div className="w-[80%] rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-[#e8f0ec]">
              {t("Kak, bolu pandan ready hari ini?", "Is the pandan cake ready today?")}
            </div>
            <div className="ml-auto w-[78%] rounded-2xl rounded-br-md bg-[#0aa878] px-3.5 py-2.5 text-[13px] text-white">
              {t("Ready kak! Mau diambil jam berapa? 😊", "It's ready! What time would you like to pick it up? 😊")}
            </div>
          </div>
          <p className="mt-6 text-[12.5px] text-[#93a99f]">{t("Juga tersedia sebagai endpoint untuk menyaring teks di aplikasi Anda:", "Also available as an endpoint to screen text in your own app:")}</p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/30 px-3.5 py-3 font-mono text-[12px] leading-[1.7] text-[#e8f0ec]">
            <span className="text-[#c792ea]">POST</span> /api/v1/alat/cek-spam{"\n"}
            <span className="text-[#5f7a6e]">{"{ "}</span>
            <span className="text-[#a6f5cf]">&quot;spam&quot;</span>: <span className="text-[#f9c784]">true</span>, <span className="text-[#a6f5cf]">&quot;skor&quot;</span>: <span className="text-[#f9c784]">7</span>,{" "}
            <span className="text-[#a6f5cf]">&quot;alasan&quot;</span>: <span className="text-[#a6f5cf]">&quot;Promosi judi online&quot;</span>
            <span className="text-[#5f7a6e]">{" }"}</span>
          </pre>
        </article>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            ikon: GraduationCap,
            judul: t("Belajar dari admin", "Learns from your team"),
            isi: t("Balas sekali dari HP, AI mengingatnya. Pertanyaan serupa berikutnya dijawab dengan gaya bahasa bisnis Anda sendiri.", "Reply once from your phone and the AI remembers. Similar questions get answered in your own brand voice."),
          },
          {
            ikon: Timer,
            judul: t("Antrean anti-blokir", "Anti-ban queue"),
            isi: t("Ritme kirim diatur otomatis, kontak baru per hari dibatasi, dan Idempotency-Key mencegah pesan ganda. Nomor tetap sehat.", "Send rhythm is paced automatically, new contacts per day are capped, and Idempotency-Key prevents duplicates. Your number stays healthy."),
          },
          {
            ikon: Hand,
            judul: t("Tahu kapan mundur", "Knows when to step back"),
            isi: t("Begitu admin ikut membalas, bot otomatis jeda di chat itu. Pelanggan tidak pernah dijawab dua kali.", "The moment a human replies, the bot pauses in that chat. Customers never get answered twice."),
          },
        ].map((x, i) => (
          <article key={x.judul} className="ld-muncul rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.16]" style={{ "--tunda": `${i * 80}ms` } as React.CSSProperties}>
            <x.ikon className="size-5 text-[#3ddc97]" aria-hidden />
            <h3 className="mt-4 text-[16.5px] font-semibold tracking-tight">{x.judul}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#93a99f]">{x.isi}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

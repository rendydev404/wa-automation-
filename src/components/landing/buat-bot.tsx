"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Loader2, RotateCcw, SendHorizontal, Sparkles, Wand2 } from "lucide-react";
import Link from "@/components/link";
import { useBahasa } from "@/components/bahasa";
import { BATAS_DEMO, contohIsian, pertanyaanPancingan } from "@/lib/demo-bot-def";
import { JENIS_USAHA, type KunciUsaha, jenisUsahaSah } from "@/lib/templat-usaha";

interface Pesan {
  ai: boolean;
  teks: string;
}

const SIMPAN = "cg_demo_isian";
const DAFTAR_JENIS = Object.keys(JENIS_USAHA) as KunciUsaha[];

/** Isian tersimpan di browser, atau jenis usaha dari LP industri (localStorage cg_industry). Komponen ini hanya dirender di browser (ssr: false). */
function bacaAwal(): { jenis: KunciUsaha | null; nama: string; produk: string; info: string } {
  const kosong = { jenis: null, nama: "", produk: "", info: "" };
  try {
    const s = JSON.parse(localStorage.getItem(SIMPAN) ?? "null") as { jenis?: string; nama?: string; produk?: string; info?: string } | null;
    if (s && jenisUsahaSah(s.jenis)) return { jenis: s.jenis, nama: s.nama ?? "", produk: s.produk ?? "", info: s.info ?? "" };
    const ind = localStorage.getItem("cg_industry");
    return { ...kosong, jenis: jenisUsahaSah(ind) ? ind : null };
  } catch {
    return kosong;
  }
}

/**
 * "Buat bot Anda dalam 60 detik": pengunjung memilih jenis usaha, mengisi nama + produk/harga, lalu mengobrol dengan
 * AI yang menjawab dari isian itu (/api/demo-bot). Isian disimpan sebagai draf di server (cookie cg_draf) dan menjadi
 * nomor pertama + Informasi Usaha begitu pengunjung mendaftar. Isian juga diingat di browser (localStorage) supaya
 * tidak hilang saat halaman dimuat ulang.
 */
export function BuatBot() {
  const { b, t } = useBahasa();
  const [awal] = useState(bacaAwal);
  const [jenis, setJenis] = useState<KunciUsaha | null>(awal.jenis);
  const [nama, setNama] = useState(awal.nama);
  const [produk, setProduk] = useState(awal.produk);
  const [info, setInfo] = useState(awal.info);
  const [chat, setChat] = useState<Pesan[]>([]);
  const [mulai, setMulai] = useState(false);
  const [ketik, setKetik] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [batas, setBatas] = useState(false);
  const [sisa, setSisa] = useState<number>(BATAS_DEMO.perPengunjung);
  const bawah = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jenis) return;
    try {
      localStorage.setItem(SIMPAN, JSON.stringify({ jenis, nama, produk, info }));
    } catch {}
  }, [jenis, nama, produk, info]);
  useEffect(() => {
    bawah.current?.scrollIntoView({ block: "nearest" });
  }, [chat, memuat]);

  const siap = !!jenis && nama.trim().length >= 2 && produk.trim().length >= 5;
  const j = jenis ? JENIS_USAHA[jenis] : null;
  const istilah = j ? (b === "en" ? j.en.istilah : j.istilah) : t("PRODUK & HARGA", "PRODUCTS & PRICES");
  const istilahRapi = istilah.charAt(0) + istilah.slice(1).toLowerCase();

  function pakaiContoh() {
    const k = jenis ?? "kuliner";
    const c = contohIsian(k, b);
    setJenis(k);
    setNama(c.nama);
    setProduk(c.produk);
    setInfo(c.info);
  }

  function coba() {
    if (!siap) return;
    setMulai(true);
    setChat([]);
    setGalat("");
    // HP: panel chat ada di bawah formulir, jadi langsung digulir ke sana.
    if (window.matchMedia("(max-width: 1023px)").matches) setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function kirim(teks: string) {
    const isi = teks.trim();
    if (!isi || memuat || !siap || batas) return;
    const riwayat = chat;
    setChat([...riwayat, { ai: false, teks: isi }]);
    setKetik("");
    setGalat("");
    setMemuat(true);
    try {
      const r = await fetch("/api/demo-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isian: { jenis, nama, produk, info }, pesan: isi, riwayat, en: b === "en" }),
      });
      const d = (await r.json().catch(() => ({}))) as { teks?: string; sisa?: number; abaikan?: boolean; batas?: string; error?: string };
      if (r.status === 429 || d.batas) {
        setBatas(true);
        return;
      }
      if (!r.ok) {
        setGalat(d.error ?? t("Gagal menghubungi AI. Coba lagi.", "Couldn't reach the AI. Please try again."));
        return;
      }
      if (typeof d.sisa === "number") setSisa(d.sisa);
      setChat((c) => [...c, { ai: true, teks: d.abaikan || !d.teks ? t("(AI menilai pesan ini tidak perlu dibalas.)", "(The AI decided this message doesn't need a reply.)") : d.teks! }]);
    } catch {
      setGalat(t("Koneksi terputus. Coba lagi.", "Connection lost. Please try again."));
    } finally {
      setMemuat(false);
    }
  }

  const sudahDibalas = chat.some((m) => m.ai);
  const inisial = (nama.replace(/\((contoh|sample)\)/gi, "").trim() || "AI")
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-10">
      {/* ---------- Isian ---------- */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <p className="text-[13px] font-bold text-accent">1 · {t("Pilih jenis usaha", "Pick your business type")}</p>
        <div role="radiogroup" aria-label={t("Jenis usaha", "Business type")} className="mt-3 flex flex-wrap gap-2">
          {DAFTAR_JENIS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={jenis === k}
              onClick={() => setJenis(k)}
              data-cta="demo_jenis"
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                jenis === k ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-fg hover:border-line-strong"
              }`}
            >
              <span aria-hidden>{JENIS_USAHA[k].ikon}</span> {b === "en" ? JENIS_USAHA[k].en.label : JENIS_USAHA[k].label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-bold text-accent">2 · {t("Isi info singkat", "Add a few details")}</p>
          <button type="button" onClick={pakaiContoh} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline" data-cta="demo_contoh">
            <Wand2 className="size-3.5" aria-hidden /> {t("Isi dengan contoh", "Fill with a sample")}
          </button>
        </div>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="demo-nama" className="label">
              {t("Nama usaha", "Business name")}
            </label>
            <input id="demo-nama" value={nama} onChange={(e) => setNama(e.target.value)} maxLength={BATAS_DEMO.nama} className="field" placeholder={t("mis. Laundry Melati", "e.g. Melati Laundry")} />
          </div>
          <div>
            <label htmlFor="demo-produk" className="label">
              {istilahRapi} {t("(satu per baris)", "(one per line)")}
            </label>
            <textarea
              id="demo-produk"
              value={produk}
              onChange={(e) => setProduk(e.target.value)}
              maxLength={BATAS_DEMO.produk}
              rows={4}
              className="field resize-y"
              placeholder={t("Nama produk/layanan + harga\nNama produk/layanan + harga", "Product/service name + price\nProduct/service name + price")}
            />
          </div>
          <div>
            <label htmlFor="demo-info" className="label">
              {t("Jam buka, alamat, cara pesan", "Opening hours, address, how to order")} <span className="font-normal text-muted">({t("opsional", "optional")})</span>
            </label>
            <textarea id="demo-info" value={info} onChange={(e) => setInfo(e.target.value)} maxLength={BATAS_DEMO.info} rows={2} className="field resize-y" />
          </div>
        </div>
        <button type="button" onClick={coba} disabled={!siap} className="btn btn-primary mt-5 w-full sm:w-auto" data-cta="demo_coba">
          <Sparkles className="size-4" aria-hidden /> {mulai ? t("Perbarui bot saya", "Update my bot") : t("Coba bot saya", "Try my bot")}
        </button>
        {!siap && <p className="mt-2 text-[12.5px] text-muted">{t("Pilih jenis usaha, isi nama usaha dan minimal satu produk/layanan.", "Pick a business type, then add a name and at least one product/service.")}</p>}
      </div>

      {/* ---------- Chat ---------- */}
      <div ref={panel} className="scroll-mt-6">
        <div className="overflow-hidden rounded-3xl border border-line shadow-card">
          <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20 text-[14px] font-bold">{inisial}</span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{nama.trim() || t("Bot usaha Anda", "Your business bot")}</p>
              <p className="text-[12px] text-white/75">{mulai ? t("online · dibalas AI ChatGerCep", "online · answered by ChatGerCep AI") : t("menunggu info usaha", "waiting for business info")}</p>
            </div>
          </div>
          <div className="h-[360px] space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4 sm:h-[400px]" aria-live="polite">
            {!mulai ? (
              <div className="mx-auto mt-16 max-w-[260px] rounded-2xl bg-white/80 p-4 text-center text-[13px] text-[#3b4a54]">
                <Bot className="mx-auto mb-2 size-7 text-[#075e54]" aria-hidden />
                {t("Isi info usaha, tekan “Coba bot saya”, lalu tanya bot Anda seperti pelanggan.", "Add your business info, press “Try my bot”, then ask your bot like a customer would.")}
              </div>
            ) : (
              <>
                <p className="mx-auto w-fit rounded-lg bg-[#fff5c4] px-3 py-1.5 text-center text-[11.5px] text-[#54656f]">
                  {t("Anda berperan sebagai pelanggan. AI menjawab hanya dari info yang Anda isi.", "You play the customer. The AI answers only from the info you entered.")}
                </p>
                {chat.map((m, i) => (
                  <div key={i} className={`flex ${m.ai ? "justify-start" : "justify-end"}`}>
                    <p className={`max-w-[85%] rounded-xl px-3 py-2 text-[14px] leading-snug whitespace-pre-wrap text-[#111b21] shadow-sm ${m.ai ? "rounded-tl-none bg-white" : "rounded-tr-none bg-[#d9fdd3]"}`}>{m.teks}</p>
                  </div>
                ))}
                {memuat && (
                  <div className="flex justify-start">
                    <p className="inline-flex items-center gap-2 rounded-xl rounded-tl-none bg-white px-3 py-2 text-[13px] text-[#54656f] shadow-sm">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t("mengetik…", "typing…")}
                    </p>
                  </div>
                )}
              </>
            )}
            <div ref={bawah} />
          </div>
          {mulai && !batas && (
            <div className="border-t border-line bg-surface p-3">
              {!chat.length && jenis && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pertanyaanPancingan(jenis, b).map((q) => (
                    <button key={q} type="button" onClick={() => kirim(q)} disabled={memuat} className="rounded-full border border-line px-3 py-1 text-[12.5px] font-medium hover:border-accent hover:text-accent" data-cta="demo_pancingan">
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void kirim(ketik);
                }}
                className="flex gap-2"
              >
                <input
                  value={ketik}
                  onChange={(e) => setKetik(e.target.value)}
                  maxLength={BATAS_DEMO.pesan}
                  className="field flex-1"
                  placeholder={t("Tanya seperti pelanggan…", "Ask like a customer…")}
                  aria-label={t("Pesan ke bot", "Message to the bot")}
                />
                <button type="submit" disabled={memuat || !ketik.trim()} className="btn btn-primary shrink-0 px-3" aria-label={t("Kirim", "Send")}>
                  <SendHorizontal className="size-4" aria-hidden />
                </button>
              </form>
              {galat && <p className="mt-2 text-[12.5px] text-danger">{galat}</p>}
              {sudahDibalas && <p className="mt-2 text-[11.5px] text-muted">{t(`Sisa ${sisa} pesan uji gratis hari ini.`, `${sisa} free test ${sisa === 1 ? "message" : "messages"} left today.`)}</p>}
            </div>
          )}
        </div>

        {(sudahDibalas || batas) && (
          <div className="mt-4 rounded-3xl border border-accent/30 bg-accent-soft p-5">
            <p className="flex items-center gap-2 text-[15px] font-bold text-fg">
              <Sparkles className="size-4 text-accent" aria-hidden />
              {batas ? t("Batas uji gratis di halaman ini habis", "You've used today's free tests on this page") : t("Bot Anda sudah jadi!", "Your bot is ready!")}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {t(
                "Simpan sekarang: info usaha yang tadi Anda isi ikut tersimpan di akun, tinggal scan QR dan AI langsung membalas pelanggan sungguhan di WhatsApp Anda.",
                "Save it now: the business info you just entered is saved to your account. Just scan the QR code and the AI starts replying to real customers on your WhatsApp.",
              )}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href="/daftar" className="btn btn-primary" data-cta="demo_simpan">
                {t("Simpan & sambungkan WhatsApp", "Save & connect WhatsApp")} <ArrowRight className="size-4" aria-hidden />
              </Link>
              {!batas && (
                <button type="button" onClick={() => setChat([])} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-fg">
                  <RotateCcw className="size-3.5" aria-hidden /> {t("Ulangi obrolan", "Restart chat")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

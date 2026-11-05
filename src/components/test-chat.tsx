"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, Send, X } from "lucide-react";
import { useBahasa } from "./bahasa";

interface Gelembung {
  /** info = AI sengaja tidak membalas (spam); tidak ikut riwayat uji. */
  dari: "saya" | "bot" | "galat" | "info";
  teks: string;
  meta?: string;
  foto?: string;
}

const sesiBaru = () => Math.random().toString(36).slice(2, 14).padEnd(8, "0");

const MODE = {
  kosong: { id: "tanpa knowledge", en: "no knowledge" },
  utuh: { id: "knowledge utuh", en: "full knowledge" },
  relevan: { id: "potongan relevan", en: "relevant excerpts" },
} as const;
/** Penilaian AI atas pesan uji (penyaring prospek). */
const NILAI = {
  prospek: { id: "dinilai prospek", en: "judged a lead" },
  netral: { id: "dinilai netral", en: "judged neutral" },
  selesai: { id: "dinilai penutup", en: "judged a closing message" },
  bukan: { id: "dinilai bukan prospek", en: "judged not a lead" },
} as const;

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
  const { b, t } = useBahasa();

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
          // Percakapan uji sejauh ini: dipakai mesin AI yang tidak menyimpan ingatan sesi.
          riwayat: pesan.filter((g) => g.dari === "saya" || g.dari === "bot").slice(-12).map((g) => ({ ai: g.dari === "bot", teks: g.teks })),
          ...(lampiran ? { foto: lampiran } : {}),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { teks?: string; ms?: number; mode?: keyof typeof MODE; pelajaran?: number; diblokir?: boolean; error?: string; abaikan?: string; selesai?: boolean; nilai?: keyof typeof NILAI | null; katalog?: { daftar: string; foto: { id: number; caption: string }[] } | null };
      if (res.ok && d.abaikan) {
        setPesan((p) => [
          ...p,
          {
            dari: "info",
            teks: t(
              `Tidak dibalas: terdeteksi spam. ${d.abaikan}. Di WhatsApp pesan ini hanya tercatat di histori dengan tanda Spam.`,
              `Not answered: detected as spam. ${d.abaikan}. On WhatsApp this message is only logged in the history with a Spam tag.`,
            ),
          },
        ]);
      } else if (res.ok && d.selesai) {
        setPesan((p) => [
          ...p,
          {
            dari: "info",
            teks: t(
              "Tidak dibalas: AI menilai ini ucapan penutup dan urusannya sudah tuntas, jadi tidak perlu dijawab.",
              "Not answered: AI judged this a closing message and the matter is settled, so no reply is needed.",
            ),
          },
        ]);
      } else if (res.ok && d.teks) {
        lalu.current = isi;
        const detik = ((d.ms ?? 0) / 1000).toFixed(1);
        const meta = [
          t(`${detik.replace(".", ",")} dtk`, `${detik} s`),
          MODE[d.mode ?? "kosong"][b],
          d.pelajaran ? t(`${d.pelajaran} balasan admin`, `${d.pelajaran} admin ${d.pelajaran === 1 ? "reply" : "replies"}`) : "",
          d.diblokir ? t("kode diblokir", "code blocked") : "",
          d.nilai ? NILAI[d.nilai][b] : "",
        ]
          .filter(Boolean)
          .join(" · ");
        // Katalog: di WhatsApp dikirim sebagai pesan terpisah setelah jawaban (daftar, lalu foto + nama + harga).
        const kat = d.katalog;
        const kiriman: Gelembung[] = kat ? [...(kat.daftar ? [{ dari: "bot" as const, teks: kat.daftar }] : []), ...kat.foto.map((f) => ({ dari: "bot" as const, teks: f.caption, foto: `/api/katalog/foto?id=${f.id}` }))] : [];
        setPesan((p) => [...p, { dari: "bot", teks: d.teks!, meta }, ...kiriman]);
      } else setPesan((p) => [...p, { dari: "galat", teks: d.error ?? t(`Gagal (HTTP ${res.status}).`, `Failed (HTTP ${res.status}).`) }]);
    } catch {
      setPesan((p) => [...p, { dari: "galat", teks: t("Koneksi terputus.", "Connection lost.") }]);
    } finally {
      setTunggu(false);
    }
  }

  return (
    <section className="card flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">{t("Uji bot", "Test the bot")}</h2>
          <p className="hint mt-0.5">{t("Sama persis dengan jawaban di WhatsApp, tanpa mengirim pesan.", "Exactly the same answers as on WhatsApp, without sending any message.")}</p>
        </div>
        <button
          type="button"
          aria-label={t("Mulai percakapan baru", "Start a new conversation")}
          title={t("Mulai percakapan baru", "Start a new conversation")}
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

      <div className="flex h-[26rem] flex-col gap-2 overflow-y-auto bg-subtle/40 px-4 py-4 lg:h-[30rem]" aria-live="polite">
        {pesan.length === 0 && !tunggu && <p className="m-auto max-w-56 text-center text-[13px] text-faint">
            {t("Coba tanyakan sesuatu yang ada di base knowledge, lalu yang tidak ada.", "Ask something that's in your product knowledge, then something that isn't.")}
          </p>}
        {pesan.map((g, i) => (
          <div key={i} className={`max-w-[85%] animate-masuk ${g.dari === "saya" ? "self-end" : "self-start"}`}>
            <div
              className={`rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${
                g.dari === "saya" ? "rounded-br-md bg-accent text-on-accent" : g.dari === "bot" ? "rounded-bl-md border border-line bg-surface" : g.dari === "info" ? "border border-dashed border-line-strong bg-surface text-[12.5px] text-muted" : "bg-danger-soft text-danger"
              }`}
            >
              {g.foto && (
                // eslint-disable-next-line @next/next/no-img-element -- data URL lokal / foto katalog privat, bukan aset yang perlu dioptimasi
                <img src={g.foto} alt={g.dari === "bot" ? t("Foto produk", "Product photo") : t("Foto uji", "Test photo")} className={`max-h-48 rounded-lg object-cover ${g.teks ? "mb-1.5" : ""}`} />
              )}
              {g.dari === "bot" ? <TeksWa teks={g.teks} /> : g.teks}
            </div>
            {g.meta && <p className="mt-1 pl-1 text-[11px] text-faint">{g.meta}</p>}
          </div>
        ))}
        {tunggu && (
          <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2 text-[13px] text-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t("mengetik…", "typing…")}
          </div>
        )}
        <div ref={bawah} />
      </div>

      <form onSubmit={kirim} className="border-t border-line p-3">
        {foto && (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau data URL lokal */}
            <img src={foto} alt={t("Foto yang akan dikirim", "Photo to send")} className="size-14 rounded-lg object-cover" />
            <button type="button" onClick={() => setFoto(null)} aria-label={t("Batalkan foto", "Remove photo")} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-fg">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputFoto.current?.click()}
            disabled={tunggu}
            aria-label={t("Lampirkan foto", "Attach photo")}
            title={t("Lampirkan foto", "Attach photo")}
            className="btn btn-ghost h-auto w-11 shrink-0 px-0"
          >
            <ImagePlus className="size-4" aria-hidden />
          </button>
          <input
            ref={inputFoto}
            type="file"
            aria-label={t("Lampirkan foto", "Attach photo")}
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
                setPesan((p) => [...p, { dari: "galat", teks: t("Foto tidak bisa dibaca.", "Couldn't read the photo.") }]);
              }
            }}
          />
          <input value={teks} onChange={(e) => setTeks(e.target.value)} maxLength={2000} placeholder={
              foto
                ? t("Keterangan foto (opsional)…", "Photo caption (optional)…")
                : t("Tulis pesan seperti orang yang chat ke nomor ini…", "Write a message as if you were a customer chatting this number…")
            }
            aria-label={t("Pesan uji", "Test message")} className="field" />
          <button type="submit" disabled={tunggu || (!teks.trim() && !foto)} aria-label={t("Kirim", "Send")} className="btn btn-primary h-auto w-11 shrink-0 px-0">
            <Send className="size-4" aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { angka } from "@/lib/format";
import { MAKS_INSTRUKSI, TEMPLAT_AI, sisaPenanda, slugTemplatSah } from "@/lib/templat-ai-def";
import { useBahasa } from "./bahasa";

/**
 * Kolom "Instruksi khusus" nomor + pemilih template AI per jenis usaha (sama dengan langkah 4 di landing page industri).
 * Template dimuat saat tombol ditekan (bukan bersama halaman). Pengunjung yang datang dari LP industri sudah terpilih
 * jenis usahanya (localStorage `cg_industry`, ditulis lp.js). Penanda [...] yang belum diganti ditampilkan di sini dan
 * ditolak saat disimpan (ubahNomorAction), supaya isian contoh tidak terbaca AI sebagai fakta.
 */
export function InstruksiNomor({ awal }: { awal: string }) {
  const { b, t } = useBahasa();
  const [teks, setTeks] = useState(awal);
  const [jenis, setJenis] = useState("");
  const [tanya, setTanya] = useState(false); // konfirmasi menimpa isi yang sudah ada
  const [muat, setMuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const dariLp = localStorage.getItem("cg_industry");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nilai awal dari localStorage hanya bisa dibaca setelah hidrasi
      if (slugTemplatSah(dariLp)) setJenis(dariLp);
    } catch {
      /* penyimpanan diblokir: pilih manual */
    }
  }, []);

  const penanda = sisaPenanda(teks);

  async function pakai() {
    setTanya(false);
    setGalat(null);
    setMuat(true);
    try {
      const r = await fetch(`/api/templat-ai?jenis=${encodeURIComponent(jenis)}`);
      const d = (await r.json().catch(() => ({}))) as { teks?: string; error?: string };
      if (!r.ok || !d.teks) throw new Error(d.error || t("Template gagal dimuat. Coba lagi.", "Couldn't load the template. Try again."));
      setTeks(d.teks);
      // Arahkan langsung ke isian pertama yang perlu diganti.
      requestAnimationFrame(() => {
        const el = area.current;
        if (!el) return;
        const i = d.teks!.indexOf("[");
        el.focus();
        if (i >= 0) el.setSelectionRange(i, d.teks!.indexOf("]", i) + 1);
        el.scrollTop = 0;
      });
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e));
    } finally {
      setMuat(false);
    }
  }

  return (
    <div>
      <label htmlFor="instruksi" className="label">
        {t("Instruksi khusus", "Custom instructions")} <span className="font-normal text-faint">{t("(opsional)", "(optional)")}</span>
      </label>

      <div className="mb-3 rounded-2xl border border-line bg-subtle/60 p-3.5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles className="size-4 text-accent" aria-hidden /> {t("Template AI per jenis usaha", "AI template by business type")}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {t(
            "Gaya bicara, pertanyaan untuk calon pembeli, kapan diserahkan ke admin, dan larangan mengarang harga sudah disiapkan. Pilih, lalu ganti semua bagian [ ... ] dengan data usaha Anda.",
            "Tone, questions for prospects, when to hand over to an admin, and rules against making up prices are ready. Pick one, then replace every [ ... ] with your business details (templates are in Indonesian).",
          )}
        </p>
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <select
            // Bukan bagian data yang disimpan: dilepas dari form supaya reset form setelah Simpan (React 19) tidak
            // mengosongkan pilihan di layar sementara state masih berisi jenis usaha.
            form="templat-ai-bukan-form"
            aria-label={t("Jenis usaha", "Business type")}
            value={jenis}
            onChange={(e) => {
              setJenis(e.target.value);
              setTanya(false);
            }}
            className="field sm:max-w-xs"
          >
            <option value="">{t("Pilih jenis usaha…", "Choose a business type…")}</option>
            {TEMPLAT_AI.map((x) => (
              <option key={x.slug} value={x.slug}>
                {b === "en" ? x.labelEn : x.label}
              </option>
            ))}
            <option value="lainnya">{t("Lainnya (tulis sendiri)", "Other (write your own)")}</option>
          </select>
          {jenis === "lainnya" ? (
            <span className="self-center text-[12.5px] text-muted">
              {t("Belum ada template untuk jenis usaha ini. Tulis instruksi sendiri di kolom bawah.", "No template for this type yet. Write your own instructions below.")}
            </span>
          ) : tanya ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-warning">{t("Isi instruksi sekarang akan diganti.", "Your current instructions will be replaced.")}</span>
              <button type="button" onClick={pakai} className="btn btn-primary">
                {t("Ganti", "Replace")}
              </button>
              <button type="button" onClick={() => setTanya(false)} className="btn btn-ghost">
                {t("Batal", "Cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={!jenis || muat}
              onClick={() => (teks.trim() ? setTanya(true) : pakai())}
              className="btn btn-ghost h-[2.6rem]"
            >
              {muat ? t("Memuat…", "Loading…") : t("Pakai template", "Use template")}
            </button>
          )}
        </div>
        {galat && <p className="mt-2 text-[12.5px] text-danger">{galat}</p>}
      </div>

      <textarea
        ref={area}
        id="instruksi"
        name="instruksi"
        rows={teks.length > 400 ? 14 : 4}
        maxLength={MAKS_INSTRUKSI}
        value={teks}
        onChange={(e) => setTeks(e.target.value)}
        placeholder={t(
          "Contoh: Sapa pelanggan dengan ramah dan jawab singkat. Untuk permintaan penawaran, tanyakan dulu kebutuhannya.",
          "E.g. Greet customers warmly and keep answers short. For quote requests, ask about their needs first.",
        )}
        className="field resize-y font-[inherit] leading-relaxed"
      />
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="hint">
          {t(
            "Gaya bicara, alur, dan batasan khusus nomor ini. Data lengkap (katalog, harga, jadwal) tetap taruh juga di base knowledge.",
            "Tone, flows, and limits for this number. Keep the full facts (catalog, prices, schedule) in product knowledge too.",
          )}
        </p>
        <p className="hint shrink-0 tabular-nums">
          {angka(teks.length, b)}/{angka(MAKS_INSTRUKSI, b)}
        </p>
      </div>
      {penanda.length > 0 && (
        <p role="status" className="mt-2 flex gap-2 rounded-xl border border-warning/30 bg-warning-soft/60 px-3 py-2 text-[12.5px] leading-relaxed text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t(
              `Masih ada ${penanda.length} bagian bertanda [ ... ] yang perlu diganti dengan data Anda atau dihapus sebelum disimpan, misalnya ${penanda[0]}.`,
              `${penanda.length} part(s) marked [ ... ] still need your details (or deleting) before saving, e.g. ${penanda[0]}.`,
            )}
          </span>
        </p>
      )}
    </div>
  );
}

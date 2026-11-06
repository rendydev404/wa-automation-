"use client";

import { useActionState, useState, useTransition } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { adminMetaPixelAction, adminUjiMetaPixelAction } from "@/app/actions";
import { lacakUjiBrowserPixel } from "@/components/meta-pixel";
import { Pesan, Saklar } from "@/components/ui";
import {
  EVENT_META_PIXEL,
  KUNCI_EVENT_META,
  type KunciEventMeta,
  type PengaturanMetaPixel,
  ekstrakPixelId,
} from "@/lib/meta-pixel-def";

export function FormMetaPixel({ awal }: { awal: PengaturanMetaPixel }) {
  const [hasil, aksi, menyimpan] = useActionState(adminMetaPixelAction, null);
  const [, mulaiSimpan] = useTransition();
  const [menguji, mulaiUji] = useTransition();

  const [inputPixel, setInputPixel] = useState(awal.pixelId);
  const [aktif, setAktif] = useState(awal.aktif || !awal.pixelId);
  const [event, setEvent] = useState<Record<KunciEventMeta, boolean>>(awal.event);
  const [bukaCapi, setBukaCapi] = useState(Boolean(awal.capiToken || awal.testEventCode));
  const [capiToken, setCapiToken] = useState(awal.capiToken);
  const [lihatToken, setLihatToken] = useState(false);
  const [testCode, setTestCode] = useState(awal.testEventCode);
  const [disalin, setDisalin] = useState(false);
  const [hasilUji, setHasilUji] = useState<{ ok: boolean; pesan: string } | null>(null);

  const idTerdeteksi = ekstrakPixelId(inputPixel);
  const inputTerisi = inputPixel.trim().length > 0;
  const apakahPotonganKode = inputTerisi && idTerdeteksi && inputPixel.trim() !== idTerdeteksi;
  const sah = idTerdeteksi !== null;

  const ubahInputPixel = (nilaiBaru: string) => {
    const idLama = ekstrakPixelId(inputPixel);
    const idBaru = ekstrakPixelId(nilaiBaru);
    setInputPixel(nilaiBaru);
    // Bila sebelumnya kosong lalu diisi ID yang valid, otomatis nyalakan saklar aktif
    if (!idLama && idBaru) {
      setAktif(true);
    }
  };

  const tempelClipboard = async () => {
    try {
      const teks = await navigator.clipboard.readText();
      if (teks) ubahInputPixel(teks);
    } catch {
      // Clipboard API tidak diizinkan browser, pengguna tetap bisa Ctrl+V
    }
  };

  const salinId = () => {
    if (!idTerdeteksi) return;
    navigator.clipboard?.writeText(idTerdeteksi);
    setDisalin(true);
    setTimeout(() => setDisalin(false), 1800);
  };

  const kirimEventUji = () => {
    if (!idTerdeteksi) return;
    setHasilUji(null);
    lacakUjiBrowserPixel(idTerdeteksi);
    mulaiUji(async () => {
      const res = await adminUjiMetaPixelAction();
      setHasilUji({
        ok: res.ok,
        pesan: res.pesan ?? (res.ok ? "Event uji berhasil dikirim." : "Gagal mengirim event uji."),
      });
    });
  };

  const jumlahEventAktif = KUNCI_EVENT_META.filter((k) => event[k]).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        mulaiSimpan(() => aksi(fd));
      }}
      className="space-y-6"
    >
      {/* Baris Status & Saklar Utama */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-subtle/50 p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <span
            className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${
              aktif && idTerdeteksi ? "bg-success-soft text-success" : "bg-surface text-muted border border-line"
            }`}
          >
            <Activity className="size-5" aria-hidden />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] font-bold">Status Pelacakan Meta Ads Pixel</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  aktif && idTerdeteksi ? "bg-success-soft text-success" : "bg-subtle text-muted"
                }`}
              >
                {aktif && idTerdeteksi ? `Aktif · ID ${idTerdeteksi}` : "Belum Aktif"}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {aktif && idTerdeteksi
                ? "Skrip Meta Pixel otomatis dimuat di halaman publik dan aplikasi untuk merekam konversi iklan."
                : "Masukkan ID Pixel atau tempel kode dari Meta Events Manager di bawah untuk mulai melacak iklan."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Saklar aktif={aktif} onUbah={setAktif} label="Aktifkan Meta Ads Pixel" />
          {aktif && <input type="hidden" name="aktif" value="on" />}
        </div>
      </div>

      {/* Input Utama: ID Pixel / Kode Script */}
      <fieldset className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="input-meta-pixel" className="text-[13.5px] font-bold">
            ID Meta Pixel atau Kode Script Meta
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={tempelClipboard}
              className="btn btn-ghost border border-line px-2.5 py-1 text-[12px]"
            >
              <ClipboardPaste className="size-3.5" aria-hidden /> Tempel
            </button>
            {idTerdeteksi && (
              <button
                type="button"
                onClick={salinId}
                className="btn btn-ghost border border-line px-2.5 py-1 text-[12px]"
              >
                {disalin ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {disalin ? "Disalin" : "Salin ID"}
              </button>
            )}
            {inputTerisi && (
              <button
                type="button"
                onClick={() => setInputPixel("")}
                className="btn btn-ghost border border-line px-2.5 py-1 text-[12px] text-muted hover:text-danger"
              >
                <Trash2 className="size-3.5" aria-hidden /> Kosongkan
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          Cukup ketik angka <strong>Dataset / Pixel ID</strong> (mis. <code className="font-mono text-fg">123456789012345</code>) atau{" "}
          <strong>tempel langsung seluruh kode HTML/script</strong> dari Meta Events Manager — sistem otomatis mengambil ID-nya.
        </p>

        <textarea
          id="input-meta-pixel"
          name="pixel_id"
          rows={apakahPotonganKode ? 4 : 2}
          value={inputPixel}
          onChange={(e) => ubahInputPixel(e.target.value)}
          placeholder="Contoh: 123456789012345 atau tempel kode <script>...fbq('init', '123456789012345')...</script>"
          className="field mt-3 font-mono text-[13px]"
        />

        {/* Umpan balik deteksi ID otomatis */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          {!inputTerisi ? (
            <span className="text-muted">Belum ada ID Pixel yang diisi.</span>
          ) : idTerdeteksi ? (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-semibold text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              ID Pixel terdeteksi: <code className="rounded bg-success-soft px-1.5 py-0.5 font-mono">{idTerdeteksi}</code>
              {apakahPotonganKode && (
                <button
                  type="button"
                  onClick={() => setInputPixel(idTerdeteksi)}
                  className="ml-0 underline hover:no-underline sm:ml-1"
                >
                  Rapikan jadi angka ID saja
                </button>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
              <XCircle className="size-4 shrink-0" aria-hidden />
              Format belum dikenali. Masukkan 8–25 digit angka ID Pixel atau kode script resmi Meta Pixel.
            </span>
          )}
        </div>
      </fieldset>

      {/* Pilihan Event Otomatis */}
      <fieldset className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <legend className="text-[13.5px] font-bold">
              Event Konversi yang Dilacak Otomatis ({jumlahEventAktif}/{KUNCI_EVENT_META.length})
            </legend>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Pilih event standar Meta Ads yang ingin dikirim otomatis saat pengunjung berinteraksi.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setEvent(Object.fromEntries(KUNCI_EVENT_META.map((k) => [k, true])) as Record<KunciEventMeta, boolean>)
              }
              className="btn btn-ghost border border-line px-2.5 py-1 text-[12px]"
            >
              Aktifkan semua
            </button>
          </div>
        </div>

        <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
          {KUNCI_EVENT_META.map((k) => {
            const info = EVENT_META_PIXEL[k];
            const nyala = event[k];
            return (
              <div
                key={k}
                className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                  nyala ? "border-accent/50 bg-accent-soft/40" : "border-line bg-subtle/30 opacity-75"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-ink px-2 py-0.5 font-mono text-[11.5px] font-bold text-ink-signal">
                      {info.kode}
                    </span>
                    <span className="text-[13px] font-semibold">{info.label.replace(`${info.kode} `, "")}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-muted">{info.ket}</p>
                </div>
                <div className="shrink-0 pt-0.5">
                  <Saklar
                    aktif={nyala}
                    onUbah={(v) => setEvent((lama) => ({ ...lama, [k]: v }))}
                    label={info.label}
                  />
                  {nyala && <input type="hidden" name={`ev_${k}`} value="on" />}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* Opsional: Conversions API (CAPI) & Test Event Code */}
      <div className="rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div>
            <p className="flex items-center gap-2 text-[13.5px] font-bold">
              <Sparkles className="size-4 text-accent" aria-hidden />
              Conversions API (Server-Side) &amp; Kode Uji Event
              <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">Opsional</span>
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              Kirim juga event pendaftaran, checkout, dan pembayaran langsung dari server ke Meta agar tetap tercatat walau browser memakai ad-blocker.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBukaCapi((v) => !v)}
            aria-expanded={bukaCapi}
            className="btn btn-ghost border border-line px-3 py-1.5 text-[12px]"
          >
            {bukaCapi ? "Sembunyikan" : "Atur CAPI & Kode Uji"}
          </button>
        </div>

        {/* Input tersembunyi bila panel ditutup agar nilai tersimpan tidak hilang saat submit */}
        {!bukaCapi && (
          <>
            <input type="hidden" name="capi_token" value={capiToken} />
            <input type="hidden" name="test_event_code" value={testCode} />
          </>
        )}

        {bukaCapi && (
          <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
            <div>
              <label htmlFor="capi_token" className="label">
                Conversions API Access Token (Opsional)
              </label>
              <div className="relative flex items-center">
                <input
                  id="capi_token"
                  name="capi_token"
                  type={lihatToken ? "text" : "password"}
                  value={capiToken}
                  onChange={(e) => setCapiToken(e.target.value)}
                  placeholder="EAA..."
                  autoComplete="off"
                  className="field pr-11 font-mono text-[12.5px]"
                />
                <button
                  type="button"
                  onClick={() => setLihatToken((v) => !v)}
                  aria-label={lihatToken ? "Sembunyikan token" : "Tampilkan token"}
                  className="absolute right-1 grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg"
                >
                  {lihatToken ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
              <p className="mt-1 text-[11.5px] text-faint">
                Dapatkan dari Meta Events Manager → Data Sources → Settings → Conversions API → Generate access token.
              </p>
            </div>

            <div className="max-w-xs">
              <label htmlFor="test_event_code" className="label">
                Test Event Code (Opsional, untuk uji coba)
              </label>
              <input
                id="test_event_code"
                name="test_event_code"
                type="text"
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                placeholder="Mis. TEST12345"
                maxLength={64}
                className="field font-mono text-[12.5px]"
              />
              <p className="mt-1 text-[11.5px] text-faint">
                Kosongkan setelah pengujian selesai agar event produksi tidak masuk ke tab Test Events.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tombol Simpan & Kirim Event Uji */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={menyimpan || !sah} className="btn btn-primary">
            {menyimpan && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Simpan Pengaturan Pixel
          </button>

          {awal.pixelId && (
            <button
              type="button"
              disabled={menguji || !idTerdeteksi}
              onClick={kirimEventUji}
              className="btn btn-ghost border border-line"
            >
              {menguji ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              Kirim Event Uji
            </button>
          )}

          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        </div>
      </div>

      {hasilUji && (
        <div
          role="status"
          className={`rounded-xl border p-3.5 text-[12.5px] font-medium ${
            hasilUji.ok ? "border-success/40 bg-success-soft text-success" : "border-danger/40 bg-danger-soft text-danger"
          }`}
        >
          {hasilUji.pesan}
        </div>
      )}
    </form>
  );
}

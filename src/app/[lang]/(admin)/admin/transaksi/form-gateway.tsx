"use client";

import { useActionState, useState, useTransition } from "react";
import { adminCobaLagiKanalAction, adminGatewayAction, adminPenyediaKanalAction, adminSegarkanStatusKanalAction, setKanalTampilAction } from "@/app/actions";
import { LogoKanal } from "@/components/logo-kanal";
import { Pesan, Saklar, SubmitButton } from "@/components/ui";
import { GATEWAY, type Gateway, MODE_GATEWAY, type ModeGateway } from "@/lib/gateway-def";
import type { KanalBayar } from "@/lib/harga";

export interface OpsiGateway {
  nama: Gateway;
  label: string;
  terpasang: boolean;
  sandbox: boolean;
}

/**
 * Pilihan cara memakai payment gateway untuk tagihan BARU (settings `gateway_aktif`): hanya Midtrans, hanya iPaymu,
 * atau hybrid. Mode yang providernya belum dipasang di .env tidak bisa dipilih.
 */
export function FormModeGateway({ mode, opsi }: { mode: ModeGateway; opsi: OpsiGateway[] }) {
  const [pilih, setPilih] = useState<ModeGateway>(mode);
  // Mode tersimpan berubah (setelah Simpan / dari tab lain): pilihan ikut. Form di-mount ulang lewat `key` karena React
  // mengembalikan radio ke nilai awalnya setelah aksi form selesai.
  const [modeLalu, setModeLalu] = useState(mode);
  if (mode !== modeLalu) {
    setModeLalu(mode);
    setPilih(mode);
  }
  const [hasil, aksi] = useActionState(adminGatewayAction, null);
  const pasang = (g: Gateway) => opsi.find((o) => o.nama === g)?.terpasang ?? false;
  const bisa = (m: ModeGateway) => (m === "hybrid" ? pasang("midtrans") && pasang("ipaymu") : pasang(m));
  const lencana = (m: ModeGateway) => {
    const perlu = m === "hybrid" ? opsi : opsi.filter((o) => o.nama === m);
    return perlu.filter((o) => !o.terpasang).map((o) => `${o.label} belum dipasang`).concat(perlu.filter((o) => o.terpasang && o.sandbox).map((o) => `${o.label} sandbox`));
  };
  return (
    <form key={mode} action={aksi} className="space-y-3">
      <div role="radiogroup" aria-label="Cara memakai payment gateway" className="grid gap-2 md:grid-cols-3">
        {(Object.keys(MODE_GATEWAY) as ModeGateway[]).map((m) => (
          <label
            key={m}
            className={`flex gap-2.5 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
              !bisa(m) ? "cursor-not-allowed border-line opacity-60" : pilih === m ? "cursor-pointer border-accent bg-accent-soft" : "cursor-pointer border-line hover:border-line-strong"
            }`}
          >
            <input type="radio" name="mode" value={m} checked={pilih === m} disabled={!bisa(m)} onChange={() => setPilih(m)} className="bulat mt-0.5" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                {MODE_GATEWAY[m].judul}
                {mode === m && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">Aktif</span>}
                {lencana(m).map((l) => (
                  <span key={l} className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                    {l}
                  </span>
                ))}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted">{MODE_GATEWAY[m].isi}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={pilih === mode}>Simpan</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export interface DataBarisKanal {
  kanal: KanalBayar;
  label: string;
  penyedia: Gateway | null;
  /** Provider yang metode ini aktif di akunnya (boleh dipilih). */
  pilihan: Gateway[];
  /** Status nyata metode ini di tiap provider yang melayaninya. */
  status: Partial<Record<Gateway, { aktif: boolean | null; catatan: string; ditolak?: boolean }>>;
  tampil: boolean;
  /** Alasan disembunyikan admin. */
  keterangan: string;
}

/** Lencana status satu provider untuk satu metode: hijau aktif, abu-abu belum aktif, kuning belum diketahui. */
function LencanaStatus({ g, s, kanal }: { g: Gateway; s: { aktif: boolean | null; catatan: string; ditolak?: boolean }; kanal: KanalBayar }) {
  const [menunggu, mulai] = useTransition();
  const warna = s.aktif === true ? "bg-success/12 text-success" : s.aktif === false ? "bg-line text-muted" : "bg-warning/15 text-warning";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span title={s.catatan} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${warna}`}>
        {GATEWAY[g].label}: {s.aktif === true ? "aktif" : s.aktif === false ? "belum aktif" : "belum diketahui"}
      </span>
      {s.aktif !== true && <span className="text-[11px] text-faint">{s.catatan}</span>}
      {s.ditolak && (
        <button
          type="button"
          disabled={menunggu}
          onClick={() => mulai(async () => void (await adminCobaLagiKanalAction(kanal, g)))}
          className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-50"
        >
          Coba lagi
        </button>
      )}
    </span>
  );
}

/**
 * Satu metode bayar di panel admin: status nyatanya di tiap provider, provider yang melayaninya (mode hybrid: bisa
 * dipilih di antara provider yang AKTIF; yang belum aktif dinonaktifkan), dan saklar tampil/sembunyi di halaman bayar.
 */
export function BarisKanal({ d, mode }: { d: DataBarisKanal; mode: ModeGateway }) {
  const [tampil, setTampil] = useState(d.tampil);
  const [galat, setGalat] = useState("");
  const [menunggu, mulai] = useTransition();
  const tersedia = !!d.penyedia;
  const dilayani = (Object.keys(d.status) as Gateway[]).sort();
  const pilihProvider = mode === "hybrid" && dilayani.length > 1;
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${tersedia ? "" : "bg-subtle/60"}`}>
      <span className={tersedia ? "" : "opacity-50"}>
        <LogoKanal kanal={d.kanal} />
      </span>
      <span className="min-w-0 flex-1 basis-48">
        <span className={`block text-[13.5px] font-semibold ${tersedia ? "" : "text-muted"}`}>{d.label}</span>
        <span className={`block text-[12px] ${galat ? "text-danger" : !tersedia ? "text-muted" : tampil ? "text-muted" : "text-warning"}`}>
          {galat ||
            (!tersedia
              ? !dilayani.length
                ? mode === "hybrid"
                  ? "Tidak dilayani provider mana pun"
                  : `Tidak ada di ${GATEWAY[mode].label}`
                : mode === "hybrid"
                  ? "Nonaktif: belum aktif di provider mana pun"
                  : `Nonaktif: belum aktif di ${GATEWAY[mode].label}`
              : tampil
                ? `Tampil di halaman bayar · lewat ${GATEWAY[d.penyedia!].label}`
                : d.keterangan)}
        </span>
        {dilayani.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {dilayani.map((g) => (
              <LencanaStatus key={g} g={g} s={d.status[g]!} kanal={d.kanal} />
            ))}
          </span>
        )}
      </span>
      {pilihProvider && (
        <span role="radiogroup" aria-label={`Provider ${d.label}`} className="inline-flex rounded-lg border border-line p-0.5 text-[12px] font-semibold">
          {dilayani.map((g) => {
            const bisa = d.pilihan.includes(g);
            return (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={d.penyedia === g}
                disabled={menunggu || !bisa}
                title={bisa ? undefined : `${d.label} belum aktif di ${GATEWAY[g].label}`}
                onClick={() =>
                  d.penyedia !== g &&
                  mulai(async () => {
                    setGalat("");
                    const h = await adminPenyediaKanalAction(d.kanal, g);
                    if (!h.ok) setGalat(h.pesan ?? "Gagal menyimpan.");
                  })
                }
                className={`rounded-md px-2.5 py-1 transition-colors disabled:cursor-not-allowed ${
                  d.penyedia === g ? "bg-accent text-on-accent" : bisa ? "text-muted hover:text-fg" : "text-faint line-through decoration-1"
                }`}
              >
                {GATEWAY[g].label}
              </button>
            );
          })}
        </span>
      )}
      {tersedia ? (
        <Saklar
          aktif={tampil}
          disabled={menunggu}
          label={`Tampilkan ${d.label}`}
          onUbah={(v) =>
            mulai(async () => {
              setGalat("");
              const h = await setKanalTampilAction(d.kanal, v);
              if (h.ok) setTampil(v);
              else setGalat(h.pesan ?? "Gagal menyimpan.");
            })
          }
        />
      ) : (
        <Saklar aktif={false} disabled label={`${d.label} nonaktif`} onUbah={() => {}} />
      )}
    </li>
  );
}

/** Baca ulang status kanal dari dashboard provider sekarang (biasanya disegarkan otomatis tiap 10 menit). */
export function TombolPerbaruiStatus() {
  const [menunggu, mulai] = useTransition();
  return (
    <button type="button" disabled={menunggu} onClick={() => mulai(async () => void (await adminSegarkanStatusKanalAction()))} className="btn btn-ghost h-9 shrink-0 text-[13px]">
      {menunggu ? "Membaca status…" : "Perbarui status dari provider"}
    </button>
  );
}

import Link from "next/link";
import { ArrowDown, Bot, ChevronRight, CreditCard, Package, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { angka, tanggal, waktuSingkatWib } from "@/lib/format";
import { type FilterPengguna, daftarLog, daftarPengguna } from "@/lib/pengguna";
import { kuotaBawaan, pendaftaranDibuka, requireAdmin } from "@/lib/session";
import { FormAi, FormBuatAkun, FormPaket, FormPengaturan } from "./form-admin";
import { customTampil, hargaAngka, paketCustom } from "@/lib/paket-custom";
import { PembangunCustom } from "./paket-custom";
import { METODE_MANUAL, acuanHarga, aturanPercobaan, daftarPaket, pemakaianNyata, riwayatTransaksi } from "@/lib/langganan";
import { SimulasiHarga } from "./simulasi-harga";
import { konfigMidtrans } from "@/lib/midtrans";
import { kunciAnthropic, modelAnthropic, pengaturanAi, perkiraanPerBalasan, ringkasPakai } from "@/lib/ai";
import { infoKurs } from "@/lib/kurs";
import { sttTerkonfigurasi } from "@/lib/stt";
import { infoTarif, siapkanTarif, tarifModel } from "@/lib/tarif";
import type { OpsiModel } from "@/components/pilih-model";
import { TarifInfo } from "@/components/tarif-info";
import { sekarang } from "@/lib/db";

/** Bagian-bagian panel admin; tiap halaman di /admin/* menyusunnya. */

const FILTER: { nilai: FilterPengguna; label: string }[] = [
  { nilai: "semua", label: "Semua" },
  { nilai: "aktif", label: "Aktif" },
  { nilai: "diblokir", label: "Diblokir" },
  { nilai: "admin", label: "Admin" },
];

export function BuatAkun() {
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <UserPlus className="size-4 text-accent" aria-hidden /> Buat akun
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Untuk klien yang tidak mendaftar sendiri.</p>
      <div className="mt-4">
        <FormBuatAkun />
      </div>
    </section>
  );
}

export async function MesinAi() {
  await requireAdmin();
  const kunci = kunciAnthropic();
  const [atur, pakai, kursI, tarifI] = await Promise.all([pengaturanAi(), ringkasPakai(sekarang() - 7 * 86400), infoKurs(), infoTarif()]);
  const KURS = kursI.kurs;
  // Daftar model resmi dari akun Anthropic (sekaligus bukti kuncinya masih berlaku).
  const daftarModel = kunci ? await modelAnthropic(kunci) : null;
  const dasar = daftarModel?.length ? daftarModel : MODEL_SARAN;
  const opsi = [...dasar, ...[atur.model, atur.cadangan].filter((id) => id && !dasar.some((m) => m.id === id)).map((id) => ({ id, nama: id }))].map((m) => opsiModel(m, KURS));
  const total = pakai.reduce((a, p) => ({ n: a.n + p.balasan, usd: a.usd + p.biaya_usd }), { n: 0, usd: 0 });
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Bot className="size-4 text-accent" aria-hidden /> Mesin AI
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">
        Sekarang:{" "}
        <span className="font-semibold text-fg">
          {atur.mode === "anthropic" ? `Claude API · ${atur.model}` : atur.mode === "per_paket" ? `Otomatis: gratis Hermes, berbayar Claude API · ${atur.model} (cadangan Hermes)` : "Hermes"}
        </span>
      </p>
      <p className="mt-1 text-[12.5px] text-muted">Penyedia untuk akun tertentu bisa dipaksa dari halaman Pengguna (Kelola pengguna → Mesin AI akun); pilihan itu menang atas pengaturan di sini.</p>
      <p className={`mt-1 text-[12.5px] ${kunci && daftarModel === null ? "text-danger" : "text-muted"}`}>
        API key Anthropic:{" "}
        {!kunci ? "belum dipasang di server (developer: ANTHROPIC_API_KEY di .env)." : daftarModel === null ? "terpasang di server tapi ditolak/tak terjangkau, hubungi developer." : "terpasang di server ✓"}
      </p>
      <p className={`mt-1 text-[12.5px] ${sttTerkonfigurasi() ? "text-muted" : "text-warning"}`}>
        Transkripsi pesan suara:{" "}
        {sttTerkonfigurasi()
          ? "terpasang di server ✓ (pesan suara pelanggan dibaca AI)"
          : "belum dipasang, jadi AI meminta pelanggan mengetik (developer: STT_API_KEY di .env, lalu buat ulang container)."}
      </p>
      <div className="mt-4">
        <FormAi penyedia={atur.mode} model={atur.model} cadangan={atur.cadangan} adaKunci={!!kunci} opsi={opsi} />
      </div>
      <div className="mt-3">
        <TarifInfo info={tarifI} />
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-[12.5px] font-semibold">7 hari terakhir</p>
        <p className="mt-0.5 text-[11.5px] text-faint">
          Biaya dalam Rp memakai kurs pasar Rp{angka(KURS)}/USD ({kursI.cadangan ? "perkiraan cadangan" : kursI.sumber}).
        </p>
        {pakai.length === 0 ? (
          <p className="mt-1 text-[12.5px] text-muted">Belum ada balasan AI tercatat.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[12.5px]">
            {pakai.map((p) => (
              <li key={`${p.penyedia}-${p.model}`} className="flex justify-between gap-3">
                <span className="truncate text-muted">{p.model ?? p.penyedia}</span>
                <span className="shrink-0 tabular-nums">
                  {angka(p.balasan)} balasan{p.biaya_usd > 0 && ` · Rp${angka(Math.round(p.biaya_usd * KURS))}`}
                </span>
              </li>
            ))}
            {total.usd > 0 && (
              <li className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
                <span>Rata-rata per balasan</span>
                <span className="tabular-nums">Rp{angka(Math.round((total.usd * KURS) / Math.max(1, pakai.filter((p) => p.biaya_usd > 0).reduce((a, p) => a + p.balasan, 0))))}</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

export async function Pengaturan() {
  await requireAdmin();
  const [buka, kuota, percobaan, kurs] = await Promise.all([pendaftaranDibuka(), kuotaBawaan(), aturanPercobaan(), infoKurs()]);
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <ShieldCheck className="size-4 text-accent" aria-hidden /> Aturan pendaftaran
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Berlaku langsung setelah disimpan, untuk semua akun yang belum berlangganan.</p>
      <div className="mt-4">
        <FormPengaturan buka={buka} kuota={kuota} percobaan={percobaan} kurs={kurs} />
      </div>
    </section>
  );
}

/** Saran model bila daftar dari Anthropic belum bisa diambil (kunci belum dipasang). */
const MODEL_SARAN = [
  { id: "claude-haiku-5-5", nama: "Claude Haiku 5.5" },
  { id: "claude-sonnet-5-5", nama: "Claude Sonnet 5.5" },
];

/** Satu pilihan model untuk pemilih model: biaya per balasan (Rp) dan tarif resmi per 1 juta token, bila tercantum. */
function opsiModel(m: { id: string; nama: string }, kurs: number, tambahan = 0): OpsiModel {
  const usd = perkiraanPerBalasan(m.id);
  const t = tarifModel(m.id);
  return { id: m.id, nama: m.nama, rpBalasan: usd === null ? null : usd * kurs * (1 + tambahan), masuk: t?.masuk ?? null, keluar: t?.keluar ?? null };
}

/**
 * Model acuan biaya untuk simulasi paket & paket Custom: semua model di akun Anthropic yang tarifnya tercantum di halaman
 * harga resmi (tanpa kunci: tiga model yang tarifnya dicek manual).
 */
async function modelAcuan(): Promise<{ id: string; nama: string; usd: number; masuk: number; keluar: number }[]> {
  await siapkanTarif();
  const daftar = (kunciAnthropic() && (await modelAnthropic())) || MODEL_ACUAN;
  return daftar.flatMap((m) => {
    const usd = perkiraanPerBalasan(m.id);
    const t = tarifModel(m.id);
    return usd === null || !t ? [] : [{ id: m.id, nama: m.nama, usd, masuk: t.masuk, keluar: t.keluar }];
  });
}

/** Cadangan daftar model acuan bila kunci Anthropic belum dipasang (tarifnya ada di TARIF_CADANGAN, tarif.ts). */
const MODEL_ACUAN = [
  { id: "claude-haiku-5-5", nama: "Claude Haiku 5.5" },
  { id: "claude-sonnet-5-5", nama: "Claude Sonnet 5.5" },
  { id: "claude-haiku-4-5", nama: "Claude Haiku 4.5" },
];

export async function KelolaPaket() {
  await requireAdmin();
  const [paket, acuan, nyata, kursI, custom, daftarAcuan, tarifI] = await Promise.all([daftarPaket({ semua: true }), acuanHarga(), pemakaianNyata(), infoKurs(), paketCustom(), modelAcuan(), infoTarif()]);
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Package className="size-4 text-accent" aria-hidden /> Paket langganan
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Perubahan berlaku untuk pembelian berikutnya; pelanggan yang sedang aktif tetap memakai kuota saat ia membeli.</p>
      <details className="mt-4 rounded-xl border border-accent/30 bg-accent-soft/30" open>
        <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-semibold text-accent">Margin keuntungan & simulasi paket (pratinjau langsung)</summary>
        <div className="border-t border-accent/20 bg-surface p-4">
          <SimulasiHarga
            paket={paket.map((p) => ({ id: p.id, nama: p.nama, harga: p.harga, durasi_hari: p.durasi_hari, kuota_nomor: p.kuota_nomor, kuota_balasan: p.kuota_balasan, unggulan: p.unggulan }))}
            model={daftarAcuan}
            acuan={acuan}
            nyata={nyata}
            kursInfo={kursI}
          />
        </div>
      </details>
      <div className="mt-3">
        <TarifInfo info={tarifI} />
      </div>
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        {paket.map((p) => (
          <li key={p.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px] [&::-webkit-details-marker]:hidden">
                <span className="font-semibold">
                  {p.nama} {!p.aktif && <span className="ml-1 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] text-muted">tidak dijual</span>}
                  {p.unggulan && <span className="ml-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">unggulan</span>}
                </span>
                <span className="text-muted tabular-nums">
                  Rp{angka(p.harga)} · {p.durasi_hari} hari · {angka(p.kuota_nomor)} nomor · {angka(p.kuota_balasan)} balasan
                </span>
              </summary>
              <div className="border-t border-line bg-subtle/40 p-4">
                <FormPaket paket={p} />
              </div>
            </details>
          </li>
        ))}
        <li>
          <a href="#paket-custom" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px] transition-colors hover:bg-subtle/50">
            <span className="font-semibold">
              {custom.nama} <span className="ml-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">custom · {customTampil(custom) ? "tampil" : "tidak tampil"}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted tabular-nums">
              {custom.kurs > 0 ? `Rp${angka(custom.harga)} · ${custom.durasi_hari} hari · ${angka(custom.kuota_nomor)} nomor · ${angka(custom.kuota_balasan)} balasan` : "belum dihitung"}
              {!hargaAngka(custom) && ` · kartu: "${custom.teks_harga}"`} <ArrowDown className="size-3.5" aria-hidden /> atur di bawah
            </span>
          </a>
        </li>
      </ul>
      <details className="mt-4">
        <summary className="cursor-pointer text-[13px] font-semibold text-accent">+ Buat paket baru</summary>
        <div className="mt-3">
          <FormPaket />
        </div>
      </details>
    </section>
  );
}

/** Paket Custom: kuota → harga otomatis (margin & asumsi biaya bisa diatur, harga bisa ditimpa), lihat paket-custom.tsx. */
export async function KelolaPaketCustom() {
  await requireAdmin();
  const [custom, acuan, nyata, kursI, paket, midtrans, model] = await Promise.all([paketCustom(), acuanHarga(), pemakaianNyata(), infoKurs(), daftarPaket(), konfigMidtrans(), modelAcuan()]);
  // Model tersimpan yang tidak ada di daftar acuan (mis. diganti di versi lama) tetap bisa dipilih bila tarifnya diketahui.
  const usdTersimpan = perkiraanPerBalasan(custom.model);
  const tarifTersimpan = tarifModel(custom.model);
  if (usdTersimpan !== null && tarifTersimpan && !model.some((m) => m.id === custom.model))
    model.push({ id: custom.model, nama: custom.model, usd: usdTersimpan, masuk: tarifTersimpan.masuk, keluar: tarifTersimpan.keluar });
  const tampil = customTampil(custom);
  return (
    <section id="paket-custom" className="card scroll-mt-24 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Sparkles className="size-4 text-accent" aria-hidden /> Paket Custom
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Isi kuota balasan AI, harga dihitung otomatis dari modal nyata + margin pilihanmu, lalu timpa sendiri bila perlu. Kurs USD diambil langsung dari data pasar dan diperbarui otomatis.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${tampil ? "bg-success-soft text-success" : "bg-subtle text-muted"}`}>{tampil ? "Tampil di daftar harga" : "Tidak tampil"}</span>
      </div>
      <div className="mt-5">
        <PembangunCustom
          awal={custom}
          acuan={{ margin: acuan.margin, pemakaian: acuan.pemakaian, metode: acuan.metode, biayaServerNomor: acuan.biayaServerNomor, model: model.some((m) => m.id === acuan.model) ? acuan.model : (model[0]?.id ?? acuan.model) }}
          model={model}
          nyata={nyata}
          kursInfo={kursI}
          paketLain={paket.filter((p) => p.harga > 0).map((p) => ({ nama: p.nama, harga: p.harga, durasi_hari: p.durasi_hari, kuota_balasan: p.kuota_balasan }))}
          midtrans={!!midtrans}
        />
      </div>
    </section>
  );
}

const STATUS_TRX: Record<string, string> = {
  menunggu: "bg-warning-soft text-warning",
  lunas: "bg-success-soft text-success",
  gagal: "bg-danger-soft text-danger",
  kedaluwarsa: "bg-subtle text-muted",
  dikembalikan: "bg-subtle text-muted",
};

export async function Transaksi() {
  await requireAdmin();
  const daftar = await riwayatTransaksi({ batas: 25 });
  const lunas = daftar.filter((t) => t.status === "lunas");
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <CreditCard className="size-4 text-accent" aria-hidden /> Transaksi terbaru
        </h2>
        <span className="text-[12.5px] text-muted">
          {lunas.length} lunas · Rp{angka(lunas.reduce((a, t) => a + t.jumlah, 0))}
        </span>
      </div>
      {daftar.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted">Belum ada transaksi.</p>
      ) : (
        <ul className="divide-y divide-line">
          {daftar.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13px]">
              <span className="min-w-0">
                <Link href={`/admin/pengguna/${t.user_id}`} className="font-semibold hover:underline">
                  {t.email}
                </Link>{" "}
                · {t.nama_paket} · Rp{angka(t.jumlah)}
                <span className="block text-[12px] text-faint">
                  {waktuSingkatWib(t.dibuat)} · {t.order_id}
                  {t.metode ? ` · ${t.metode in METODE_MANUAL ? `${METODE_MANUAL[t.metode as keyof typeof METODE_MANUAL]} (dicatat admin)` : t.metode.replace(/_/g, " ")}` : ""}
                  {t.catatan ? ` · ${t.catatan}` : ""}
                </span>
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_TRX[t.status] ?? ""}`}>{t.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function TabelPengguna({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const cari = typeof sp.q === "string" ? sp.q : "";
  const filter = (FILTER.find((f) => f.nilai === sp.f)?.nilai ?? "semua") as FilterPengguna;
  const sebelum = Number(sp.sebelum);
  const { daftar, adaLagi } = await daftarPengguna({ cari, filter, sebelumId: Number.isInteger(sebelum) && sebelum > 0 ? sebelum : undefined });
  const tautan = (ubah: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const semua = { q: cari || undefined, f: filter === "semua" ? undefined : filter, ...ubah };
    for (const [k, v] of Object.entries(semua)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/admin/pengguna?${s}` : "/admin/pengguna";
  };

  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <form action="/admin/pengguna" className="flex w-full max-w-sm gap-2">
          {filter !== "semua" && <input type="hidden" name="f" value={filter} />}
          <label htmlFor="cari-pengguna" className="sr-only">
            Cari pengguna
          </label>
          <input id="cari-pengguna" name="q" defaultValue={cari} placeholder="Cari nama atau email…" className="field" />
          <button type="submit" className="btn btn-ghost border border-line">
            Cari
          </button>
        </form>
        <nav aria-label="Saring pengguna" className="flex gap-1 rounded-xl bg-subtle p-1">
          {FILTER.map((f) => (
            <Link
              key={f.nilai}
              href={tautan({ f: f.nilai === "semua" ? undefined : f.nilai })}
              aria-current={filter === f.nilai ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${filter === f.nilai ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-subtle/60 text-[11.5px] font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th className="px-5 py-3">Pengguna</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Nomor</th>
              <th className="px-3 py-3">Login terakhir</th>
              <th className="px-5 py-3 text-right" aria-label="Buka" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {daftar.map((u) => (
              <tr key={u.id} className="group transition-colors hover:bg-subtle/50">
                <td className="px-5 py-3">
                  <Link href={`/admin/pengguna/${u.id}`} className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-[12px] font-bold text-ink-signal uppercase">{(u.nama || u.email).charAt(0)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {u.nama || "(tanpa nama)"}
                        {u.peran === "admin" && <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold text-accent uppercase">Admin</span>}
                        {u.ai_penyedia && (
                          <span className="ml-2 rounded-md bg-subtle px-1.5 py-0.5 text-[10.5px] font-bold text-muted uppercase">{u.ai_penyedia === "anthropic" ? "Claude API" : "Hermes"}</span>
                        )}
                      </span>
                      <span className="block truncate text-muted">{u.email}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  {u.status === "aktif" ? (
                    <span className="rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-semibold text-success">Aktif</span>
                  ) : (
                    <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[11.5px] font-semibold text-danger">Diblokir</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {u.jumlah_nomor}
                  <span className="text-muted"> / {u.peran === "admin" ? "∞" : (u.kuota_nomor ?? "bawaan")}</span>
                </td>
                <td className="px-3 py-3 text-muted">{u.login_terakhir ? waktuSingkatWib(u.login_terakhir) : `Daftar ${tanggal(u.created_at)}`}</td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/admin/pengguna/${u.id}`} aria-label={`Kelola ${u.email}`} className="inline-grid size-8 place-items-center rounded-lg text-faint transition-colors group-hover:bg-surface group-hover:text-fg">
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
            {daftar.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-muted">
                  Tidak ada pengguna yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(adaLagi || sp.sebelum) && (
        <div className="flex justify-between gap-3 border-t border-line p-4">
          <Link href={tautan({})} className="btn btn-ghost border border-line">
            Ke awal
          </Link>
          {adaLagi && (
            <Link href={tautan({ sebelum: String(daftar[daftar.length - 1].id) })} className="btn btn-ghost border border-line">
              Berikutnya
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

export async function Log({ batas = 25 }: { batas?: number } = {}) {
  await requireAdmin();
  const log = await daftarLog(batas);
  return (
    <section className="card p-6">
      <h2 className="text-[15px] font-bold">Jejak tindakan admin</h2>
      <ol className="mt-4 space-y-3">
        {log.map((l) => (
          <li key={l.id} className="text-[12.5px]">
            <p>
              <span className="font-semibold">{l.admin}</span> <span className="text-muted">{l.aksi}</span>
              {l.sasaran && <span className="font-semibold"> {l.sasaran}</span>}
            </p>
            <p className="text-faint">
              {waktuSingkatWib(l.waktu)}
              {l.detail && ` · ${l.detail}`}
            </p>
          </li>
        ))}
        {log.length === 0 && <li className="text-[13px] text-muted">Belum ada tindakan.</li>}
      </ol>
    </section>
  );
}

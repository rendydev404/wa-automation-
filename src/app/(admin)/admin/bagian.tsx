import Link from "next/link";
import { Bot, ChevronRight, CreditCard, Package, Phone, ShieldCheck, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { KartuStat } from "@/components/stat";
import { angka, tanggal, waktuSingkatWib } from "@/lib/format";
import { type FilterPengguna, daftarLog, daftarPengguna, ringkasanAdmin } from "@/lib/pengguna";
import { kuotaBawaan, pendaftaranDibuka, requireAdmin } from "@/lib/session";
import { FormAi, FormBuatAkun, FormPaket, FormPengaturan, SalinTeks } from "./form-admin";
import { acuanHarga, daftarPaket, kuotaBalasanGratis, pemakaianNyata, riwayatTransaksi } from "@/lib/langganan";
import { SimulasiHarga } from "./simulasi-harga";
import { konfigMidtrans, kunciMidtransSah } from "@/lib/midtrans";
import { asalAplikasi } from "@/lib/batas";
import { kunciAnthropic, modelAnthropic, pengaturanAi, perkiraanPerBalasan, ringkasPakai } from "@/lib/ai";
import { infoKurs } from "@/lib/kurs";
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

export async function Ringkasan() {
  await requireAdmin();
  const r = await ringkasanAdmin();
  return (
    <section aria-label="Ringkasan pengguna" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <KartuStat label="Total akun" nilai={angka(r.total)} ikon={<Users className="size-4" aria-hidden />} keterangan={`${angka(r.baru7)} mendaftar 7 hari terakhir`} />
      <KartuStat label="Akun aktif" nilai={angka(r.aktif)} ikon={<UserCheck className="size-4" aria-hidden />} keterangan={`${angka(r.admin)} admin`} />
      <KartuStat label="Diblokir" nilai={angka(r.diblokir)} ikon={<UserX className="size-4" aria-hidden />} keterangan="AI berhenti membalas di nomornya" />
      <KartuStat label="Nomor WhatsApp" nilai={angka(r.nomor)} ikon={<Phone className="size-4" aria-hidden />} keterangan={`${angka(r.tertaut)} sudah tertaut`} />
    </section>
  );
}

export async function MesinAi() {
  await requireAdmin();
  const kunci = kunciAnthropic();
  const [atur, pakai, kursI] = await Promise.all([pengaturanAi(), ringkasPakai(sekarang() - 7 * 86400), infoKurs()]);
  const KURS = kursI.kurs;
  // Daftar model resmi dari akun Anthropic (sekaligus bukti kuncinya masih berlaku).
  const daftarModel = kunci ? await modelAnthropic(kunci) : null;
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
      <div className="mt-4">
        <FormAi
          penyedia={atur.mode}
          model={atur.model}
          cadangan={atur.cadangan}
          adaKunci={!!kunci}
          daftarModel={daftarModel}
          biaya={Object.fromEntries(
            [...new Set([...(daftarModel ?? []).map((m) => m.id), "claude-haiku-5-5", "claude-sonnet-5-5"])]
              .map((id) => [id, perkiraanPerBalasan(id)] as const)
              .filter((x): x is readonly [string, number] => x[1] !== null)
              .map(([id, usd]) => [id, Math.round(usd * KURS)])
          )}
        />
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
  const [buka, kuota, balasan, kurs] = await Promise.all([pendaftaranDibuka(), kuotaBawaan(), kuotaBalasanGratis(), infoKurs()]);
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <ShieldCheck className="size-4 text-accent" aria-hidden /> Aturan pendaftaran
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Berlaku untuk akun yang dibuat setelah disimpan.</p>
      <div className="mt-4">
        <FormPengaturan buka={buka} kuota={kuota} balasan={balasan} kurs={kurs} />
      </div>
    </section>
  );
}

/** Model yang tarif resminya sudah dicek (src/lib/ai.ts) dan bisa jadi acuan biaya. */
const MODEL_ACUAN = [
  { id: "claude-haiku-5-5", nama: "Claude Haiku 5.5" },
  { id: "claude-sonnet-5-5", nama: "Claude Sonnet 5.5" },
  { id: "claude-haiku-4-5", nama: "Claude Haiku 4.5" },
];

export async function KelolaPaket() {
  await requireAdmin();
  const [paket, acuan, nyata, kursI] = await Promise.all([daftarPaket({ semua: true }), acuanHarga(), pemakaianNyata(), infoKurs()]);
  const modelAcuan = MODEL_ACUAN.flatMap((m) => {
    const usd = perkiraanPerBalasan(m.id);
    return usd === null ? [] : [{ ...m, usd }];
  });
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
            model={modelAcuan}
            acuan={acuan}
            nyata={nyata}
            kursInfo={kursI}
          />
        </div>
      </details>
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
                  {t.metode ? ` · ${t.metode.replace(/_/g, " ")}` : ""}
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

export async function Pembayaran() {
  await requireAdmin();
  const [k, asal] = await Promise.all([konfigMidtrans(), asalAplikasi()]);
  // Kunci dipasang developer di server; di sini hanya dicek apakah Midtrans menerimanya.
  const sah = k ? await kunciMidtransSah(k) : false;
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <CreditCard className="size-4 text-accent" aria-hidden /> Pembayaran (Midtrans Snap)
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">
        {!k
          ? "Belum aktif: server key belum dipasang developer di server (MIDTRANS_SERVER_KEY di .env)."
          : `${sah ? "Aktif ✓" : "Kunci terpasang tapi ditolak Midtrans, hubungi developer."} · ${k.produksi ? "Production" : "Sandbox"}`}
      </p>
      <div className="mt-4">
        <p className="label">Payment Notification URL (tempel di dashboard Midtrans → Settings → Payment)</p>
        <SalinTeks teks={`${asal}/api/midtrans/notifikasi`} label="Salin URL notifikasi" />
      </div>
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

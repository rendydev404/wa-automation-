import Link from "next/link";
import { AlertTriangle, ArrowDown, Bot, CheckCircle2, ChevronRight, Info, Package, ShieldCheck, Sparkles, UserPlus, Wallet } from "lucide-react";
import { angka, tanggal, waktuSingkatWib } from "@/lib/format";
import { type FilterPengguna, daftarLog, daftarPengguna, hitungPaketPengguna, hitungPengguna } from "@/lib/pengguna";
import { SaringPaket } from "./pengguna/saring-paket";
import { kuotaBawaan, pendaftaranDibuka, requireStaf } from "@/lib/session";
import { FormAi, FormBuatAkun, FormPaket, FormPengaturan, TombolHapusPengguna } from "./form-admin";
import { customTampil, hargaAngka, paketCustom } from "@/lib/paket-custom";
import { labelKomisiPaket } from "@/lib/afiliasi-def";
import { PembangunCustom } from "./paket-custom";
import { acuanHarga, aturanPercobaan, daftarPaket, pemakaianNyata } from "@/lib/langganan";
import { SimulasiHarga } from "./simulasi-harga";
import { konfigMidtrans } from "@/lib/midtrans";
import { GATEWAY, type Gateway, infoGateway, rencanaKanal, sumberStatus } from "@/lib/gateway";
import { labelKanal } from "@/lib/harga";
import { BarisKanal, type DataBarisKanal, FormModeGateway, TombolPerbaruiStatus } from "./transaksi/form-gateway";
import { kunciAnthropic, modelAnthropic, pengaturanAi, perkiraanPerBalasan, ringkasPakai } from "@/lib/ai";
import { infoKurs } from "@/lib/kurs";
import { sttTerkonfigurasi } from "@/lib/stt";
import { infoTarif, siapkanTarif, tarifModel } from "@/lib/tarif";
import type { OpsiModel } from "@/components/pilih-model";
import { TarifInfo } from "@/components/tarif-info";
import { sekarang } from "@/lib/db";
import { LencanaPaket } from "@/components/lencana-paket";
import { tingkatPaket } from "@/lib/tingkat-paket";
import { labelPeran, staf } from "@/lib/peran";

/** Bagian-bagian panel admin; tiap halaman di /admin/* menyusunnya. */

const FILTER: { nilai: FilterPengguna; label: string }[] = [
  { nilai: "semua", label: "Semua" },
  { nilai: "aktif", label: "Aktif" },
  { nilai: "diblokir", label: "Diblokir" },
  { nilai: "admin", label: "Staf" },
];

export async function BuatAkun() {
  const pelaku = await requireStaf();
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <UserPlus className="size-4 text-accent" aria-hidden /> Buat akun
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Untuk klien yang tidak mendaftar sendiri.</p>
      <div className="mt-4">
        <FormBuatAkun bolehStaf={pelaku.peran === "admin"} />
      </div>
    </section>
  );
}

export async function MesinAi() {
  await requireStaf();
  const kunci = kunciAnthropic();
  const [atur, pakai, kursI, tarifI] = await Promise.all([pengaturanAi(), ringkasPakai(sekarang() - 7 * 86400), infoKurs(), infoTarif()]);
  const KURS = kursI.kurs;
  // Daftar model resmi dari akun Anthropic (sekaligus bukti kuncinya masih berlaku).
  const daftarModel = kunci ? await modelAnthropic(kunci) : null;
  const dasar = daftarModel?.length ? daftarModel : MODEL_SARAN;
  const opsi = [...dasar, ...[atur.model, atur.cadangan].filter((id) => id && !dasar.some((m) => m.id === id)).map((id) => ({ id, nama: id }))].map((m) => opsiModel(m, KURS));
  const total = pakai.reduce((a, p) => ({ n: a.n + p.balasan, usd: a.usd + p.biaya_usd }), { n: 0, usd: 0 });
  return (
    <section className="card p-4 sm:p-6">
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
  await requireStaf();
  const [buka, kuota, percobaan, kurs] = await Promise.all([pendaftaranDibuka(), kuotaBawaan(), aturanPercobaan(), infoKurs()]);
  return (
    <section className="card p-4 sm:p-6">
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
  await requireStaf();
  const [paket, acuan, nyata, kursI, custom, daftarAcuan, tarifI] = await Promise.all([daftarPaket({ semua: true }), acuanHarga(), pemakaianNyata(), infoKurs(), paketCustom(), modelAcuan(), infoTarif()]);
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Package className="size-4 text-accent" aria-hidden /> Paket langganan
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Perubahan berlaku untuk pembelian berikutnya; pelanggan yang sedang aktif tetap memakai kuota saat ia membeli.</p>
      <details className="mt-4 rounded-xl border border-accent/30 bg-accent-soft/30" open>
        <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-semibold text-accent">Margin keuntungan & simulasi paket (pratinjau langsung)</summary>
        <div className="border-t border-accent/20 bg-surface p-2 sm:p-4">
          <SimulasiHarga
            paket={paket.map((p) => ({
              id: p.id,
              nama: p.nama,
              harga: p.harga,
              durasi_hari: p.durasi_hari,
              kuota_nomor: p.kuota_nomor,
              kuota_balasan: p.kuota_balasan,
              unggulan: p.unggulan,
              komisi_jenis: p.komisi_jenis,
              komisi_nilai: p.komisi_nilai,
            }))}
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
                  Rp{angka(p.harga)} · {p.durasi_hari} hari · {angka(p.kuota_nomor)} nomor · {angka(p.kuota_balasan)} balasan · komisi {labelKomisiPaket(p.komisi_jenis, p.komisi_nilai, p.harga)}
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
  await requireStaf();
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


/**
 * Payment gateway: mode (hanya Midtrans / hanya iPaymu / hybrid per metode, bisa diganti kapan saja) dan metode bayar di
 * halaman bayar beserta providernya. Metode yang ditolak provider tersembunyi sendiri; admin bisa menampilkan/menyembunyikan.
 */
export async function MetodeBayar() {
  await requireStaf();
  const [info, rencana] = await Promise.all([infoGateway(), rencanaKanal()]);
  const sumber = await sumberStatus(); // setelah rencanaKanal: hasil baca provider sudah tersimpan
  const jam = (ms: number) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  const kini = sekarang();
  const baris: DataBarisKanal[] = rencana.kanal.map((r) => {
    const m = r.mati;
    const asal = r.penyedia ? GATEWAY[r.penyedia].label : "";
    return {
      kanal: r.kanal,
      label: labelKanal(r.kanal, "id", r.penyedia),
      penyedia: r.penyedia,
      pilihan: r.pilihan,
      status: r.status,
      tampil: !m,
      keterangan: m ? `Disembunyikan admin ${waktuSingkatWib(m.waktu, kini)} · ${asal}` : "",
    };
  });
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <Wallet className="size-4 text-accent" aria-hidden /> Payment gateway &amp; metode pembayaran
        </h2>
        <p className="mt-0.5 text-[13px] text-muted">Pilih lewat mana pembeli membayar. Bisa diganti kapan saja.</p>
        <div className="mt-3">
          <FormModeGateway mode={info.mode} opsi={info.daftar} />
        </div>
        <ul className="mt-4 space-y-1 rounded-xl bg-subtle px-4 py-3 text-[12.5px] leading-relaxed text-muted [&_b]:font-semibold [&_b]:text-fg">
          <li>
            <b>Hanya Midtrans / Hanya iPaymu:</b> semua metode bayar lewat satu provider.
          </li>
          <li>
            <b>Hybrid:</b> tiap metode lewat provider yang kamu pilih di daftar bawah, misalnya BCA VA, ShopeePay, dan DANA lewat iPaymu, sisanya lewat Midtrans. Metode yang tidak ada di satu provider otomatis lewat provider lainnya.
          </li>
          <li>
            <b>Tagihan lama aman:</b> mengganti pilihan hanya berlaku untuk tagihan baru; tagihan yang sudah dibuat tetap diproses provider asalnya.
          </li>
          <li>
            <b>Uang kembali:</b> pembayaran lewat Midtrans bisa dikembalikan otomatis; lewat iPaymu ditransfer manual oleh admin.
          </li>
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="max-w-3xl text-[13px] text-muted">
          Status tiap metode dibaca dari dashboard provider (iPaymu &amp; Midtrans, diperbarui tiap 10 menit). Metode yang belum aktif di provider otomatis nonaktif; di mode hybrid, metode itu lewat provider lain yang sudah aktif.
        </p>
        <TombolPerbaruiStatus />
      </div>
      <ul className="space-y-2 border-b border-line px-5 py-3 text-[12.5px] leading-relaxed">
        {(["ipaymu", "midtrans"] as Gateway[]).map((g) => {
          const s = sumber[g];
          const nama = `${GATEWAY[g].label} (${s.produksi ? "production" : "sandbox"})`;
          const sumberNya = g === "ipaymu" ? "daftar metode di akun iPaymu" : "pengaturan metode bayar di dashboard Midtrans";
          if (!s.terpasang)
            return (
              <li key={g} className="flex gap-2 text-muted">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <b className="font-semibold text-fg">{GATEWAY[g].label}</b> belum dipasang di server ({g === "ipaymu" ? "IPAYMU_VA & IPAYMU_API_KEY" : "MIDTRANS_SERVER_KEY"} di .env), jadi metodenya tidak dipakai.
                </span>
              </li>
            );
          if (s.galat)
            return (
              <li key={g} className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  <b className="font-semibold">{nama}: status GAGAL dibaca.</b> {s.galat}{" "}
                  {s.dibaca ? `Terakhir berhasil dibaca pukul ${jam(s.dibaca)} WIB. ` : ""}
                  Sampai terbaca, metode {GATEWAY[g].label} tetap ditawarkan dan baru ketahuan aktif atau tidak saat pembeli membuat tagihan.
                </span>
              </li>
            );
          return (
            <li key={g} className="flex gap-2 text-muted">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <span>
                <b className="font-semibold text-fg">{nama}:</b> status dibaca langsung dari {sumberNya}
                {s.dibaca ? ` pukul ${jam(s.dibaca)} WIB` : ""}.
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="divide-y divide-line">
        {baris.map((d) => (
          <BarisKanal key={`${info.mode}-${d.kanal}-${d.penyedia}`} d={d} mode={info.mode} />
        ))}
      </ul>
    </section>
  );
}

export async function TabelPengguna({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireStaf();
  const sp = await searchParams;
  const cari = typeof sp.q === "string" ? sp.q : "";
  const filter = (FILTER.find((f) => f.nilai === sp.f)?.nilai ?? "semua") as FilterPengguna;
  const paket = typeof sp.p === "string" ? sp.p.slice(0, 122) : "";
  const sebelum = Number(sp.sebelum);
  const [{ daftar, adaLagi }, jumlah, perPaket] = await Promise.all([
    daftarPengguna({ cari, filter, paket, sebelumId: Number.isInteger(sebelum) && sebelum > 0 ? sebelum : undefined }),
    hitungPengguna({ cari, paket }),
    hitungPaketPengguna({ cari, filter }),
  ]);
  const angkaId = (n: number) => n.toLocaleString("id-ID");
  const opsiPaket = [
    { id: "", label: "Semua paket" },
    { id: "g", label: "Gratis", lencana: angkaId(perPaket.gratis) },
    { id: "b", label: "Berbayar (semua paket)", lencana: angkaId(perPaket.berbayar) },
    ...perPaket.paket.map((x) => ({ id: `n:${x.nama}`, label: x.nama, sub: "Berbayar", lencana: angkaId(x.n) })),
  ];
  // Paket yang sedang disaring tapi tidak punya pelanggan di saringan ini tetap tampil sebagai pilihan aktif.
  if (paket.startsWith("n:") && !opsiPaket.some((o) => o.id === paket)) opsiPaket.push({ id: paket, label: paket.slice(2), sub: "Berbayar", lencana: "0" });
  const tautan = (ubah: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const semua = { q: cari || undefined, f: filter === "semua" ? undefined : filter, p: paket || undefined, ...ubah };
    for (const [k, v] of Object.entries(semua)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/admin/pengguna?${s}` : "/admin/pengguna";
  };

  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex w-full flex-col gap-2 sm:flex-row xl:max-w-xl">
        <form action="/admin/pengguna" className="flex w-full gap-2 sm:max-w-sm">
          {filter !== "semua" && <input type="hidden" name="f" value={filter} />}
          {paket && <input type="hidden" name="p" value={paket} />}
          <label htmlFor="cari-pengguna" className="sr-only">
            Cari pengguna
          </label>
          <input id="cari-pengguna" name="q" defaultValue={cari} placeholder="Cari nama atau email…" className="field" />
          <button type="submit" className="btn btn-ghost min-h-[2.75rem] border border-line">
            Cari
          </button>
        </form>
        <SaringPaket nilai={paket} opsi={opsiPaket} param={Object.fromEntries(Object.entries({ q: cari, f: filter === "semua" ? "" : filter }).filter(([, v]) => v))} />
        </div>
        <nav aria-label="Saring pengguna" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-subtle p-1">
          {FILTER.map((f) => (
            <Link
              key={f.nilai}
              data-analitik={`Saring pengguna: ${f.label}`}
              href={tautan({ f: f.nilai === "semua" ? undefined : f.nilai })}
              aria-current={filter === f.nilai ? "page" : undefined}
              className={`inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${filter === f.nilai ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {f.label}
              <span className={`ml-1.5 tabular-nums ${filter === f.nilai ? "text-accent" : "text-faint"}`}>{jumlah[f.nilai].toLocaleString("id-ID")}</span>
            </Link>
          ))}
        </nav>
      </div>
      {/* HP: daftar kartu (tabel lebar memaksa geser ke samping & tombol aksi tersembunyi di kanan). */}
      <ul data-analitik-privat className="divide-y divide-line sm:hidden">
        {daftar.map((u) => (
          <li key={u.id} className="flex items-center gap-2 px-4 py-3">
            <Link href={`/admin/pengguna/${u.id}`} data-analitik="Buka pengguna" className="flex min-w-0 flex-1 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-[13px] font-bold text-ink-signal uppercase">{(u.nama || u.email).charAt(0)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[14px] font-semibold">{u.nama || "(tanpa nama)"}</span>
                  {staf(u.peran) && <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold text-accent uppercase">{labelPeran(u.peran)}</span>}
                </span>
                <span className="block truncate text-[12.5px] text-muted">{u.email}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${u.status === "aktif" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                    {u.status === "aktif" ? "Aktif" : "Diblokir"}
                  </span>
                  {u.paket_nama && <LencanaPaket tingkat={tingkatPaket(u.paket_kode, u.paket_nama)} nama={u.paket_nama} ukuran="sm" />}
                  <span className="tabular-nums">
                    {u.jumlah_nomor} / {staf(u.peran) ? "∞" : (u.kuota_nomor ?? "bawaan")} nomor
                  </span>
                  <span>{u.login_terakhir ? waktuSingkatWib(u.login_terakhir) : `Daftar ${tanggal(u.created_at)}`}</span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
            </Link>
            {u.id !== admin.id && !(u.peran === "admin" && admin.peran !== "admin") && <TombolHapusPengguna id={u.id} nama={u.nama} email={u.email} jumlahNomor={u.jumlah_nomor} mode="baris" />}
          </li>
        ))}
        {daftar.length === 0 && <li className="px-4 py-10 text-center text-muted">Tidak ada pengguna yang cocok.</li>}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="bg-subtle/60 text-[11.5px] font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th className="px-5 py-3">Pengguna</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Paket</th>
              <th className="px-3 py-3 text-right">Nomor</th>
              <th className="px-3 py-3">Login terakhir</th>
              <th className="px-5 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody data-analitik-privat className="divide-y divide-line">
            {daftar.map((u) => (
              <tr key={u.id} className="group transition-colors hover:bg-subtle/50">
                <td className="px-5 py-3">
                  <Link href={`/admin/pengguna/${u.id}`} data-analitik="Buka pengguna" className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-[12px] font-bold text-ink-signal uppercase">{(u.nama || u.email).charAt(0)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {u.nama || "(tanpa nama)"}
                        {staf(u.peran) && <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold text-accent uppercase">{labelPeran(u.peran)}</span>}
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
                <td className="px-3 py-3">
                  {u.paket_nama ? (
                    <span className="flex flex-col items-start gap-1">
                      <LencanaPaket tingkat={tingkatPaket(u.paket_kode, u.paket_nama)} nama={u.paket_nama} ukuran="sm" />
                      {u.paket_sampai && <span className="text-[11.5px] text-faint">s.d. {tanggal(u.paket_sampai)}</span>}
                    </span>
                  ) : (
                    <span className="text-[12px] text-faint">{staf(u.peran) ? "—" : "Gratis"}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {u.jumlah_nomor}
                  <span className="text-muted"> / {staf(u.peran) ? "∞" : (u.kuota_nomor ?? "bawaan")}</span>
                </td>
                <td className="px-3 py-3 text-muted">{u.login_terakhir ? waktuSingkatWib(u.login_terakhir) : `Daftar ${tanggal(u.created_at)}`}</td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    {u.id !== admin.id && !(u.peran === "admin" && admin.peran !== "admin") && <TombolHapusPengguna id={u.id} nama={u.nama} email={u.email} jumlahNomor={u.jumlah_nomor} mode="baris" />}
                    <Link
                      href={`/admin/pengguna/${u.id}`}
                      data-analitik="Kelola pengguna"
                      aria-label={`Kelola ${u.email}`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-line-strong hover:bg-surface hover:text-fg"
                    >
                      <span>Kelola</span>
                      <ChevronRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {daftar.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted">
                  Tidak ada pengguna yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
        <p className="text-[12.5px] text-muted">
          Menampilkan <b className="font-semibold text-fg tabular-nums">{daftar.length.toLocaleString("id-ID")}</b> dari{" "}
          <b className="font-semibold text-fg tabular-nums">{jumlah[filter].toLocaleString("id-ID")}</b> pengguna
          {cari ? ` yang cocok dengan "${cari}"` : ""}
          {paket ? ` · paket: ${opsiPaket.find((o) => o.id === paket)?.label ?? paket.slice(2)}` : ""}
        </p>
        {(adaLagi || sp.sebelum) && (
          <div className="flex gap-2">
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
      </div>
    </section>
  );
}

export async function Log({ batas = 25 }: { batas?: number } = {}) {
  await requireStaf();
  const log = await daftarLog(batas);
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-[15px] font-bold">Jejak tindakan admin</h2>
      <ol data-analitik-privat className="mt-4 space-y-3">
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

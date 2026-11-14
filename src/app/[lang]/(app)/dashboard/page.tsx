import { Suspense } from "react";
import { connection } from "next/server";
import { Bot, Users } from "lucide-react";
import { BannerKuota } from "@/components/banner-akun";
import { KartuLangganan } from "@/components/kartu-langganan";
import { GrafikAktivitas } from "@/components/grafik-aktivitas";
import { NumbersList } from "@/components/numbers-list";
import { KartuTerhubung, PanelSistem, PeringatanAi } from "@/components/ringkasan-langsung";
import { KartuStat, KartuUtama, Meter } from "@/components/stat";
import { PanelSyaratNomor } from "@/components/syarat-nomor";
import { TombolTambahNomor } from "@/components/tambah-nomor";
import { angka } from "@/lib/format";
import { daftarNomor, statHarian, tanggalWib } from "@/lib/numbers";
import { TUR_DASHBOARD } from "@/components/isi-tur";
import { TurOtomatis } from "@/components/tur";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { turSelesai } from "@/lib/pengguna";
import { Maskot } from "@/components/maskot/maskot";
import { hakAkunSekali, sisaKuotaAi, syaratBotTerpenuhi } from "@/lib/langganan";
import { kuotaNomor, requireUser } from "@/lib/session";
import { deretHarian, hariTerakhir, persen } from "@/lib/tren";
import { staf } from "@/lib/peran";
import { voucherBelumDiklaimEmail } from "@/lib/voucher";
import { KotakKlaimVoucher } from "@/components/klaim-voucher";

const fmtHariIni = {
  id: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }),
};

export default async function Beranda() {
  const { b, t } = await teksHalaman();
  return (
    <div className="space-y-6 lg:space-y-8">
      <Suspense fallback={null}>
        <BannerKuota />
      </Suspense>
      <Suspense fallback={null}>
        <BannerVoucherDashboard />
      </Suspense>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Suspense fallback={<p className="h-4" />}>
            <TanggalHariIni />
          </Suspense>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">{t("Ringkasan", "Overview")}</h1>
          <p className="mt-1 max-w-xl text-muted">
            {t(
              "Pantau nomor WhatsApp Anda, koneksinya, dan kinerja balasan AI dalam satu layar.",
              "Keep track of your WhatsApp numbers, their connections, and how your AI replies are doing, all on one screen."
            )}
          </p>
        </div>
        <div className="self-start sm:self-auto">
          <TombolTambahNomor />
        </div>
      </div>
      <PeringatanAi />
      <PanelSyaratNomor b={b} />
      <Suspense fallback={<div aria-hidden className="card h-36 animate-denyut" />}>
        <KartuLangganan tautan />
      </Suspense>
      <Suspense fallback={<KerangkaRingkasan />}>
        <Ringkasan />
      </Suspense>
    </div>
  );
}

async function TanggalHariIni() {
  await connection();
  const { b } = await teksHalaman();
  return <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">{fmtHariIni[b].format(new Date())}</p>;
}

async function BannerVoucherDashboard() {
  const user = await requireUser();
  if (staf(user.peran)) return null;
  const voucherEmail = await voucherBelumDiklaimEmail(user.email);
  if (voucherEmail.length === 0) return null;
  return <KotakKlaimVoucher voucherEmail={voucherEmail} ringkas />;
}

/** Dua query paralel: ringkasan per nomor (satu query, tanpa N+1) dan statistik 7 hari (PK stats). */
async function Ringkasan() {
  const [user, { b, t }] = await Promise.all([requireUser(), teksHalaman()]);
  const hari = hariTerakhir(tanggalWib(), 7);
  // hakAkun dibagi dengan banner kuota & kartu langganan (cache per permintaan); sisa kuota dari cache memori 60 dtk.
  const [nomor, stat, kuota, tur, hak, sisaAi] = await Promise.all([
    daftarNomor(user.id, staf(user.peran)),
    statHarian(hari[0], { userId: user.id }),
    kuotaNomor(user),
    turSelesai(user.id),
    hakAkunSekali(user),
    sisaKuotaAi(user.id),
  ]);

  const tren = deretHarian(hari, stat);
  const urutan = new Map(hari.map((t, i) => [t, i]));
  const trenNomor = new Map<number, number[]>();
  for (const s of stat) {
    const i = urutan.get(s.tanggal);
    if (i === undefined) continue;
    let deret = trenNomor.get(s.number_id);
    if (!deret) trenNomor.set(s.number_id, (deret = Array<number>(hari.length).fill(0)));
    deret[i] = s.masuk;
  }

  const kini = tren[tren.length - 1];
  const kemarin = tren[tren.length - 2];
  const rasio = persen(kini.dibalas, kini.masuk);
  const pelanggan = nomor.reduce((a, n) => a + n.jumlah_percakapan, 0);
  const dokumen = nomor.reduce((a, n) => a + n.jumlah_dokumen, 0);
  const karakter = nomor.reduce((a, n) => a + n.jumlah_karakter, 0);
  const adaKuota = syaratBotTerpenuhi(true, sisaAi);

  return (
    <div className="space-y-6 lg:space-y-8">
      <TurOtomatis nama="dashboard" langkah={TUR_DASHBOARD} sudah={tur.includes("dashboard")} />
      <Maskot
        tur={{ nama: "dashboard", langkah: TUR_DASHBOARD }}
        data={{
          jenis: "pengguna",
          nama: (user.nama || user.email.split("@")[0]).split(/\s+/)[0],
          hariIni: { masuk: kini.masuk, dibalas: kini.dibalas },
          kemarin: { masuk: kemarin.masuk, dibalas: kemarin.dibalas },
          pekan: { masuk: tren.reduce((a, x) => a + x.masuk, 0), dibalas: tren.reduce((a, x) => a + x.dibalas, 0) },
          nomor: nomor.map((n) => ({ id: n.id, label: n.label, botAktif: !!n.bot_aktif, knowledge: n.jumlah_karakter > 0 })),
          kuota: { aktif: !(hak.sampai === null && hak.balasan === 0), sisa: sisaAi, batas: hak.balasan },
        }}
      />
      <section aria-label={t("Statistik hari ini", "Today's stats")} data-tur="ringkasan" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KartuUtama
          label={t("Pesan masuk hari ini", "Incoming messages today")}
          nilai={angka(kini.masuk, b)}
          keterangan={t(
            `Kemarin ${angka(kemarin.masuk)} · 7 hari ${angka(tren.reduce((a, x) => a + x.masuk, 0))}`,
            `Yesterday ${angka(kemarin.masuk, b)} · 7 days ${angka(tren.reduce((a, x) => a + x.masuk, 0), b)}`
          )}
          tren={tren.map((x) => x.masuk)}
        />
        <KartuStat
          label={t("Dibalas AI hari ini", "AI replies today")}
          nilai={angka(kini.dibalas, b)}
          ikon={<Bot className="size-4" aria-hidden />}
          keterangan={rasio === null ? t("Belum ada pesan masuk", "No incoming messages yet") : t(`${rasio}% dari pesan masuk`, `${rasio}% of incoming messages`)}
        >
          {rasio !== null && <Meter persen={rasio} label={t("Persentase pesan yang dibalas AI hari ini", "Share of messages the AI replied to today")} />}
        </KartuStat>
        <KartuTerhubung total={nomor.length} />
        <KartuStat
          label={t("Pelanggan tercatat", "Customers recorded")}
          nilai={angka(pelanggan, b)}
          ikon={<Users className="size-4" aria-hidden />}
          keterangan={
            kuota === null
              ? t(`Di ${nomor.length} nomor WhatsApp`, `Across ${nomor.length} WhatsApp ${nomor.length === 1 ? "number" : "numbers"}`)
              : t(`Di ${nomor.length} dari ${kuota} nomor kuota akun`, `Across ${nomor.length} of the ${kuota} ${kuota === 1 ? "number" : "numbers"} in your quota`)
          }
        />
      </section>

      {/* Kesehatan sistem (status mesin AI, galat) hanya untuk admin; pengguna biasa cukup melihat grafik aktivitasnya. */}
      {staf(user.peran) ? (
        <div className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <GrafikAktivitas titik={tren} />
          <PanelSistem botAktif={nomor.filter((n) => n.bot_aktif && n.jumlah_karakter > 0 && adaKuota).length} total={nomor.length} dokumen={dokumen} karakter={karakter} />
        </div>
      ) : (
        <GrafikAktivitas titik={tren} />
      )}

      <NumbersList
        adaKuota={adaKuota}
        nomor={nomor.map((n) => ({
          id: n.id,
          wa_id: n.wa_id,
          label: n.label,
          bot_aktif: !!n.bot_aktif,
          jumlah_dokumen: n.jumlah_dokumen,
          jumlah_karakter: n.jumlah_karakter,
          dibalas_hari_ini: n.dibalas_hari_ini,
          masuk_hari_ini: n.masuk_hari_ini,
          jumlah_percakapan: n.jumlah_percakapan,
          tren: trenNomor.get(n.id) ?? Array<number>(hari.length).fill(0),
        }))}
      />
    </div>
  );
}

function KerangkaRingkasan() {
  return (
    <div aria-hidden className="space-y-6 lg:space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="col-span-2 h-40 animate-denyut rounded-2xl bg-ink/90 xl:col-span-1" />
        <div className="card h-36 animate-denyut" />
        <div className="card h-36 animate-denyut" />
        <div className="card h-36 animate-denyut" />
      </div>
      <div className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card h-80 animate-denyut" />
        <div className="card h-80 animate-denyut" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <div className="card h-64 animate-denyut" />
        <div className="card h-64 animate-denyut" />
      </div>
    </div>
  );
}

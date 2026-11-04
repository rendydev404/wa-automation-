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
import { daftarNomor, siapDipakai, statHarian, tanggalWib } from "@/lib/numbers";
import { TUR_DASHBOARD } from "@/components/isi-tur";
import { TurOtomatis } from "@/components/tur";
import { turSelesai } from "@/lib/pengguna";
import { kuotaNomor, requireUser } from "@/lib/session";
import { deretHarian, hariTerakhir, persen } from "@/lib/tren";

const fmtHariIni = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function Beranda() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <Suspense fallback={null}>
        <BannerKuota />
      </Suspense>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Suspense fallback={<p className="h-4" />}>
            <TanggalHariIni />
          </Suspense>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Ringkasan</h1>
          <p className="mt-1 max-w-xl text-muted">Pantau nomor WhatsApp Anda, koneksinya, dan kinerja balasan AI dalam satu layar.</p>
        </div>
        <div className="self-start sm:self-auto">
          <TombolTambahNomor />
        </div>
      </div>
      <PeringatanAi />
      <PanelSyaratNomor />
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
  return <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">{fmtHariIni.format(new Date())}</p>;
}

/** Dua query paralel: ringkasan per nomor (satu query, tanpa N+1) dan statistik 7 hari (PK stats). */
async function Ringkasan() {
  const user = await requireUser();
  const hari = hariTerakhir(tanggalWib(), 7);
  const [nomor, stat, kuota, tur] = await Promise.all([daftarNomor(user.id, user.peran === "admin"), statHarian(hari[0], { userId: user.id }), kuotaNomor(user), turSelesai(user.id)]);

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

  return (
    <div className="space-y-6 lg:space-y-8">
      <TurOtomatis nama="dashboard" langkah={TUR_DASHBOARD} sudah={tur.includes("dashboard")} />
      <section aria-label="Statistik hari ini" data-tur="ringkasan" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KartuUtama
          label="Pesan masuk hari ini"
          nilai={angka(kini.masuk)}
          keterangan={`Kemarin ${angka(kemarin.masuk)} · 7 hari ${angka(tren.reduce((a, t) => a + t.masuk, 0))}`}
          tren={tren.map((t) => t.masuk)}
        />
        <KartuStat
          label="Dibalas AI hari ini"
          nilai={angka(kini.dibalas)}
          ikon={<Bot className="size-4" aria-hidden />}
          keterangan={rasio === null ? "Belum ada pesan masuk" : `${rasio}% dari pesan masuk`}
        >
          {rasio !== null && <Meter persen={rasio} label="Persentase pesan yang dibalas AI hari ini" />}
        </KartuStat>
        <KartuTerhubung total={nomor.length} />
        <KartuStat
          label="Pelanggan tercatat"
          nilai={angka(pelanggan)}
          ikon={<Users className="size-4" aria-hidden />}
          keterangan={kuota === null ? `Di ${nomor.length} nomor WhatsApp` : `Di ${nomor.length} dari ${kuota} nomor kuota akun`}
        />
      </section>

      {/* Kesehatan sistem (status mesin AI, galat) hanya untuk admin; pengguna biasa cukup melihat grafik aktivitasnya. */}
      {user.peran === "admin" ? (
        <div className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <GrafikAktivitas titik={tren} />
          <PanelSistem botAktif={nomor.filter((n) => n.bot_aktif && siapDipakai(n)).length} total={nomor.length} dokumen={dokumen} karakter={karakter} />
        </div>
      ) : (
        <GrafikAktivitas titik={tren} />
      )}

      <NumbersList
        nomor={nomor.map((n) => ({
          id: n.id,
          wa_id: n.wa_id,
          label: n.label,
          bot_aktif: !!n.bot_aktif,
          ada_penerus: siapDipakai(n),
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

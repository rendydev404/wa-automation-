import { Suspense } from "react";
import { LencanaPaket } from "@/components/lencana-paket";
import { tingkatPaket } from "@/lib/tingkat-paket";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { formatNomor, tanggal, waktuSingkatWib } from "@/lib/format";
import { nomorMilik } from "@/lib/numbers";
import { penggunaById } from "@/lib/pengguna";
import { kuotaBawaan, requireAdmin } from "@/lib/session";
import { infoSesi } from "@/lib/wa";
import { AksiAkun, FormAiAkun, FormBonusKuota, FormBlokir, FormKuota, HapusAkun, HentikanLangganan, PutuskanWa } from "../../form-admin";
import { BerikanPaket } from "../../berikan-paket";
import { sekarang } from "@/lib/db";
import { kursUsd } from "@/lib/kurs";
import { paketCustom } from "@/lib/paket-custom";
import { angka } from "@/lib/format";
import { kunciAnthropic, pengaturanAi, perkiraanPerBalasan } from "@/lib/ai";
import { aiUntukAkun, balasanTerpakai, daftarPaket, hakAkun, langgananAktif, pemakaianNyata, riwayatBonus, riwayatLangganan } from "@/lib/langganan";
import { MEREK } from "@/lib/merek";
import { followupAkun } from "@/lib/followup";
import { LABEL_ACK, LABEL_STATUS } from "@/lib/followup-def";
import { AntrekanUlang, FormTautChatCs } from "../../followup/followup-akun";

export const metadata: Metadata = { title: `Kelola pengguna · ${MEREK}` };

const STATUS: Record<string, string> = {
  WORKING: "Terhubung",
  SCAN_QR_CODE: "Menunggu scan QR",
  STARTING: "Menyiapkan",
  FAILED: "Gagal",
  STOPPED: "Terputus",
  BELUM_ADA: "Belum tersambung",
};

export default function HalamanPengguna(props: PageProps<"/[lang]/admin/pengguna/[id]">) {
  return (
    <div>
      <nav aria-label="Jejak halaman" className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/admin/pengguna" className="font-medium text-muted transition-colors hover:text-fg">
              Pengguna
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            Kelola pengguna
          </li>
        </ol>
      </nav>
      <Suspense fallback={<div aria-hidden className="card h-[520px] animate-denyut" />}>
        <Isi params={props.params} />
      </Suspense>
    </div>
  );
}

async function Isi({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const u = Number.isInteger(id) && id > 0 ? await penggunaById(id) : undefined;
  if (!u) notFound();
  const [nomor, bawaan, hak, aktif, paket, atur, ai, riwayat, custom, kurs, nyata, bonus] = await Promise.all([
    nomorMilik(id),
    kuotaBawaan(),
    hakAkun(u),
    langgananAktif(id),
    daftarPaket({ semua: true, custom: true }),
    pengaturanAi(),
    aiUntukAkun(id),
    riwayatLangganan(id),
    paketCustom(),
    kursUsd(),
    pemakaianNyata(),
    riwayatBonus(id),
  ]);
  const usdCustom = perkiraanPerBalasan(custom.model);
  const kini = sekarang();
  const umum =
    atur.mode === "anthropic"
      ? `Claude API (${atur.model})`
      : atur.mode === "per_paket"
        ? `otomatis menurut paket (${aktif ? "berbayar: Claude API" : "tanpa paket: Hermes"})`
        : "Hermes";
  const terpakai = hak.balasan === null ? 0 : await balasanTerpakai(id, hak.periodeMulai);
  const diriSendiri = u.id === admin.id;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-xl font-bold text-ink-signal uppercase">
            <span aria-hidden className="kisi-tinta absolute inset-0" />
            <span className="relative">{(u.nama || u.email).charAt(0)}</span>
          </span>
          {/* Nama & email akun: klik di dalamnya tercatat "(isi privat)" (analitik tidak menyimpan teks data pribadi). */}
          <div data-analitik-privat className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{u.nama || "(tanpa nama)"}</h1>
              {u.peran === "admin" && <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent uppercase">Admin</span>}
              {u.paket_nama && <LencanaPaket tingkat={tingkatPaket(u.paket_kode, u.paket_nama)} nama={u.paket_nama} />}
              {u.google && <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-bold text-muted uppercase">Google</span>}
              {u.status === "diblokir" ? (
                <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[11.5px] font-semibold text-danger">Diblokir</span>
              ) : (
                <span className="rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-semibold text-success">Aktif</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-muted">{u.email}</p>
          </div>
        </div>
        <dl className="card grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-[12.5px]">
          <dt className="text-muted">Terdaftar</dt>
          <dd className="font-semibold">{tanggal(u.created_at)}</dd>
          <dt className="text-muted">Login terakhir</dt>
          <dd className="font-semibold">{u.login_terakhir ? waktuSingkatWib(u.login_terakhir) : "Belum pernah"}</dd>
          <dt className="text-muted">Pembayaran</dt>
          <dd>
            <Link href={`/admin/transaksi?q=${u.id}`} className="font-semibold text-accent hover:underline">
              Lihat transaksi
            </Link>
          </dd>
          <dt className="text-muted">Aktivitas</dt>
          <dd>
            <Link href={`/admin/analitik?pengguna=${u.id}`} className="font-semibold text-accent hover:underline">
              Lihat analitik
            </Link>
          </dd>
        </dl>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
              <div>
                <h2 className="text-[15px] font-bold">Perangkat WhatsApp</h2>
                <p className="text-[13px] text-muted">
                  {nomor.length} dari {u.peran === "admin" ? "∞" : (u.kuota_nomor ?? bawaan)} kuota terpakai
                </p>
              </div>
              <PutuskanWa id={u.id} jumlah={nomor.filter((n) => n.wa_id).length} />
            </div>
            <ul className="divide-y divide-line">
              {nomor.map((n) => {
                const s = infoSesi(n.sesi);
                return (
                  <li key={n.id}>
                    <Link href={`/nomor/${n.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-subtle/50">
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold">{n.label}</span>
                        <span className="block text-[12.5px] text-muted tabular-nums">{n.wa_id ? formatNomor(n.wa_id) : "Belum ada nomor tertaut"}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1 text-[12px] sm:flex-row sm:items-center sm:gap-2">
                        <span className={`rounded-full px-2.5 py-1 font-semibold ${s.status === "WORKING" ? "bg-success-soft text-success" : "bg-subtle text-muted"}`}>{STATUS[s.status] ?? s.status}</span>
                        <span className={`rounded-full px-2.5 py-1 font-semibold ${n.bot_aktif ? "bg-accent-soft text-accent" : "bg-subtle text-muted"}`}>{n.bot_aktif ? "AI aktif" : "AI mati"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              {nomor.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Belum menambahkan nomor.</li>}
            </ul>
          </section>
          <section className="card p-4 sm:p-6">
            <h2 className="text-[15px] font-bold">Tindakan akun</h2>
            <div className="mt-4">
              <AksiAkun id={u.id} nama={u.nama} email={u.email} jumlahNomor={nomor.length} admin={u.peran === "admin"} diriSendiri={diriSendiri} />
            </div>
          </section>
        </div>
        <div className="min-w-0 space-y-6">
          {u.peran !== "admin" && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">Langganan</h2>
              <p className="mt-1 text-[13px] text-muted">
                <span className="font-semibold text-fg">{hak.paket}</span>
                {hak.sampai ? ` · sampai ${tanggal(hak.sampai)}` : hak.percobaan
                    ? hak.percobaanSampai === null
                      ? " · free trial (tanpa batas waktu)"
                      : ` · free trial ${hak.percobaanBerakhir ? "berakhir" : "sampai"} ${tanggal(hak.percobaanSampai)}`
                    : " · kuota gratis bulanan"}
              </p>
              <p className="mt-1 text-[13px] text-muted tabular-nums">
                Balasan AI: {angka(terpakai)} / {hak.balasan === null ? "∞" : angka(hak.balasan)}
              </p>
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-[13.5px] font-bold">Berikan / perpanjang paket</h3>
                <p className="mt-0.5 mb-4 text-[12px] text-muted">Untuk pembayaran di luar Midtrans (transfer, tunai) atau kompensasi. Pembayarannya ikut tercatat di Transaksi.</p>
                <BerikanPaket
                  userId={u.id}
                  paket={paket.map((p) => ({ id: p.id, kode: p.kode, nama: p.nama, harga: p.harga, durasi_hari: p.durasi_hari, kuota_nomor: p.kuota_nomor, kuota_balasan: p.kuota_balasan, aktif: p.aktif }))}
                  sekarang={aktif ? { paket_id: aktif.paket_id, nama_paket: aktif.nama_paket, sampai: aktif.sampai, kuota_balasan: aktif.kuota_balasan } : null}
                  kini={kini}
                  saran={usdCustom === null ? null : { spek: custom, konteks: { usd: usdCustom, kurs, balasanPerNomorBulan: nyata.balasanPerNomorBulan } }}
                />
              </div>
              {aktif && (
                <div className="mt-4 border-t border-line pt-3">
                  <HentikanLangganan id={u.id} />
                </div>
              )}
              {riwayat.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">Riwayat langganan</p>
                  <ul className="mt-2 space-y-2">
                    {riwayat.map((l) => (
                      <li key={l.id} className="flex items-start justify-between gap-3 text-[12.5px]">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{l.nama_paket}</span>
                          <span className="block text-muted tabular-nums">
                            {tanggal(l.mulai)} – {tanggal(l.sampai)} · {angka(l.kuota_balasan)} balasan · {angka(l.kuota_nomor)} nomor
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${l.sampai > kini ? "bg-success-soft text-success" : "bg-subtle text-muted"}`}>{l.sampai > kini ? "Aktif" : "Berakhir"}</span>
                          <span className="text-[11px] text-faint">{l.sumber === "midtrans" ? "Midtrans" : "Admin"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          {u.peran !== "admin" && (
            <Suspense fallback={<div aria-hidden className="card h-56 animate-denyut" />}>
              <FollowupAkun id={u.id} />
            </Suspense>
          )}
          {u.peran !== "admin" && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">Bonus kuota balasan AI</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Gratis, tanpa tercatat di Transaksi. Berlaku di periode kuota saat ini ({hak.sampai ? `paket sampai ${tanggal(hak.sampai)}` : hak.percobaan ? "masa free trial" : "bulan ini"}) dan langsung dipakai AI.
              </p>
              <p className="mt-3 text-[13px] tabular-nums">
                Kuota periode ini: <span className="font-semibold">{hak.balasan === null ? "∞" : angka(hak.balasan)}</span>
                {hak.bonus > 0 && <span className="text-muted"> (termasuk bonus +{angka(hak.bonus)})</span>} · terpakai {angka(terpakai)}
              </p>
              <div className="mt-4">
                <FormBonusKuota id={u.id} />
              </div>
              {bonus.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">Riwayat bonus</p>
                  <ul className="mt-2 space-y-2">
                    {bonus.map((x) => (
                      <li key={x.id} className="flex items-start justify-between gap-3 text-[12.5px]">
                        <span className="min-w-0">
                          <span className="block font-semibold tabular-nums">+{angka(x.jumlah)} balasan</span>
                          {x.catatan && <span className="block truncate text-muted">{x.catatan}</span>}
                        </span>
                        <span className="max-w-[45%] min-w-0 shrink text-right text-[11.5px] text-faint">
                          {tanggal(x.dibuat)}
                          {x.oleh_email && <span className="block truncate">{x.oleh_email}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          <section className="card p-4 sm:p-6">
            <h2 className="text-[15px] font-bold">Mesin AI akun</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Sekarang dijawab:{" "}
              <span className="font-semibold text-fg">{ai.penyedia === "anthropic" ? `Claude API · ${atur.model}${ai.cadanganHermes ? " (cadangan Hermes)" : ""}` : "Hermes"}</span>
            </p>
            <div className="mt-4">
              <FormAiAkun id={u.id} penyedia={u.ai_penyedia} umum={umum} adaKunci={!!kunciAnthropic()} />
            </div>
          </section>
          {u.peran !== "admin" && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">Kuota perangkat</h2>
              <div className="mt-4">
                <FormKuota id={u.id} kuota={u.kuota_nomor} bawaan={bawaan} />
              </div>
            </section>
          )}
          {!diriSendiri && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">{u.status === "diblokir" ? "Akun diblokir" : "Blokir akun"}</h2>
              <div className="mt-4">
                <FormBlokir id={u.id} diblokir={u.status === "diblokir"} alasan={u.alasan_blokir} />
              </div>
            </section>
          )}
          {!diriSendiri && (
            <section className="card border-danger/30 p-4 sm:p-6">
              <h2 className="text-[15px] font-bold text-danger">Hapus akun</h2>
              <p className="mt-0.5 text-[13px] text-muted">Semua nomor, knowledge, dan histori percakapannya ikut terhapus permanen.</p>
              <div className="mt-4">
                <HapusAkun id={u.id} nama={u.nama} email={u.email} jumlahNomor={nomor.length} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Follow-up WhatsApp nomor CS untuk akun ini: chat tujuan (otomatis / manual), status, dan isian nomor fallback. */
async function FollowupAkun({ id }: { id: number }) {
  const f = await followupAkun(id);
  const b = f.baris;
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-[15px] font-bold">Follow-up WhatsApp</h2>
      <p className="mt-0.5 text-[13px] text-muted">
        {f.tanpaNomorCs
          ? "Nomor CS follow-up belum diatur (Admin › Follow-up WA)."
          : f.chat
            ? `Tujuan: ${f.chat.nama || "(tanpa nama)"}${f.chat.telepon ? ` · ${formatNomor(f.chat.telepon)}` : ""}${f.chat.manual ? " · ditautkan manual" : " · cocok otomatis"}`
            : "Belum ada chat CS yang cocok: akun ini tidak akan dikirimi follow-up sampai nomornya diisi di bawah."}
      </p>
      {b && (
        <div className="mt-3 rounded-xl bg-subtle px-3.5 py-2.5 text-[12.5px]">
          <p className="font-semibold">
            {LABEL_STATUS[b.status]}
            {b.tahap > 0 && <span className="font-normal text-muted"> · {b.tahap} pesan terkirim</span>}
          </p>
          {b.terkirim1 && <p className="text-muted">Sapaan {waktuSingkatWib(b.terkirim1)} · {LABEL_ACK[Math.min(4, b.ack1)]}</p>}
          {b.terkirim2 && <p className="text-muted">Pengingat {waktuSingkatWib(b.terkirim2)} · {LABEL_ACK[Math.min(4, b.ack2)]}</p>}
          {b.dibalas && <p className="text-success">Dibalas {waktuSingkatWib(b.dibalas)}</p>}
          {b.alasan && <p className="text-muted">{b.alasan}</p>}
          {b.tahap === 0 && (b.status === "batal" || b.status === "gagal") && (
            <div className="mt-2 flex justify-end">
              <AntrekanUlang id={id} />
            </div>
          )}
        </div>
      )}
      {!f.tanpaNomorCs && (
        <div className="mt-4">
          <FormTautChatCs id={id} manual={f.chat?.manual ? f.chat.telepon : null} />
        </div>
      )}
    </section>
  );
}

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Link from "@/components/link";
import { Pill } from "@/components/ui";
import { LABEL_STATUS_APLIKASI, labelFitur } from "@/lib/api-def";
import { sekarang } from "@/lib/db";
import { aplikasiById, biayaEfektif, daftarInstalasi, daftarKunci, fiturUntuk, hargaEfektif, pengaturanApi, statusLisensi } from "@/lib/developer-api";
import { angka, formatNomor, tanggal, waktuSingkatWib } from "@/lib/format";
import { sembunyikanKunci } from "@/lib/lisensi-def";
import { modeMesin } from "@/lib/mode";
import { requireDeveloper } from "@/lib/session";
import { FormKeputusan, FormStatus, FormTolak, TombolCabutKunci, TombolLepasStaf } from "../form-developer-api";
import { NADA_STATUS } from "../umum";

const LABEL_LISENSI = { aktif: "Lisensi aktif", belum_bayar: "Belum bayar", ditangguhkan: "Ditangguhkan", dicabut: "Dicabut" } as const;

export default function HalamanDetailAplikasi(props: { params: Promise<{ id: string }> }) {
  if (modeMesin()) notFound();
  return (
    <div>
      <nav aria-label="Jejak halaman" className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/admin/developer-api" className="font-medium text-muted transition-colors hover:text-fg">
              Developer API
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            Kelola aplikasi
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
  await requireDeveloper();
  const id = Number((await params).id);
  const a = await aplikasiById(id);
  if (!a || a.mode === "sandbox") notFound(); // sandbox dikelola di kartu Sandbox / tab Sandbox
  const aktif = a.status === "disetujui" || a.status === "ditangguhkan";
  const umum = await pengaturanApi();
  const [kunci, instalasi, dibagikan] = await Promise.all([aktif || a.status === "dicabut" ? daftarKunci(a.id) : [], aktif ? daftarInstalasi(a.id) : [], fiturUntuk(a.user_id, umum)]);
  const kini = sekarang();
  const lisensi = statusLisensi(a, umum, kini);
  const biaya = biayaEfektif(a, umum);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink text-xl font-bold text-ink-signal uppercase">{a.nama.charAt(0)}</span>
          <div data-analitik-privat className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{a.nama}</h1>
              <Pill nada={NADA_STATUS[a.status]}>{LABEL_STATUS_APLIKASI[a.status]}</Pill>
              {lisensi && lisensi !== "aktif" && <Pill nada="kuning">{LABEL_LISENSI[lisensi]}</Pill>}
              {aktif && <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-bold text-muted uppercase">{biaya === "gratis" ? "Gratis" : `Rp${angka(hargaEfektif(a, umum))}/30 hari`}</span>}
            </div>
            <p className="mt-0.5 truncate text-muted">
              {a.pemilik} · {a.email}
            </p>
          </div>
        </div>
        <dl className="card grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-[12.5px]">
          <dt className="text-muted">Diajukan</dt>
          <dd className="font-semibold">{tanggal(a.created_at)}</dd>
          <dt className="text-muted">Ditinjau</dt>
          <dd className="font-semibold">{a.ditinjau_pada ? tanggal(a.ditinjau_pada) : "Belum"}</dd>
          <dt className="text-muted">Akun</dt>
          <dd>
            <Link href={`/admin/pengguna/${a.user_id}`} className="font-semibold text-accent hover:underline">
              Kelola pengguna
            </Link>
          </dd>
          {biaya === "berbayar" && (
            <>
              <dt className="text-muted">Dibayar sampai</dt>
              <dd className="font-semibold">{a.dibayar_sampai ? tanggal(a.dibayar_sampai) : "Belum pernah"}</dd>
            </>
          )}
        </dl>
      </header>

      {a.alasan && (
        <p className="card border-danger/30 bg-danger-soft p-4 text-[13.5px] text-danger">
          <span className="font-semibold">Alasan {a.status === "ditolak" ? "penolakan" : a.status === "dicabut" ? "pencabutan" : "penangguhan"}: </span>
          {a.alasan}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {(a.status === "menunggu" || a.status === "ditolak") && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">{a.status === "ditolak" ? "Setujui ulang" : "Setujui pengajuan"}</h2>
              <p className="mt-0.5 text-[13px] text-muted">Pilih fitur yang dibuka, biaya, dan batas. Developer lalu membuat API key sendiri di portalnya.</p>
              <div className="mt-5">
                <FormKeputusan id={a.id} mode="setujui" fitur={a.fitur_diminta} diminta={a.fitur_diminta} global={dibagikan.fitur} biaya="ikut_umum" harga={null} batas={a.batas} umum={umum} />
              </div>
            </section>
          )}
          {aktif && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">Fitur, biaya & batas</h2>
              <p className="mt-0.5 text-[13px] text-muted">Perubahan langsung dikirim ke semua mesin aplikasi ini lewat webhook lisensi.</p>
              <div className="mt-5">
                <FormKeputusan id={a.id} mode="ubah" fitur={a.fitur} diminta={a.fitur_diminta} global={dibagikan.fitur} biaya={a.biaya} harga={a.harga_bulan} batas={a.batas} umum={umum} />
              </div>
            </section>
          )}

          {aktif && (
            <section className="card overflow-hidden">
              <div className="border-b border-line p-4 sm:p-5">
                <h2 className="text-[15px] font-bold">Instalasi mesin</h2>
                <p className="text-[13px] text-muted">
                  {instalasi.length} dari maks {a.batas.instalasi} mesin
                </p>
              </div>
              {instalasi.length ? (
                <ul className="divide-y divide-line">
                  {instalasi.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0 flex-1 text-[13px]">
                        <p className="truncate font-semibold">{i.alamat}</p>
                        <p className="text-[12.5px] text-muted">
                          Versi {i.versi_mesin ?? "-"} · {angka(i.jumlah_nomor)} nomor · dipasang {tanggal(i.dibuat)}
                          {i.terakhir_sukses && ` · terhubung ${waktuSingkatWib(i.terakhir_sukses, kini)}`}
                        </p>
                        <p className="font-mono text-[11px] text-faint">{i.id}</p>
                        {i.gagal_sejak && (
                          <p className="mt-1 text-[12.5px] text-danger">
                            Webhook lisensi gagal sejak {waktuSingkatWib(i.gagal_sejak, kini)}
                            {i.galat_terakhir && `: ${i.galat_terakhir}`}
                          </p>
                        )}
                      </div>
                      <TombolLepasStaf id={a.id} instalasiId={i.id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-[13px] text-muted">Belum ada mesin yang aktif.</p>
              )}
            </section>
          )}

          <section className="card p-4 sm:p-6">
            <h2 className="text-[15px] font-bold">Detail pengajuan</h2>
            <dl data-analitik-privat className="mt-3 grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-muted">Kegunaan</dt>
                <dd className="mt-0.5 whitespace-pre-line">{a.kegunaan}</dd>
              </div>
              <div>
                <dt className="text-muted">Akun</dt>
                <dd className="font-semibold">
                  {a.nama_akun || "-"} · {a.email}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Kontak WhatsApp</dt>
                <dd className="font-semibold">
                  <a href={`https://wa.me/${a.kontak_wa}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {formatNomor(a.kontak_wa)}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Domain aplikasi</dt>
                <dd className="truncate font-semibold">
                  {a.alamat_mesin ? (
                    <a href={a.alamat_mesin} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
                      {a.alamat_mesin}
                    </a>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Perkiraan nomor</dt>
                <dd className="font-semibold">{a.perkiraan_nomor !== null ? angka(a.perkiraan_nomor) : "-"}</dd>
              </div>
              {/* Kolom situs tidak ditanyakan lagi (diganti domain aplikasi); hanya tampil untuk pengajuan lama. */}
              {a.situs && (
                <div>
                  <dt className="text-muted">Situs</dt>
                  <dd className="truncate font-semibold">
                    <a href={a.situs} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
                      {a.situs}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted">Fitur diminta</dt>
                <dd className="font-semibold">{a.fitur_diminta.map(labelFitur).join(", ") || "-"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {a.status === "menunggu" && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">Tolak pengajuan</h2>
              <div className="mt-4">
                <FormTolak id={a.id} />
              </div>
            </section>
          )}
          {aktif && (
            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-bold">Status layanan</h2>
              <div className="mt-4">
                <FormStatus id={a.id} status={a.status as "disetujui" | "ditangguhkan"} />
              </div>
            </section>
          )}
          {(aktif || kunci.length > 0) && (
            <section className="card p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold">API key</h2>
                {aktif && kunci.some((k) => !k.dicabut_pada && (k.berlaku_sampai === null || k.berlaku_sampai > kini)) && <TombolCabutKunci id={a.id} />}
              </div>
              <p className="mt-0.5 text-[12.5px] text-muted">Key utuh hanya dilihat developer sekali saat dibuat; di sini hanya awalannya.</p>
              {kunci.length ? (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {kunci.map((k) => {
                    const berlaku = !k.dicabut_pada && (k.berlaku_sampai === null || k.berlaku_sampai > kini);
                    return (
                      <li key={k.id} className="px-3 py-2.5 text-[12.5px]">
                        <code className={`font-mono ${berlaku ? "" : "text-faint line-through"}`}>{sembunyikanKunci(k.awalan)}</code>
                        <p className="text-muted">
                          dibuat {tanggal(k.dibuat)}
                          {k.dicabut_pada ? ` · dicabut ${tanggal(k.dicabut_pada)}` : k.berlaku_sampai ? ` · ${k.berlaku_sampai > kini ? "berlaku sampai" : "kedaluwarsa"} ${waktuSingkatWib(k.berlaku_sampai, kini)}` : " · aktif"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-muted">Developer belum membuat key.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

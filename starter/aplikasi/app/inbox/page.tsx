import Link from "next/link";
import { connection } from "next/server";
import { FormAksi } from "../../komponen/form-aksi";
import { GulirBawah } from "../../komponen/gulir-bawah";
import { PenyegarLangsung } from "../../komponen/penyegar-langsung";
import { Peringatan, PilihNomor } from "../../komponen/umum";
import { type ParamCari, jam, satu, tanggalJam, tautan } from "../../lib/format";
import { coba } from "../../lib/galat";
import { klien } from "../../lib/klien";
import type { Percakapan } from "../../lib/sdk";
import { aksiAturBot, aksiBalas } from "../aksi";

const FILTER = [
  { kode: "semua", label: "Semua" },
  { kode: "bot", label: "Dijawab bot" },
  { kode: "manusia", label: "Dijawab manusia" },
] as const;
type Filter = (typeof FILTER)[number]["kode"];

const LABEL_BOT: Record<Percakapan["bot"], string> = { aktif: "Bot aktif", dijeda: "Bot dijeda", dibisukan: "Bot dibisukan" };
const LABEL_PERAN = { pelanggan: "Pelanggan", ai: "Bot AI", manusia: "Anda" } as const;
const namaTampil = (p: Percakapan): string => p.nama || p.telepon || "Tanpa nama";

/**
 * Inbox: daftar percakapan (kiri), isi pesan + balas manual + jeda/lanjut bot (kanan).
 * Pesan baru tampil sendiri: event `pesan.masuk` / `pesan.dibalas_ai` / `pesan.manusia` dari webhook diteruskan lewat
 * SSE, lalu halaman memuat ulang datanya (paling banyak sekali per 400 ms).
 */
export default async function HalamanInbox({ searchParams }: { searchParams: ParamCari }) {
  await connection();
  const sp = await searchParams;
  const diminta = satu(sp.nomor);
  const pid = satu(sp.p);
  const cari = satu(sp.cari);
  const filter: Filter = FILTER.find((f) => f.kode === satu(sp.filter))?.kode ?? "semua";
  const setelah = satu(sp.setelah);
  const sebelum = satu(sp.sebelum);
  const cg = () => klien();

  // Nomor sudah dipilih: ketiga panggilan berjalan bersamaan. Belum: tunggu daftar nomor untuk memilih yang pertama.
  const janjiNomor = coba(() => cg().nomor.daftar({ batas: 100 }));
  const awal = diminta ? null : await janjiNomor;
  const nomorId = diminta ?? (awal?.ok ? awal.data.data[0]?.id : undefined);
  const [nomor, daftar, isi] = await Promise.all([
    janjiNomor,
    nomorId ? coba(() => cg().percakapan.daftar(nomorId, { batas: 25, cari, filter, setelah })) : null,
    nomorId && pid ? coba(() => cg().percakapan.pesan(nomorId, pid, { batas: 50, sebelum })) : null,
  ]);

  /** Tautan inbox yang mempertahankan nomor, pencarian, dan filter saat ini. */
  const ke = (ubah: Record<string, string | null | undefined>) => tautan("/inbox", { nomor: nomorId, cari, filter: filter === "semua" ? null : filter, ...ubah });

  if (!nomor.ok)
    return (
      <>
        <h1>Inbox</h1>
        <Peringatan galat={nomor.galat} />
      </>
    );
  if (!nomorId)
    return (
      <>
        <h1>Inbox</h1>
        <p className="kartu">Belum ada nomor. Tambah nomor dulu di halaman Sambungkan.</p>
      </>
    );

  const percakapan = isi?.ok ? isi.data.percakapan : null;
  const pesan = isi?.ok ? isi.data.data : [];

  return (
    <>
      <div className="judul-baris">
        <h1>Inbox</h1>
        <PenyegarLangsung query={`nomor=${encodeURIComponent(nomorId)}&jenis=pesan.masuk,pesan.dibalas_ai,pesan.manusia`} />
      </div>

      <section className="kartu">
        <PilihNomor jalur="/inbox" daftar={nomor.data.data} terpilih={nomorId} />
      </section>

      <div className="inbox">
        <aside className="kartu inbox-daftar">
          <form method="get" action="/inbox" className="baris">
            <input type="hidden" name="nomor" value={nomorId} />
            {filter !== "semua" && <input type="hidden" name="filter" value={filter} />}
            <input name="cari" defaultValue={cari} placeholder="Cari nama, nomor, atau isi pesan" aria-label="Cari percakapan" />
            <button type="submit" className="tombol biasa">
              Cari
            </button>
          </form>
          <div className="tab">
            {FILTER.map((f) => (
              <Link key={f.kode} href={ke({ filter: f.kode === "semua" ? null : f.kode })} prefetch={false} aria-current={f.kode === filter ? "page" : undefined}>
                {f.label}
              </Link>
            ))}
          </div>

          {!daftar ? null : !daftar.ok ? (
            <Peringatan galat={daftar.galat} />
          ) : daftar.data.data.length === 0 ? (
            <p className="kecil">{cari ? "Tidak ada percakapan yang cocok." : "Belum ada percakapan. Pesan masuk akan muncul di sini."}</p>
          ) : (
            <>
              <ul className="percakapan">
                {daftar.data.data.map((p) => (
                  <li key={p.id}>
                    <Link href={ke({ p: p.id, setelah })} prefetch={false} aria-current={p.id === pid ? "true" : undefined}>
                      <span className="atas">
                        <strong>{namaTampil(p)}</strong>
                        <time className="kecil">{tanggalJam(p.terakhir_pada)}</time>
                      </span>
                      <span className="cuplikan">
                        {p.pengirim_akhir === "pelanggan" ? "" : `${LABEL_PERAN[p.pengirim_akhir]}: `}
                        {p.cuplikan}
                      </span>
                      {p.bot !== "aktif" && <span className={`lencana ${p.bot}`}>{LABEL_BOT[p.bot]}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="baris">
                {setelah && (
                  <Link href={ke({ p: pid })} prefetch={false}>
                    Ke awal
                  </Link>
                )}
                {daftar.data.berikutnya && (
                  <Link href={ke({ p: pid, setelah: daftar.data.berikutnya })} prefetch={false}>
                    Berikutnya
                  </Link>
                )}
              </div>
            </>
          )}
        </aside>

        <section className="kartu inbox-isi">
          {!pid ? (
            <p className="kecil">Pilih percakapan di sebelah kiri untuk membaca dan membalas.</p>
          ) : isi && !isi.ok ? (
            <Peringatan galat={isi.galat} />
          ) : percakapan ? (
            <>
              <header className="judul-baris">
                <div>
                  <h2>{namaTampil(percakapan)}</h2>
                  <span className="kecil">
                    {percakapan.telepon ?? "Nomor tersembunyi"} · {LABEL_BOT[percakapan.bot]}
                    {percakapan.bot === "dijeda" && percakapan.jeda_sampai ? ` sampai ${jam(percakapan.jeda_sampai)}` : ""}
                  </span>
                </div>
                {percakapan.bot === "aktif" ? (
                  <FormAksi aksi={aksiAturBot.bind(null, nomorId, percakapan.id, "jeda")} tombol="Jeda bot 30 menit" gaya="biasa" kelas="sebaris" />
                ) : (
                  <FormAksi aksi={aksiAturBot.bind(null, nomorId, percakapan.id, "lanjut")} tombol="Lanjutkan bot" gaya="biasa" kelas="sebaris" />
                )}
              </header>

              <div className="baris">
                {isi?.ok && isi.data.ada_sebelumnya && pesan[0] && (
                  <Link href={ke({ p: pid, setelah, sebelum: pesan[0].id })} prefetch={false}>
                    Tampilkan pesan lebih lama
                  </Link>
                )}
                {sebelum && (
                  <Link href={ke({ p: pid, setelah })} prefetch={false}>
                    Kembali ke pesan terbaru
                  </Link>
                )}
              </div>

              <GulirBawah kunci={pesan.at(-1)?.id ?? ""} kelas="pesan">
                {pesan.length === 0 && <p className="kecil">Belum ada pesan.</p>}
                {pesan.map((m) => (
                  <div key={m.id} className={`gelembung ${m.peran}`}>
                    <span className="kecil">
                      {LABEL_PERAN[m.peran]} · {tanggalJam(m.waktu)}
                    </span>
                    <p>{m.teks}</p>
                  </div>
                ))}
              </GulirBawah>

              <FormAksi aksi={aksiBalas.bind(null, nomorId, percakapan.id)} tombol="Kirim balasan" kelas="balas">
                <textarea name="teks" rows={2} maxLength={4000} placeholder="Tulis balasan… (bot dijeda otomatis untuk percakapan ini)" aria-label="Balasan" required />
              </FormAksi>
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}

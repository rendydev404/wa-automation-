import { connection } from "next/server";
import { FormAksi } from "../../komponen/form-aksi";
import { Peringatan, PilihNomor } from "../../komponen/umum";
import { type ParamCari, satu, tanggalJam } from "../../lib/format";
import { coba } from "../../lib/galat";
import { klien } from "../../lib/klien";
import { aksiHapusDokumen, aksiTambahDokumen } from "../aksi";

/** Informasi Usaha: bahan yang dipakai bot AI untuk menjawab pelanggan (daftar, tambah teks, hapus) per nomor. */
export default async function HalamanInformasiUsaha({ searchParams }: { searchParams: ParamCari }) {
  await connection();
  const diminta = satu((await searchParams).nomor);
  const cg = () => klien();

  // Nomor sudah dipilih: daftar nomor & dokumennya diambil bersamaan. Belum: tunggu daftar nomor untuk memilih yang pertama.
  const janjiNomor = coba(() => cg().nomor.daftar({ batas: 100 }));
  const awal = diminta ? null : await janjiNomor;
  const nomorId = diminta ?? (awal?.ok ? awal.data.data[0]?.id : undefined);
  const [nomor, dokumen] = await Promise.all([janjiNomor, nomorId ? coba(() => cg().knowledge.daftar(nomorId)) : null]);

  return (
    <>
      <h1>Informasi Usaha</h1>
      <p className="pengantar">Tulis menu, harga, jam buka, cara pesan, dan hal lain tentang usaha. Bot AI menjawab pelanggan berdasarkan dokumen di sini.</p>

      {!nomor.ok ? (
        <Peringatan galat={nomor.galat} />
      ) : nomor.data.data.length === 0 ? (
        <p className="kartu">Belum ada nomor. Tambah nomor dulu di halaman Sambungkan.</p>
      ) : (
        <>
          <section className="kartu">
            <PilihNomor jalur="/informasi-usaha" daftar={nomor.data.data} terpilih={nomorId} />
          </section>

          {nomorId && dokumen && (
            <>
              <section className="kartu">
                <h2>Dokumen</h2>
                {!dokumen.ok ? (
                  <Peringatan galat={dokumen.galat} />
                ) : dokumen.data.data.length === 0 ? (
                  <p>Belum ada dokumen untuk nomor ini.</p>
                ) : (
                  <ul className="daftar">
                    {dokumen.data.data.map((d) => (
                      <li key={d.id}>
                        <span>
                          <strong>{d.judul}</strong>
                          <span className="kecil">
                            {" "}
                            {d.sumber} · {d.karakter.toLocaleString("id-ID")} karakter · {tanggalJam(d.dibuat)}
                          </span>
                        </span>
                        <FormAksi aksi={aksiHapusDokumen.bind(null, nomorId, d.id)} tombol="Hapus" gaya="bahaya" kelas="sebaris" />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="kartu">
                <h2>Tambah dokumen teks</h2>
                <FormAksi aksi={aksiTambahDokumen.bind(null, nomorId)} tombol="Simpan">
                  <label htmlFor="judul">Judul</label>
                  <input id="judul" name="judul" placeholder="mis. Menu & harga" maxLength={120} />
                  <label htmlFor="teks">Isi</label>
                  <textarea id="teks" name="teks" rows={8} placeholder={"Paket Hemat Rp25.000: nasi, ayam, es teh\nBuka setiap hari 10.00–21.00"} required />
                </FormAksi>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

import { connection } from "next/server";
import { FormAksi } from "../../komponen/form-aksi";
import { Peringatan } from "../../komponen/umum";
import { type ParamCari, satu } from "../../lib/format";
import { coba } from "../../lib/galat";
import { klien } from "../../lib/klien";
import { aksiKirimPesan } from "../aksi";

/** Kirim pesan: masuk antrean anti-blokir mesin (`cg.pesan.kirim` dengan kunci idempotensi, lihat app/aksi.ts). */
export default async function HalamanKirim({ searchParams }: { searchParams: ParamCari }) {
  await connection();
  const diminta = satu((await searchParams).nomor);
  const nomor = await coba(() => klien().nomor.daftar({ batas: 100 }));

  return (
    <>
      <h1>Kirim pesan</h1>
      <p className="pengantar">Pesan tidak langsung terkirim: mesin memasukkannya ke antrean dengan jeda acak supaya nomor aman dari blokir.</p>

      <section className="kartu">
        {!nomor.ok ? (
          <Peringatan galat={nomor.galat} />
        ) : nomor.data.data.length === 0 ? (
          <p>Belum ada nomor. Tambah nomor dulu di halaman Sambungkan.</p>
        ) : (
          <FormAksi aksi={aksiKirimPesan} tombol="Kirim">
            <label htmlFor="nomor_id">Kirim dari</label>
            <select id="nomor_id" name="nomor_id" defaultValue={diminta ?? nomor.data.data[0].id}>
              {nomor.data.data.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                  {n.status === "terhubung" ? "" : " (belum terhubung)"}
                </option>
              ))}
            </select>
            <label htmlFor="ke">Nomor atau ID grup tujuan</label>
            <input id="ke" name="ke" placeholder="6281234567890 atau 120363041234567890@g.us" required />
            <label htmlFor="teks">Pesan</label>
            <textarea id="teks" name="teks" rows={4} maxLength={4000} placeholder="Pesanan kakak siap diambil!" required />
          </FormAksi>
        )}
      </section>
    </>
  );
}

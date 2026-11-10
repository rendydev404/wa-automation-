import Link from "next/link";
import { connection } from "next/server";
import { FormAksi } from "../../komponen/form-aksi";
import { PanelSambung } from "../../komponen/panel-sambung";
import { LencanaStatus, Peringatan } from "../../komponen/umum";
import { type ParamCari, satu, tautan } from "../../lib/format";
import { coba } from "../../lib/galat";
import { klien } from "../../lib/klien";
import { aksiPairing, aksiTambahNomor } from "../aksi";

/** Sambungkan nomor: tambah nomor, pindai QR (langsung lewat event `nomor.qr`), atau pakai kode pairing. */
export default async function HalamanSambungkan({ searchParams }: { searchParams: ParamCari }) {
  await connection();
  const terpilihId = satu((await searchParams).nomor);
  const nomor = await coba(() => klien().nomor.daftar({ batas: 100 }));
  const terpilih = nomor.ok ? nomor.data.data.find((n) => n.id === terpilihId) : undefined;

  return (
    <>
      <h1>Sambungkan nomor</h1>

      <section className="kartu">
        <h2>Tambah nomor</h2>
        <FormAksi aksi={aksiTambahNomor} tombol="Tambah & tampilkan QR" kelas="baris">
          <label htmlFor="label">Nama nomor</label>
          <input id="label" name="label" placeholder="mis. CS Toko" maxLength={60} required />
        </FormAksi>
      </section>

      <section className="kartu">
        <h2>Nomor Anda</h2>
        {!nomor.ok ? (
          <Peringatan galat={nomor.galat} />
        ) : nomor.data.data.length === 0 ? (
          <p>Belum ada nomor. Tambah dulu di atas.</p>
        ) : (
          <ul className="daftar">
            {nomor.data.data.map((n) => (
              <li key={n.id} className={n.id === terpilihId ? "terpilih" : undefined}>
                <span>
                  <strong>{n.label}</strong> {n.wa_id && <span className="kecil">{n.wa_id}</span>}
                </span>
                <LencanaStatus status={n.status} />
                <Link href={tautan("/sambungkan", { nomor: n.id })} prefetch={false}>
                  {n.status === "terhubung" ? "Lihat" : "Tampilkan QR"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {terpilih && (
        <section className="kartu">
          <h2>{terpilih.label}</h2>
          {/* key memuat status: panel dibuat ulang saat status di server berubah (mis. baru saja terhubung). */}
          <PanelSambung key={`${terpilih.id}:${terpilih.status}`} nomorId={terpilih.id} statusAwal={terpilih.status} />

          {terpilih.status !== "terhubung" && (
            <>
              <h3>Tidak bisa memindai? Pakai kode pairing</h3>
              <FormAksi aksi={aksiPairing.bind(null, terpilih.id)} tombol="Minta kode pairing" kelas="baris" gaya="biasa" kosongkan={false}>
                <label htmlFor="nomor_hp">Nomor HP WhatsApp</label>
                <input id="nomor_hp" name="nomor_hp" inputMode="numeric" placeholder="6281234567890" required />
              </FormAksi>
            </>
          )}
        </section>
      )}
      {terpilihId && nomor.ok && !terpilih && <p className="catatan galat">Nomor dengan id {terpilihId} tidak ditemukan di mesin.</p>}
    </>
  );
}

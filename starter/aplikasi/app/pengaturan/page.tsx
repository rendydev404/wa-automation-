import { connection } from "next/server";
import { FormAksi } from "../../komponen/form-aksi";
import { PenyegarLangsung } from "../../komponen/penyegar-langsung";
import { Peringatan } from "../../komponen/umum";
import { tanggalJam } from "../../lib/format";
import { coba } from "../../lib/galat";
import { klien, urlWebhook } from "../../lib/klien";
import { terbaru } from "../../lib/peristiwa";
import { rahasiaWebhook } from "../../lib/rahasia";
import { aksiDaftarkanWebhook, aksiUjiWebhook } from "../aksi";

/** Awalan key saja (cg_test_ / cg_live_), tidak pernah isinya. */
const jenisKey = (key: string | undefined): string => (!key ? "belum diisi" : key.startsWith("cg_test_") ? "terisi (cg_test_…, sandbox)" : key.startsWith("cg_live_") ? "terisi (cg_live_…, production)" : "terisi");

/** Pengaturan: hubungkan webhook mesin ke aplikasi ini, uji, dan lihat event yang baru diterima. */
export default async function HalamanPengaturan() {
  await connection();
  const tujuan = urlWebhook();
  const webhook = await coba(() => klien().webhook.ambil());
  const event = terbaru(15);
  const cocok = webhook.ok && webhook.data.url === tujuan;

  return (
    <>
      <div className="judul-baris">
        <h1>Pengaturan</h1>
        <PenyegarLangsung query="jenis=webhook.uji,pesan.masuk,pesan.dibalas_ai,pesan.manusia,pesan.status,nomor.status,nomor.terhubung,nomor.terputus" />
      </div>

      <section className="kartu">
        <h2>Sambungan ke mesin</h2>
        <dl className="rincian">
          <dt>CHATGERCEP_ALAMAT</dt>
          <dd>{process.env.CHATGERCEP_ALAMAT?.trim() || "belum diisi"}</dd>
          <dt>CHATGERCEP_KEY</dt>
          <dd>{jenisKey(process.env.CHATGERCEP_KEY?.trim())}</dd>
          <dt>CHATGERCEP_RAHASIA_WEBHOOK</dt>
          <dd>{process.env.CHATGERCEP_RAHASIA_WEBHOOK?.trim() ? "terisi" : rahasiaWebhook() ? "di memori saja (belum disimpan ke .env.local)" : "belum diisi"}</dd>
          <dt>ALAMAT_APLIKASI</dt>
          <dd>{tujuan.replace(/\/api\/webhook$/, "")}</dd>
        </dl>
      </section>

      <section className="kartu">
        <h2>Webhook</h2>
        <p className="pengantar">
          Mesin mengirim event (pesan masuk, balasan bot, QR, status nomor) ke <code>{tujuan}</code>. Mesin harus bisa membuka alamat itu: bila mesin berjalan di Docker di komputer yang sama, isi ALAMAT_APLIKASI dengan{" "}
          <code>http://host.docker.internal:3000</code>.
        </p>
        {!webhook.ok ? (
          <Peringatan galat={webhook.galat} />
        ) : (
          <dl className="rincian">
            <dt>Terdaftar di mesin</dt>
            <dd>
              {webhook.data.url ?? "Belum ada"} {webhook.data.url && <span className={`lencana ${cocok ? "terhubung" : "terputus"}`}>{cocok ? "Aplikasi ini" : "Bukan aplikasi ini"}</span>}
            </dd>
            <dt>Event</dt>
            <dd className="keping">{webhook.data.event.length ? webhook.data.event.map((e) => <span key={e}>{e}</span>) : "-"}</dd>
            <dt>Keadaan</dt>
            <dd>{!webhook.data.url ? "-" : webhook.data.gagal_sejak ? `Gagal terkirim sejak ${tanggalJam(webhook.data.gagal_sejak)}` : webhook.data.aktif ? "Sehat" : "Nonaktif"}</dd>
          </dl>
        )}

        <FormAksi aksi={aksiDaftarkanWebhook} tombol={cocok ? "Daftarkan ulang (rahasia baru)" : "Daftarkan webhook aplikasi ini"} kelas="form" />
        <p className="kecil">Mendaftarkan ulang membuat rahasia baru dan rahasia lama berhenti berlaku. Rahasia hanya ditampilkan sekali.</p>

        <FormAksi aksi={aksiUjiWebhook} tombol="Kirim event uji" gaya="biasa" kelas="form" />
      </section>

      <section className="kartu">
        <h2>Event terakhir diterima</h2>
        {event.length === 0 ? (
          <p className="kecil">Belum ada event sejak aplikasi dijalankan. Tekan Kirim event uji untuk mencoba.</p>
        ) : (
          <div className="gulir-x">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Jenis</th>
                  <th>Nomor</th>
                  <th>Id event</th>
                </tr>
              </thead>
              <tbody>
                {event.map((e) => (
                  <tr key={e.id_event}>
                    <td>{tanggalJam(e.waktu)}</td>
                    <td>
                      {e.jenis} {e.mode === "sandbox" && <span className="lencana sandbox">sandbox</span>}
                    </td>
                    <td>{e.nomor_id ?? "-"}</td>
                    <td className="kecil">{e.id_event}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

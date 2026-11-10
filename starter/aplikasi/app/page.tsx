import Link from "next/link";
import { connection } from "next/server";
import { LencanaStatus, Peringatan } from "../komponen/umum";
import { tanggalJam, tautan } from "../lib/format";
import { coba } from "../lib/galat";
import { klien } from "../lib/klien";

/** Ringkasan: status mesin (mode, lisensi, fitur) dan daftar nomor. Dua panggilan API, dijalankan bersamaan. */
export default async function HalamanRingkasan() {
  // Selalu dirender saat diminta (data mesin tidak boleh ikut ter-prerender saat build). Harus sebelum panggilan SDK.
  await connection();
  const [status, nomor] = await Promise.all([coba(() => klien().status()), coba(() => klien().nomor.daftar({ batas: 100 }))]);

  return (
    <>
      <h1>Ringkasan</h1>

      <section className="kartu">
        <h2>Mesin</h2>
        {!status.ok ? (
          <Peringatan galat={status.galat} />
        ) : (
          <>
            <dl className="rincian">
              <dt>Mode</dt>
              <dd>
                <span className={`lencana ${status.data.mode}`}>{status.data.mode === "sandbox" ? "Sandbox" : "Production"}</span>
              </dd>
              <dt>Versi mesin</dt>
              <dd>{status.data.versi}</dd>
              <dt>Aplikasi</dt>
              <dd>{status.data.lisensi.aplikasi ?? "-"}</dd>
              <dt>Lisensi</dt>
              <dd>
                {status.data.lisensi.status}, berlaku sampai {tanggalJam(status.data.lisensi.berlaku_sampai)}
              </dd>
              {status.data.mode === "sandbox" && (
                <>
                  <dt>Nomor penguji</dt>
                  <dd>{status.data.nomor_uji ?? "Belum diverifikasi (daftarkan di portal Developer)"}</dd>
                </>
              )}
              <dt>Nomor</dt>
              <dd>
                {status.data.nomor.terhubung} terhubung dari {status.data.nomor.total}
                {status.data.lisensi.batas ? ` (maks ${status.data.lisensi.batas.nomor})` : ""}
              </dd>
              <dt>Fitur dibuka</dt>
              <dd className="keping">{status.data.lisensi.fitur.length ? status.data.lisensi.fitur.map((f) => <span key={f}>{f}</span>) : "Belum ada"}</dd>
            </dl>
            {status.data.lisensi.alasan && <p className="catatan galat">{status.data.lisensi.alasan}</p>}
          </>
        )}
      </section>

      <section className="kartu">
        <h2>Nomor WhatsApp</h2>
        {!nomor.ok ? (
          <Peringatan galat={nomor.galat} />
        ) : nomor.data.data.length === 0 ? (
          <p>
            Belum ada nomor.{" "}
            <Link href="/sambungkan" prefetch={false}>
              Tambah nomor pertama
            </Link>
            .
          </p>
        ) : (
          <div className="gulir-x">
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Status</th>
                  <th>WhatsApp</th>
                  <th>Bot</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {nomor.data.data.map((n) => (
                  <tr key={n.id}>
                    <td>{n.label}</td>
                    <td>
                      <LencanaStatus status={n.status} />
                    </td>
                    <td>{n.wa_id ? `${n.wa_id}${n.nama_wa ? ` · ${n.nama_wa}` : ""}` : "-"}</td>
                    <td>{n.bot_aktif ? "Aktif" : "Mati"}</td>
                    <td className="aksi">
                      {n.status === "terhubung" ? (
                        <Link href={tautan("/inbox", { nomor: n.id })} prefetch={false}>
                          Inbox
                        </Link>
                      ) : (
                        <Link href={tautan("/sambungkan", { nomor: n.id })} prefetch={false}>
                          Sambungkan
                        </Link>
                      )}
                    </td>
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

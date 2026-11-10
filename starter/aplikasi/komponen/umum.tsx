import type { GalatRamah } from "../lib/galat";
import type { Nomor, StatusNomor } from "../lib/sdk";

/** Kotak pesan galat ramah (lihat lib/galat.ts untuk mengubah teksnya). */
export function Peringatan({ galat }: { galat: GalatRamah }) {
  return (
    <div role="alert" className="catatan galat">
      <p>{galat.pesan}</p>
      {galat.rinci && <p className="kecil">{galat.rinci}</p>}
    </div>
  );
}

const LABEL_STATUS: Record<StatusNomor, string> = {
  terhubung: "Terhubung",
  menunggu_qr: "Menunggu QR",
  menyambung: "Menyambung",
  terputus: "Terputus",
};

export function LencanaStatus({ status }: { status: StatusNomor }) {
  return <span className={`lencana ${status}`}>{LABEL_STATUS[status] ?? status}</span>;
}

/** Pemilih nomor tanpa JavaScript: form GET yang menaruh `?nomor=<id>` di alamat halaman. */
export function PilihNomor({ jalur, daftar, terpilih }: { jalur: string; daftar: Nomor[]; terpilih?: string }) {
  return (
    <form method="get" action={jalur} className="baris">
      <label htmlFor="pilih-nomor">Nomor</label>
      <select id="pilih-nomor" name="nomor" defaultValue={terpilih}>
        {daftar.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
            {n.wa_id ? ` (${n.wa_id})` : ""}
          </option>
        ))}
      </select>
      <button type="submit" className="tombol biasa">
        Pilih
      </button>
    </form>
  );
}

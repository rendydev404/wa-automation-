import Link from "next/link";

export default function NomorTidakDitemukan() {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <p className="text-[15px] font-bold">Nomor tidak ditemukan</p>
      <p className="hint mt-1">Nomor ini mungkin sudah dihapus.</p>
      <Link href="/dashboard" className="btn btn-primary mt-5">
        Kembali ke daftar nomor
      </Link>
    </div>
  );
}

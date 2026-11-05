"use client";

import { useBahasa } from "@/components/bahasa";
import Link from "@/components/link";

export default function NomorTidakDitemukan() {
  const { t } = useBahasa();
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <p className="text-[15px] font-bold">{t("Nomor tidak ditemukan", "Number not found")}</p>
      <p className="hint mt-1">{t("Nomor ini mungkin sudah dihapus.", "This number may have been deleted.")}</p>
      <Link href="/dashboard" className="btn btn-primary mt-5">
        {t("Kembali ke daftar nomor", "Back to your numbers")}
      </Link>
    </div>
  );
}

import { jamWib, tanggal } from "@/lib/format";
import type { InfoKurs } from "@/lib/kurs-def";

/** Kurs USD → Rp yang dipakai sistem (otomatis dari data pasar, tidak bisa diisi manual) beserta asal & umur datanya. */
export function KursInfo({ info }: { info: InfoKurs }) {
  const tglData = info.tanggal ? tanggal(Date.parse(`${info.tanggal}T12:00:00Z`) / 1000) : null;
  return (
    <div>
      <p className="label">Kurs USD → Rp (data pasar, otomatis)</p>
      <p className="text-[18px] font-extrabold tracking-tight tabular-nums">Rp{info.kurs.toLocaleString("id-ID")}</p>
      <p className="mt-0.5 text-[11.5px] text-faint">
        {info.cadangan
          ? "Kurs pasar belum bisa diambil; sementara memakai perkiraan cadangan. Dicoba lagi otomatis."
          : `${info.sumber}${tglData ? ` · data ${tglData}` : ""} · diambil ${jamWib(info.diambil)} WIB · diperbarui otomatis tiap jam.`}
      </p>
      {info.basi && <p className="mt-0.5 text-[11.5px] text-warning">Sumber kurs sedang tidak terjangkau; memakai nilai pasar terakhir yang berhasil diambil.</p>}
    </div>
  );
}

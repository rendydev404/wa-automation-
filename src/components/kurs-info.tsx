import { Loader2, RefreshCw } from "lucide-react";
import { jamWib, kunciHariWib, tanggal } from "@/lib/format";
import type { InfoKurs } from "@/lib/kurs-def";

/** "Frankfurter (kurs referensi ECB)" -> "Frankfurter": nama pendek untuk baris pembanding. */
const singkat = (nama: string) => nama.replace(/\s*\(.*\)$/, "");

/**
 * Kurs USD → Rp yang dipakai sistem (otomatis dari data pasar, tidak bisa diisi manual) beserta asal, umur, dan
 * sumber pembandingnya. `segarkan` (opsional) menampilkan tombol untuk mengambil ulang dari sumber sekarang juga.
 */
export function KursInfo({ info, segarkan, sedang, galat }: { info: InfoKurs; segarkan?: () => void; sedang?: boolean; galat?: boolean }) {
  // Jam data ditulis tanpa tanggal bila harinya sama dengan saat diambil (pembanding "hari ini" tanpa Date.now()).
  const dataPada = info.waktuData
    ? `${kunciHariWib(info.waktuData) === kunciHariWib(info.diambil) ? "" : `${tanggal(info.waktuData)} `}${jamWib(info.waktuData)} WIB`
    : info.tanggal
      ? tanggal(Date.parse(`${info.tanggal}T12:00:00Z`) / 1000)
      : null;
  const live = info.langsung && !info.basi && !info.cadangan;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="label mb-0">Kurs USD → Rp (data pasar, otomatis)</p>
        {segarkan && (
          <button type="button" onClick={segarkan} disabled={sedang} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-60">
            {sedang ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            Perbarui
          </button>
        )}
      </div>
      <p className="mt-1 flex items-center gap-2 text-[18px] font-extrabold tracking-tight tabular-nums">
        Rp{info.kurs.toLocaleString("id-ID")}
        {live && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-success uppercase">
            <span aria-hidden className="size-1.5 animate-denyut rounded-full bg-success" /> Live
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[11.5px] text-faint">
        {info.cadangan
          ? "Kurs pasar belum bisa diambil; sementara memakai perkiraan cadangan. Dicoba lagi otomatis."
          : `${info.sumber}${dataPada ? ` · data ${dataPada}` : ""} · dicek ${jamWib(info.diambil)} WIB · diperbarui otomatis tiap 10 menit.`}
      </p>
      {info.pembanding.length > 0 && (
        <p className="mt-0.5 text-[11.5px] text-faint">
          Dicek silang:{" "}
          {info.pembanding.map((p, i) => (
            <span key={p.sumber} className={p.cocok ? "" : "text-warning"}>
              {i > 0 && " · "}
              {singkat(p.sumber)} Rp{p.kurs.toLocaleString("id-ID")}
              {!p.cocok && " (menyimpang, diabaikan)"}
            </span>
          ))}
        </p>
      )}
      {info.basi && <p className="mt-0.5 text-[11.5px] text-warning">Sumber kurs sedang tidak terjangkau; memakai nilai pasar terakhir yang berhasil diambil.</p>}
      {galat && <p className="mt-0.5 text-[11.5px] text-warning">Kurs belum bisa diperbarui dari browser; angka di atas tetap yang terakhir.</p>}
    </div>
  );
}

import Link from "next/link";
import { angka, tanggal } from "@/lib/format";
import { balasanTerpakai, hakAkun } from "@/lib/langganan";
import { nomorMilik } from "@/lib/numbers";
import { requireUser } from "@/lib/session";
import { Meter } from "./stat";

/**
 * Paket aktif, pemakaian kuota balasan AI (dengan bilah kemajuan), dan kuota nomor. Dipakai di Langganan, Ringkasan,
 * dan Akun saya. `tautan`: tombol ke halaman Langganan (tidak dipasang di halaman Langganan sendiri).
 */
export async function KartuLangganan({ tautan = false }: { tautan?: boolean }) {
  const user = await requireUser();
  const hak = await hakAkun(user);
  const [terpakai, nomor] = await Promise.all([hak.balasan === null ? Promise.resolve(0) : balasanTerpakai(user.id, hak.periodeMulai), nomorMilik(user.id)]);
  const persenBalasan = hak.balasan ? Math.min(100, Math.round((terpakai / hak.balasan) * 100)) : 0;
  const habis = hak.balasan !== null && terpakai >= hak.balasan;
  const tipis = !habis && hak.balasan !== null && persenBalasan >= 80;
  return (
    <section aria-label="Langganan dan kuota" className="card grid gap-6 p-6 md:grid-cols-3">
      <div>
        <p className="text-[12.5px] font-semibold text-muted">Paket sekarang</p>
        <p className="mt-1 text-2xl font-bold">{hak.paket}</p>
        <p className="mt-1 text-[13px] text-muted">
          {hak.sampai ? `Aktif sampai ${tanggal(hak.sampai)}` : hak.paket === "Admin" ? "Tanpa batas" : "Kuota gratis, berulang tiap awal bulan"}
        </p>
      </div>
      <div>
        <p className="text-[12.5px] font-semibold text-muted">Balasan AI {hak.sampai ? "masa ini" : "bulan ini"}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {angka(terpakai)}
          <span className="text-base text-muted"> / {hak.balasan === null ? "∞" : angka(hak.balasan)}</span>
        </p>
        {hak.balasan !== null && (
          <div className="mt-2">
            <Meter persen={persenBalasan} label="Pemakaian kuota balasan AI" nada={habis ? "bahaya" : tipis ? "waspada" : "normal"} />
          </div>
        )}
        {habis ? (
          <p className="mt-2 text-[12.5px] font-semibold text-danger">Kuota habis: AI berhenti membalas sampai paket diperpanjang.</p>
        ) : tipis ? (
          <p className="mt-2 text-[12.5px] font-semibold text-warning">Sisa {angka(hak.balasan! - terpakai)} balasan lagi.</p>
        ) : null}
      </div>
      <div className="flex flex-col justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-semibold text-muted">Nomor WhatsApp</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {nomor.length}
            <span className="text-base text-muted"> / {hak.nomor === null ? "∞" : hak.nomor}</span>
          </p>
        </div>
        {tautan && hak.paket !== "Admin" && (
          <Link href="/langganan" className={`btn self-start ${habis || tipis ? "btn-primary" : "btn-ghost border border-line"}`}>
            {habis ? "Perpanjang paket" : "Kelola paket"}
          </Link>
        )}
      </div>
    </section>
  );
}

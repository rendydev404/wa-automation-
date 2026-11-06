import Link from "@/components/link";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { angka, tanggal } from "@/lib/format";
import { balasanTerpakai, hakAkun } from "@/lib/langganan";
import { nomorMilik } from "@/lib/numbers";
import { requireUser } from "@/lib/session";
import { tingkatPaket } from "@/lib/tingkat-paket";
import { LencanaPaket } from "./lencana-paket";
import { Meter } from "./stat";

/**
 * Paket aktif, pemakaian kuota balasan AI (dengan bilah kemajuan), dan kuota nomor. Dipakai di Langganan, Ringkasan,
 * dan Akun saya. `tautan`: tombol ke halaman Langganan (tidak dipasang di halaman Langganan sendiri).
 */
export async function KartuLangganan({ tautan = false }: { tautan?: boolean }) {
  const [user, { b, t }] = await Promise.all([requireUser(), teksHalaman()]);
  const hak = await hakAkun(user);
  const [terpakai, nomor] = await Promise.all([hak.balasan === null ? Promise.resolve(0) : balasanTerpakai(user.id, hak.periodeMulai), nomorMilik(user.id)]);
  const persenBalasan = hak.balasan ? Math.min(100, Math.round((terpakai / hak.balasan) * 100)) : 0;
  const berakhir = hak.percobaanBerakhir;
  const habis = berakhir || (hak.balasan !== null && terpakai >= hak.balasan);
  const tipis = !habis && hak.balasan !== null && persenBalasan >= 80;
  return (
    <section aria-label={t("Langganan dan kuota", "Subscription and quota")} className="card grid gap-5 p-5 sm:gap-6 sm:p-6 md:grid-cols-3">
      <div>
        <p className="text-[12.5px] font-semibold text-muted">{t("Paket sekarang", "Current plan")}</p>
        {hak.sampai ? (
          <p className="mt-2">
            <LencanaPaket tingkat={tingkatPaket(hak.kodePaket, hak.paket)} nama={hak.paket} ukuran="lg" />
          </p>
        ) : (
          <p className="mt-1 text-2xl font-bold">{hak.paket === "Gratis" ? t("Gratis", "Free") : hak.paket}</p>
        )}
        <p className="mt-1 text-[13px] text-muted">
          {hak.sampai ? t(`Aktif sampai ${tanggal(hak.sampai)}`, `Active until ${tanggal(hak.sampai, b)}`) : hak.paket === "Admin" ? t("Tanpa batas", "Unlimited") : hak.percobaan
              ? hak.percobaanSampai === null
                ? t("Kuota percobaan gratis, sekali pakai", "Free trial quota, one-time")
                : berakhir
                  ? t(`Masa percobaan berakhir ${tanggal(hak.percobaanSampai)}`, `Trial ended ${tanggal(hak.percobaanSampai, b)}`)
                  : t(`Masa percobaan sampai ${tanggal(hak.percobaanSampai)}`, `Trial until ${tanggal(hak.percobaanSampai, b)}`)
              : t("Kuota gratis, diperbarui tiap awal bulan", "Free quota, renewed at the start of each month")}
        </p>
      </div>
      <div>
        <p className="text-[12.5px] font-semibold text-muted">{hak.sampai ? t("Balasan AI masa ini", "AI replies this period") : hak.percobaan ? t("Balasan AI percobaan", "Trial AI replies") : t("Balasan AI bulan ini", "AI replies this month")}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {angka(terpakai, b)}
          <span className="text-base text-muted"> / {hak.balasan === null ? "∞" : angka(hak.balasan, b)}</span>
        </p>
        {hak.balasan !== null && (
          <div className="mt-2">
            <Meter persen={persenBalasan} label={t("Pemakaian kuota balasan AI", "AI reply quota usage")} nada={habis ? "bahaya" : tipis ? "waspada" : "normal"} />
          </div>
        )}
        {habis ? (
          <p className="mt-2 text-[12.5px] font-semibold text-danger">
            {berakhir
              ? t("Masa percobaan sudah berakhir: AI berhenti membalas. Pilih paket untuk melanjutkan.", "Your trial has ended: the AI has stopped replying. Choose a plan to continue.")
              : hak.percobaan
                ? t("Kuota percobaan habis: AI berhenti membalas. Pilih paket untuk melanjutkan.", "Your trial quota is used up: the AI has stopped replying. Choose a plan to continue.")
                : t("Kuota habis: AI berhenti membalas sampai paket diperpanjang.", "Quota used up: the AI has stopped replying until you renew your plan.")}
          </p>
        ) : tipis ? (
          <p className="mt-2 text-[12.5px] font-semibold text-warning">{t(`Sisa ${angka(hak.balasan! - terpakai)} balasan lagi.`, `${angka(hak.balasan! - terpakai, b)} ${hak.balasan! - terpakai === 1 ? "reply" : "replies"} left.`)}</p>
        ) : null}
      </div>
      <div className="flex flex-col justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-semibold text-muted">{t("Nomor WhatsApp", "WhatsApp numbers")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {nomor.length}
            <span className="text-base text-muted"> / {hak.nomor === null ? "∞" : hak.nomor}</span>
          </p>
        </div>
        {tautan && hak.paket !== "Admin" && (
          // Akun gratis yang AI-nya berhenti: ke halaman hasil trial + pilihan paket (/trial-habis), bukan langsung ke tagihan.
          <Link href={habis && hak.sampai === null ? "/trial-habis" : "/langganan"} className={`btn self-start ${habis || tipis ? "btn-primary" : "btn-ghost border border-line"}`}>
            {hak.paket === "Gratis" ? t("Pilih paket", "Choose a plan") : habis ? t("Perpanjang paket", "Renew plan") : t("Kelola paket", "Manage plan")}
          </Link>
        )}
      </div>
    </section>
  );
}

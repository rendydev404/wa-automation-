import { FlaskConical } from "lucide-react";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { tanggal } from "@/lib/format";
import { modeMesin } from "@/lib/mode";
import { requireUser } from "@/lib/session";
import { alasanTerbatas, infoLisensi, muatLisensi, sandboxAktif } from "@/lib/mesin/lisensi";
import { TombolPerbaruiLisensi } from "./tombol-perbarui-lisensi";

/**
 * Banner mesin sandbox (key cg_test_) di atas dashboard mesin self-host: nomor penguji, sisa balasan AI hari ini, masa
 * berlaku, alasan mode terbatas, dan tombol Perbarui lisensi. Di pusat & mesin production: tidak tampil, tanpa query.
 */
export async function BannerSandbox() {
  if (!modeMesin()) return null;
  // Akses dinamis (cookie sesi) lebih dulu: banner membaca jam & lisensi saat permintaan, bukan saat prerender.
  await requireUser();
  await muatLisensi().catch(() => {});
  if (!sandboxAktif()) return null;
  const { b, t } = await teksHalaman();
  const l = infoLisensi();
  const terbatas = alasanTerbatas();
  return (
    <div role="status" className={`mb-6 flex flex-col gap-4 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${terbatas ? "border-danger/40 bg-danger-soft" : "border-warning/40 bg-warning-soft"}`}>
      <div className="flex gap-3">
        <FlaskConical className={`mt-0.5 size-5 shrink-0 ${terbatas ? "text-danger" : "text-warning"}`} aria-hidden />
        <div className="text-[13px]">
          <p className="font-bold text-fg">
            {t("Mode sandbox", "Sandbox mode")}
            <span className="font-normal text-muted">
              {" · "}
              {l.nomor_uji
                ? t(`hanya dengan nomor penguji ${l.nomor_uji}`, `only with tester number ${l.nomor_uji}`)
                : t("nomor penguji belum didaftarkan (kirim UJI <kode> dari HP penguji)", "tester number not registered yet (send UJI <code> from the tester's phone)")}
            </span>
          </p>
          <p className="mt-0.5 text-muted">
            {l.berlaku_sampai ? t(`Berlaku s.d. ${tanggal(l.berlaku_sampai)}`, `Valid until ${tanggal(l.berlaku_sampai, b)}`) : ""}
          </p>
          {terbatas && <p className="mt-1 font-semibold text-danger">{terbatas.pesan}</p>}
        </div>
      </div>
      <TombolPerbaruiLisensi />
    </div>
  );
}

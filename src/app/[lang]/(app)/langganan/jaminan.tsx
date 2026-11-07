"use client";

import { useActionState, useState } from "react";
import { ajukanJaminanAction } from "@/app/actions";
import { useBahasa } from "@/components/bahasa";
import { PilihOpsi } from "@/components/pilih-opsi";
import { Pesan, SubmitButton } from "@/components/ui";
import { DAFTAR_BANK } from "@/lib/afiliasi-def";
import type { ModeRefund } from "@/lib/jaminan-def";

const OPSI_BANK = DAFTAR_BANK.map((b) => ({ id: b.id, label: b.nama, lencana: b.kategori }));

/**
 * Tombol "Minta uang kembali" dengan konfirmasi di tempat: klik pertama membuka formulir (mode manual: rekening /
 * e-wallet tujuan transfer; alasan opsional) dan peringatan; baru tombol kedua yang mengirim. Setelah berhasil halaman
 * disegarkan dari server (revalidatePath), jadi kartu langsung berganti status.
 */
export function FormJaminan({ jumlah, mode, kanal }: { jumlah: string; mode: ModeRefund; kanal: string | null }) {
  const { t } = useBahasa();
  const [hasil, aksi] = useActionState(ajukanJaminanAction, null);
  const [buka, setBuka] = useState(false);
  // E-wallet yang sama dengan cara bayar sebagai pilihan awal (QRIS: tidak diketahui aplikasinya -> GoPay).
  const [bank, setBank] = useState<string>(kanal === "shopeepay" ? "shopeepay" : "gopay");
  const manual = mode === "manual";

  if (!buka)
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setBuka(true)} data-analitik="Jaminan: buka minta uang kembali" className="btn btn-ghost border border-line">
          {t("Minta uang kembali", "Request a refund")}
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    );

  return (
    <form action={aksi} className="space-y-3">
      {manual && (
        <fieldset className="space-y-3">
          <legend className="text-[13px] font-semibold">{t("Kirim uangnya ke mana?", "Where should we send the money?")}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="jaminan-bank" className="label">
                {t("Bank / e-wallet", "Bank / e-wallet")}
              </label>
              <PilihOpsi id="jaminan-bank" name="tujuan_bank" nilai={bank} onUbah={setBank} opsi={OPSI_BANK} label={t("Bank / e-wallet", "Bank / e-wallet")} />
            </div>
            <div>
              <label htmlFor="jaminan-nomor" className="label">
                {t("Nomor rekening / HP", "Account / phone number")}
              </label>
              <input id="jaminan-nomor" name="tujuan_nomor" inputMode="numeric" autoComplete="off" required minLength={6} maxLength={30} className="field" placeholder={t("Contoh: 081234567890", "e.g. 081234567890")} />
            </div>
            <div>
              <label htmlFor="jaminan-nama" className="label">
                {t("Nama pemilik", "Account holder name")}
              </label>
              <input id="jaminan-nama" name="tujuan_nama" autoComplete="name" required minLength={2} maxLength={80} className="field" />
            </div>
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="jaminan-alasan" className="label">
          {t("Kenapa minta uang kembali?", "Why do you want a refund?")}
        </label>
        <textarea
          id="jaminan-alasan"
          name="alasan"
          rows={2}
          required
          minLength={10}
          maxLength={300}
          className="field"
          placeholder={t("Contoh: balasan AI belum sesuai produk saya.", "e.g. the AI's replies don't match my products yet.")}
        />
      </div>
      <p className="rounded-xl bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
        {manual
          ? t(
              "Admin mentransfer dananya ke tujuan di atas. Begitu dana ditransfer, paket langsung dihentikan dan AI berhenti membalas pelanggan. Pastikan nomornya benar.",
              "The admin transfers the money to the destination above. Once it's sent, the plan stops right away and the AI stops replying to customers. Make sure the number is correct.",
            )
          : t(
              "Dana dikembalikan ke metode bayar asal. Paket langsung dihentikan dan AI berhenti membalas pelanggan. Ini tidak bisa dibatalkan.",
              "The money goes back to the original payment method. The plan stops right away and the AI stops replying to customers. This can't be undone.",
            )}
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn bg-danger text-white hover:opacity-90">{manual ? t(`Ajukan uang kembali ${jumlah}`, `Request ${jumlah} back`) : t(`Ya, kembalikan ${jumlah}`, `Yes, refund ${jumlah}`)}</SubmitButton>
        <button type="button" onClick={() => setBuka(false)} className="btn btn-ghost">
          {t("Batal", "Cancel")}
        </button>
      </div>
      <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
    </form>
  );
}

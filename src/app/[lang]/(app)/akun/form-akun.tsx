"use client";

import { useActionState, useRef, useEffect } from "react";
import { LogOut } from "lucide-react";
import { gantiPasswordAction, keluarSemuaAction, ubahProfilAction } from "@/app/actions";
import { useBahasa } from "@/components/bahasa";
import { Pesan, SubmitButton, TombolKonfirmasi } from "@/components/ui";

export function FormProfil({ nama, email }: { nama: string; email: string }) {
  const { t } = useBahasa();
  const [hasil, aksi] = useActionState(ubahProfilAction, null);
  return (
    <form action={aksi} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="nama" className="label">
          {t("Nama", "Name")}
        </label>
        <input id="nama" name="nama" defaultValue={nama} required minLength={2} maxLength={60} className="field" />
      </div>
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" value={email} readOnly disabled className="field opacity-70" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton>{t("Simpan profil", "Save profile")}</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function FormPassword({ punyaPassword }: { punyaPassword: boolean }) {
  const { t } = useBahasa();
  const [hasil, aksi] = useActionState(gantiPasswordAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (hasil?.ok) ref.current?.reset();
  }, [hasil]);
  return (
    <form ref={ref} action={aksi} className={`grid gap-4 ${punyaPassword ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {punyaPassword && (
        <div>
          <label htmlFor="lama" className="label">
            {t("Password saat ini", "Current password")}
          </label>
          <input id="lama" name="lama" type="password" autoComplete="current-password" required maxLength={200} className="field" />
        </div>
      )}
      <div>
        <label htmlFor="baru" className="label">
          {t("Password baru", "New password")}
        </label>
        <input id="baru" name="baru" type="password" autoComplete="new-password" required minLength={10} maxLength={200} className="field" />
      </div>
      <div>
        <label htmlFor="ulang" className="label">
          {t("Ulangi password baru", "Confirm new password")}
        </label>
        <input id="ulang" name="ulang" type="password" autoComplete="new-password" required maxLength={200} className="field" />
      </div>
      <div className={`flex items-center gap-3 ${punyaPassword ? "sm:col-span-3" : "sm:col-span-2"}`}>
        <SubmitButton>{punyaPassword ? t("Ganti password", "Change password") : t("Pasang password", "Set password")}</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function FormKeluarSemua() {
  const { t } = useBahasa();
  return (
    <TombolKonfirmasi
      label={t("Keluarkan perangkat lain", "Sign out other devices")}
      tanya={t("Yakin?", "Are you sure?")}
      ya={t("Keluarkan", "Sign out")}
      className="btn btn-ghost border border-line"
      ikon={<LogOut className="size-4" aria-hidden />}
      aksi={keluarSemuaAction}
    />
  );
}

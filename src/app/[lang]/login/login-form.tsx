"use client";

import { useActionState } from "react";
import Link from "@/components/link";
import { loginAction } from "@/app/actions";
import { useBahasa } from "@/components/bahasa";
import { Pesan, SubmitButton } from "@/components/ui";

export function LoginForm() {
  const { t } = useBahasa();
  const [hasil, aksi] = useActionState(loginAction, null);
  return (
    <form action={aksi} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus className="field" />
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="password" className="label">
            Password
          </label>
          <Link href="/lupa-password" className="text-[12.5px] font-medium text-accent hover:underline">
            {t("Lupa password?", "Forgot password?")}
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <Pesan ok={false}>{hasil?.pesan}</Pesan>
      <SubmitButton className="btn btn-primary w-full">{t("Masuk", "Sign in")}</SubmitButton>
    </form>
  );
}

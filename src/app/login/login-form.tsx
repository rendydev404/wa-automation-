"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions";
import { Pesan, SubmitButton } from "@/components/ui";

export function LoginForm() {
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
            Lupa password?
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <Pesan ok={false}>{hasil?.pesan}</Pesan>
      <SubmitButton className="btn btn-primary w-full">Masuk</SubmitButton>
    </form>
  );
}

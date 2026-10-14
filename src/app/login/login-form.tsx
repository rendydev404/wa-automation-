"use client";

import { useActionState } from "react";
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
        <label htmlFor="password" className="label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <Pesan ok={false}>{hasil?.pesan}</Pesan>
      <SubmitButton className="btn btn-primary w-full">Masuk</SubmitButton>
    </form>
  );
}

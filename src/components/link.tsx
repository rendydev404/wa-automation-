"use client";

import NextLink from "next/link";
import { useBahasa } from "./bahasa";

/**
 * Pengganti next/link yang menambahkan awalan bahasa (/eng) pada jalur internal secara otomatis.
 * Pakai `import Link from "@/components/link"` di semua halaman pengguna; jalur ditulis tanpa awalan ("/dashboard").
 */
export default function Link({ href, ...props }: React.ComponentProps<typeof NextLink>) {
  const { href: buat } = useBahasa();
  const tujuan = typeof href === "string" ? buat(href) : href.pathname ? { ...href, pathname: buat(href.pathname) } : href;
  return <NextLink href={tujuan} {...props} />;
}

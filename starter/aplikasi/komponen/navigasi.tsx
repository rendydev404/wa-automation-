"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { jalur: "/", label: "Ringkasan" },
  { jalur: "/sambungkan", label: "Sambungkan" },
  { jalur: "/informasi-usaha", label: "Informasi Usaha" },
  { jalur: "/kirim", label: "Kirim pesan" },
  { jalur: "/inbox", label: "Inbox" },
  { jalur: "/pengaturan", label: "Pengaturan" },
];

export function Navigasi() {
  const jalur = usePathname();
  return (
    <nav className="navigasi" aria-label="Menu utama">
      {MENU.map((m) => (
        // prefetch dimatikan: setiap halaman memanggil mesin, jadi hanya dimuat saat benar-benar dibuka.
        <Link key={m.jalur} href={m.jalur} prefetch={false} aria-current={jalur === m.jalur ? "page" : undefined}>
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

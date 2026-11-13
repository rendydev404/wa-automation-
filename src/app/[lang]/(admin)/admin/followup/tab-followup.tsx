import Link from "next/link";

/** Tab halaman Follow-up WA: akun gratis yang kuotanya habis | prospek yang diam. */
export function TabFollowup({ aktif }: { aktif: "akun" | "prospek" }) {
  const tab = [
    { id: "akun", href: "/admin/followup", label: "Akun gratis" },
    { id: "prospek", href: "/admin/followup/prospek", label: "Prospek" },
  ] as const;
  return (
    <nav aria-label="Jenis follow-up" className="flex gap-1 border-b border-line">
      {tab.map((t) => (
        <Link
          key={t.id}
          prefetch={false}
          href={t.href}
          aria-current={aktif === t.id ? "page" : undefined}
          data-analitik={`Follow-up: tab ${t.label}`}
          className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-3.5 text-[13.5px] font-semibold transition-colors ${aktif === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

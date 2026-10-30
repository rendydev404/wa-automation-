import { Check, MessageCircle } from "lucide-react";
import type { PaketCustom } from "@/lib/paket-custom";

/** Kartu paket "Custom" di samping paket biasa: tombolnya membuka chat WhatsApp ke admin, bukan pembayaran. */
export function KartuCustom({ p, href, varian }: { p: PaketCustom; href: string; varian: "landing" | "app" }) {
  const landing = varian === "landing";
  return (
    <article className={landing ? "relative flex flex-col rounded-3xl border border-dashed border-line-strong bg-surface p-7 shadow-card" : "card relative flex flex-col border-dashed p-6"}>
      <h3 className={landing ? "text-xl font-bold" : "text-lg font-bold"}>{p.nama}</h3>
      {p.deskripsi && <p className={`mt-1 text-muted ${landing ? "text-[14px]" : "text-[13px]"}`}>{p.deskripsi}</p>}
      <p className={`font-extrabold tracking-tight ${landing ? "mt-5 text-4xl" : "mt-4 text-3xl"}`}>{p.harga}</p>
      <ul className={`flex-1 ${landing ? "mt-5 space-y-2.5 text-[14px]" : "mt-4 space-y-2 text-[13.5px]"}`}>
        {p.fitur.map((x) => (
          <li key={x} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
          </li>
        ))}
      </ul>
      <a href={href} target="_blank" rel="noopener noreferrer" className={`btn btn-ghost w-full justify-center border border-line ${landing ? "mt-6" : "mt-5"}`}>
        <MessageCircle className="size-4" aria-hidden /> {p.tombol}
      </a>
    </article>
  );
}

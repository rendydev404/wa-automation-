import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Info } from "lucide-react";
import { db } from "@/lib/db";
import { formatNomor } from "@/lib/format";
import { nomorCsChatGercep } from "@/lib/followup";
import { MEREK } from "@/lib/merek";
import { requireStaf } from "@/lib/session";
import { kebijakanJalur, kuotaTerpakai } from "@/lib/wa-resmi";
import { angkaTier } from "@/lib/wa-resmi-def";
import { TabFollowup } from "../tab-followup";
import { FormKebijakan } from "./form-kebijakan";

export const metadata: Metadata = { title: `Jalur WhatsApp · Admin · ${MEREK}` };

interface BarisNomor {
  id: number;
  label: string;
  jalur: string;
  user_id: number | null;
  email: string | null;
  nomor_tampil: string | null;
  kualitas: string | null;
  tier: string | null;
  status: string | null;
  waba_id: string | null;
  aktif: boolean | null;
}

const FAKTA = [
  "Di dalam 24 jam sejak pelanggan terakhir chat: balasan & follow-up tetap ditulis AI per orang (gratis untuk pesan layanan sampai 1.000/bulan per nomor).",
  "Di luar 24 jam: hanya template yang disetujui Meta. AI hanya mengisi nama pelanggan dan nama usaha.",
  "Template marketing ditagih Meta per pesan yang sampai, ke akun Meta pemilik nomor, bukan ke ChatGerCep.",
  "Batas penerima di luar 24 jam dihitung per WhatsApp Business Account: 250/hari untuk akun baru, 2.000 setelah verifikasi bisnis, lalu naik otomatis.",
  "Satu nomor hanya satu jalur: nomor resmi harus dihapus dulu dari aplikasi WhatsApp di HP. Scan QR (Baileys) tidak bisa dipakai bersamaan.",
  "Daftar sekali klik (Embedded Signup) & Coexistence butuh ChatGerCep terdaftar sebagai Tech Provider Meta (belum).",
];

async function Isi() {
  await requireStaf();
  const sql = await db();
  const [kebijakan, cs, baris] = await Promise.all([
    kebijakanJalur(),
    nomorCsChatGercep(),
    sql<BarisNomor[]>`
      SELECT n.id, n.label, n.jalur, n.user_id, u.email, r.nomor_tampil, r.kualitas, r.tier, r.status, r.waba_id, r.aktif
        FROM numbers n
        LEFT JOIN nomor_resmi r ON r.number_id = n.id
        LEFT JOIN users u ON u.id = n.user_id
       WHERE n.jalur = 'resmi' OR r.number_id IS NOT NULL
       ORDER BY (n.jalur = 'resmi') DESC, n.id
       LIMIT 200`,
  ]);
  const wabaUnik = [...new Set(baris.filter((b) => b.jalur === "resmi" && b.waba_id).map((b) => b.waba_id as string))];
  const kuota = new Map(await Promise.all(wabaUnik.map(async (w) => [w, await kuotaTerpakai(w)] as const)));
  const csIds = [...cs];
  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <section className="card p-5 sm:p-6">
          <h2 className="text-[15px] font-bold">Kebijakan untuk nomor pengguna</h2>
          <p className="mt-1 text-[13px] text-muted">Berlaku untuk akun berlangganan. Akun gratis selalu memakai scan QR. Admin & developer selalu boleh memasang jalur resmi.</p>
          <div className="mt-4">
            <FormKebijakan awal={kebijakan} />
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-[15px] font-bold">Nomor CS {MEREK}</h2>
          <p className="mt-1 text-[13px] text-muted">
            Jalur nomor CS (follow-up akun & prospek) dipasang dari halaman nomornya, tab Koneksi. Template follow-up akun & prospek diajukan dari tab Follow-up nomor itu.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {csIds.length ? (
              csIds.map((id) => (
                <Link key={id} prefetch={false} href={`/nomor/${id}#koneksi`} className="btn btn-ghost">
                  Nomor CS #{id}
                </Link>
              ))
            ) : (
              <p className="text-[13px] text-faint">Nomor CS belum diatur di tab Akun gratis.</p>
            )}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <BadgeCheck className="size-4 text-accent" aria-hidden /> Nomor di jalur resmi
            </h2>
          </div>
          {baris.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="border-y border-line bg-subtle/60 text-left text-[12px] text-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Nomor</th>
                    <th className="px-3 py-2.5 font-semibold">Pemilik</th>
                    <th className="px-3 py-2.5 font-semibold">Kualitas</th>
                    <th className="px-3 py-2.5 font-semibold">Kuota 24 jam</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {baris.map((b) => {
                    const batas = angkaTier(b.tier);
                    return (
                      <tr key={b.id}>
                        <td className="px-5 py-3">
                          <Link prefetch={false} href={`/nomor/${b.id}#koneksi`} className="font-semibold hover:text-accent">
                            {b.label}
                          </Link>
                          <p className="text-[12px] text-muted tabular-nums">{b.nomor_tampil ? formatNomor(b.nomor_tampil) : "-"}</p>
                        </td>
                        <td className="px-3 py-3 text-muted">{cs.has(b.id) ? `CS ${MEREK}` : (b.email ?? "-")}</td>
                        <td className="px-3 py-3">{b.kualitas ?? "-"}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {b.jalur === "resmi" && b.waba_id ? `${kuota.get(b.waba_id) ?? 0} / ${batas === null ? "?" : Number.isFinite(batas) ? batas : "∞"}` : "-"}
                        </td>
                        <td className="px-3 py-3">{b.jalur === "resmi" ? (b.status ?? "-") : "Nonaktif (kembali ke QR)"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="border-t border-line px-5 py-6 text-[13px] text-muted">Belum ada nomor yang memakai WhatsApp resmi.</p>
          )}
        </section>
      </div>
      <aside className="card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <Info className="size-4 text-accent" aria-hidden /> Aturan Meta yang berlaku
        </h2>
        <ul className="mt-3.5 space-y-2.5 text-[12.5px] text-muted">
          {FAKTA.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="mt-4 text-[11.5px] text-faint">Dicek di dokumentasi resmi Meta, 18 November 2026. Tarif per pesan Indonesia: lihat whatsappbusiness.com/id/products/platform-pricing.</p>
      </aside>
    </div>
  );
}

export default function HalamanJalurWa() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Follow-up WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Pilih jalur pengiriman: scan QR (Baileys, seperti sekarang) atau WhatsApp resmi (Cloud API Meta). Logika follow-up sama; yang berbeda cara kirim dan rem anti-blokirnya.
        </p>
      </div>
      <TabFollowup aktif="jalur" />
      <Suspense fallback={<div aria-hidden className="card h-[520px] animate-denyut" />}>
        <Isi />
      </Suspense>
    </div>
  );
}

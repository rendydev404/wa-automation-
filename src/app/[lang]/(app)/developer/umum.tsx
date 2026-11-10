import { Pill } from "@/components/ui";
import type { StatusAplikasi, StatusLisensi } from "@/lib/api-def";
import type { T } from "@/lib/bahasa";

/** Potongan tampilan bersama halaman portal developer (server component). */

const STATUS: Record<StatusAplikasi, { nada: "hijau" | "kuning" | "merah" | "abu"; id: string; en: string }> = {
  menunggu: { nada: "kuning", id: "Menunggu tinjauan", en: "Under review" },
  disetujui: { nada: "hijau", id: "Disetujui", en: "Approved" },
  ditolak: { nada: "merah", id: "Ditolak", en: "Rejected" },
  ditangguhkan: { nada: "kuning", id: "Ditangguhkan", en: "Suspended" },
  dicabut: { nada: "merah", id: "Dicabut", en: "Revoked" },
};

export function PillStatus({ status, t }: { status: StatusAplikasi; t: T }) {
  const s = STATUS[status];
  return <Pill nada={s.nada}>{t(s.id, s.en)}</Pill>;
}

const LISENSI: Record<StatusLisensi, { nada: "hijau" | "kuning" | "merah"; id: string; en: string }> = {
  aktif: { nada: "hijau", id: "Lisensi aktif", en: "License active" },
  belum_bayar: { nada: "kuning", id: "Menunggu pembayaran", en: "Awaiting payment" },
  ditangguhkan: { nada: "kuning", id: "Layanan ditangguhkan", en: "Service suspended" },
  dicabut: { nada: "merah", id: "Lisensi dicabut", en: "License revoked" },
};

export function PillLisensi({ status, t }: { status: StatusLisensi; t: T }) {
  const s = LISENSI[status];
  return <Pill nada={s.nada}>{t(s.id, s.en)}</Pill>;
}

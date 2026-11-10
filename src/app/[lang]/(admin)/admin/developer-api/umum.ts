import type { StatusAplikasi } from "@/lib/api-def";

/** Warna pil status aplikasi di panel (dipakai daftar & detail). */
export const NADA_STATUS: Record<StatusAplikasi, "hijau" | "kuning" | "merah" | "abu"> = {
  menunggu: "kuning",
  disetujui: "hijau",
  ditolak: "merah",
  ditangguhkan: "kuning",
  dicabut: "merah",
};

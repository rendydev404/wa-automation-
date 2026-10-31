import Link from "next/link";
import { AlertTriangle, BookOpen } from "lucide-react";
import { aturan, saklar } from "@/lib/aturan";
import { db, sekarang } from "@/lib/db";
import { tanggal } from "@/lib/format";
import { hakAkun, langgananAktif, sisaKuotaAi } from "@/lib/langganan";
import { requireUser } from "@/lib/session";

/** Nomor milik pengguna yang belum punya base knowledge sama sekali (satu query, lewat documents_number_idx). */
async function nomorTanpaKnowledge(userId: number): Promise<{ id: number; label: string }[]> {
  const sql = await db();
  return sql<{ id: number; label: string }[]>`
    SELECT n.id, n.label FROM numbers n
     WHERE n.user_id = ${userId} AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.number_id = n.id)
     ORDER BY n.id`;
}

/**
 * Banner di paling atas semua halaman workspace: pelanggan berbayar yang nomornya belum punya base knowledge.
 * Dibaca di dalam Suspense: rangka tetap statis.
 */
export async function BannerAkun() {
  const user = await requireUser();
  if (user.peran === "admin") return null;
  const [ingatkan, langganan] = await Promise.all([saklar("banner_knowledge"), langgananAktif(user.id)]);
  const kosong = ingatkan && langganan ? await nomorTanpaKnowledge(user.id) : [];
  if (!kosong.length) return null;

  return (
    <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <BookOpen className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="text-[13px]">
          <p className="font-bold text-fg">Segera isi base knowledge {kosong.length === 1 ? `nomor ${kosong[0].label}` : `${kosong.length} nomor Anda`}</p>
          <p className="text-muted">
            Paket {langganan?.nama_paket} Anda sudah aktif, tapi AI belum tahu apa pun tentang usaha Anda, jadi ia hanya bisa bilang belum punya informasi. Pakai templat: tinggal
            ganti nama produk, harga, jam, dan alamat (±5 menit).
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {kosong.slice(0, 3).map((n) => (
          <Link key={n.id} href={`/nomor/${n.id}#knowledge`} className="btn btn-primary">
            Isi {kosong.length > 1 ? n.label : "sekarang"}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Kuota balasan AI hampir/sudah habis (ambang dari aturan admin), dengan tombol ke halaman Langganan. Hanya dipasang di
 * Ringkasan dan Akun saya: di halaman Langganan sendiri tombolnya tidak berguna (kuotanya sudah tampil di sana).
 */
export async function BannerKuota() {
  const user = await requireUser();
  if (user.peran === "admin") return null;
  const ambang = await aturan("peringatan_kuota_persen");
  const [hak, sisa] = await Promise.all([hakAkun(user), sisaKuotaAi(user.id)]);
  if (!hak.balasan || sisa === null) return null;
  // Free trial: diingatkan juga menjelang masa berlakunya habis (<= 2 hari) dan setelah lewat.
  const sisaHari = hak.percobaanSampai === null ? null : Math.ceil((hak.percobaanSampai - sekarang()) / 86400);
  const masaHampir = !hak.percobaanBerakhir && sisaHari !== null && sisaHari <= 2;
  const kuotaTipis = ambang > 0 && (sisa / hak.balasan) * 100 <= ambang;
  if (!hak.percobaanBerakhir && !masaHampir && !kuotaTipis) return null;

  const [judul, isi] = hak.percobaanBerakhir
    ? [
        `Masa percobaan gratis berakhir ${tanggal(hak.percobaanSampai!)}: AI berhenti membalas`,
        "Pesan pelanggan tetap masuk, tapi tidak dijawab AI. Pilih paket untuk melanjutkan.",
      ]
    : sisa === 0
      ? [
          `Kuota ${hak.percobaan ? "percobaan" : "balasan AI"} habis: AI berhenti membalas`,
          hak.percobaan
            ? "Pesan pelanggan tetap masuk, tapi tidak dijawab AI. Pilih paket untuk melanjutkan."
            : "Pesan pelanggan tetap masuk, tapi tidak dijawab AI sampai paket diperpanjang.",
        ]
      : masaHampir
        ? [
            `Masa percobaan gratis berakhir ${tanggal(hak.percobaanSampai!)} (${sisaHari! <= 0 ? "hari ini" : `${sisaHari} hari lagi`})`,
            `Sisa ${sisa.toLocaleString("id-ID")} balasan AI percobaan. Pilih paket supaya AI tetap membalas setelah masa percobaan berakhir.`,
          ]
        : [
            `Kuota ${hak.percobaan ? "percobaan" : "balasan AI"} tinggal ${sisa.toLocaleString("id-ID")} dari ${hak.balasan.toLocaleString("id-ID")} balasan`,
            hak.percobaan
              ? "Pilih paket sebelum kuota percobaan habis supaya AI tidak berhenti di tengah jalan."
              : "Perpanjang atau naikkan paket supaya AI tidak berhenti di tengah jalan.",
          ];

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="text-[13px]">
          <p className="font-bold text-fg">{judul}</p>
          <p className="text-muted">{isi}</p>
        </div>
      </div>
      <Link href="/langganan" className="btn btn-primary shrink-0">
        Lihat paket
      </Link>
    </div>
  );
}

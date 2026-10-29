import Link from "next/link";
import { AlertTriangle, BookOpen } from "lucide-react";
import { aturan, saklar } from "@/lib/aturan";
import { db } from "@/lib/db";
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
 * Banner di paling atas semua halaman workspace: pelanggan berbayar yang nomornya belum punya base knowledge, dan
 * kuota balasan AI yang hampir/sudah habis (ambang dari aturan admin). Dibaca di dalam Suspense: rangka tetap statis.
 */
export async function BannerAkun() {
  const user = await requireUser();
  if (user.peran === "admin") return null;
  const [ingatkan, ambang, langganan] = await Promise.all([saklar("banner_knowledge"), aturan("peringatan_kuota_persen"), langgananAktif(user.id)]);
  const [kosong, hak, sisa] = await Promise.all([
    ingatkan && langganan ? nomorTanpaKnowledge(user.id) : Promise.resolve([]),
    ambang > 0 ? hakAkun(user) : Promise.resolve(null),
    ambang > 0 ? sisaKuotaAi(user.id) : Promise.resolve(null),
  ]);
  const kuotaTipis = hak?.balasan && sisa !== null && (sisa / hak.balasan) * 100 <= ambang;
  if (!kosong.length && !kuotaTipis) return null;

  return (
    <div className="mb-6 space-y-3">
      {kosong.length > 0 && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
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
      )}
      {kuotaTipis && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <div className="text-[13px]">
              <p className="font-bold text-fg">{sisa === 0 ? "Kuota balasan AI habis: AI berhenti membalas" : `Kuota balasan AI tinggal ${sisa!.toLocaleString("id-ID")} dari ${hak!.balasan!.toLocaleString("id-ID")}`}</p>
              <p className="text-muted">{sisa === 0 ? "Pesan pelanggan tetap masuk, tapi tidak dijawab AI sampai paket diperpanjang." : "Perpanjang atau naikkan paket supaya AI tidak berhenti di tengah jalan."}</p>
            </div>
          </div>
          <Link href="/langganan" className="btn btn-primary shrink-0">
            Lihat paket
          </Link>
        </div>
      )}
    </div>
  );
}

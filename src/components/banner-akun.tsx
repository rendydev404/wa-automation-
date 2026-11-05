import Link from "@/components/link";
import { AlertTriangle, BookOpen } from "lucide-react";
import { aturan, saklar } from "@/lib/aturan";
import { db, sekarang } from "@/lib/db";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { angka, tanggal } from "@/lib/format";
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
  const { t } = await teksHalaman();

  return (
    <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <BookOpen className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="text-[13px]">
          <p className="font-bold text-fg">
            {kosong.length === 1
              ? t(`Segera isi base knowledge nomor ${kosong[0].label}`, `Add product knowledge for number ${kosong[0].label} now`)
              : t(`Segera isi base knowledge ${kosong.length} nomor Anda`, `Add product knowledge for your ${kosong.length} numbers now`)}
          </p>
          <p className="text-muted">
            {t(
              `Paket ${langganan?.nama_paket} Anda sudah aktif, tapi AI belum tahu apa pun tentang usaha Anda, jadi ia hanya bisa bilang belum punya informasi. Pakai templat: tinggal ganti nama produk, harga, jam, dan alamat (±5 menit).`,
              `Your ${langganan?.nama_paket} plan is active, but the AI doesn't know anything about your business yet, so all it can say is that it has no information. Use a template: just swap in your product names, prices, hours, and address (about 5 minutes).`,
            )}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {kosong.slice(0, 3).map((n) => (
          <Link key={n.id} href={`/nomor/${n.id}#knowledge`} className="btn btn-primary max-w-full min-w-0">
            <span className="truncate">{kosong.length > 1 ? t(`Isi ${n.label}`, `Fill in ${n.label}`) : t("Isi sekarang", "Fill in now")}</span>
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
  const { b, t } = await teksHalaman();
  const pilihPaket = t(
    "Pesan pelanggan tetap masuk, tapi tidak dijawab AI. Pilih paket untuk melanjutkan.",
    "Customer messages still come in, but the AI won't answer them. Choose a plan to continue.",
  );

  const [judul, isi] = hak.percobaanBerakhir
    ? [
        t(
          `Masa percobaan gratis berakhir ${tanggal(hak.percobaanSampai!, b)}: AI berhenti membalas`,
          `Your free trial ended on ${tanggal(hak.percobaanSampai!, b)}: the AI has stopped replying`,
        ),
        pilihPaket,
      ]
    : sisa === 0
      ? [
          t(
            `Kuota ${hak.percobaan ? "percobaan" : "balasan AI"} habis: AI berhenti membalas`,
            `Your ${hak.percobaan ? "trial quota" : "AI reply quota"} is used up: the AI has stopped replying`,
          ),
          hak.percobaan
            ? pilihPaket
            : t(
                "Pesan pelanggan tetap masuk, tapi tidak dijawab AI sampai paket diperpanjang.",
                "Customer messages still come in, but the AI won't answer them until your plan is renewed.",
              ),
        ]
      : masaHampir
        ? [
            t(
              `Masa percobaan gratis berakhir ${tanggal(hak.percobaanSampai!, b)} (${sisaHari! <= 0 ? "hari ini" : `${sisaHari} hari lagi`})`,
              `Your free trial ends on ${tanggal(hak.percobaanSampai!, b)} (${sisaHari! <= 0 ? "today" : sisaHari === 1 ? "in 1 day" : `in ${sisaHari} days`})`,
            ),
            t(
              `Sisa ${angka(sisa, b)} balasan AI percobaan. Pilih paket supaya AI tetap membalas setelah masa percobaan berakhir.`,
              `${angka(sisa, b)} trial AI ${sisa === 1 ? "reply" : "replies"} left. Choose a plan so the AI keeps replying after your trial ends.`,
            ),
          ]
        : [
            t(
              `Kuota ${hak.percobaan ? "percobaan" : "balasan AI"} tinggal ${angka(sisa, b)} dari ${angka(hak.balasan, b)} balasan`,
              `Only ${angka(sisa, b)} of ${angka(hak.balasan, b)} ${hak.percobaan ? "trial" : "AI"} replies left`,
            ),
            hak.percobaan
              ? t(
                  "Pilih paket sebelum kuota percobaan habis supaya AI tidak berhenti di tengah jalan.",
                  "Choose a plan before your trial quota runs out so the AI doesn't stop mid-conversation.",
                )
              : t("Perpanjang atau naikkan paket supaya AI tidak berhenti di tengah jalan.", "Renew or upgrade your plan so the AI doesn't stop mid-conversation."),
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
        {t("Lihat paket", "View plans")}
      </Link>
    </div>
  );
}

import Link from "@/components/link";
import { AlertTriangle, MessageCircle, ShieldCheck } from "lucide-react";
import { aturan } from "@/lib/aturan";
import { db, sekarang } from "@/lib/db";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { angka, tanggal } from "@/lib/format";
import { tautanChatCs } from "@/lib/followup";
import { hakAkunSekali, sisaKuotaAi } from "@/lib/langganan";
import { requireUser } from "@/lib/session";
import { MASA_ID, MASA_EN_ADJ } from "@/lib/jaminan-def";
import { staf } from "@/lib/peran";

/** Nomor milik pengguna yang belum punya base knowledge berisi (satu query, lewat documents_number_idx). */
async function nomorTanpaKnowledge(userId: number): Promise<{ id: number; label: string }[]> {
  const sql = await db();
  return sql<{ id: number; label: string }[]>`
    SELECT n.id, n.label FROM numbers n
     WHERE n.user_id = ${userId} AND NOT EXISTS (
       SELECT 1 FROM documents d WHERE d.number_id = n.id AND d.jumlah_karakter > 0
     )
     ORDER BY n.id`;
}

/**
 * Peringatan wajib di paling atas semua halaman workspace selama ada nomor tanpa base knowledge berisi.
 * Dibaca di dalam Suspense: rangka tetap statis.
 */
export async function BannerAkun() {
  const user = await requireUser();
  if (staf(user.peran)) return null;
  const kosong = await nomorTanpaKnowledge(user.id);
  if (!kosong.length) return null;
  const { t } = await teksHalaman();

  return (
    <div role="alert" className="mb-6 flex flex-col gap-4 rounded-2xl border-2 border-danger/50 bg-danger-soft px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex gap-3.5">
        <AlertTriangle className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden />
        <div className="text-[13px]">
          <h2 className="text-lg font-extrabold text-danger sm:text-xl">
            {t("Peringatan: AI belum siap membalas pelanggan", "Warning: AI is not ready to reply to customers")}
          </h2>
          <p className="mt-1 text-base font-semibold text-fg">
            {kosong.length === 1
              ? t(`Nomor ${kosong[0].label} belum memiliki base knowledge.`, `Number ${kosong[0].label} does not have product knowledge yet.`)
              : t(`${kosong.length} nomor WhatsApp Anda belum memiliki base knowledge.`, `${kosong.length} of your WhatsApp numbers do not have product knowledge yet.`)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t(
              "Isi base knowledge agar AI tahu informasi usaha yang benar. Sampai diisi, pesan pelanggan tetap tercatat tetapi AI tidak membalas.",
              "Add product knowledge so the AI knows the correct facts about your business. Until then, customer messages are recorded but the AI will not reply.",
            )}
          </p>
        </div>
      </div>
      <Link href={`/nomor/${kosong[0].id}#knowledge`} data-analitik="Banner: isi knowledge" className="btn btn-primary w-full shrink-0 sm:w-auto">
        {t("Isi base knowledge sekarang", "Add product knowledge now")}
      </Link>
    </div>
  );
}

/**
 * Kuota balasan AI hampir/sudah habis (ambang dari aturan admin), dengan tombol ke halaman Langganan. Hanya dipasang di
 * Ringkasan dan Akun saya: di halaman Langganan sendiri tombolnya tidak berguna (kuotanya sudah tampil di sana).
 */
export async function BannerKuota() {
  const user = await requireUser();
  if (staf(user.peran)) return null;
  const ambang = await aturan("peringatan_kuota_persen");
  const [hak, sisa] = await Promise.all([hakAkunSekali(user), sisaKuotaAi(user.id)]);
  if (hak.sampai === null && hak.balasan === 0) {
    // Tanpa free trial: belum (atau tidak lagi) berlangganan. Ajakan tenang, bukan peringatan merah.
    const { t } = await teksHalaman();
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <div className="text-[13px]">
            <p className="font-bold text-fg">{t("AI belum membalas pelanggan", "The AI isn't replying to customers yet")}</p>
            <p className="text-muted">
              {t(
                `Coba dulu di Uji bot, lalu pilih paket supaya AI mulai membalas. Pembayaran pertama lewat GoPay, ShopeePay, atau QRIS dilindungi jaminan uang kembali ${MASA_ID}.`,
                `Try it in the bot test first, then pick a plan so the AI starts replying. A first payment with GoPay, ShopeePay, or QRIS is covered by a ${MASA_EN_ADJ} money-back guarantee.`,
              )}
            </p>
          </div>
        </div>
        <Link href="/langganan" data-analitik="Banner: pilih paket" className="btn btn-primary shrink-0">
          {t("Pilih paket", "Choose a plan")}
        </Link>
      </div>
    );
  }
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

  // Akun gratis yang AI-nya sudah berhenti: tombol chat CS di WhatsApp dengan kode akun (pengguna yang chat duluan
  // adalah jalur paling aman; kodenya menautkan chat itu ke akun ini dari HP mana pun, lihat followup.ts).
  const habisGratis = hak.sampai === null && (hak.percobaanBerakhir || sisa === 0);
  const chatCs = habisGratis ? await tautanChatCs(user.id).catch(() => null) : null;

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="text-[13px]">
          <p className="font-bold text-fg">{judul}</p>
          <p className="text-muted">{isi}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        {chatCs && (
          <a href={chatCs} target="_blank" rel="noopener noreferrer" className="btn btn-ghost border border-line bg-surface">
            <MessageCircle className="size-4" aria-hidden />
            {t("Chat CS di WhatsApp", "Chat support on WhatsApp")}
          </a>
        )}
        {/* Akun gratis yang AI-nya berhenti: ke halaman hasil trial + pilihan paket, bukan langsung ke tagihan. */}
        <Link href={habisGratis ? "/trial-habis" : "/langganan"} className="btn btn-primary">
          {habisGratis ? t("Nyalakan AI lagi", "Turn the AI back on") : t("Lihat paket", "View plans")}
        </Link>
      </div>
    </div>
  );
}

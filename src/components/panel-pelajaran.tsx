"use client";

import { useOptimistic, useState, useTransition } from "react";
import { GraduationCap, Loader2, Trash2 } from "lucide-react";
import { hapusPelajaranAction, muatPelajaranAction, setBelajarAction } from "@/app/actions";
import { angka, waktuSingkatWib } from "@/lib/format";
import type { ItemPelajaran } from "@/lib/pelajaran";
import { useBahasa } from "./bahasa";
import { Saklar, TombolKonfirmasi } from "./ui";

/**
 * Balasan yang dipelajari AI dari admin yang membalas sendiri lewat HP. Admin bisa mematikan
 * belajar untuk nomor ini dan menghapus balasan yang tidak boleh ditiru (mis. berisi data pribadi).
 */
export function PanelPelajaran({
  numberId,
  aktif: aktifAwal,
  total: totalAwal,
  daftarAwal,
  adaLagiAwal,
  kini,
}: {
  numberId: number;
  aktif: boolean;
  total: number;
  daftarAwal: ItemPelajaran[];
  adaLagiAwal: boolean;
  kini: number;
}) {
  const { b, t } = useBahasa();
  const [aktif, setAktif] = useOptimistic(aktifAwal);
  const [daftar, setDaftar] = useState(daftarAwal);
  const [adaLagi, setAdaLagi] = useState(adaLagiAwal);
  const [total, setTotal] = useState(totalAwal);
  const [, mulaiSaklar] = useTransition();
  const [memuat, mulaiMuat] = useTransition();

  const muatLagi = () => {
    const akhir = daftar.at(-1);
    if (!akhir) return;
    mulaiMuat(async () => {
      const r = await muatPelajaranAction(numberId, akhir.terakhir_pada, akhir.id);
      setDaftar((d) => [...d, ...r.daftar.filter((x) => !d.some((y) => y.id === x.id))]);
      setAdaLagi(r.adaLagi);
    });
  };

  const buang = (id: number) => {
    setDaftar((d) => d.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight">{t("Belajar dari balasan manusia", "Learn from human replies")}</h2>
          <p className="hint mt-0.5">
            {aktif
              ? t(
                  "Saat Anda membalas sendiri dari HP, balasan itu diingat dan dipakai AI untuk pertanyaan serupa dari pelanggan lain.",
                  "When you reply yourself from your phone, that reply is remembered and used by the AI for similar questions from other customers."
                )
              : t(
                  "Mati: balasan dari HP tidak diingat dan yang sudah tersimpan tidak dipakai AI.",
                  "Off: replies from your phone aren't remembered, and the AI doesn't use the ones already saved."
                )}
          </p>
        </div>
        <Saklar
          aktif={aktif}
          label={t("Belajar dari balasan manusia", "Learn from human replies")}
          onUbah={(v) =>
            mulaiSaklar(async () => {
              setAktif(v);
              await setBelajarAction(numberId, v);
            })
          }
        />
      </div>

      <div className="px-5 py-5 sm:px-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-wide text-faint uppercase">{t("Balasan dipelajari", "Learned replies")} ({angka(total, b)})</p>
          {total > 0 && (
            <TombolKonfirmasi
              label={t("Hapus semua", "Delete all")}
              tanya={t("Hapus semua pelajaran?", "Delete all learned replies?")}
              ya={t("Ya, hapus", "Yes, delete")}
              className="btn btn-ghost h-8 px-3 text-danger"
              aksi={async () => {
                const h = await hapusPelajaranAction(numberId);
                if (h.ok) {
                  setDaftar([]);
                  setTotal(0);
                  setAdaLagi(false);
                }
                return h;
              }}
            />
          )}
        </div>
        {daftar.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
            <GraduationCap className="mx-auto mb-2 size-6 text-faint" aria-hidden />
            {t(
              'Belum ada. Balasan Anda dari HP yang cukup berisi (mis. nomor rekening, cara pemesanan, kebijakan) akan muncul di sini. Balasan pendek seperti "ok kak" dilewati.',
              'Nothing yet. Substantial replies you send from your phone (e.g. bank account details, how to order, policies) will show up here. Short replies like "ok, thanks" are skipped.'
            )}
          </div>
        ) : (
          <ul data-analitik-privat className="max-h-[480px] divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {daftar.map((p) => (
              <Baris key={p.id} p={p} numberId={numberId} kini={kini} onHapus={() => buang(p.id)} />
            ))}
          </ul>
        )}
        {adaLagi && (
          <button type="button" onClick={muatLagi} disabled={memuat} className="btn btn-ghost mt-3 w-full">
            {memuat && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("Muat lagi", "Load more")}
          </button>
        )}
        <p className="hint mt-3">
          {t(
            "AI memakai fakta umum dari balasan ini (rekening, prosedur, kebijakan) dan meniru cara Anda menjawab, tetapi tidak menyebut detail milik pelanggan lain. Bila bertentangan dengan base knowledge, base knowledge yang diikuti. Hapus balasan yang tidak boleh ditiru.",
            "The AI uses general facts from these replies (bank details, procedures, policies) and mimics how you answer, but never mentions details belonging to other customers. If they conflict with your product knowledge, the product knowledge wins. Delete any reply that shouldn't be copied."
          )}
        </p>
      </div>
    </section>
  );
}

function Baris({ p, numberId, kini, onHapus }: { p: ItemPelajaran; numberId: number; kini: number; onHapus: () => void }) {
  const { b, t } = useBahasa();
  const [tanya, setTanya] = useState(false);
  const [tunggu, mulai] = useTransition();
  return (
    <li className="flex gap-2 px-3 py-3 sm:gap-3 sm:px-3.5">
      <div className="min-w-0 flex-1 space-y-1.5 text-[13px] leading-relaxed [overflow-wrap:anywhere]">
        {p.pertanyaan && (
          <p className="line-clamp-3 whitespace-pre-wrap text-muted">
            <span className="font-semibold text-faint">{t("Pelanggan: ", "Customer: ")}</span>
            {p.pertanyaan}
          </p>
        )}
        <p className="line-clamp-6 whitespace-pre-wrap text-fg">
          <span className="font-semibold text-accent">{t("Anda: ", "You: ")}</span>
          {p.jawaban}
        </p>
        <p className="hint">
          {waktuSingkatWib(p.terakhir_pada, kini, b)}
          {p.kali > 1 && t(` · dikirim ${angka(p.kali)}×`, ` · sent ${angka(p.kali, b)}×`)}
        </p>
      </div>
      {tanya ? (
        <div className="flex shrink-0 animate-masuk flex-col items-end gap-1.5 sm:flex-row sm:items-start">
          <button
            type="button"
            data-analitik="Hapus pelajaran: ya"
            disabled={tunggu}
            className="btn h-8 bg-danger px-3 text-white"
            onClick={() =>
              mulai(async () => {
                const h = await hapusPelajaranAction(numberId, p.id);
                if (h.ok) onHapus();
                else setTanya(false);
              })
            }
          >
            {tunggu && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {t("Hapus", "Delete")}
          </button>
          <button type="button" data-analitik="Hapus pelajaran: batal" disabled={tunggu} className="btn btn-ghost h-8 px-3" onClick={() => setTanya(false)}>
            {t("Batal", "Cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-analitik="Hapus pelajaran"
          onClick={() => setTanya(true)}
          aria-label={t("Hapus pelajaran ini", "Delete this learned reply")}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Loader2,
  MessagesSquare,
  MicOff,
  RefreshCw,
  Search,
  ShieldAlert,
  Smartphone,
  Trash2,
  User,
  X,
} from "lucide-react";
import { bangunkanChatAction, bukanSpamAction, hapusPercakapanAction } from "@/app/actions";
import type { T } from "@/lib/bahasa";
import { angka, formatNomor, jamWib, kunciHariWib, tanggal, UMUR_HISTORI_HARI, waktuSingkatWib } from "@/lib/format";
import type { ItemPercakapan, ItemPesan, PeranPesan, RingkasanPercakapan } from "@/lib/percakapan";
import { useBahasa } from "./bahasa";
import { Pill, TombolKonfirmasi } from "./ui";

/** Render cetak tebal WhatsApp (*teks*) menjadi elemen <b>. */
function TeksWa({ teks }: { teks: string }) {
  return (
    <>
      {teks.split(/(\*[^*\n]+\*)/g).map((bagian, i) =>
        bagian.length > 2 && bagian.startsWith("*") && bagian.endsWith("*") ? <b key={i}>{bagian.slice(1, -1)}</b> : <span key={i}>{bagian}</span>
      )}
    </>
  );
}

function namaTampil(p: ItemPercakapan, t: T): string {
  if (p.nama) return p.nama;
  if (p.telepon) return formatNomor(p.telepon);
  return t(`Pelanggan #${p.id}`, `Customer #${p.id}`);
}

function awalanCuplikan(peran: PeranPesan, t: T): string {
  if (peran === 1) return "AI: ";
  if (peran === 2) return t("Admin: ", "You: ");
  return "";
}

export function HistoriPercakapan({
  numberId,
  ringkasanAwal,
  daftarAwal,
  adaLagiAwal,
  pesanAwal,
  adaSebelumnyaAwal,
  kiniAwal,
}: {
  numberId: number;
  ringkasanAwal: RingkasanPercakapan;
  daftarAwal: ItemPercakapan[];
  adaLagiAwal: boolean;
  pesanAwal: ItemPesan[];
  adaSebelumnyaAwal: boolean;
  kiniAwal: number;
}) {
  const [ringkasan, setRingkasan] = useState<RingkasanPercakapan>(ringkasanAwal);
  const [daftar, setDaftar] = useState<ItemPercakapan[]>(daftarAwal);
  const [adaLagi, setAdaLagi] = useState<boolean>(adaLagiAwal);
  const [inputCari, setInputCari] = useState("");
  const [cariAktif, setCariAktif] = useState("");
  const [memuatDaftar, setMemuatDaftar] = useState(false);
  const [memuatLagi, setMemuatLagi] = useState(false);

  const [aktifId, setAktifId] = useState<number | null>(daftarAwal[0]?.id ?? null);
  const [detailMobile, setDetailMobile] = useState(false);
  const [pesan, setPesan] = useState<ItemPesan[]>(pesanAwal);
  const [adaSebelumnya, setAdaSebelumnya] = useState<boolean>(adaSebelumnyaAwal);
  const [memuatPesan, setMemuatPesan] = useState(false);
  const [memuatSebelumnya, setMemuatSebelumnya] = useState(false);
  const [menyegarkan, setMenyegarkan] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  const [kini, setKini] = useState(kiniAwal);
  const { b, t } = useBahasa();

  const wadahPesanRef = useRef<HTMLDivElement>(null);
  const bagianRef = useRef<HTMLElement>(null);
  const gulirKeBawahRef = useRef(true);

  const percakapanAktif = daftar.find((p) => p.id === aktifId) ?? null;

  const gulirBawah = useCallback(() => {
    const el = wadahPesanRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (gulirKeBawahRef.current) {
      gulirBawah();
      gulirKeBawahRef.current = false;
    }
  }, [pesan, gulirBawah]);

  const muatPesan = useCallback(
    async (id: number) => {
      setMemuatPesan(true);
      try {
        const res = await fetch(`/api/percakapan?number_id=${numberId}&percakapan_id=${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { percakapan: ItemPercakapan; pesan: ItemPesan[]; adaSebelumnya: boolean };
        gulirKeBawahRef.current = true;
        setPesan(d.pesan);
        setAdaSebelumnya(d.adaSebelumnya);
        setDaftar((lama) => lama.map((item) => (item.id === d.percakapan.id ? d.percakapan : item)));
      } finally {
        setMemuatPesan(false);
      }
    },
    [numberId]
  );

  const pilihPercakapan = useCallback(
    (id: number) => {
      setAktifId(id);
      setDetailMobile(true);
      void muatPesan(id);
      // HP: daftar berganti jadi isi chat; pastikan kepala panel terlihat, bukan tengah halaman.
      const el = bagianRef.current;
      if (el && window.matchMedia("(max-width: 767px)").matches && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
    },
    [muatPesan]
  );

  // Debounce pencarian custom (250 ms) supaya tidak memicu query di tiap ketikan huruf.
  useEffect(() => {
    const t = setTimeout(() => {
      setCariAktif(inputCari.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [inputCari]);

  const muatUlangDaftar = useCallback(
    async (q: string, pilihPertama = false) => {
      setMemuatDaftar(true);
      try {
        const params = new URLSearchParams({ number_id: String(numberId), ringkasan: "1" });
        if (q) params.set("cari", q);
        const res = await fetch(`/api/percakapan?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { daftar: ItemPercakapan[]; adaLagi: boolean; ringkasan?: RingkasanPercakapan };
        setDaftar(d.daftar);
        setAdaLagi(d.adaLagi);
        if (d.ringkasan) setRingkasan(d.ringkasan);
        setKini(Math.floor(Date.now() / 1000));
        if (pilihPertama) {
          const idBaru = d.daftar[0]?.id ?? null;
          setAktifId(idBaru);
          if (idBaru !== null) void muatPesan(idBaru);
          else {
            setPesan([]);
            setAdaSebelumnya(false);
          }
        }
      } finally {
        setMemuatDaftar(false);
      }
    },
    [numberId, muatPesan]
  );

  // Jalankan query saat kata kunci pencarian berubah dari keadaan awal.
  const pertamaRef = useRef(true);
  useEffect(() => {
    if (pertamaRef.current) {
      pertamaRef.current = false;
      return;
    }
    void muatUlangDaftar(cariAktif, true);
  }, [cariAktif, muatUlangDaftar]);

  async function muatLebihBanyakPercakapan() {
    if (!adaLagi || memuatLagi || daftar.length === 0) return;
    const terakhir = daftar[daftar.length - 1];
    setMemuatLagi(true);
    try {
      const params = new URLSearchParams({
        number_id: String(numberId),
        sebelum_waktu: String(terakhir.terakhir_pada),
        sebelum_id: String(terakhir.id),
      });
      if (cariAktif) params.set("cari", cariAktif);
      const res = await fetch(`/api/percakapan?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as { daftar: ItemPercakapan[]; adaLagi: boolean };
      setDaftar((lama) => {
        const ada = new Set(lama.map((x) => x.id));
        return [...lama, ...d.daftar.filter((x) => !ada.has(x.id))];
      });
      setAdaLagi(d.adaLagi);
    } finally {
      setMemuatLagi(false);
    }
  }

  async function muatPesanSebelumnya() {
    if (!aktifId || !adaSebelumnya || memuatSebelumnya || pesan.length === 0) return;
    const tertua = pesan[0];
    const el = wadahPesanRef.current;
    const tinggiSebelum = el?.scrollHeight ?? 0;
    setMemuatSebelumnya(true);
    try {
      const res = await fetch(`/api/percakapan?number_id=${numberId}&percakapan_id=${aktifId}&sebelum_id=${tertua.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as { pesan: ItemPesan[]; adaSebelumnya: boolean };
      gulirKeBawahRef.current = false;
      setPesan((lama) => {
        const ada = new Set(lama.map((x) => x.id));
        return [...d.pesan.filter((x) => !ada.has(x.id)), ...lama];
      });
      setAdaSebelumnya(d.adaSebelumnya);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - tinggiSebelum;
      });
    } finally {
      setMemuatSebelumnya(false);
    }
  }

  const segarkan = useCallback(async () => {
    if (menyegarkan) return;
    setMenyegarkan(true);
    try {
      const params = new URLSearchParams({ number_id: String(numberId), ringkasan: "1" });
      if (cariAktif) params.set("cari", cariAktif);
      const janjiDaftar = fetch(`/api/percakapan?${params.toString()}`, { cache: "no-store" });
      const idTerakhir = pesan.length > 0 ? pesan[pesan.length - 1].id : 0;
      const janjiPesan =
        aktifId !== null
          ? fetch(
              `/api/percakapan?number_id=${numberId}&percakapan_id=${aktifId}${idTerakhir > 0 ? `&setelah_id=${idTerakhir}` : ""}`,
              { cache: "no-store" }
            )
          : null;

      const [resDaftar, resPesan] = await Promise.all([janjiDaftar, janjiPesan]);
      if (resDaftar.ok) {
        const d = (await resDaftar.json()) as { daftar: ItemPercakapan[]; adaLagi: boolean; ringkasan?: RingkasanPercakapan };
        setDaftar(d.daftar);
        setAdaLagi(d.adaLagi);
        if (d.ringkasan) setRingkasan(d.ringkasan);
        setKini(Math.floor(Date.now() / 1000));
        if (aktifId === null && d.daftar[0]) {
          setAktifId(d.daftar[0].id);
          void muatPesan(d.daftar[0].id);
        }
      }
      if (resPesan && resPesan.ok) {
        const dp = (await resPesan.json()) as { percakapan: ItemPercakapan; pesan: ItemPesan[]; adaSebelumnya: boolean };
        if (dp.pesan.length > 0) {
          gulirKeBawahRef.current = true;
          setPesan((lama) => {
            if (idTerakhir === 0) return dp.pesan;
            const ada = new Set(lama.map((x) => x.id));
            return [...lama, ...dp.pesan.filter((x) => !ada.has(x.id))];
          });
        }
      }
    } finally {
      setMenyegarkan(false);
    }
  }, [menyegarkan, numberId, cariAktif, pesan, aktifId, muatPesan]);

  // Penyegaran ringan otomatis tiap 15 detik HANYA bila tab browser sedang terbuka/terlihat.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void segarkan();
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [segarkan]);

  async function salinNomor(telepon: string) {
    try {
      await navigator.clipboard.writeText(telepon);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 1800);
    } catch {
      // Clipboard tidak diizinkan pada konteks ini.
    }
  }

  async function hapusSatu() {
    if (aktifId === null) return { ok: false, pesan: t("Pilih percakapan dulu.", "Select a conversation first.") };
    const h = await hapusPercakapanAction(numberId, aktifId);
    if (h.ok) {
      setDetailMobile(false);
      await muatUlangDaftar(cariAktif, true); // daftar + ringkasan terbaru, pilih yang teratas
    }
    return h;
  }

  const [menandai, setMenandai] = useState(false);
  async function bukanSpam(id: number) {
    setMenandai(true);
    try {
      const h = await bukanSpamAction(numberId, id);
      if (h.ok) setDaftar((d) => d.map((p) => (p.id === id ? { ...p, spam: 2 } : p)));
    } finally {
      setMenandai(false);
    }
  }

  async function bangunkan(id: number) {
    setMenandai(true);
    try {
      const h = await bangunkanChatAction(numberId, id);
      if (h.ok) setDaftar((d) => d.map((p) => (p.id === id ? { ...p, prospek: 0, prospek_alasan: null } : p)));
    } finally {
      setMenandai(false);
    }
  }

  async function hapusSemua() {
    const h = await hapusPercakapanAction(numberId);
    if (h.ok) {
      setDaftar([]);
      setAdaLagi(false);
      setAktifId(null);
      setPesan([]);
      setAdaSebelumnya(false);
      setDetailMobile(false);
      setRingkasan({ total_percakapan: 0, total_masuk: 0, total_bot: 0, total_manusia: 0 });
    }
    return h;
  }

  return (
    <section ref={bagianRef} id="histori" className="card overflow-hidden">
      {/* Header & Ringkasan Statistik */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <MessagesSquare className="size-4" aria-hidden />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-bold tracking-tight">{t("Histori percakapan", "Conversation history")}</h2>
              <Pill nada="abu">
                {angka(ringkasan.total_percakapan, b)} {t("pelanggan", ringkasan.total_percakapan === 1 ? "customer" : "customers")}
              </Pill>
            </div>
            <p className="hint mt-0.5">
              {ringkasan.total_percakapan === 0
                ? t(
                    "Belum ada percakapan yang tercatat di nomor ini. Pesan pelanggan, balasan AI, dan balasan manusia dari HP akan muncul terstruktur di sini.",
                    "No conversations recorded on this number yet. Customer messages, AI replies, and your replies from the phone will appear here, neatly organized.",
                  )
                : t(
                    `${angka(ringkasan.total_masuk)} pesan pelanggan · ${angka(ringkasan.total_bot)} balasan AI · ${angka(ringkasan.total_manusia)} balasan manusia`,
                    `${angka(ringkasan.total_masuk, b)} customer ${ringkasan.total_masuk === 1 ? "message" : "messages"} · ${angka(ringkasan.total_bot, b)} AI ${ringkasan.total_bot === 1 ? "reply" : "replies"} · ${angka(ringkasan.total_manusia, b)} human ${ringkasan.total_manusia === 1 ? "reply" : "replies"}`,
                  )}
            </p>
            <p className="hint mt-1 flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              {t(
                `Riwayat chat disimpan ${UMUR_HISTORI_HARI} hari. Pesan yang lebih lama terhapus otomatis.`,
                `Chat history is kept for ${UMUR_HISTORI_HARI} days; older messages are deleted automatically. Times are in WIB (UTC+7).`,
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {ringkasan.total_percakapan > 0 && (
            <TombolKonfirmasi
              label={t("Hapus semua", "Delete all")}
              tanya={t(
                `Hapus ${angka(ringkasan.total_percakapan)} percakapan beserta isinya? Tidak bisa dikembalikan.`,
                `Delete ${angka(ringkasan.total_percakapan, b)} ${ringkasan.total_percakapan === 1 ? "conversation" : "conversations"} and all their messages? This can't be undone.`,
              )}
              ya={t("Ya, hapus semua", "Yes, delete all")}
              aksi={hapusSemua}
              className="btn btn-danger h-9 sm:h-8 px-3 text-xs"
              ikon={<Trash2 className="size-3.5" aria-hidden />}
            />
          )}
          <button
            type="button"
            onClick={() => void segarkan()}
            disabled={menyegarkan}
            className="btn btn-ghost h-9 sm:h-8 px-3 text-xs"
            aria-label={t("Segarkan histori percakapan", "Refresh conversation history")}
          >
            <RefreshCw className={`size-3.5 ${menyegarkan ? "animate-spin" : ""}`} aria-hidden />
            {t("Segarkan", "Refresh")}
          </button>
        </div>
      </div>

      {/* Panel Utama: Daftar Percakapan (Kiri) + Rincian Gelembung Chat (Kanan) */}
      <div className="grid md:h-[620px] md:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Kolom Kiri: Pencarian dan Daftar Percakapan */}
        <div className={`min-h-0 flex-col md:border-r md:border-line ${detailMobile ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-line p-3.5">
            {/* Custom Search Bar (tanpa native type="search") */}
            <div role="search" className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-faint" aria-hidden />
              <input
                type="text"
                value={inputCari}
                onChange={(e) => setInputCari(e.target.value)}
                maxLength={80}
                placeholder={t("Cari nama, nomor WA, atau isi pesan…", "Search name, WhatsApp number, or message…")}
                aria-label={t("Cari percakapan", "Search conversations")}
                className="field py-2 pr-9 pl-9 sm:py-1.5 sm:text-[13px]"
              />
              {inputCari && (
                <button
                  type="button"
                  onClick={() => setInputCari("")}
                  aria-label={t("Hapus pencarian", "Clear search")}
                  className="absolute right-1.5 grid size-7 place-items-center rounded-md text-faint hover:bg-subtle hover:text-fg"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {/* Daftar Percakapan */}
          <div className="max-h-[65svh] min-h-0 flex-1 overflow-y-auto md:max-h-none">
            {memuatDaftar ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {t("Memuat percakapan…", "Loading conversations…")}
              </div>
            ) : daftar.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p className="text-[13.5px] font-semibold text-fg">
                  {cariAktif ? t("Tidak ada percakapan yang cocok", "No matching conversations") : t("Belum ada histori percakapan", "No conversation history yet")}
                </p>
                <p className="hint mt-1">
                  {cariAktif
                    ? t("Coba ubah kata kunci pencarian.", "Try a different search term.")
                    : t(
                        "Saat pelanggan mengirim chat ke nomor WhatsApp ini, percakapannya langsung tampil di sini.",
                        "When customers message this WhatsApp number, their conversations show up here right away.",
                      )}
                </p>
              </div>
            ) : (
              <ul data-analitik-privat className="divide-y divide-line">
                {daftar.map((item) => {
                  const terpilih = item.id === aktifId;
                  const dijeda = item.jeda_sampai > kini;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-analitik="Buka percakapan"
                        onClick={() => pilihPercakapan(item.id)}
                        className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                          terpilih ? "bg-accent-soft/55" : "hover:bg-subtle/60"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                            terpilih ? "bg-accent text-on-accent" : "bg-subtle text-muted"
                          }`}
                        >
                          <User className="size-4" aria-hidden />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[13.5px] font-semibold text-fg">{namaTampil(item, t)}</p>
                            <span className="shrink-0 text-[11px] text-faint tabular-nums">{waktuSingkatWib(item.terakhir_pada, kini, b)}</span>
                          </div>

                          {item.nama && item.telepon && (
                            <p className="truncate text-[11.5px] text-muted tabular-nums">{formatNomor(item.telepon)}</p>
                          )}

                          <p className="mt-0.5 truncate text-[12.5px] text-muted">
                            <span className="font-medium text-fg">{awalanCuplikan(item.pengirim_akhir, t)}</span>
                            {item.cuplikan || "—"}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 font-semibold text-accent tabular-nums">
                              <Bot className="size-3" aria-hidden /> {item.bot_n}
                            </span>
                            {item.manusia_n > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 font-semibold text-warning tabular-nums">
                                <Smartphone className="size-3" aria-hidden /> {item.manusia_n}
                              </span>
                            )}
                            {dijeda && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 font-medium text-muted">
                                <Clock className="size-3" aria-hidden /> {t("Dijeda manusia", "Paused by you")}
                              </span>
                            )}
                            {item.spam === 1 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 font-semibold text-danger">
                                <ShieldAlert className="size-3" aria-hidden /> Spam
                              </span>
                            )}
                            {item.prospek >= 2 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 font-medium text-muted">
                                <MicOff className="size-3" aria-hidden /> {item.prospek === 3 ? "Bot" : t("Dibisukan", "Muted")}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {adaLagi && (
              <div className="border-t border-line p-3">
                <button
                  type="button"
                  onClick={() => void muatLebihBanyakPercakapan()}
                  disabled={memuatLagi}
                  className="btn btn-ghost h-9 sm:h-8 w-full text-xs"
                >
                  {memuatLagi ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
                  {t("Muat percakapan lainnya", "Load more conversations")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Kolom Kanan: Rincian Gelembung Percakapan */}
        <div className={`min-h-0 min-w-0 flex-col bg-subtle/35 ${detailMobile ? "flex" : "hidden md:flex"}`}>
          {!percakapanAktif ? (
            <div className="m-auto px-6 py-16 text-center">
              <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-subtle text-muted">
                <MessagesSquare className="size-5" aria-hidden />
              </span>
              <p className="text-[14px] font-semibold text-fg">{t("Pilih percakapan", "Select a conversation")}</p>
              <p className="hint mt-1 max-w-xs">
                {t(
                  "Klik salah satu pelanggan di sebelah kiri untuk melihat seluruh riwayat tanya-jawabnya.",
                  "Click a customer on the left to see their full conversation.",
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Header Percakapan Terpilih */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDetailMobile(false)}
                    aria-label={t("Kembali ke daftar percakapan", "Back to conversation list")}
                    className="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg md:hidden"
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                  </button>
                  <div data-analitik-privat className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14px] font-bold text-fg">{namaTampil(percakapanAktif, t)}</p>
                      {percakapanAktif.jeda_sampai > kini && <Pill nada="kuning">{t("AI sedang jeda (ditangani manusia)", "AI paused (handled by you)")}</Pill>}
                      {percakapanAktif.spam === 1 && <Pill nada="merah">Spam</Pill>}
                      {percakapanAktif.prospek === 1 && <Pill nada="hijau">{t("Prospek", "Lead")}</Pill>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      {percakapanAktif.telepon && (
                        <button
                          type="button"
                          data-analitik="Salin nomor WhatsApp"
                          onClick={() => void salinNomor(percakapanAktif.telepon!)}
                          title={t("Salin nomor WhatsApp", "Copy WhatsApp number")}
                          className="inline-flex items-center gap-1 font-medium text-muted tabular-nums hover:text-fg"
                        >
                          {formatNomor(percakapanAktif.telepon)}
                          {tersalin ? <Check className="size-3 text-success" aria-hidden /> : <Copy className="size-3 text-faint" aria-hidden />}
                        </button>
                      )}
                      <span>
                        {t(
                          `${angka(percakapanAktif.masuk_n)} masuk · ${angka(percakapanAktif.bot_n)} AI · ${angka(percakapanAktif.manusia_n)} manusia`,
                          `${angka(percakapanAktif.masuk_n, b)} in · ${angka(percakapanAktif.bot_n, b)} AI · ${angka(percakapanAktif.manusia_n, b)} you`,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                {/* key: konfirmasi yang sedang terbuka tertutup lagi saat pindah percakapan. */}
                <TombolKonfirmasi
                  key={percakapanAktif.id}
                  label={t("Hapus", "Delete")}
                  tanya={t("Hapus percakapan ini beserta isinya?", "Delete this conversation and all its messages?")}
                  ya={t("Ya, hapus", "Yes, delete")}
                  aksi={hapusSatu}
                  className="btn btn-danger h-9 sm:h-8 px-2.5 text-xs"
                  ikon={<Trash2 className="size-3.5" aria-hidden />}
                />
              </div>

              {percakapanAktif.spam === 1 && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-danger-soft/60 px-4 py-2.5 text-[12.5px] sm:px-5">
                  <p className="min-w-0 flex-1 text-fg">
                    <span className="font-semibold text-danger">{t("AI tidak membalas pesan spam di chat ini.", "AI doesn't reply to spam in this chat.")}</span>{" "}
                    {percakapanAktif.spam_alasan && <span className="text-muted">{percakapanAktif.spam_alasan}.</span>}
                  </p>
                  <button type="button" onClick={() => void bukanSpam(percakapanAktif.id)} disabled={menandai} className="btn btn-ghost h-9 sm:h-8 border border-line bg-surface px-3 text-xs">
                    {menandai && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    {t("Bukan spam, balas seperti biasa", "Not spam, reply as usual")}
                  </button>
                </div>
              )}

              {percakapanAktif.prospek >= 2 && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-2.5 text-[12.5px] sm:px-5">
                  <p className="min-w-0 flex-1 text-fg">
                    <span className="font-semibold">{percakapanAktif.prospek === 3
                        ? t("AI berhenti membalas: lawan bicara terdeteksi bot.", "AI stopped replying: the other side looks like a bot.")
                        : t("AI tidak lagi melayani chat ini: dinilai bukan prospek.", "AI no longer serves this chat: judged not to be a lead.")}</span>{" "}
                    <span className="text-muted">
                      {percakapanAktif.prospek_alasan ? `${percakapanAktif.prospek_alasan}. ` : ""}
                      {percakapanAktif.prospek === 3
                        ? t("Dicoba lagi otomatis setelah 6 jam.", "It will try again automatically after 6 hours.")
                        : t(
                            "Otomatis dilayani lagi bila kontak ini menanyakan hal seputar usaha Anda.",
                            "It's served again automatically if this contact asks about your business.",
                          )}
                    </span>
                  </p>
                  <button type="button" onClick={() => void bangunkan(percakapanAktif.id)} disabled={menandai} className="btn btn-ghost h-9 sm:h-8 border border-line bg-surface px-3 text-xs">
                    {menandai && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    {t("Layani lagi", "Serve again")}
                  </button>
                </div>
              )}

              {/* Ruang Gelembung Pesan */}
              <div
                ref={wadahPesanRef}
                data-analitik-privat
                className="flex h-[62svh] min-h-80 flex-col gap-2.5 overflow-y-auto px-3 py-4 sm:px-5 md:h-auto md:min-h-0 md:flex-1"
              >
                {!adaSebelumnya && !memuatPesan && pesan.length > 0 && (
                  <p className="mb-1 text-center text-[11.5px] text-faint">
                    {t(
                      `Pesan yang lebih lama dari ${UMUR_HISTORI_HARI} hari terhapus otomatis.`,
                      `Messages older than ${UMUR_HISTORI_HARI} days are deleted automatically.`,
                    )}
                  </p>
                )}
                {adaSebelumnya && (
                  <div className="mb-1 flex justify-center">
                    <button
                      type="button"
                      data-analitik="Muat pesan sebelumnya"
                      onClick={() => void muatPesanSebelumnya()}
                      disabled={memuatSebelumnya}
                      className="btn btn-ghost h-7 px-3 text-xs"
                    >
                      {memuatSebelumnya && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                      {t("Muat pesan sebelumnya", "Load earlier messages")}
                    </button>
                  </div>
                )}

                {memuatPesan ? (
                  <div className="m-auto flex items-center gap-2 py-12 text-[13px] text-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> {t("Memuat isi percakapan…", "Loading messages…")}
                  </div>
                ) : pesan.length === 0 ? (
                  <p className="m-auto text-center text-[13px] text-faint">{t("Belum ada pesan di percakapan ini.", "No messages in this conversation yet.")}</p>
                ) : (
                  pesan.map((m, idx) => {
                    const hariIni = kunciHariWib(m.waktu);
                    const hariSebelum = idx > 0 ? kunciHariWib(pesan[idx - 1].waktu) : null;
                    const tampilkanHari = hariIni !== hariSebelum;
                    const dariPelanggan = m.peran === 0;
                    const dariBot = m.peran === 1;

                    return (
                      <div key={m.id} className="flex flex-col gap-2">
                        {tampilkanHari && (
                          <div className="my-1 flex justify-center">
                            <span className="rounded-full border border-line bg-surface px-3 py-0.5 text-[11px] font-semibold text-muted">
                              {tanggal(m.waktu, b)}
                            </span>
                          </div>
                        )}

                        <div className={`flex max-w-[88%] min-w-0 flex-col sm:max-w-[80%] ${dariPelanggan ? "self-start" : "self-end"}`}>
                          <div
                            className={`rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${
                              dariPelanggan
                                ? "rounded-bl-md border border-line bg-surface text-fg"
                                : dariBot
                                  ? "rounded-br-md bg-accent text-on-accent"
                                  : "rounded-br-md border border-line-strong bg-warning-soft text-fg"
                            }`}
                          >
                            <div
                              className={`mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold ${
                                dariPelanggan ? "text-muted" : dariBot ? "text-on-accent/85" : "text-warning"
                              }`}
                            >
                              <span className="inline-flex items-center gap-1">
                                {dariPelanggan ? (
                                  <>
                                    <User className="size-3" aria-hidden /> {t("Pelanggan", "Customer")}
                                  </>
                                ) : dariBot ? (
                                  <>
                                    <Bot className="size-3" aria-hidden /> {t("Balasan AI", "AI reply")}
                                  </>
                                ) : (
                                  <>
                                    <Smartphone className="size-3" aria-hidden /> {t("Balasan Manusia (HP)", "You (phone)")}
                                  </>
                                )}
                              </span>
                              <span className="font-normal tabular-nums">{jamWib(m.waktu, b)} WIB</span>
                            </div>

                            <div>
                              <TeksWa teks={m.teks} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

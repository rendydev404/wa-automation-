"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Check, ChevronDown, CircleHelp, Contact, Loader2, MessageCircleOff, RefreshCw, Search, Sparkles, Star, UserRound, X } from "lucide-react";
import { daftarKontakAction, perbaruiKontakAction, ringkasanKontakAction, setAbaikanKontakAction, setTetapBalasAction } from "@/app/actions";
import type { Kontak, RingkasanKontak } from "@/lib/kontak";
import { angka, formatNomor, jamWib, kunciHariWib, tanggal } from "@/lib/format";
import { useBahasa } from "./bahasa";
import { TUR_KONTAK } from "./isi-tur";
import { useTurOpsional } from "./tur";
import { Saklar } from "./ui";

/**
 * "Jangan balas kontak yang tersimpan di HP" + kontak pengecualian yang tetap dibalas AI (lib/kontak.ts).
 * Panduan cara kerjanya selalu tampil (3 kartu) supaya pemilik paham sebelum menyalakan; tanya-jawab bisa dibuka.
 */
export function PanelKontak({
  numberId,
  aktif: aktifAwal,
  resmi,
  ringkasan: ringkasanAwal,
  tetapAwal,
  daftarAwal,
  adaLagiAwal,
  turSudah,
}: {
  numberId: number;
  aktif: boolean;
  /** Nomor jalur resmi (Cloud API): tidak punya buku telepon, fitur tidak tersedia. */
  resmi: boolean;
  ringkasan: RingkasanKontak;
  tetapAwal: Kontak[];
  daftarAwal: Kontak[];
  adaLagiAwal: boolean;
  /** Panduan sorotan sudah pernah dilihat akun ini (users.tur_selesai). */
  turSudah: boolean;
}) {
  const { b, t } = useBahasa();
  const [aktif, setAktif] = useOptimistic(aktifAwal);
  const [, mulaiSaklar] = useTransition();
  const [ringkasan, setRingkasan] = useState(ringkasanAwal);
  const [tetap, setTetap] = useState(tetapAwal);
  const [daftar, setDaftar] = useState(daftarAwal);
  const [adaLagi, setAdaLagi] = useState(adaLagiAwal);
  const [cari, setCari] = useState("");
  const [mencari, setMencari] = useState(false);
  const [memuat, mulaiMuat] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);
  const permintaan = useRef(0);
  const tur = useTurOpsional();
  const mulaiTur = () => tur?.mulai("kontak", TUR_KONTAK(t));

  // Datang dari pengumuman "Fitur baru" atau notifikasinya (?tur=kontak): putar panduannya, lalu buang parameternya.
  const turDiminta = useSearchParams().get("tur") === "kontak";
  useEffect(() => {
    if (!turDiminta || resmi) return;
    // Parameter dibuang di akhir: membuangnya mengubah useSearchParams dan menjalankan cleanup efek ini, jadi tur
    // harus sudah dimulai lebih dulu.
    let lanjut: ReturnType<typeof setTimeout> | undefined;
    const id = setTimeout(() => {
      // Pengguna bisa saja sedang di tab lain halaman nomor ini: buka tab Pengaturan dulu (tab-nomor.tsx).
      window.dispatchEvent(new CustomEvent("nomor:tab", { detail: "pengaturan" }));
      lanjut = setTimeout(() => {
        mulaiTur();
        const u = new URL(location.href);
        u.searchParams.delete("tur");
        history.replaceState(history.state, "", u);
      }, 450);
    }, 900);
    return () => {
      clearTimeout(id);
      clearTimeout(lanjut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turDiminta]);

  // Pertama kali fitur dinyalakan: panduan sorotan diputar sekali, setelah daftar kontak tampil (panel dipasang ulang
  // begitu sakelar berubah, jadi tandanya disimpan di modul).
  useEffect(() => {
    if (!aktifAwal || turSudah || !turSetelahNyala.has(numberId)) return;
    turSetelahNyala.delete(numberId);
    const id = setTimeout(mulaiTur, 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const muatUlang = async (kata: string) => {
    const no = ++permintaan.current;
    setMencari(true);
    const [r, p] = await Promise.all([daftarKontakAction(numberId, kata, false, 0), daftarKontakAction(numberId, "", true, 0)]);
    if (no !== permintaan.current) return;
    setDaftar(r.daftar);
    setAdaLagi(r.adaLagi);
    setTetap(p.daftar);
    setMencari(false);
  };

  // Cari: tunggu pengguna berhenti mengetik sebentar, lalu satu permintaan (yang basi diabaikan).
  const pertama = useRef(true);
  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    const id = setTimeout(() => void muatUlang(cari), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cari]);

  // Selama daftar sedang diambil dari HP: cek status berkala, lalu tampilkan hasilnya.
  useEffect(() => {
    if (!ringkasan.sedang) return;
    const id = setInterval(async () => {
      const r = await ringkasanKontakAction(numberId);
      if (!r) return;
      setRingkasan(r);
      if (!r.sedang) void muatUlang(cari);
    }, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringkasan.sedang, numberId]);

  const ubahAktif = (v: boolean) =>
    mulaiSaklar(async () => {
      setGalat(null);
      setAktif(v);
      if (v) turSetelahNyala.add(numberId);
      const h = await setAbaikanKontakAction(numberId, v);
      if (!h.ok) {
        turSetelahNyala.delete(numberId);
        return setGalat(h.pesan ?? null);
      }
      if (v) setRingkasan((r) => ({ ...r, sedang: true, galat: null, galatEn: null }));
    });

  const perbarui = async () => {
    setGalat(null);
    setRingkasan((r) => ({ ...r, sedang: true, galat: null, galatEn: null }));
    const h = await perbaruiKontakAction(numberId);
    if (!h.ok) {
      setGalat(h.pesan ?? null);
      setRingkasan((r) => ({ ...r, sedang: false }));
    }
  };

  const ubahTetap = async (k: Kontak, v: boolean) => {
    setGalat(null);
    const ganti = (x: Kontak) => (x.jid === k.jid ? { ...x, tetap_balas: v } : x);
    setDaftar((d) => d.map(ganti));
    setTetap((d) => (v ? [...d.filter((x) => x.jid !== k.jid), { ...k, tetap_balas: true }].sort(urutNama) : d.filter((x) => x.jid !== k.jid)));
    setRingkasan((r) => ({ ...r, tetap: Math.max(0, r.tetap + (v ? 1 : -1)) }));
    const h = await setTetapBalasAction(numberId, k.jid, v);
    if (!h.ok) {
      setGalat(h.pesan ?? null);
      void muatUlang(cari);
    }
  };

  const muatLagi = () =>
    mulaiMuat(async () => {
      const r = await daftarKontakAction(numberId, cari, false, daftar.length);
      setDaftar((d) => [...d, ...r.daftar.filter((x) => !d.some((y) => y.jid === x.jid))]);
      setAdaLagi(r.adaLagi);
    });

  const galatTarik = b === "en" ? ringkasan.galatEn : ringkasan.galat;

  return (
    <section className="card" id="kontak-tersimpan">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-start gap-2 text-[15px] font-bold tracking-tight">
            <Contact className="mt-[3px] size-4 shrink-0 text-accent" aria-hidden />
            {t("Jangan balas kontak yang tersimpan di HP", "Don't reply to contacts saved on the phone")}
          </h2>
          <p className="hint mt-0.5">
            {resmi
              ? t("Hanya untuk nomor yang tersambung lewat scan QR.", "Only for numbers connected by scanning a QR code.")
              : aktif
                ? t("Nyala: teman, keluarga & pelanggan tetap yang Anda simpan dibalas sendiri. AI melayani nomor baru.", "On: friends, family & regulars you've saved are yours to answer. AI serves new numbers.")
                : t("Mati: AI membalas semua chat, termasuk dari kontak yang tersimpan.", "Off: AI replies to every chat, including saved contacts.")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {tur && (
            <button type="button" onClick={mulaiTur} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold text-accent hover:bg-accent-soft" data-analitik="Panduan kontak tersimpan">
              <CircleHelp className="size-4" aria-hidden />
              <span className="max-sm:sr-only">{t("Panduan", "Guide")}</span>
            </button>
          )}
          <span data-tur="kontak-saklar" className="inline-flex rounded-full">
            <Saklar aktif={aktif && !resmi} disabled={resmi} label={t("Jangan balas kontak yang tersimpan di HP", "Don't reply to contacts saved on the phone")} analitik="Saklar abaikan kontak tersimpan" onUbah={ubahAktif} />
          </span>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <CaraKerja />

        {galat && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-semibold text-danger">{galat}</p>}

        {resmi ? (
          <p className="rounded-xl bg-subtle px-4 py-3 text-[13px] text-muted">
            {t(
              "Nomor ini memakai WhatsApp resmi (Cloud API Meta). Meta tidak membagikan buku telepon HP, jadi AI tidak bisa tahu kontak mana yang tersimpan. Fitur ini tersedia untuk nomor yang tersambung lewat scan QR.",
              "This number uses official WhatsApp (Meta Cloud API). Meta doesn't share the phone's address book, so the AI can't tell which contacts are saved. This feature is available for numbers connected by scanning a QR code.",
            )}
          </p>
        ) : !aktif ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-line-strong px-4 py-4 text-[13px] text-muted">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <p>
              {t(
                "Nyalakan sakelar di kanan atas. Daftar kontak diambil otomatis dari WhatsApp di HP Anda, tanpa perlu mengunggah apa pun. Setelah itu Anda bisa memilih kontak yang tetap boleh dibalas AI.",
                "Turn on the switch at the top right. Your contact list is pulled automatically from WhatsApp on your phone, nothing to upload. Then you can choose contacts the AI may still reply to.",
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Status buku telepon */}
            <div data-tur="kontak-status" className="flex flex-col gap-3 rounded-xl bg-subtle/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-[13px]">
                {ringkasan.sedang ? (
                  <p className="flex items-center gap-2 font-semibold text-fg">
                    <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
                    {t("Mengambil daftar kontak dari HP…", "Fetching the contact list from the phone…")}
                  </p>
                ) : (
                  <p className="font-semibold text-fg">
                    {ringkasan.total > 0
                      ? t(`${angka(ringkasan.total)} kontak tersimpan terbaca`, `${angka(ringkasan.total, b)} saved ${ringkasan.total === 1 ? "contact" : "contacts"} found`)
                      : t("Belum ada kontak terbaca", "No contacts found yet")}
                  </p>
                )}
                <p className="hint mt-0.5">
                  {galatTarik && !ringkasan.sedang
                    ? galatTarik
                    : ringkasan.terakhir
                      ? t(`Diperbarui ${kapan(ringkasan.terakhir, "id")}. Kontak baru di HP ikut terbaca sendiri dalam beberapa detik.`, `Updated ${kapan(ringkasan.terakhir, "en")}. New contacts on the phone are picked up on their own within seconds.`)
                      : t("Pastikan nomor tersambung. Daftar diambil otomatis begitu nomor tersambung.", "Make sure the number is connected. The list is fetched automatically once it connects.")}
                </p>
              </div>
              <button type="button" onClick={perbarui} disabled={ringkasan.sedang} className="btn btn-ghost h-9 shrink-0 self-start px-3 sm:self-auto" data-analitik="Perbarui daftar kontak">
                <RefreshCw className={`size-4 ${ringkasan.sedang ? "animate-spin" : ""}`} aria-hidden />
                {t("Perbarui daftar", "Refresh list")}
              </button>
            </div>

            {/* Pengecualian */}
            <div data-tur="kontak-tetap">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
                <Star className="size-3.5" aria-hidden />
                {t("Tetap dibalas AI", "Still replied to by AI")} ({angka(ringkasan.tetap, b)})
              </p>
              {tetap.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-[13px] text-muted">
                  {t(
                    "Belum ada. Contoh: pelanggan langganan yang nomornya Anda simpan tapi tetap ingin dilayani AI. Cari kontaknya di bawah, lalu ketuk “Tetap balas”.",
                    "None yet. Example: a regular customer whose number you saved but still want the AI to serve. Find them below, then tap “Keep replying”.",
                  )}
                </p>
              ) : (
                <ul data-analitik-privat className="flex flex-wrap gap-2">
                  {tetap.map((k) => (
                    <li key={k.jid} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft py-1 pr-1 pl-3 text-[13px] font-semibold text-fg">
                      <span className="truncate">{namaKontak(k)}</span>
                      <button
                        type="button"
                        onClick={() => void ubahTetap(k, false)}
                        aria-label={t(`Hapus ${namaKontak(k)} dari daftar tetap dibalas`, `Remove ${namaKontak(k)} from the keep-replying list`)}
                        className="grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-danger"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Semua kontak + cari */}
            <div>
              <label htmlFor={`cari-kontak-${numberId}`} className="mb-2 block text-xs font-semibold tracking-wide text-faint uppercase">
                {t("Kontak tersimpan di HP", "Contacts saved on the phone")}
              </label>
              <div className="relative" data-tur="kontak-cari">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
                <input
                  id={`cari-kontak-${numberId}`}
                  type="search"
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder={t("Cari nama atau nomor HP…", "Search a name or number…")}
                  className="field pl-9"
                  autoComplete="off"
                />
                {mencari && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-faint" aria-hidden />}
              </div>
              {daftar.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
                  <UserRound className="mx-auto mb-2 size-6 text-faint" aria-hidden />
                  {cari.trim()
                    ? t("Tidak ada kontak yang cocok. Baru disimpan di HP? Ketuk “Perbarui daftar”.", "No matching contacts. Just saved it on the phone? Tap “Refresh list”.")
                    : ringkasan.sedang
                      ? t("Sebentar, daftar kontak sedang diambil…", "One moment, fetching the contact list…")
                      : t("Belum ada kontak. Ketuk “Perbarui daftar” saat nomor tersambung.", "No contacts yet. Tap “Refresh list” while the number is connected.")}
                </div>
              ) : (
                <ul data-analitik-privat className="mt-2 max-h-[420px] divide-y divide-line overflow-y-auto rounded-xl border border-line">
                  {daftar.map((k, n) => (
                    <li key={k.jid} className="flex items-center gap-3 px-3 py-2.5" data-tur={n === 0 ? "kontak-tetap-balas" : undefined}>
                      <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold uppercase ${k.tetap_balas ? "bg-accent text-on-accent" : "bg-subtle text-muted"}`} aria-hidden>
                        {(k.nama ?? "#").trim().charAt(0) || "#"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13.5px] leading-snug font-semibold [overflow-wrap:anywhere]">{namaKontak(k)}</p>
                        <p className="text-[12px] text-muted tabular-nums">
                          <span className="whitespace-nowrap">{k.telepon ? formatNomor(k.telepon) : t("Nomor disembunyikan WhatsApp", "Number hidden by WhatsApp")}</span>
                          <span className="hidden sm:inline">
                            {" · "}
                            {k.tetap_balas ? <span className="font-semibold text-accent">{t("Dibalas AI", "AI replies")}</span> : t("AI tidak membalas", "AI doesn't reply")}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-pressed={k.tetap_balas}
                        onClick={() => void ubahTetap(k, !k.tetap_balas)}
                        className={`btn h-8 shrink-0 px-2.5 text-[12.5px] sm:px-3 ${k.tetap_balas ? "btn-primary" : "btn-ghost"}`}
                        data-analitik={k.tetap_balas ? "Batal tetap balas" : "Tetap balas"}
                      >
                        {k.tetap_balas ? <Check className="size-3.5" aria-hidden /> : <Star className="size-3.5" aria-hidden />}
                        {k.tetap_balas ? t("Tetap dibalas", "Replying") : t("Tetap balas", "Keep replying")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {adaLagi && (
                <button type="button" onClick={muatLagi} disabled={memuat} className="btn btn-ghost mt-3 w-full">
                  {memuat && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {t("Muat lagi", "Load more")}
                </button>
              )}
            </div>
          </>
        )}

        <TanyaJawab />
      </div>
    </section>
  );
}

/** Nomor yang baru saja dinyalakan pengguna di tab ini: panduannya diputar setelah panel dipasang ulang. */
const turSetelahNyala = new Set<number>();

const urutNama = (a: Kontak, c: Kontak) => namaKontak(a).localeCompare(namaKontak(c));
/** "pukul 14.03" bila hari ini (WIB), selain itu tanggalnya. */
const kapan = (detik: number, b: "id" | "en") => {
  if (kunciHariWib(detik) !== kunciHariWib(Math.floor(Date.now() / 1000))) return tanggal(detik, b);
  return b === "en" ? `at ${jamWib(detik, b)}` : `pukul ${jamWib(detik, b)}`;
};
const namaKontak = (k: Kontak) => k.nama || (k.telepon ? formatNomor(k.telepon) : "Tanpa nama");

/** Tiga keadaan dalam satu pandangan: siapa yang dibalas AI dan siapa yang tidak. */
function CaraKerja() {
  const { t } = useBahasa();
  const kartu = [
    {
      ikon: <UserRound className="size-4" aria-hidden />,
      warna: "bg-accent-soft text-accent",
      judul: t("Nomor baru / belum disimpan", "New / unsaved number"),
      hasil: t("Dibalas AI", "AI replies"),
      nada: "text-accent",
      contoh: t("Calon pembeli dari iklan, status, atau link WA.", "Prospects from ads, status, or a WA link."),
    },
    {
      ikon: <MessageCircleOff className="size-4" aria-hidden />,
      warna: "bg-subtle text-muted",
      judul: t("Kontak tersimpan di HP", "Contact saved on the phone"),
      hasil: t("Tidak dibalas AI", "AI stays quiet"),
      nada: "text-muted",
      contoh: t("Keluarga, teman, supplier: Anda balas sendiri.", "Family, friends, suppliers: you reply yourself."),
    },
    {
      ikon: <Star className="size-4" aria-hidden />,
      warna: "bg-warning-soft text-warning",
      judul: t("Kontak tersimpan pilihan Anda", "Saved contact you picked"),
      hasil: t("Tetap dibalas AI", "AI still replies"),
      nada: "text-accent",
      contoh: t("Pelanggan tetap yang tetap ingin dilayani AI.", "Regulars you still want the AI to serve."),
    },
  ];
  return (
    <ol data-tur="kontak-cara" className="grid gap-2 sm:grid-cols-3 sm:gap-2.5" aria-label={t("Cara kerja fitur ini", "How this feature works")}>
      {kartu.map((k) => (
        <li key={k.judul} className="flex items-start gap-3 rounded-xl border border-line p-3 sm:block sm:p-3.5">
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${k.warna}`}>{k.ikon}</span>
          <div className="min-w-0">
            <p className="text-[13px] leading-snug font-semibold sm:mt-2.5">{k.judul}</p>
            <p className={`mt-0.5 text-[13px] font-bold sm:mt-1 ${k.nada}`}>→ {k.hasil}</p>
            <p className="hint mt-0.5 sm:mt-1">{k.contoh}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Panduan langkah demi langkah + pertanyaan yang sering muncul. */
function TanyaJawab() {
  const { t } = useBahasa();
  const langkah = [
    t("Pastikan nomor ini tersambung (tab Koneksi berstatus Terhubung).", "Make sure this number is connected (Connection tab shows Connected)."),
    t("Nyalakan sakelar “Jangan balas kontak yang tersimpan di HP”.", "Turn on “Don't reply to contacts saved on the phone”."),
    t("Tunggu beberapa detik sampai muncul “… kontak tersimpan terbaca”.", "Wait a few seconds until “… saved contacts found” appears."),
    t("Ada kontak tersimpan yang tetap ingin dilayani AI? Cari namanya, lalu ketuk “Tetap balas”.", "Any saved contact the AI should still serve? Search for them, then tap “Keep replying”."),
  ];
  const tanya = [
    {
      q: t("Dari mana daftar kontaknya?", "Where does the contact list come from?"),
      a: t(
        "Dari WhatsApp di HP Anda: nomor yang Anda simpan di buku telepon dan terbaca di WhatsApp. Tidak perlu mengunggah atau mengetik apa pun.",
        "From WhatsApp on your phone: numbers you've saved in your address book that WhatsApp can see. Nothing to upload or type.",
      ),
    },
    {
      q: t("Pesan dari kontak tersimpan hilang?", "Do messages from saved contacts disappear?"),
      a: t(
        "Tidak. Pesannya tetap masuk ke WhatsApp di HP dan tercatat di tab Percakapan. Hanya AI yang tidak membalas, jadi Anda yang membalasnya.",
        "No. They still arrive in WhatsApp on your phone and appear in the Conversations tab. Only the AI stays quiet, so you answer them.",
      ),
    },
    {
      q: t("Saya baru menyimpan nomor pelanggan. Kapan berlaku?", "I just saved a customer's number. When does it apply?"),
      a: t(
        "Biasanya dalam beberapa detik, karena WhatsApp mengirim perubahan kontak sendiri. Bila belum muncul di daftar, ketuk “Perbarui daftar”.",
        "Usually within seconds, as WhatsApp sends contact changes on its own. If it isn't in the list yet, tap “Refresh list”.",
      ),
    },
    {
      q: t("Kontak saya hapus dari HP, lalu?", "What if I delete a contact from the phone?"),
      a: t(
        "Ketuk “Perbarui daftar”. Kontak yang sudah tidak ada di HP ikut terhapus dari daftar, dan AI kembali membalas nomor itu seperti nomor baru.",
        "Tap “Refresh list”. Contacts no longer on the phone are removed from the list, and the AI replies to that number again like a new one.",
      ),
    },
    {
      q: t("Bedanya dengan mematikan Balasan otomatis?", "How is this different from turning off Auto-reply?"),
      a: t(
        "Balasan otomatis mati = AI diam untuk SEMUA chat. Fitur ini memilah: AI tetap melayani calon pembeli, tetapi tidak ikut campur di chat pribadi Anda.",
        "Auto-reply off = AI is quiet for ALL chats. This feature sorts them: the AI keeps serving prospects but stays out of your personal chats.",
      ),
    },
    {
      q: t("Apakah data kontak saya aman?", "Is my contact data safe?"),
      a: t(
        "Daftar kontak hanya disimpan selama fitur ini menyala, hanya dipakai untuk menentukan siapa yang dibalas AI, dan bot tidak pernah mengirim pesan ke kontak Anda. Daftarnya ikut terhapus bila nomor ini dihapus.",
        "The contact list is only stored while this feature is on, only used to decide who the AI replies to, and the bot never messages your contacts. It's deleted along with this number.",
      ),
    },
    {
      q: t("Ada nomor yang tetap dibalas AI padahal tersimpan?", "A saved number still gets AI replies?"),
      a: t(
        "Cek apakah nomor itu ada di daftar kontak di atas. Bila tidak ada, kemungkinan WhatsApp belum mengirimnya: ketuk “Perbarui daftar”. Pastikan juga namanya tidak ada di “Tetap dibalas AI”.",
        "Check that the number appears in the contact list above. If not, WhatsApp may not have sent it yet: tap “Refresh list”. Also make sure it isn't under “Still replied to by AI”.",
      ),
    },
  ];
  return (
    <details data-tur="kontak-panduan" className="group rounded-xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <BookOpen className="size-4 text-accent" aria-hidden />
          {t("Panduan & pertanyaan umum", "Guide & FAQ")}
        </span>
        <ChevronDown className="size-4 text-faint transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4">
        <div>
          <p className="text-[13px] font-bold">{t("Cara memakai dalam 4 langkah", "How to use it in 4 steps")}</p>
          <ol className="mt-2 space-y-2">
            {langkah.map((l, i) => (
              <li key={l} className="flex gap-2.5 text-[13px] text-muted">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-on-accent">{i + 1}</span>
                <span>{l}</span>
              </li>
            ))}
          </ol>
        </div>
        <dl className="space-y-3">
          {tanya.map((x) => (
            <div key={x.q}>
              <dt className="text-[13px] font-semibold">{x.q}</dt>
              <dd className="mt-0.5 text-[13px] text-muted">{x.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

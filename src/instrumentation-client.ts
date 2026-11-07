/**
 * Pelacak perilaku pengguna di browser (konvensi Next 16 `instrumentation-client`: dijalankan sekali sebelum hidrasi).
 * Mencatat kunjungan halaman (saat dimuat + `onRouterTransitionStart`) dan klik elemen interaktif, lalu mengirimnya
 * berkelompok ke UJUNG_ANALITIK (src/app/api/analitik/route.ts). Server menghitung ulang pola & label; di sini hanya
 * penyaringan awal supaya kiriman kecil dan tidak ada teks data pelanggan yang meninggalkan browser.
 *
 * Aturan (kontrak di analitik-def.ts):
 * - Label klik: data-analitik > (di dalam [data-analitik-privat] -> "(isi privat)") > tautan luar "↗ host" / tautan
 *   internal ke pola dinamis "→ pola" > aria-label > title > teks; selalu lewat labelAman().
 * - Antrean di memori, satu timer: kirim 8 dtk setelah event pertama, segera bila >= 20 event, saat formulir dikirim
 *   (bisa mengganti sesi), dan saat halaman disembunyikan/ditinggalkan. Tanpa interval saat diam, tidak mengirim bila
 *   antrean kosong.
 * - Semua dibungkus try/catch: pelacak tidak boleh mengganggu aplikasi. Hanya impor fungsi murni (tanpa modul server).
 */
import {
  MAKS_BYTE_KIRIM,
  MAKS_EVENT_PER_KIRIM,
  UJUNG_ANALITIK,
  labelAman,
  polaDinamis,
  polaJalur,
  type EventKirim,
} from "@/lib/analitik-def";

/** Antrean sepanjang ini segera dikirim tanpa menunggu timer. */
const KIRIM_SEGERA = 20;
/** Jeda kirim (ms) setelah event pertama masuk antrean kosong. */
const JEDA_KIRIM = 8_000;
/** Batas antrean supaya memori aman; event selebihnya dibuang. */
const BATAS_ANTREAN = 200;
/** Klik identik (halaman + label sama) dalam selang ini dianggap klik ganda dan diabaikan. */
const JEDA_KLIK_GANDA = 400;
/** Teks elemen yang lebih panjang dipotong sebelum disaring (label akhirnya maksimal 60 karakter). */
const MAKS_TEKS = 2_000;
/** Elemen yang kliknya dicatat; klik di luar elemen ini (teks, kartu biasa) diabaikan. */
const INTERAKTIF =
  "a[href],button,summary,select,input[type=checkbox],input[type=radio],input[type=submit],input[type=button]," +
  "[role=button],[role=tab],[role=menuitem],[role=switch],[role=link],[role=option],[role=checkbox]";

const antrean: EventKirim[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
/** Pola kunjungan terakhir yang dicatat: pola sama berturut-turut (ganti query/id saja) tidak dicatat dua kali. */
let polaTerakhir: string | null = null;
/** Pola location.pathname saat terakhir diperiksa (menangkap pindah halaman tanpa hook, mis. redirect server action). */
let polaLokasi: string | null = null;
/** Tujuan navigasi yang sudah dicatat hook tetapi URL-nya belum terlihat berganti (tidak dihitung lagi saat terlihat). */
let polaTujuan: string | null = null;
let klikTerakhir = "";
let waktuKlik = 0;

/** Kirim satu kelompok: sendBeacon (Blob text/plain = tanpa preflight), cadangan fetch keepalive. */
function kirimBlob(blob: Blob): void {
  try {
    if (navigator.sendBeacon?.(UJUNG_ANALITIK, blob)) return;
  } catch {
    // sendBeacon ditolak (kuota/kebijakan): jatuh ke fetch.
  }
  try {
    fetch(UJUNG_ANALITIK, { method: "POST", body: blob, keepalive: true }).catch(() => {});
  } catch {
    // Jaringan/peramban menolak: kelompok ini dilepas (analitik bukan data penting).
  }
}

/** Kosongkan antrean ke server, dipotong per MAKS_EVENT_PER_KIRIM event dan MAKS_BYTE_KIRIM byte. */
function kirim(): void {
  try {
    clearTimeout(timer);
    timer = undefined;
    while (antrean.length) {
      let n = Math.min(antrean.length, MAKS_EVENT_PER_KIRIM);
      let blob = new Blob([JSON.stringify({ e: antrean.slice(0, n) })], { type: "text/plain" });
      while (blob.size > MAKS_BYTE_KIRIM && n > 1) {
        n = Math.ceil(n / 2);
        blob = new Blob([JSON.stringify({ e: antrean.slice(0, n) })], { type: "text/plain" });
      }
      antrean.splice(0, n);
      if (blob.size <= MAKS_BYTE_KIRIM) kirimBlob(blob);
    }
  } catch {
    antrean.length = 0;
  }
}

function antre(ev: EventKirim): void {
  if (antrean.length >= BATAS_ANTREAN) return;
  antrean.push(ev);
  if (antrean.length >= KIRIM_SEGERA) kirim();
  else if (timer === undefined) timer = setTimeout(tuntaskan, JEDA_KIRIM);
}

/**
 * Catat kunjungan bila polanya berbeda dari kunjungan terakhir. Jalur yang cocok pola sudah pasti pendek (maks. 4
 * segmen, segmen dinamis <= 80 karakter), jadi selalu di bawah MAKS_PANJANG_JALUR.
 */
function kunjungi(jalur: string, pola: string): void {
  if (pola === polaTerakhir) return;
  polaTerakhir = pola;
  antre([0, jalur]);
}

/**
 * Halaman yang tampil berganti pola sejak pemeriksaan terakhir -> catat, kecuali hook sudah mencatatnya sebagai tujuan.
 * Menangkap perpindahan yang tidak lewat hook (redirect server action / server component). Navigasi yang tersusul atau
 * batal tidak menghasilkan dobel: hanya pergantian URL yang benar-benar terlihat yang diperiksa.
 */
function periksaLokasi(): void {
  const jalur = location.pathname;
  const pola = polaJalur(jalur);
  if (pola === polaLokasi) return;
  polaLokasi = pola;
  // Benar-benar di halaman luar pola (mis. 404): kembali ke halaman sebelumnya dihitung kunjungan baru.
  if (!pola) polaTerakhir = null;
  else if (pola === polaTujuan) polaTujuan = null;
  else kunjungi(jalur, pola);
}

/** Timer habis / halaman disembunyikan / ditinggalkan: tangkap halaman terakhir lalu kirim semua. */
function tuntaskan(): void {
  periksaAman();
  kirim();
}

/** periksaLokasi untuk callback peramban (idle/timer/event): tidak pernah melempar. */
function periksaAman(): void {
  try {
    periksaLokasi();
  } catch {
    // Lokasi tak terbaca: kunjungan dilewati, yang sudah antre tetap dikirim.
  }
}

/**
 * Isi teks elemen seperti terbaca di layar: teks di kotak berbeda (blok, flex, inline-block/lencana) dipisah spasi,
 * potongan inline dalam satu kotak tetap menyambung ("Chat"+"GerCep" = "ChatGerCep"), teks di dalam display:none
 * dilewati. textContent menempelkan semuanya ("Akun saya"+"Wulan" = "Akun sayaWulan"); innerText ikut text-transform
 * dan bisa memaksa tata letak. Di sini hanya gaya terhitung yang dibaca (sekali per elemen), berhenti di MAKS_TEKS.
 */
function isiTeks(el: Element): string {
  const tampilan = new Map<Element, string>();
  const display = (e: Element): string => {
    let d = tampilan.get(e);
    if (d === undefined) tampilan.set(e, (d = getComputedStyle(e).display));
    return d;
  };
  const w = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let s = "";
  let kotakLalu: Element | null = null;
  while (s.length <= MAKS_TEKS && w.nextNode()) {
    const t = w.currentNode;
    let kotak: Element | null = null;
    let tersembunyi = false;
    for (let a = t.parentElement; a; a = a === el ? null : a.parentElement) {
      const d = display(a);
      if (d === "none") {
        tersembunyi = true;
        break;
      }
      if (!kotak && d !== "inline" && d !== "contents") kotak = a;
    }
    if (tersembunyi) continue;
    s += kotak === kotakLalu ? (t.nodeValue ?? "") : ` ${t.nodeValue ?? ""}`;
    kotakLalu = kotak;
  }
  return s;
}

/** Teks bawaan elemen: nilai tombol input, teks <label> untuk kotak centang/pilihan (bukan isi opsinya), selain itu isi teks. */
function teksElemen(el: Element): string {
  if (el instanceof HTMLInputElement) return el.type === "submit" || el.type === "button" ? el.value : (el.labels?.[0]?.textContent ?? "");
  if (el instanceof HTMLSelectElement) return el.labels?.[0]?.textContent ?? "";
  const s = isiTeks(el);
  // Potong di batas kata supaya email/nomor di ujung potongan tidak tersisa separuh (lolos dari penyaring).
  return s.length > MAKS_TEKS ? s.slice(0, MAKS_TEKS).replace(/\S*$/, "") : s;
}

/** Label klik yang aman disimpan (urutan aturan di kepala berkas). */
function labelKlik(el: Element): string {
  const tanda = el.getAttribute("data-analitik");
  let mentah = "";
  if (tanda) mentah = tanda;
  else if (el.closest("[data-analitik-privat]")) mentah = "(isi privat)";
  else {
    if (el instanceof HTMLAnchorElement) {
      if (el.protocol !== "http:" && el.protocol !== "https:") mentah = `↗ ${el.protocol.slice(0, -1)}`;
      else if (el.host !== location.host) mentah = `↗ ${el.hostname}`;
      else {
        const pola = polaJalur(el.pathname);
        if (pola && polaDinamis(pola)) mentah = `→ ${pola}`;
      }
    }
    mentah ||= el.getAttribute("aria-label") || el.getAttribute("title") || teksElemen(el);
  }
  return labelAman(mentah) || "(tanpa label)";
}

function padaKlik(e: MouseEvent): void {
  try {
    const t = e.target;
    const el = t instanceof Element ? t.closest(INTERAKTIF) : null;
    if (!el) return;
    periksaLokasi();
    if (!polaLokasi) return; // halaman di luar POLA_HALAMAN: server juga akan membuangnya
    const jalur = location.pathname;
    const label = labelKlik(el);
    const kunci = `${jalur}\n${label}`;
    const kini = Date.now();
    if (kunci === klikTerakhir && kini - waktuKlik < JEDA_KLIK_GANDA) return;
    klikTerakhir = kunci;
    waktuKlik = kini;
    antre([1, jalur, label]);
  } catch {
    // Pelacak tidak boleh mengganggu klik pengguna.
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    document.addEventListener("click", padaKlik, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") tuntaskan();
    });
    window.addEventListener("pagehide", tuntaskan);
    // Formulir (masuk, daftar, keluar) bisa mengganti cookie sesi: antrean dikirim dulu supaya tercatat atas identitas
    // saat event terjadi, bukan identitas sesudahnya (kunjungan /login anonim tidak jadi milik akun yang baru masuk).
    document.addEventListener("submit", tuntaskan, { capture: true, passive: true });
    // Kunjungan awal dicocokkan saat peramban senggang (tidak membebani jalur sebelum hidrasi), tanpa requestIdleCallback
    // bersama timer kirim pertama. Klik/navigasi/halaman disembunyikan sebelum itu memeriksanya lebih dulu.
    if (typeof requestIdleCallback === "function") requestIdleCallback(periksaAman, { timeout: 2_000 });
    else timer = setTimeout(tuntaskan, JEDA_KIRIM);
  } catch {
    // Peramban tanpa API di atas: analitik nonaktif, aplikasi tetap jalan.
  }
}

/**
 * Dipanggil Next di awal tiap navigasi App Router, sebelum URL berganti (kecuali "traverse": sudah berganti).
 * `url` bisa relatif ("/nomor/3?tab=x") atau absolut; tujuan di luar asal ini diabaikan.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tanda tangan hook Next 16; semua jenis navigasi diperlakukan sama
export function onRouterTransitionStart(url: string, navigationType: "push" | "replace" | "traverse"): void {
  try {
    if (typeof window === "undefined") return;
    // Halaman asal mungkin belum tercatat (dibuka lewat redirect server action, yang tidak memanggil hook ini).
    periksaLokasi();
    const u = new URL(url, location.href);
    const pola = u.origin === location.origin ? polaJalur(u.pathname) : null;
    // Tujuan di luar pola (unduhan /api, asal lain) diabaikan; halaman yang benar-benar terbuka diperiksa lewat lokasi.
    if (!pola) return;
    kunjungi(u.pathname, pola);
    // URL akan berganti ke tujuan ini (kecuali "traverse"/pola sama: sudah tampil): jangan dihitung lagi saat terlihat.
    polaTujuan = pola === polaLokasi ? null : pola;
  } catch {
    // URL tak terbaca: kunjungan ini dilewati.
  }
}

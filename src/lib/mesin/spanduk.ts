import { VERSI_APLIKASI } from "@/lib/mode";
import { PERINTAH_UPDATE, type StatusUpdate } from "@/lib/rilis-def";

/**
 * Spanduk (banner) ASCII ChatGerCep yang dicetak sekali saat mesin menyala, terlihat di
 * `docker compose up` / `docker compose logs mesin`. Murni teks, tanpa I/O lain; warna ANSI dimatikan bila NO_COLOR.
 */

// Huruf figlet "standard" tanpa smushing (setiap huruf 6 baris), digabung saat dicetak supaya rapi & mudah dibaca.
const HURUF: Record<string, string[]> = {
  C: ["  ____ ", " / ___|", "| |    ", "| |___ ", " \\____|", "       "],
  h: [" _     ", "| |__  ", "| '_ \\ ", "| | | |", "|_| |_|", "       "],
  a: ["       ", "  __ _ ", " / _` |", "| (_| |", " \\__,_|", "       "],
  t: [" _   ", "| |_ ", "| __|", "| |_ ", " \\__|", "     "],
  G: ["  ____ ", " / ___|", "| |  _ ", "| |_| |", " \\____|", "       "],
  e: ["      ", "  ___ ", " / _ \\", "|  __/", " \\___|", "      "],
  r: ["      ", " _ __ ", "| '__|", "| |   ", "|_|   ", "      "],
  p: ["       ", " _ __  ", "| '_ \\ ", "| |_) |", "| .__/ ", "|_|    "],
};

// Tanda merek (gelembung chat + panah naik + titik) dari PATH_TANDA (src/components/logo.tsx), dirasterisasi 26x26
// lalu dijadikan setengah-blok (1 karakter = 2 piksel tegak, jadi proporsinya tetap bulat di terminal).
const TANDA = [
  "         ▄▄▄▄▄▄▄▄",
  "     ▄██████████████▄",
  "  ▄████████████████████▄",
  " ▄██████████████████████▄",
  " ████████████▀▀▀▀   █████",
  " █████████████     ▄█████",
  " ████████████▀     ██████",
  " ▀█████████▀   ▄██▄█████▀",
  "   ▀█████▀   ▄████████▀",
  "     ▀▀▀   ▄████████▀  ▄█",
  "             █████▀",
  "             ██▀",
  "             ▀",
];
const LEBAR_TANDA = 27;

// Aturan smushing figlet: sama, garis bawah (_ diganti garis lain), dan hierarki kelas (kelas lebih tinggi menang).
const KELAS = ["|", "/\\", "[]", "{}", "()", "<>"];
const kelas = (c: string) => KELAS.findIndex((k) => k.includes(c));
/** Karakter hasil menumpuk a (kiri) & b (kanan), atau null bila tidak boleh ditumpuk. */
function tumpuk(a: string, b: string): string | null {
  if (a === " ") return b;
  if (b === " ") return a;
  if (a === b) return a;
  if (a === "_" && kelas(b) >= 0) return b;
  if (b === "_" && kelas(a) >= 0) return a;
  const ka = kelas(a);
  const kb = kelas(b);
  if (ka >= 0 && kb >= 0 && ka !== kb) return ka > kb ? a : b;
  return null;
}

/** Gabung dua kolom huruf: rapatkan 1 kolom bila di semua baris karakternya boleh ditumpuk (smushing figlet). */
function gabung(kiri: string[], kanan: string[]): string[] {
  const hasil = kiri.map((k, i) => tumpuk(k.at(-1) ?? " ", kanan[i][0] ?? " "));
  if (hasil.some((c) => c === null)) return kiri.map((k, i) => k + kanan[i]);
  return kiri.map((k, i) => k.slice(0, -1) + hasil[i] + kanan[i].slice(1));
}

/** Baris huruf figlet tanpa dipangkas (semua baris sama lebar). */
function susun(teks: string): string[] {
  const huruf = [...teks].map((c) => HURUF[c]).filter(Boolean);
  return huruf.length ? huruf.slice(1).reduce(gabung, huruf[0]) : [];
}

/** Baris-baris logo "ChatGerCep" (tanpa warna). */
export function logoAscii(teks = "ChatGerCep"): string[] {
  return susun(teks).map((b) => b.trimEnd());
}

type InfoSpanduk = { mode: "sandbox" | "production" | "belum_aktif"; dashboard: string; publik: string; dashboardMati: boolean };

/** Info yang ditampilkan di bawah logo, dibaca dari env mesin (.env ikut masuk lewat env_file compose). */
export function infoSpanduk(env: NodeJS.ProcessEnv = process.env): InfoSpanduk {
  const key = (env.CHATGERCEP_KEY ?? "").trim();
  const mode = key.startsWith("cg_test_") ? "sandbox" : key ? "production" : "belum_aktif";
  // Di dalam container mesin selalu mendengar 3230; PORT_MESIN = port di komputer pemilik (sandbox bawaan 1975).
  const port = (env.PORT_MESIN ?? "").trim() || (mode === "sandbox" ? "1975" : env.PORT || "3230");
  return {
    mode,
    dashboard: `http://localhost:${port}`,
    publik: (env.ALAMAT_PUBLIK ?? "").trim().replace(/\/+$/, ""),
    dashboardMati: (env.DASHBOARD_MESIN ?? "").trim().toLowerCase() === "mati",
  };
}

/** Teks spanduk lengkap: tanda merek di kiri, tulisan "Chat" + "GerCep" (hijau) dan info mesin di kanan. `warna` = kode ANSI. */
export function teksSpanduk(env: NodeJS.ProcessEnv = process.env, warna = !env.NO_COLOR): string {
  const w = (kode: string, s: string) => (warna ? `\x1b[${kode}m${s}\x1b[0m` : s);
  const hijau = (s: string) => w("1;38;5;42", s);
  const redup = (s: string) => w("2", s);
  const tebal = (s: string) => w("1", s);
  const i = infoSpanduk(env);
  const labelMode = i.mode === "sandbox" ? w("1;33", "SANDBOX") : i.mode === "production" ? w("1;32", "PRODUCTION") : w("1;31", "BELUM AKTIF (isi CHATGERCEP_KEY di .env)");
  const baris = (label: string, isi: string) => `${redup(label.padEnd(11))}${isi}`;

  // Tulisan disusun utuh (sambungan t-G ikut dirapatkan), lalu dipotong: bagian "Chat" tebal, "GerCep" hijau.
  const utuh = susun("ChatGerCep");
  const potong = (utuh[0]?.length ?? 0) - (susun("GerCep")[0]?.length ?? 0);
  const chat = utuh.map((b) => b.slice(0, potong));
  const gercep = utuh.map((b) => b.slice(potong).trimEnd());
  const lebarChat = potong;
  const kanan = [
    "",
    ...chat.map((b, n) => tebal(b.padEnd(lebarChat)) + hijau(gercep[n])),
    "",
    `${tebal("Mesin WhatsApp + AI")} ${redup(`v${VERSI_APLIKASI}`)}  ·  ${labelMode}`,
    baris("Dashboard", i.dashboardMati ? redup("dimatikan (DASHBOARD_MESIN=mati), mode API saja") : tebal(i.dashboard)),
    baris("API", `${i.publik || i.dashboard}/api/v1`),
    ...(i.publik ? [baris("Publik", i.publik)] : []),
    baris("Docs", "https://chatgercep.com/docs/api"),
  ];
  const tinggi = Math.max(TANDA.length, kanan.length);
  const isi = Array.from({ length: tinggi }, (_, n) => {
    const t = TANDA[n] ?? "";
    return ("  " + (t ? hijau(t) : "") + " ".repeat(LEBAR_TANDA - t.length) + (kanan[n] ?? "")).trimEnd();
  });
  return ["", ...isi, ""].join("\n");
}

const g = globalThis as unknown as { __waSpandukMesin?: boolean };

/** Cetak spanduk sekali per proses. */
export function cetakSpanduk(): void {
  if (g.__waSpandukMesin) return;
  g.__waSpandukMesin = true;
  console.log(teksSpanduk());
}

/**
 * Banner kotak "update tersedia / wajib update" untuk terminal (docker compose logs). Kuning = tersedia, merah = wajib
 * atau API sudah diblokir. Murni teks; lebar kotak mengikuti baris terpanjang (kode ANSI tidak dihitung).
 */
export function teksBannerUpdate(u: StatusUpdate, warna = !process.env.NO_COLOR): string {
  const w = (kode: string, s: string) => (warna ? `\x1b[${kode}m${s}\x1b[0m` : s);
  const tenggat = u.wajib_sampai ? new Date(u.wajib_sampai * 1000).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) + " WIB" : null;
  const kode = u.terblokir || u.wajib ? "1;31" : "1;33";
  const judul = u.terblokir
    ? "■ API DIHENTIKAN: mesin wajib di-update"
    : u.wajib
      ? `▲ WAJIB UPDATE${tenggat ? ` sebelum ${tenggat}` : ""}`
      : "▲ UPDATE TERSEDIA";
  const baris: [string, string][] = [
    [judul, w(kode, judul)],
    ["", ""],
    [`Versi mesin ini v${u.versi_kini}  →  terbaru v${u.versi_terbaru ?? u.versi_minimal ?? "?"}`, `Versi mesin ini ${w("2", `v${u.versi_kini}`)}  →  terbaru ${w("1;32", `v${u.versi_terbaru ?? u.versi_minimal ?? "?"}`)}`],
    ...(u.catatan ? ([[`Catatan: ${u.catatan}`, `Catatan: ${u.catatan}`]] as [string, string][]) : []),
    ["", ""],
    ["Jalankan di folder mesin:", "Jalankan di folder mesin:"],
    [`  ${PERINTAH_UPDATE}`, `  ${w("1", PERINTAH_UPDATE)}`],
    ["", ""],
    [
      u.terblokir ? "WhatsApp tetap tersambung; API pulih begitu mesin terbaru menyala." : "Data & nomor WhatsApp tetap aman, tanpa scan ulang.",
      w("2", u.terblokir ? "WhatsApp tetap tersambung; API pulih begitu mesin terbaru menyala." : "Data & nomor WhatsApp tetap aman, tanpa scan ulang."),
    ],
  ];
  const lebar = Math.max(...baris.map(([polos]) => [...polos].length)) + 2;
  const garis = (a: string, b: string) => w(kode, `  ${a}${"─".repeat(lebar + 2)}${b}`);
  return [
    "",
    garis("╭", "╮"),
    ...baris.map(([polos, berwarna]) => `  ${w(kode, "│")}  ${berwarna}${" ".repeat(lebar - [...polos].length)}${w(kode, "│")}`),
    garis("╰", "╯"),
    "",
  ].join("\n");
}

/**
 * Kontrak murni jalur WhatsApp resmi (Cloud API Meta): tanpa I/O dan tanpa modul Node, dipakai server, UI, dan uji.
 * Rencana: docs/plans/2026-11-18-followup-dua-jalur-wa-resmi.md. Fakta Meta yang dipakai (dicek 2026-11-18):
 *   - Jendela layanan 24 jam sejak pesan masuk terakhir; di luar itu hanya template yang disetujui.
 *   - Batas penerima unik di luar jendela per 24 jam = per business portfolio (WABA), tier 250 → 2K → 10K → 100K → ∞.
 *   - Webhook ditandatangani X-Hub-Signature-256 = HMAC-SHA256(body mentah, app secret).
 */

/** Versi Graph API. Diganti di satu tempat (env META_GRAPH_VERSI untuk mencoba versi baru tanpa rilis). */
export const GRAPH_VERSI_BAWAAN = "v24.0";

export type Jalur = "baileys" | "resmi";
/** Kebijakan admin untuk nomor pengguna (setelan `jalur_wa`). */
export type KebijakanJalur = "baileys" | "resmi" | "pilih";
export const KEBIJAKAN_JALUR: readonly { kode: KebijakanJalur; label: string; keterangan: string }[] = [
  { kode: "baileys", label: "Baileys saja (QR)", keterangan: "Semua nomor pengguna memakai scan QR seperti sekarang." },
  { kode: "pilih", label: "Pengguna memilih", keterangan: "Pengguna berbayar boleh memasang API resmi Meta miliknya sendiri, atau tetap scan QR." },
  { kode: "resmi", label: "Resmi saja", keterangan: "Nomor baru pengguna berbayar wajib API resmi Meta. Nomor yang sudah scan QR tetap jalan sampai dipindah pemiliknya." },
];
export const KEBIJAKAN_BAWAAN: KebijakanJalur = "baileys";
export const uraiKebijakan = (v: unknown): KebijakanJalur => (v === "resmi" || v === "pilih" ? v : "baileys");

export const JENDELA_DTK = 24 * 3600;
/** Margin aman: pesan bebas tidak dikirim di 5 menit terakhir jendela (jam server vs Meta, antrean kirim). */
export const MARGIN_JENDELA_DTK = 300;
export const dalamJendela = (masukPada: number | null | undefined, kini: number): boolean =>
  !!masukPada && masukPada > kini - JENDELA_DTK + MARGIN_JENDELA_DTK;

/** Follow-up berhenti mengirim template di 90% kuota penerima harian, supaya pesan lain pemilik tetap punya ruang. */
export const PORSI_KUOTA_TIER = 0.9;

/** messaging_limit_tier Meta → jumlah penerima unik per 24 jam (Infinity = tanpa batas, null = tidak dikenal). */
export function angkaTier(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const t = tier.toUpperCase();
  if (t.includes("UNLIMITED")) return Number.POSITIVE_INFINITY;
  const m = /(\d+)\s*(K)?/.exec(t);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

/** Status pesan Meta → kode ack Baileys (0 galat, 2 sampai server, 3 sampai HP, 4 dibaca) yang dipakai follow-up. */
export function statusKeAck(status: string): number | null {
  switch (status) {
    case "sent":
      return 2;
    case "delivered":
      return 3;
    case "read":
    case "played":
      return 4;
    case "failed":
      return 0;
    default:
      return null;
  }
}

/** Kualitas/status nomor yang membuat pesan yang kita mulai sendiri (follow-up) ditahan. null = sehat. */
export function alasanTidakSehat(k: { kualitas: string | null; status: string | null }): string | null {
  const q = (k.kualitas ?? "").toUpperCase();
  if (q === "RED" || q === "LOW") return "Kualitas nomor dari Meta rendah (RED)";
  const s = (k.status ?? "").toUpperCase();
  if (s && s !== "CONNECTED") return `Status nomor di Meta: ${s}`;
  return null;
}

// ---------- Kredensial ----------

export interface MasukanKredensial {
  phone_number_id: string;
  waba_id: string;
  token: string;
  app_secret: string;
  pin?: string;
}

/** Validasi bentuk (bukan keabsahan; itu dicek ke Meta). Mengembalikan pesan galat atau data rapi. */
export function rapikanKredensial(v: Record<string, unknown>): { galat: string } | { data: MasukanKredensial } {
  const s = (k: string): string => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  const pnid = s("phone_number_id");
  const waba = s("waba_id");
  const token = s("token");
  const rahasia = s("app_secret");
  const pin = s("pin");
  if (!/^\d{6,25}$/.test(pnid)) return { galat: "Phone number ID tidak valid (angka saja, dari WhatsApp Manager / App Dashboard Meta)." };
  if (!/^\d{6,25}$/.test(waba)) return { galat: "WhatsApp Business Account ID tidak valid (angka saja)." };
  if (token.length < 40 || token.length > 1000 || /\s/.test(token)) return { galat: "Token akses tidak valid. Pakai token System User permanen dari Meta Business Suite." };
  if (!/^[a-f0-9]{32}$/i.test(rahasia)) return { galat: "App secret tidak valid (32 karakter heksadesimal, dari App Dashboard → Settings → Basic)." };
  if (pin && !/^\d{6}$/.test(pin)) return { galat: "PIN verifikasi dua langkah harus 6 angka." };
  return { data: { phone_number_id: pnid, waba_id: waba, token, app_secret: rahasia.toLowerCase(), ...(pin ? { pin } : {}) } };
}

// ---------- Webhook ----------

export interface PesanMasukResmi {
  pnid: string;
  id: string;
  dari: string;
  nama: string | null;
  waktu: number;
  /** Teks pesan (atau keterangan media/tombol). */
  teks: string;
  /** Keterangan isi non-teks dalam kata-kata (dokumen, lokasi, ...) seperti `media` di EventWa. */
  media: string | null;
  foto: { id: string; mime: string } | null;
  suara: { id: string; mime: string } | null;
  konteks: string | null;
  lampiran: boolean;
}
export interface StatusResmi {
  pnid: string;
  id: string;
  status: string;
  penerima: string | null;
  waktu: number;
  galat: { kode: number; judul: string } | null;
}
export interface TemplatResmiUpdate {
  waba: string;
  nama: string;
  bahasa: string | null;
  status: string;
  alasan: string | null;
  metaId: string | null;
}
export interface KualitasResmiUpdate {
  waba: string;
  nomor: string | null;
  peristiwa: string;
  tier: string | null;
}
export interface IsiWebhook {
  pesan: PesanMasukResmi[];
  status: StatusResmi[];
  templat: TemplatResmiUpdate[];
  kualitas: KualitasResmiUpdate[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const dtk = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : Math.floor(Date.now() / 1000);
};

/** Pesan Cloud API → teks + keterangan media (mengikuti cara wa.ts menulis isi non-teks untuk AI). */
function isiPesan(m: Obj): Pick<PesanMasukResmi, "teks" | "media" | "foto" | "suara" | "lampiran"> {
  const jenis = str(m.type);
  const kosong = { teks: "", media: null, foto: null, suara: null, lampiran: false };
  switch (jenis) {
    case "text":
      return { ...kosong, teks: str(obj(m.text).body) };
    case "image": {
      const i = obj(m.image);
      return { ...kosong, teks: str(i.caption), foto: str(i.id) ? { id: str(i.id), mime: str(i.mime_type) || "image/jpeg" } : null, lampiran: true };
    }
    case "audio": {
      const a = obj(m.audio);
      return { ...kosong, suara: str(a.id) ? { id: str(a.id), mime: str(a.mime_type) || "audio/ogg" } : null, lampiran: true };
    }
    case "video": {
      const v = obj(m.video);
      return { ...kosong, teks: str(v.caption), media: "video", lampiran: true };
    }
    case "document": {
      const d = obj(m.document);
      return { ...kosong, teks: str(d.caption), media: `dokumen "${str(d.filename) || "berkas"}"`, lampiran: true };
    }
    case "sticker":
      return { ...kosong, media: "stiker", lampiran: true };
    case "location": {
      const l = obj(m.location);
      const nama = str(l.name) || str(l.address);
      return { ...kosong, media: `lokasi${nama ? ` "${nama}"` : ""} https://maps.google.com/?q=${str(l.latitude)},${str(l.longitude)}` };
    }
    case "contacts": {
      const c = obj(arr(m.contacts)[0]);
      const nama = str(obj(c.name).formatted_name);
      const tel = str(obj(arr(c.phones)[0]).phone);
      return { ...kosong, media: `kontak "${nama}"${tel ? ` ${tel}` : ""}` };
    }
    case "button":
      return { ...kosong, teks: str(obj(m.button).text) };
    case "interactive": {
      const i = obj(m.interactive);
      return { ...kosong, teks: str(obj(i.button_reply).title) || str(obj(i.list_reply).title) || str(obj(i.nfm_reply).body) };
    }
    default:
      return kosong; // reaction, unsupported, system, dll.: diabaikan
  }
}

/** Urai payload webhook WhatsApp Business Account. Tidak pernah melempar: bagian yang tidak dikenal dilewati. */
export function uraiWebhook(isi: unknown): IsiWebhook {
  const hasil: IsiWebhook = { pesan: [], status: [], templat: [], kualitas: [] };
  const o = obj(isi);
  if (o.object !== "whatsapp_business_account") return hasil;
  for (const e of arr(o.entry)) {
    const entry = obj(e);
    const waba = str(entry.id);
    for (const c of arr(entry.changes)) {
      const ch = obj(c);
      const v = obj(ch.value);
      if (ch.field === "messages") {
        const pnid = str(obj(v.metadata).phone_number_id);
        if (!pnid) continue;
        const nama = new Map<string, string>();
        for (const k of arr(v.contacts)) {
          const kk = obj(k);
          const n = str(obj(kk.profile).name);
          if (n) nama.set(str(kk.wa_id), n);
        }
        for (const m of arr(v.messages)) {
          const mm = obj(m);
          const id = str(mm.id);
          const dari = str(mm.from).replace(/\D/g, "");
          if (!id || !dari) continue;
          const isiM = isiPesan(mm);
          if (!isiM.teks && !isiM.media && !isiM.foto && !isiM.suara) continue;
          hasil.pesan.push({ pnid, id, dari, nama: nama.get(dari) ?? null, waktu: dtk(mm.timestamp), konteks: str(obj(mm.context).id) || null, ...isiM });
        }
        for (const s of arr(v.statuses)) {
          const ss = obj(s);
          const id = str(ss.id);
          if (!id) continue;
          const g = obj(arr(ss.errors)[0]);
          hasil.status.push({
            pnid,
            id,
            status: str(ss.status),
            penerima: str(ss.recipient_id).replace(/\D/g, "") || null,
            waktu: dtk(ss.timestamp),
            galat: Object.keys(g).length ? { kode: Number(g.code) || 0, judul: str(g.title) || str(g.message) } : null,
          });
        }
      } else if (ch.field === "message_template_status_update") {
        const nama = str(v.message_template_name);
        if (nama) hasil.templat.push({ waba, nama, bahasa: str(v.message_template_language) || null, status: str(v.event).toUpperCase(), alasan: str(v.reason) || null, metaId: str(v.message_template_id) || null });
      } else if (ch.field === "phone_number_quality_update") {
        hasil.kualitas.push({ waba, nomor: str(v.display_phone_number).replace(/\D/g, "") || null, peristiwa: str(v.event).toUpperCase(), tier: str(v.current_limit) || str(v.messaging_limit_tier) || null });
      }
    }
  }
  return hasil;
}

/** Galat Meta yang sering muncul → penjelasan bahasa Indonesia. */
export function jelaskanGalatMeta(kode: number, cadangan: string): string {
  const peta: Record<number, string> = {
    190: "Token akses Meta kedaluwarsa atau dicabut. Pasang token baru.",
    10: "Token tidak punya izin whatsapp_business_messaging untuk nomor ini.",
    200: "Token tidak punya izin whatsapp_business_management untuk WABA ini.",
    100: "Parameter ditolak Meta (periksa Phone number ID / WABA ID).",
    131047: "Di luar jendela 24 jam: hanya template yang disetujui yang boleh dikirim.",
    131049: "Meta menahan template marketing ke pelanggan ini (batas per pelanggan). Coba lagi setelah 24 jam.",
    131026: "Pesan tidak bisa dikirim ke nomor ini (bukan pengguna WhatsApp atau versi lama).",
    131056: "Terlalu banyak pesan ke nomor yang sama dalam waktu singkat.",
    130429: "Batas kecepatan Cloud API terlampaui. Dicoba lagi.",
    131057: "Akun sedang ditingkatkan Meta. Dicoba lagi sebentar lagi.",
    132001: "Template tidak ditemukan / belum disetujui untuk bahasa ini.",
    132015: "Template dijeda Meta karena kualitas rendah.",
    132016: "Template dimatikan Meta karena kualitas rendah.",
    133010: "Nomor belum terdaftar di Cloud API (jalankan pendaftaran dengan PIN).",
    368: "Akun dibatasi Meta karena melanggar kebijakan.",
  };
  return peta[kode] ?? cadangan;
}
/** Galat yang layak dicoba ulang otomatis (bukan salah data / izin). */
export const galatSementara = (kode: number): boolean => kode === 130429 || kode === 131057 || kode === 131000 || kode === 2 || kode === 1;

// ---------- Template ----------

/** Template yang dipakai follow-up di luar jendela 24 jam. Kode tidak boleh diganti (tersimpan di templat_wa). */
export type KodeTahap = "prospek_1" | "prospek_2" | "prospek_3" | "ulang" | "akun_1" | "akun_2";

export interface TemplatBawaan {
  kode: KodeTahap;
  nama: string;
  label: string;
  /** cs = nomor CS ChatGerCep (follow-up akun & prospek ChatGerCep); usaha = nomor pengguna. */
  untuk: "cs" | "usaha" | "keduanya";
  isi: string;
}

/**
 * Isi bawaan (kategori MARKETING, bahasa id). Variabel tidak di awal/akhir teks dan tidak berdampingan (aturan tinjauan
 * Meta yang umum). Jujur: tanpa kelangkaan/batas waktu palsu, tanpa angka; harga & detail dijawab AI setelah ia membalas
 * (di dalam jendela 24 jam, teks bebas). {{usaha}} = nama usaha/nomor, {{nama}} = nama pelanggan.
 */
export const TEMPLAT_BAWAAN: readonly TemplatBawaan[] = [
  {
    kode: "prospek_1",
    nama: "cg_prospek_1",
    label: "Prospek: pesan 1 (lanjutan)",
    untuk: "keduanya",
    isi: "Halo {{nama}}, ini dari {{usaha}}. Kemarin Kakak sempat tanya-tanya ke kami dan belum sempat lanjut. Masih butuh? Balas *YA*, nanti kami bantu sampai beres.",
  },
  {
    kode: "prospek_2",
    nama: "cg_prospek_2",
    label: "Prospek: pesan 2 (manfaat)",
    untuk: "keduanya",
    isi: "Halo {{nama}}, {{usaha}} di sini. Biar Kakak tidak repot cari-cari lagi, kami siap bantu pilihkan yang paling pas dengan kebutuhan Kakak. Balas *YA* untuk lanjut, atau *STOP* kalau tidak perlu.",
  },
  {
    kode: "prospek_3",
    nama: "cg_prospek_3",
    label: "Prospek: pesan 3 (pamit)",
    untuk: "keduanya",
    isi: "Halo {{nama}}, ini pesan terakhir dari {{usaha}} soal ini, kami tidak akan mengganggu lagi. Kapan pun Kakak butuh, cukup balas chat ini ya.",
  },
  {
    kode: "ulang",
    nama: "cg_order_ulang",
    label: "Order ulang",
    untuk: "usaha",
    isi: "Halo {{nama}}, terima kasih sudah pernah order di {{usaha}}. Mau pesan lagi? Balas *YA*, nanti langsung kami bantu siapkan.",
  },
  {
    kode: "akun_1",
    nama: "cg_akun_kuota",
    label: "Akun: kuota AI habis",
    untuk: "cs",
    isi: "Halo {{nama}}, kuota balasan AI di akun {{usaha}} Kakak sudah habis, jadi chat pelanggan belum dibalas otomatis. Mau kami bantu pilih paket yang pas? Balas *YA* ya.",
  },
  {
    kode: "akun_2",
    nama: "cg_akun_pengingat",
    label: "Akun: pengingat",
    untuk: "cs",
    isi: "Halo {{nama}}, sekadar memastikan: bot AI di akun {{usaha}} Kakak masih berhenti membalas. Balas *YA* kalau mau kami aktifkan lagi, ada jaminan uang kembali.",
  },
];

export const templatBawaan = (kode: string): TemplatBawaan | undefined => TEMPLAT_BAWAAN.find((t) => t.kode === kode);

const POLA_VAR = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;
/** Nama variabel di isi template, berurutan & unik. */
export function variabelTemplat(isi: string): string[] {
  const out: string[] = [];
  for (const m of isi.matchAll(POLA_VAR)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Nilai variabel: satu baris (Meta menolak baris baru / tab / >4 spasi), maks 60 karakter, tidak kosong. */
export function rapikanNilai(v: string | null | undefined, cadangan: string): string {
  const s = (v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").replace(/[{}]/g, "").trim().slice(0, 60);
  return s || cadangan;
}

export const CADANGAN_VAR: Record<string, string> = { nama: "Kak", usaha: "kami" };

export function isiVariabel(isi: string, nilai: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of variabelTemplat(isi)) out[n] = rapikanNilai(nilai[n], CADANGAN_VAR[n] ?? "-");
  return out;
}

export function renderTemplat(isi: string, nilai: Record<string, string>): string {
  return isi.replace(POLA_VAR, (_, n: string) => nilai[n] ?? "");
}

/** Validasi isi template sebelum diajukan ke Meta. */
export function periksaIsiTemplat(isi: string): string | null {
  const t = isi.trim();
  if (t.length < 20) return "Isi template terlalu pendek.";
  if (t.length > 1024) return "Isi template maksimal 1.024 karakter (batas Meta).";
  if (/^\{\{/.test(t) || /\}\}[.!?\s]*$/.test(t)) return "Variabel tidak boleh di awal atau akhir template (sering ditolak Meta).";
  if (/\}\}\s*\{\{/.test(t)) return "Dua variabel tidak boleh berdampingan.";
  const vars = variabelTemplat(t);
  const tanpaVar = t.replace(POLA_VAR, "").trim();
  if (vars.length && tanpaVar.length < vars.length * 15) return "Teks tetap terlalu sedikit dibanding jumlah variabel.";
  for (const v of vars) if (!(v in CADANGAN_VAR)) return `Variabel {{${v}}} tidak dikenal. Pakai {{nama}} dan/atau {{usaha}}.`;
  if (/\{\{(?!\s*[a-z_][a-z0-9_]*\s*\}\})/.test(t)) return "Format variabel salah. Contoh yang benar: {{nama}}.";
  return null;
}

export const NAMA_TEMPLAT_POLA = /^[a-z0-9_]{1,100}$/;

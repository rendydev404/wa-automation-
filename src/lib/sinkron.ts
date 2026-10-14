import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db, getSetting, sekarang, setSetting, transaksi } from "./db";
import { potong, rapikanTeks } from "./knowledge";

/**
 * Sinkron otomatis menu, harga, promo, dan outlet Suka Shawarma dari database kasir (Supabase) ke
 * base knowledge nomor yang mengaktifkannya.
 *
 * Alur: trigger di database mengirim sinyal bertanda tangan ke /api/sinkron saat data pelanggan
 * berubah -> di sini ditunda JEDA_MS (perubahan beruntun = satu tarikan) -> satu panggilan
 * kb_cs_ambil(kunci) -> teks disusun -> dokumen otomatis tiap nomor diganti dalam satu transaksi,
 * hanya bila isinya berubah. Tanpa sinyal tidak ada permintaan apa pun, kecuali satu pemeriksaan
 * pengaman tiap JAGA_MS (menutup sinyal yang hilang saat dashboard mati) dan satu tarikan tepat pada
 * batas waktu promo/outlet berikutnya.
 */

const PENANDA = "sinkron:suka-shawarma"; // documents.nama_berkas milik dokumen otomatis
const JUDUL = "Menu, harga, promo & outlet Suka Shawarma (otomatis)";
const KUNCI_NOMOR = "sinkron_ss_nomor"; // settings: daftar id nomor (JSON)
const KUNCI_STATUS = "sinkron_ss_status"; // settings: status tarikan terakhir (JSON)
const JEDA_MS = 5_000;
const JAGA_MS = 6 * 3600_000;
const BATAS_TIMER_MS = 2 ** 31 - 1;
const MAKS_KARTU = 1_100;

export interface Konfigurasi {
  url: string;
  apikey: string;
  kunci: string;
  rahasia: string;
}

export function konfigurasi(): Konfigurasi | null {
  const url = process.env.SINKRON_SS_URL?.trim().replace(/\/+$/, "");
  const apikey = process.env.SINKRON_SS_APIKEY?.trim();
  const kunci = process.env.SINKRON_SS_KUNCI?.trim();
  const rahasia = process.env.SINKRON_SS_RAHASIA?.trim();
  return url && apikey && kunci && rahasia ? { url, apikey, kunci, rahasia } : null;
}

export interface Status {
  waktu: number | null; // detik epoch tarikan terakhir yang berhasil
  versi: number | null;
  karakter: number;
  galat: string | null;
}

interface Keadaan {
  jeda: ReturnType<typeof setTimeout> | null;
  batas: ReturnType<typeof setTimeout> | null;
  jaga: ReturnType<typeof setInterval> | null;
  jalan: Promise<void> | null;
  ulang: boolean;
}
const g = globalThis as unknown as { __waSinkron?: Keadaan };
const st = (g.__waSinkron ??= { jeda: null, batas: null, jaga: null, jalan: null, ulang: false });

// ---------- Nomor yang ikut ----------

export async function nomorSinkron(): Promise<number[]> {
  try {
    const v = JSON.parse((await getSetting(KUNCI_NOMOR)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/** Nyalakan/matikan sinkron untuk satu nomor. Menyala: dokumen langsung ditulis. Mati: dokumennya dihapus. */
export async function setNomorSinkron(numberId: number, aktif: boolean): Promise<void> {
  const ids = new Set(await nomorSinkron());
  if (aktif) ids.add(numberId);
  else ids.delete(numberId);
  await setSetting(KUNCI_NOMOR, JSON.stringify([...ids].sort((a, b) => a - b)));
  if (aktif) await jalankan();
  else {
    const sql = await db();
    await sql`DELETE FROM documents WHERE number_id = ${numberId} AND nama_berkas = ${PENANDA}`;
  }
}

export async function statusSinkron(): Promise<Status> {
  try {
    return JSON.parse((await getSetting(KUNCI_STATUS)) ?? "null") ?? { waktu: null, versi: null, karakter: 0, galat: null };
  } catch {
    return { waktu: null, versi: null, karakter: 0, galat: null };
  }
}

// ---------- Sinyal dari database ----------

/** Tanda tangan sinyal: HMAC-SHA256(rahasia, "<waktu>.<badan>") dalam hex, waktu maksimal 5 menit dari sekarang. */
export function tandaSah(badan: string, waktu: string | null, tanda: string | null, rahasia: string, kini = sekarang()): boolean {
  if (!waktu || !tanda || !/^\d{9,12}$/.test(waktu) || !/^[0-9a-f]{64}$/.test(tanda)) return false;
  if (Math.abs(kini - Number(waktu)) > 300) return false;
  const harus = createHmac("sha256", rahasia).update(`${waktu}.${badan}`).digest();
  return timingSafeEqual(harus, Buffer.from(tanda, "hex"));
}

/** Minta tarikan; perubahan beruntun dalam JEDA_MS digabung jadi satu. */
export function minta(): void {
  if (st.jeda) clearTimeout(st.jeda);
  st.jeda = setTimeout(() => {
    st.jeda = null;
    void jalankan();
  }, JEDA_MS);
  st.jeda.unref?.();
}

/** Dipanggil sekali saat server mulai. */
export function mulaiSinkron(): void {
  if (!konfigurasi() || st.jaga) return;
  minta();
  st.jaga = setInterval(minta, JAGA_MS);
  st.jaga.unref?.();
}

/** Satu tarikan pada satu waktu; permintaan yang datang saat berjalan diulang sekali sesudahnya. */
export function jalankan(): Promise<void> {
  if (st.jalan) {
    st.ulang = true;
    return st.jalan;
  }
  st.jalan = tarik()
    .catch(async (e) => {
      const s = await statusSinkron();
      await setSetting(KUNCI_STATUS, JSON.stringify({ ...s, galat: e instanceof Error ? e.message : String(e) })).catch(() => {});
      console.error("[sinkron] gagal:", e instanceof Error ? e.message : e);
    })
    .finally(() => {
      st.jalan = null;
      if (st.ulang) {
        st.ulang = false;
        minta();
      }
    });
  return st.jalan;
}

// ---------- Tarik dan tulis ----------

interface MenuSs {
  nama: string;
  deskripsi: string | null;
  kategori: string | null;
  harga: number | string;
  gofood: string | null;
  grabfood: string | null;
  shopeefood: string | null;
  isi: string[] | null;
  harga_khusus_outlet: { outlet: string; harga: number | string | null; tersedia: boolean }[] | null;
}
interface OutletSs {
  nama: string;
  alamat: string;
  wilayah: string | null;
  lat: number | string;
  lng: number | string;
  buka: string | null;
  tutup: string | null;
  tutup_sementara_sampai: string | null;
  alasan_tutup: string | null;
  aplikasi: string[];
}
interface PromoSs {
  promo_name: string | null;
  discount_type: string | null;
  discount_value: number | string | null;
  min_purchase: number | string | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  apply_to_food_apps: boolean | null;
  start_date: string | null;
  end_date: string | null;
  daily_start_time: string | null;
  daily_end_time: string | null;
  daily_schedule: { date?: string; start_time?: string; end_time?: string }[] | null;
  usage_limit: number | null;
  menu: string | null;
  hadiah: string | null;
  outlet: string[] | null;
  semua_outlet: boolean | null;
}
export interface DataSs {
  versi: number;
  dibuat: string;
  berikutnya: string | null;
  menu: MenuSs[];
  outlet: OutletSs[];
  promo: PromoSs[];
}

async function ambil(k: Konfigurasi): Promise<DataSs> {
  const res = await fetch(`${k.url}/rest/v1/rpc/kb_cs_ambil`, {
    method: "POST",
    headers: { apikey: k.apikey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ p_kunci: k.kunci }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`database menjawab HTTP ${res.status}`);
  const data = (await res.json()) as DataSs | null;
  if (!data || !Array.isArray(data.menu)) throw new Error("kunci sinkron ditolak database (SINKRON_SS_KUNCI tidak cocok)");
  return data;
}

async function tarik(): Promise<void> {
  const k = konfigurasi();
  if (!k) return;
  const ids = await nomorSinkron();
  const data = await ambil(k);
  const teks = rapikanTeks(susunTeks(data));
  const hash = createHash("sha256").update(rapikanTeks(susunTeks({ ...data, dibuat: "1970-01-01T00:00:00Z" }))).digest("hex");

  if (ids.length) {
    const sql = await db();
    const lama = await sql<{ number_id: number; hash: string | null }[]>`
      SELECT d.number_id, s.nilai AS hash
        FROM documents d LEFT JOIN settings s ON s.kunci = 'sinkron_ss_hash:' || d.number_id
       WHERE d.nama_berkas = ${PENANDA} AND d.number_id = ANY(${ids})`;
    const sudah = new Map(lama.map((r) => [r.number_id, r.hash]));
    const perlu = ids.filter((id) => sudah.get(id) !== hash);
    if (perlu.length) await tulis(perlu, teks, hash);
  }

  await setSetting(KUNCI_STATUS, JSON.stringify({ waktu: sekarang(), versi: data.versi, karakter: teks.length, galat: null } satisfies Status));
  jadwalkanBatas(data.berikutnya);
}

/** Ganti dokumen otomatis di nomor-nomor itu dalam satu transaksi (pembaca tidak pernah melihat keadaan setengah jadi). */
async function tulis(ids: number[], teks: string, hash: string): Promise<void> {
  const potongan = potong(teks);
  const kini = sekarang();
  await transaksi(async (tx) => {
    await tx`DELETE FROM documents WHERE nama_berkas = ${PENANDA} AND number_id = ANY(${ids})`;
    const hidup = await tx<{ id: number }[]>`SELECT id FROM numbers WHERE id = ANY(${ids})`;
    for (const { id } of hidup) {
      const [{ id: docId }] = await tx<{ id: number }[]>`
        INSERT INTO documents(number_id, judul, sumber, nama_berkas, ukuran_byte, jumlah_karakter, created_at)
        VALUES (${id}, ${JUDUL}, 'teks', ${PENANDA}, ${Buffer.byteLength(teks)}, ${teks.length}, ${kini})
        RETURNING id`;
      const baris = potongan.map((isi, urutan) => ({ document_id: docId, number_id: id, urutan, isi }));
      for (let i = 0; i < baris.length; i += 500) await tx`INSERT INTO chunks ${tx(baris.slice(i, i + 500), "document_id", "number_id", "urutan", "isi")}`;
      await tx`INSERT INTO settings(kunci, nilai) VALUES (${`sinkron_ss_hash:${id}`}, ${hash}) ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai`;
    }
  });
}

/** Tarik ulang tepat saat promo mulai/berakhir atau outlet buka lagi, tanpa perlu ada perubahan di database. */
function jadwalkanBatas(berikutnya: string | null): void {
  if (st.batas) clearTimeout(st.batas);
  st.batas = null;
  const t = berikutnya ? Date.parse(berikutnya) : NaN;
  if (!Number.isFinite(t)) return;
  const ms = Math.min(Math.max(t - Date.now() + 2_000, 1_000), BATAS_TIMER_MS);
  st.batas = setTimeout(() => {
    st.batas = null;
    void jalankan();
  }, ms);
  st.batas.unref?.();
}

// ---------- Susun teks knowledge ----------

const rp = (n: number | string | null | undefined): string => `Rp${Math.round(Number(n)).toLocaleString("id-ID")}`;
const ada = (n: number | string | null | undefined): boolean => n !== null && n !== undefined && n !== "" && Number.isFinite(Number(n));
const waktuWib = (iso: string, jam = true): string =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", ...(jam ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(iso)) + (jam ? " WIB" : "");
const jamPendek = (j: string | null | undefined): string => (j ?? "").slice(0, 5).replace(":", ".");

function judulKata(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && /^[a-z]+$/.test(w) && w !== "dan" ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function namaOutlet(nama: string): string {
  return judulKata(nama.replace(/^(SUKA SHAWARMA|MITRA)\s+/i, "").trim());
}

export function wilayahOutlet(o: Pick<OutletSs, "wilayah" | "alamat">): string {
  const m = o.alamat.match(/\b(Kota(?!\s+Wisata)|Kabupaten|Kab\.)\s+([A-Za-z]+(?:\s+(?:Selatan|Utara|Barat|Timur|Tengah))?)/);
  if (m) return `${m[1] === "Kab." ? "Kabupaten" : m[1]} ${m[2]}`.replace(/\bBks\b/, "Bekasi");
  if (/jakarta/i.test(o.alamat)) return o.alamat.match(/Jakarta\s+(Selatan|Timur|Barat|Utara|Pusat)/i)?.[0] ?? "Jakarta";
  if (/depok/i.test(o.alamat)) return "Kota Depok";
  if (/bogor\s+(?:selatan|utara|barat|timur|tengah)/i.test(o.alamat)) return "Kota Bogor";
  return o.wilayah ? judulKata(o.wilayah) : "Lainnya";
}

/** Kelompokkan baris jadi kartu <= MAKS_KARTU karakter; tiap kartu berdiri sendiri (judul + kata kunci diulang). */
function kartu(judul: string, pembuka: string[], baris: string[], kunci: string): string[] {
  const hasil: string[] = [];
  let kini: string[] = [];
  const buat = (isi: string[], ke: number) => [`${judul}${ke > 1 ? ` (lanjutan ${ke})` : ""}`, ...(ke === 1 ? pembuka : []), ...isi, `Kata kunci: ${kunci}`].join("\n");
  for (const b of baris) {
    if (kini.length && buat([...kini, b], hasil.length + 1).length > MAKS_KARTU) {
      hasil.push(buat(kini, hasil.length + 1));
      kini = [];
    }
    kini.push(b);
  }
  if (kini.length || !hasil.length) hasil.push(buat(kini, hasil.length + 1));
  return hasil;
}

function hargaAplikasi(m: MenuSs): string | null {
  const app = ([["GoFood", m.gofood], ["GrabFood", m.grabfood], ["ShopeeFood", m.shopeefood]] as const).filter(([, h]) => ada(h));
  if (!app.length) return null;
  const sama = app.every(([, h]) => Number(h) === Number(app[0][1]));
  return sama ? `${rp(app[0][1])} di ${app.map(([n]) => n).join(", ")}` : app.map(([n, h]) => `${rp(h)} di ${n}`).join(", ");
}

const KUNCI_KATEGORI: [RegExp, string][] = [
  [/aqua|bundling/i, "bundling, aqua, air mineral, paket air, plus aqua, sama air putih"],
  [/combo/i, "combo, isi combo, isinya apa, paket, paket hemat, sama minum, plus minuman, up size, upsize, combo 1, combo 2, combo 3, combo 4"],
  [/mix/i, "harga mix, campur, ayam sapi, dua daging, mix besar, mix jumbo, mix reguler, mix sedang"],
  [/ayam/i, "harga ayam, shawarma ayam, chicken, ayam sedang, ayam besar, ayam jumbo, ayam reguler"],
  [/sapi/i, "harga sapi, shawarma sapi, beef, daging sapi, sapi sedang, sapi besar, sapi jumbo, sapi reguler"],
  [/suka suka/i, "suka beef, suka chicken, suka fried chicken, suka samyang, menu spesial, keju, crispy, pedas"],
  [/topping/i, "topping, tambahan, tambah keju, extra keju, extra cheese, tambah kentang, extra kentang"],
  [/drink|minum/i, "minuman, minum, es teh, ice tea, jeruk, orange juice"],
];

function teksPromo(p: PromoSs): string {
  const nama = p.promo_name?.trim() || "Promo";
  let jenis: string;
  const nilai = Number(p.discount_value ?? 0);
  if (p.discount_type === "percentage") jenis = `diskon ${nilai}%`;
  else if (p.discount_type === "nominal") jenis = `potongan ${rp(nilai)}`;
  else if (p.discount_type === "buy_one_get_one") jenis = `beli ${p.buy_quantity ?? 1} gratis ${p.get_quantity ?? 1}${p.hadiah ? ` ${p.hadiah}` : ""}`;
  else jenis = p.discount_type ?? "promo";
  const bagian = [`*${nama}*: ${jenis}${p.menu ? ` untuk ${p.menu}` : " untuk semua menu"}.`];
  if (ada(p.min_purchase) && Number(p.min_purchase) > 0) bagian.push(`Minimal belanja ${rp(p.min_purchase)}.`);
  if (p.start_date && p.end_date) bagian.push(`Berlaku ${waktuWib(p.start_date)} sampai ${waktuWib(p.end_date)}.`);
  else if (p.start_date) bagian.push(`Mulai ${waktuWib(p.start_date)}.`);
  else if (p.end_date) bagian.push(`Berlaku sampai ${waktuWib(p.end_date)}.`);
  if (p.daily_start_time && p.daily_end_time) bagian.push(`Setiap hari pukul ${jamPendek(p.daily_start_time)} sampai ${jamPendek(p.daily_end_time)} WIB.`);
  const jadwal = (p.daily_schedule ?? []).filter((j) => j.date);
  if (jadwal.length)
    bagian.push(`Hanya pada: ${jadwal.map((j) => `${waktuWib(`${j.date}T12:00:00+07:00`, false)} pukul ${jamPendek(j.start_time)}–${jamPendek(j.end_time)} WIB`).join("; ")}.`);
  bagian.push(p.semua_outlet || !p.outlet?.length ? "Berlaku di semua outlet." : `Berlaku di outlet: ${p.outlet.map(namaOutlet).join(", ")}.`);
  if (p.usage_limit) bagian.push("Kuotanya terbatas, jadi bisa habis sebelum periodenya selesai.");
  bagian.push(p.apply_to_food_apps ? "Berlaku juga untuk pesanan lewat aplikasi pesan-antar." : "Berlaku untuk pembelian di outlet, tidak untuk GoFood, GrabFood, dan ShopeeFood.");
  return `- ${bagian.join(" ")}`;
}

/** Susun data jadi kartu-kartu teks yang ramah pencarian (satu topik per paragraf, kata kunci pelanggan di tiap kartu). */
export function susunTeks(d: DataSs): string {
  const per = waktuWib(d.dibuat);
  const kartuSemua: string[] = [];
  const kategori = new Map<string, MenuSs[]>();
  for (const m of d.menu) {
    const k = m.kategori?.trim() || "Menu lain";
    if (!kategori.has(k)) kategori.set(k, []);
    kategori.get(k)!.push(m);
  }

  // Ringkasan menu
  const hargaOutlet = d.menu.filter((m) => !/\+|combo/i.test(m.nama) && !/topping|drink|minum/i.test(m.kategori ?? "")).map((m) => Number(m.harga));
  kartuSemua.push(
    ...kartu(
      "Daftar menu Suka Shawarma (semua kategori)",
      [`Menu-menu Suka Shawarma yang dijual di outlet, data per ${per}. Menunya terbagi dalam beberapa kategori:`],
      [
        ...[...kategori].map(([k, ms]) => `- ${k}: ${ms.map((m) => m.nama).join(", ")}.`),
        ...(hargaOutlet.length ? [`Harga shawarma di outlet mulai ${rp(Math.min(...hargaOutlet))} sampai ${rp(Math.max(...hargaOutlet))}. Harga di GoFood, GrabFood, dan ShopeeFood lebih tinggi daripada harga outlet.`] : []),
        "Menu yang tidak ada di daftar ini berarti tidak dijual saat ini.",
      ],
      "menu apa saja, menunya apa aja, ada apa aja, list menu, daftar menu, pilihan menu, varian, jual apa"
    )
  );

  // Harga per kategori
  for (const [k, ms] of kategori) {
    const baris = ms.map((m) => {
      const app = hargaAplikasi(m);
      let s = `- *${m.nama}*: ${rp(m.harga)} di outlet${app ? `, ${app}` : ""}.`;
      if (m.isi?.length) s += ` Isi: ${m.isi.join(" + ")}.`;
      else if (m.deskripsi && !m.deskripsi.includes("+") && m.deskripsi.length <= 90) s += ` ${m.deskripsi.trim().replace(/\.?$/, ".")}`;
      for (const h of m.harga_khusus_outlet ?? []) {
        if (!h.tersedia) s += ` Tidak tersedia di outlet ${namaOutlet(h.outlet)}.`;
        else if (ada(h.harga) && Number(h.harga) > 0 && Number(h.harga) !== Number(m.harga)) s += ` Di outlet ${namaOutlet(h.outlet)} harganya ${rp(h.harga)}.`;
      }
      return s;
    });
    const kunci = KUNCI_KATEGORI.find(([re]) => re.test(k))?.[1] ?? k.toLowerCase();
    kartuSemua.push(...kartu(`Harga ${k}`, [`Harga ${k}, data per ${per}. Harga outlet berlaku untuk beli langsung di kasir.`], baris, `${kunci}, harga, harganya, berapa, brp`));
  }

  // Daftar harga ringkas
  kartuSemua.push(
    ...kartu(
      "Daftar harga lengkap di outlet (price list)",
      [`Harga beli langsung di outlet Suka Shawarma, data per ${per}:`],
      d.menu.map((m) => `- ${m.nama} ${rp(m.harga)}.`),
      "price list, pricelist, daftar harga, list harga, harganya berapa, harga semua menu, harga terbaru, minta harga"
    ),
    ...kartu(
      "Daftar harga di GoFood, GrabFood, ShopeeFood",
      [`Harga di aplikasi pesan-antar, belum termasuk ongkos kirim dan biaya layanan aplikasi, data per ${per}. Yang berlaku adalah harga yang tampil di aplikasi saat memesan.`],
      d.menu.filter((m) => hargaAplikasi(m)).map((m) => `- ${m.nama}: ${hargaAplikasi(m)}.`),
      "harga gofood, harga grabfood, harga shopeefood, harga online, harga aplikasi, harga delivery, gojek, grab, shopee"
    )
  );

  // Promo
  const promoBaris = d.promo.map(teksPromo);
  kartuSemua.push(
    ...kartu(
      "Promo yang sedang berlaku",
      [
        promoBaris.length
          ? `Promo outlet Suka Shawarma yang aktif atau terjadwal, data per ${per}. Cocokkan dengan tanggal dan jam sekarang sebelum menyebutnya:`
          : `Per ${per} tidak ada promo outlet yang sedang berjalan. Kalau pelanggan bertanya promo, sampaikan dengan sopan bahwa saat ini belum ada promo di outlet. Jangan menjanjikan atau menebak promo berikutnya.`,
      ],
      promoBaris,
      "promo, promosi, diskon, potongan, buy 1 get 1, bogo, beli 1 gratis 1, gratis, cashback, kupon, promo hari ini, ada promo, lagi promo, harga promo, kode promo"
    )
  );

  // Outlet
  const outlet = d.outlet.map((o) => ({ ...o, nama_tampil: namaOutlet(o.nama), wil: wilayahOutlet(o) }));
  const jam = new Set(outlet.map((o) => `${o.buka}-${o.tutup}`));
  const satuJam = jam.size === 1 && outlet[0]?.buka ? `pukul ${outlet[0].buka} sampai ${outlet[0].tutup} WIB` : null;
  const tutup = outlet.filter((o) => o.tutup_sementara_sampai);
  kartuSemua.push(
    ...kartu(
      "Jam buka outlet Suka Shawarma",
      [
        satuJam
          ? `Semua outlet Suka Shawarma buka setiap hari, Senin sampai Minggu, ${satuJam} (mulai melayani pukul ${outlet[0].buka} WIB dan tutup pukul ${outlet[0].tutup} WIB, data per ${per}).`
          : `Jam buka berbeda per outlet; lihat data outlet masing-masing (data per ${per}).`,
      ],
      [
        ...tutup.map((o) => `- Outlet ${o.nama_tampil} sedang tutup sementara sampai ${waktuWib(o.tutup_sementara_sampai!)}${o.alasan_tutup ? ` (${o.alasan_tutup})` : ""}.`),
        "Pakai waktu sekarang untuk menjawab apakah outlet sedang buka. Jadwal khusus tanggal merah, Ramadan, dan Lebaran belum ada di data.",
      ],
      "jam buka, buka jam berapa, tutup jam berapa, tutup jam brp, jam operasional, hari ini buka, sekarang buka, masih buka, sudah tutup, minggu buka, setiap hari, malam, malem, last order"
    )
  );
  const perWil = new Map<string, string[]>();
  for (const o of outlet) {
    if (!perWil.has(o.wil)) perWil.set(o.wil, []);
    perWil.get(o.wil)!.push(o.nama_tampil);
  }
  kartuSemua.push(
    ...kartu(
      "Daftar semua outlet Suka Shawarma yang aktif",
      [`Per ${per} ada ${outlet.length} outlet Suka Shawarma yang aktif melayani pelanggan:`],
      [
        ...[...perWil].map(([w, ns]) => `- ${w}: ${ns.join(", ")}.`),
        "Outlet yang tidak ada di daftar ini tidak aktif saat ini. Daftar outlet di situs atau unggahan lama bisa berbeda karena belum diperbarui.",
      ],
      "daftar outlet, list outlet, semua cabang, cabang mana saja, lokasi, outlet terdekat, cabang terdekat, ada di mana saja, kota mana, berapa cabang, bogor, depok, jakarta, bekasi, tangerang, sukabumi"
    )
  );
  for (const o of outlet) {
    const n = o.nama_tampil;
    const app = o.aplikasi.map((a) => ({ gofood: "GoFood", grabfood: "GrabFood", shopeefood: "ShopeeFood" })[a as "gofood"] ?? a);
    kartuSemua.push(
      ...kartu(
        `Outlet Suka Shawarma ${n}, ${o.wil}`,
        [`Suka Shawarma ${n} adalah outlet Suka Shawarma di ${o.wil}.`],
        [
          `- Alamat outlet ${n}: ${o.alamat.trim().replace(/\.?$/, ".")}`,
          o.tutup_sementara_sampai
            ? `- Outlet ${n} sedang TUTUP SEMENTARA sampai ${waktuWib(o.tutup_sementara_sampai)}${o.alasan_tutup ? ` (${o.alasan_tutup})` : ""}.`
            : `- Jam buka outlet ${n}: setiap hari pukul ${o.buka ?? "?"} sampai ${o.tutup ?? "?"} WIB.`,
          `- Peta lokasi (Google Maps): https://www.google.com/maps/search/?api=1&query=${Number(o.lat)},${Number(o.lng)}`,
          app.length
            ? `- Pesan antar dari outlet ${n}: tersedia di ${app.join(", ")}.`
            : `- Pesan antar: outlet ${n} belum tercatat melayani GoFood, GrabFood, atau ShopeeFood. Pembelian dilakukan langsung di outlet.`,
        ],
        `outlet ${n.toLowerCase()}, cabang ${n.toLowerCase()}, alamat, lokasi, dimana, di mana, sebelah mana, daerah mana, maps, peta, shareloc, rute, ${o.wil.toLowerCase()}`
      )
    );
  }
  return kartuSemua.join("\n\n");
}

export const DOKUMEN_OTOMATIS = PENANDA;

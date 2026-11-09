import "server-only";
import { getSetting, setSetting } from "./db";
import {
  GATEWAY,
  GATEWAY_BAWAAN,
  type Gateway,
  GatewayError,
  type KanalMati,
  type ModeGateway,
  PETA_HYBRID_BAWAAN,
  type StatusBayar,
  gatewaySah,
  modeGatewaySah,
} from "./gateway-def";
import { KANAL_BAYAR, type KanalBayar } from "./harga";
import { IpaymuError, bacaKanalAkunIpaymu, buatChargeIpaymu, kanalDilayaniIpaymu, konfigIpaymu, petaStatusIpaymu, statusIpaymu } from "./ipaymu";
import {
  type InstruksiBayar,
  MidtransError,
  batalkanCharge,
  buatCharge,
  NAMA_PREFERENSI,
  bacaPreferensiMidtrans,
  kanalTerpasang as kanalTerpasangMidtrans,
  konfigMidtrans,
  petaStatus,
  refundMidtrans,
  statusMidtrans,
  waktuMidtrans,
} from "./midtrans";

/**
 * Lapisan payment gateway: satu antarmuka untuk semua provider (Midtrans, iPaymu). Untuk tagihan BARU, admin memilih
 * mode (settings `gateway_aktif`): hanya Midtrans, hanya iPaymu, atau hybrid (provider dipilih per metode bayar,
 * settings `gateway_hybrid`). Bisa diganti kapan saja tanpa ubah kode; transaksi yang sudah ada menyimpan providernya
 * sendiri (transaksi.gateway), jadi tetap dicek, dibatalkan, dan di-refund lewat provider asalnya.
 * Kredensial tetap dari .env server (konfigMidtrans / konfigIpaymu): provider tanpa kredensial = tidak bisa dipakai.
 */

export { GATEWAY, GATEWAY_BAWAAN, type Gateway, GatewayError, type KanalMati, type ModeGateway, gatewaySah, modeGatewaySah };

export interface DataCharge {
  orderId: string;
  jumlah: number;
  kanal: KanalBayar;
  item: { id: string; nama: string };
  pelanggan: { nama: string; email: string };
  /** Asal aplikasi (https://host), untuk alamat kembali & callback. */
  asalApp: string;
}

/** Status satu transaksi menurut provider, sudah dipetakan ke status kita. */
export interface StatusGateway {
  status: StatusBayar;
  /** Nominal menurut provider (Rp, dibulatkan): harus sama persis dengan tagihan kita. */
  jumlah: number;
  /** Metode bayar menurut provider (disimpan di transaksi.metode). */
  metode: string | null;
  /** Dana dikembalikan PENUH (refund/chargeback), bukan sebagian: paket boleh dicabut otomatis. */
  refundPenuh: boolean;
  /** Kapan refund dikonfirmasi bank/e-wallet (detik epoch), bila diketahui. */
  refundDikonfirmasi: number | null;
}

export interface AdapterGateway {
  readonly nama: Gateway;
  /** Kanal yang bisa dilayani provider ini (dipasang developer); status aktifnya di akun lihat statusProvider. */
  kanalTerpasang(): KanalBayar[];
  buatCharge(t: DataCharge): Promise<{ bayar: InstruksiBayar; kedaluwarsa: number; ref: string | null }>;
  cekStatus(orderId: string, ref: string | null): Promise<StatusGateway>;
  /** true = tagihan tidak bisa dibayar lagi / boleh ditandai dibatalkan; false = ditolak (mis. sudah dibayar). */
  batalkan(orderId: string, ref: string | null): Promise<boolean>;
  /** Refund PENUH otomatis ke metode bayar asal; tidak ada = provider tanpa Refund API (uang kembali manual). */
  refund?(orderId: string, r: { refundKey: string; jumlah: number; alasan: string }): Promise<void>;
}

// ---------- Mode & provider per metode ----------

const KUNCI_MODE = "gateway_aktif";
const KUNCI_HYBRID = "gateway_hybrid";

export async function modeGateway(): Promise<ModeGateway> {
  const v = await getSetting(KUNCI_MODE);
  return modeGatewaySah(v) ? v : GATEWAY_BAWAAN;
}

export async function setModeGateway(m: ModeGateway): Promise<void> {
  await setSetting(KUNCI_MODE, m);
}

/** Provider pilihan admin per metode untuk mode hybrid (bawaan PETA_HYBRID_BAWAAN, sisanya Midtrans). */
export async function petaHybrid(): Promise<Record<KanalBayar, Gateway>> {
  let simpan: Partial<Record<KanalBayar, Gateway>> = {};
  try {
    const v = JSON.parse((await getSetting(KUNCI_HYBRID)) ?? "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) simpan = v;
  } catch {}
  const hasil = {} as Record<KanalBayar, Gateway>;
  for (const k of Object.keys(KANAL_BAYAR) as KanalBayar[]) {
    const g = simpan[k];
    hasil[k] = gatewaySah(g) ? g : (PETA_HYBRID_BAWAAN[k] ?? "midtrans");
  }
  return hasil;
}

export async function setPenyediaHybrid(kanal: KanalBayar, g: Gateway): Promise<void> {
  await setSetting(KUNCI_HYBRID, JSON.stringify({ ...(await petaHybrid()), [kanal]: g }));
}

/** Adapter satu provider; null = kredensialnya belum dipasang di .env. */
export async function adapter(g: string | null | undefined): Promise<AdapterGateway | null> {
  if (g === "ipaymu") return adapterIpaymu();
  if (g === "midtrans" || g === null || g === undefined) return adapterMidtrans();
  return null;
}

export function terpasang(g: Gateway): boolean {
  return g === "ipaymu" ? !!konfigIpaymu() : !!process.env.MIDTRANS_SERVER_KEY?.trim();
}

// ---------- Status kanal NYATA di akun tiap provider ----------

/** Status satu metode di satu provider. aktif null = tidak diketahui (dianggap boleh dipakai). */
export interface StatusProvider {
  aktif: boolean | null;
  /** Bila aktif null: status provider gagal dibaca (alasannya di sumberStatus). */
  sebab?: "gagal-baca";
  /** Penjelasan untuk admin, mis. "Aktif di iPaymu", "Belum aktif di dashboard Midtrans". */
  catatan: string;
  /** Ditolak provider saat membuat tagihan (bisa dicoba lagi oleh admin). */
  ditolak?: boolean;
}

const SIMPAN_STATUS_MS = 10 * 60_000;
type Simpanan = { waktu: number; isi: unknown; jalan?: Promise<void>; dibaca: number | null; galat: string | null };
const gs = globalThis as unknown as { __waStatusKanal?: Map<string, Simpanan> };

/**
 * Hasil `ambil` disimpan 10 menit per `kunci` (satu panggilan API untuk semua permintaan). Pertama kali ditunggu;
 * setelahnya disegarkan di latar sambil memakai hasil lama. Gagal = hasil lama / null, dicoba lagi semenit kemudian.
 */
async function simpanSementara<T>(kunci: string, ambil: () => Promise<T>): Promise<T | null> {
  const peta = (gs.__waStatusKanal ??= new Map());
  let c = peta.get(kunci);
  if (!c) peta.set(kunci, (c = { waktu: 0, isi: null, dibaca: null, galat: null }));
  if (Date.now() - c.waktu > SIMPAN_STATUS_MS && !c.jalan) {
    const cc = c;
    cc.jalan = ambil()
      .then((isi) => {
        cc.isi = isi;
        cc.waktu = cc.dibaca = Date.now();
        cc.galat = null;
      })
      .catch((e) => {
        cc.waktu = Date.now() - SIMPAN_STATUS_MS + 60_000;
        cc.galat = e instanceof GatewayError ? e.message : "Gagal membaca status dari provider.";
        console.warn(`[gateway] status kanal ${kunci.split("|")[0]} tidak terbaca: ${e instanceof Error ? e.message : e}`);
      })
      .finally(() => {
        cc.jalan = undefined;
      });
    if (cc.isi === null) await cc.jalan;
  }
  return c.isi as T | null;
}

const kunciStatusIpaymu = (k: { produksi: boolean; va: string }) => `ipaymu|${k.produksi ? "prod" : "sandbox"}|${k.va}`;
const kunciStatusMidtrans = (k: { produksi: boolean; serverKey: string }) => `midtrans|${k.produksi ? "prod" : "sandbox"}|${k.serverKey.slice(-6)}`;

/** Dari mana status kanal tiap provider dibaca, kapan terakhir berhasil, dan alasan bila gagal (untuk panel admin). */
export interface SumberStatus {
  terpasang: boolean;
  produksi: boolean;
  /** Terakhir berhasil dibaca (ms epoch); null = belum pernah. */
  dibaca: number | null;
  /** Alasan percobaan terakhir gagal; null = terakhir berhasil. */
  galat: string | null;
}

/** Panggil setelah statusProvider/rencanaKanal (yang mengisi simpanan): tanpa jaringan. */
export async function sumberStatus(): Promise<Record<Gateway, SumberStatus>> {
  const [kM, kI] = [await konfigMidtrans(), konfigIpaymu()];
  const baca = (kunci: string | null) => {
    const c = kunci ? gs.__waStatusKanal?.get(kunci) : undefined;
    return { dibaca: c?.dibaca ?? null, galat: c?.galat ?? null };
  };
  return {
    midtrans: { terpasang: !!kM, produksi: kM?.produksi ?? true, ...baca(kM ? kunciStatusMidtrans(kM) : null) },
    ipaymu: { terpasang: !!kI, produksi: kI?.produksi ?? true, ...baca(kI ? kunciStatusIpaymu(kI) : null) },
  };
}

/** Lupakan status kanal tersimpan (tombol "Perbarui status" admin / uji): dibaca ulang dari provider. */
export function lupakanStatusKanal(): void {
  gs.__waStatusKanal?.clear();
}

/**
 * Status tiap metode yang dilayani provider `g`, seperti di dashboard provider itu: iPaymu dari payment-channels
 * (FeatureStatus/HealthStatus), Midtrans dari Preference API (payment_channels[].enabled). Metode yang ditolak provider
 * saat membuat tagihan (kode "belum aktif") = nonaktif sampai admin mencoba lagi. {} = provider belum dipasang.
 */
export async function statusProvider(g: Gateway): Promise<Partial<Record<KanalBayar, StatusProvider>>> {
  const hasil: Partial<Record<KanalBayar, StatusProvider>> = {};
  const mati = await kanalMati(g);
  const ditolak = (k: KanalBayar): StatusProvider | null => {
    const m = mati[k];
    return m?.oleh === "otomatis" ? { aktif: false, ditolak: true, catatan: `Ditolak ${GATEWAY[g].label} saat membuat tagihan${m.alasan ? ` (${m.alasan})` : ""}` } : null;
  };
  if (g === "ipaymu") {
    const k = konfigIpaymu();
    if (!k) return hasil;
    const akun = await simpanSementara(kunciStatusIpaymu(k), () => bacaKanalAkunIpaymu(k));
    for (const x of kanalDilayaniIpaymu()) {
      const s = akun?.get(x);
      hasil[x] =
        ditolak(x) ??
        (!akun
          ? { aktif: null, sebab: "gagal-baca", catatan: "Status gagal dibaca dari iPaymu (alasan di atas); tetap ditawarkan" }
          : !s
            ? { aktif: false, catatan: "Tidak ada di akun iPaymu" }
            : !s.aktif
              ? { aktif: false, catatan: "Belum aktif di dashboard iPaymu" }
              : { aktif: true, catatan: s.sehat === "online" ? "Aktif di iPaymu" : `Aktif di iPaymu · ${s.sehat}` });
    }
    return hasil;
  }
  const k = await konfigMidtrans();
  if (!k) return hasil;
  const pref = await simpanSementara(kunciStatusMidtrans(k), () => bacaPreferensiMidtrans(k));
  for (const x of kanalTerpasangMidtrans()) {
    const v = NAMA_PREFERENSI[x]?.map((n) => pref?.get(n)).find((b) => b !== undefined);
    hasil[x] =
      ditolak(x) ??
      (v === true
        ? { aktif: true, catatan: "Aktif di Midtrans" }
        : v === false
          ? { aktif: false, catatan: "Belum aktif di dashboard Midtrans" }
          : pref
            ? // Terbukti di produksi (2026-11-09): QRIS, ShopeePay, BCA VA tidak ada di daftar akun dan memang ditolak saat charge.
              { aktif: false, catatan: "Tidak ada di daftar metode akun Midtrans" }
            : { aktif: null, sebab: "gagal-baca", catatan: "Status gagal dibaca dari Midtrans (alasan di atas); tetap ditawarkan" });
  }
  return hasil;
}

/** Satu metode bayar di halaman bayar: provider yang melayaninya sekarang, dan provider yang bisa melayaninya. */
export interface RencanaKanal {
  kanal: KanalBayar;
  /** Provider untuk tagihan baru metode ini; null = tidak ada provider aktif yang melayaninya di mode ini. */
  penyedia: Gateway | null;
  /** Provider terpasang yang metode ini AKTIF (atau tidak diketahui) di akunnya: yang boleh dipilih admin. */
  pilihan: Gateway[];
  /** Pilihan admin di mode hybrid (bisa berbeda dari `penyedia` bila metode itu belum aktif di provider tsb). */
  pilihanAdmin: Gateway | null;
  /** Disembunyikan admin dari pembeli (untuk provider `penyedia`). */
  mati: KanalMati | null;
  /** Status nyata metode ini di tiap provider yang melayaninya (tidak ada = provider tidak melayani / belum dipasang). */
  status: Partial<Record<Gateway, StatusProvider>>;
}

/**
 * Rencana semua metode bayar menurut mode aktif, urut seperti KANAL_BAYAR. Hanya provider yang metodenya aktif di
 * akunnya yang dipakai. Hybrid: provider pilihan admin; bila metode itu belum aktif di sana, otomatis lewat provider lain
 * yang aktif. Dari memori (settings + status kanal tersimpan 10 menit): tanpa query/jaringan di jalur panas.
 */
export async function rencanaKanal(): Promise<{ mode: ModeGateway; kanal: RencanaKanal[] }> {
  const [mode, peta, sM, sI, matiM, matiI] = await Promise.all([modeGateway(), petaHybrid(), statusProvider("midtrans"), statusProvider("ipaymu"), kanalMati("midtrans"), kanalMati("ipaymu")]);
  const status = { midtrans: sM, ipaymu: sI };
  const mati = { midtrans: matiM, ipaymu: matiI };
  return {
    mode,
    kanal: (Object.keys(KANAL_BAYAR) as KanalBayar[]).map((k) => {
      const pilihan = (["midtrans", "ipaymu"] as const).filter((g) => status[g][k] && status[g][k].aktif !== false);
      const mau = mode === "hybrid" ? peta[k] : mode;
      const penyedia = pilihan.includes(mau) ? mau : mode === "hybrid" ? (pilihan[0] ?? null) : null;
      const m = penyedia ? mati[penyedia][k] : undefined;
      const st: Partial<Record<Gateway, StatusProvider>> = {};
      if (sM[k]) st.midtrans = sM[k];
      if (sI[k]) st.ipaymu = sI[k];
      return { kanal: k, penyedia, pilihan, pilihanAdmin: mode === "hybrid" ? peta[k] : null, mati: m?.oleh === "admin" ? m : null, status: st };
    }),
  };
}

/** Metode yang ditawarkan ke pembeli beserta providernya (urut KANAL_BAYAR). */
export async function penyediaKanal(): Promise<Partial<Record<KanalBayar, Gateway>>> {
  const hasil: Partial<Record<KanalBayar, Gateway>> = {};
  for (const r of (await rencanaKanal()).kanal) if (r.penyedia && !r.mati) hasil[r.kanal] = r.penyedia;
  return hasil;
}

/** Adapter untuk tagihan baru dengan metode ini; null = metode tidak tersedia sekarang. */
export async function adapterKanal(kanal: KanalBayar): Promise<AdapterGateway | null> {
  const g = (await penyediaKanal())[kanal];
  return g ? adapter(g) : null;
}

/** Ada metode bayar yang bisa dipakai pembeli (pembayaran online aktif). */
export async function pembayaranAktif(): Promise<boolean> {
  return (await kanalAktif()).length > 0;
}

/** Ringkasan untuk panel admin: mode aktif, dan tiap provider sudah dipasang atau belum (tanpa kunci apa pun). */
export async function infoGateway(): Promise<{ mode: ModeGateway; daftar: { nama: Gateway; label: string; info: string; terpasang: boolean; sandbox: boolean }[] }> {
  const mode = await modeGateway();
  const k = konfigIpaymu();
  return {
    mode,
    daftar: (Object.keys(GATEWAY) as Gateway[]).map((g) => ({
      nama: g,
      label: GATEWAY[g].label,
      info: GATEWAY[g].info,
      terpasang: terpasang(g),
      sandbox: g === "ipaymu" ? !!k && !k.produksi : process.env.MIDTRANS_MODE?.trim().toLowerCase() === "sandbox",
    })),
  };
}

// ---------- Kanal yang disembunyikan, per provider ----------

/** Midtrans memakai kunci lama `kanal_mati` (data yang sudah ada tetap berlaku); provider lain `kanal_mati_<nama>`. */
const kunciMati = (g: Gateway) => (g === "midtrans" ? "kanal_mati" : `kanal_mati_${g}`);

export async function kanalMati(g: Gateway): Promise<Partial<Record<KanalBayar, KanalMati>>> {
  try {
    const v = JSON.parse((await getSetting(kunciMati(g))) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** null = tampilkan lagi. */
export async function setKanalMati(g: Gateway, kanal: KanalBayar, mati: KanalMati | null): Promise<void> {
  const m = await kanalMati(g);
  if (mati) m[kanal] = mati;
  else delete m[kanal];
  await setSetting(kunciMati(g), JSON.stringify(m));
}

/** Kanal yang ditolak provider karena belum aktif di akun: disembunyikan sampai admin menampilkannya lagi. */
const sembunyikanOtomatis = (g: Gateway, kanal: KanalBayar, alasan: string) =>
  setKanalMati(g, kanal, { oleh: "otomatis", waktu: Math.floor(Date.now() / 1000), alasan: alasan.slice(0, 200) }).catch(() => {});

/**
 * Metode yang ditawarkan ke pembeli, urut seperti KANAL_BAYAR: menurut mode aktif (tanpa `g`), atau semua metode yang
 * dilayani satu provider `g` (untuk uji / admin). [] = belum ada yang terpasang.
 */
export async function kanalAktif(g?: Gateway): Promise<KanalBayar[]> {
  if (!g) return Object.keys(await penyediaKanal()) as KanalBayar[];
  const [st, mati] = await Promise.all([statusProvider(g), kanalMati(g)]);
  return (Object.keys(st) as KanalBayar[]).filter((x) => st[x]!.aktif !== false && !mati[x]);
}

// ---------- Adapter Midtrans (perilaku sama persis dengan src/lib/midtrans.ts) ----------

async function adapterMidtrans(): Promise<AdapterGateway | null> {
  const k = await konfigMidtrans();
  if (!k) return null;
  return {
    nama: "midtrans",
    kanalTerpasang: kanalTerpasangMidtrans,
    async buatCharge(t) {
      try {
        const c = await buatCharge(k, { ...t, kembaliUrl: `${t.asalApp}/langganan/tagihan/${encodeURIComponent(t.orderId)}` });
        return { ...c, ref: null };
      } catch (e) {
        if (e instanceof GatewayError && e.kanalMati) await sembunyikanOtomatis("midtrans", t.kanal, e.message.replace(/^Midtrans menolak tagihan \(kode (\w+)\)/, "kode $1"));
        throw e;
      }
    },
    async cekStatus(orderId) {
      const s = await statusMidtrans(k, orderId);
      return {
        status: petaStatus(s),
        jumlah: Math.round(Number(s.gross_amount)),
        metode: s.payment_type ?? null,
        refundPenuh: s.transaction_status === "refund" || s.transaction_status === "chargeback",
        refundDikonfirmasi: waktuMidtrans(s.refunds?.find((r) => r.bank_confirmed_at)?.bank_confirmed_at),
      };
    },
    batalkan: (orderId) => batalkanCharge(k, orderId),
    async refund(orderId, r) {
      // Midtrans sudah mencatat refund (percobaan sebelumnya berhasil tapi jawabannya hilang): tidak dikirim lagi.
      const s = await statusMidtrans(k, orderId).catch(() => null);
      if (s?.transaction_status !== "refund") await refundMidtrans(k, orderId, r);
    },
  };
}

// ---------- Adapter iPaymu ----------

async function adapterIpaymu(): Promise<AdapterGateway | null> {
  const k = konfigIpaymu();
  if (!k) return null;
  const cek = async (ref: string | null) => {
    if (!ref) throw new IpaymuError("Transaksi iPaymu tanpa TransactionId.");
    return statusIpaymu(k, ref);
  };
  return {
    nama: "ipaymu",
    kanalTerpasang: kanalDilayaniIpaymu,
    async buatCharge(t) {
      try {
        return await buatChargeIpaymu(k, {
          ...t,
          notifyUrl: `${t.asalApp}/api/ipaymu/notifikasi`,
          kembaliUrl: `${t.asalApp}/langganan/tagihan/${encodeURIComponent(t.orderId)}`,
        });
      } catch (e) {
        if (e instanceof GatewayError && e.kanalMati) await sembunyikanOtomatis("ipaymu", t.kanal, e.message);
        throw e;
      }
    },
    async cekStatus(_orderId, ref) {
      const s = await cek(ref);
      const status = petaStatusIpaymu(s);
      return {
        status,
        jumlah: Math.round(Number(s.Amount)),
        metode: (s.Via ?? s.PaymentChannel ?? s.Channel ?? null)?.toString().toLowerCase() ?? null,
        refundPenuh: status === "dikembalikan",
        refundDikonfirmasi: null,
      };
    },
    // iPaymu tidak punya API pembatalan Direct Payment: tagihan yang masih menunggu ditandai dibatalkan di sisi kita
    // saja. Bila pelanggan tetap membayarnya sebelum kedaluwarsa, callback lunas tetap mengaktifkan paket (dana masuk).
    async batalkan(_orderId, ref) {
      return petaStatusIpaymu(await cek(ref)) === "menunggu";
    },
  };
}

export { MidtransError, IpaymuError };

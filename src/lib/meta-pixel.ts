import "server-only";
import { createHash } from "node:crypto";
import { getSetting, sekarang, setSetting } from "./db";
import {
  EVENT_META_PIXEL,
  KUNCI_EVENT_META,
  type KonfigMetaPixelPublik,
  type KunciEventMeta,
  type PengaturanMetaPixel,
  ekstrakPixelId,
} from "./meta-pixel-def";

export * from "./meta-pixel-def";

const KUNCI_AKTIF = "meta_pixel_aktif";
const KUNCI_ID = "meta_pixel_id";
const KUNCI_CAPI_TOKEN = "meta_pixel_capi_token";
const KUNCI_TEST_CODE = "meta_pixel_test_code";
const kunciEvent = (k: KunciEventMeta) => `meta_pixel_ev_${k}`;

/** Ambil seluruh pengaturan Meta Pixel (termasuk token CAPI untuk halaman admin). */
export async function pengaturanMetaPixel(): Promise<PengaturanMetaPixel> {
  const [aktifRaw, idRaw, capiRaw, testRaw, ...evRaw] = await Promise.all([
    getSetting(KUNCI_AKTIF),
    getSetting(KUNCI_ID),
    getSetting(KUNCI_CAPI_TOKEN),
    getSetting(KUNCI_TEST_CODE),
    ...KUNCI_EVENT_META.map((k) => getSetting(kunciEvent(k))),
  ]);

  const pixelId = ekstrakPixelId(idRaw ?? "") || "";
  const aktif = aktifRaw === null ? Boolean(pixelId) : aktifRaw === "1";
  const event = Object.fromEntries(
    KUNCI_EVENT_META.map((k, i) => [k, evRaw[i] === null ? EVENT_META_PIXEL[k].bawaan : evRaw[i] === "1"])
  ) as Record<KunciEventMeta, boolean>;

  return {
    aktif,
    pixelId,
    capiToken: (capiRaw ?? "").trim(),
    testEventCode: (testRaw ?? "").trim(),
    event,
  };
}

/** Konfigurasi publik (tanpa token rahasia) untuk disisipkan ke komponen browser. */
export async function konfigMetaPixelPublik(): Promise<KonfigMetaPixelPublik> {
  const p = await pengaturanMetaPixel();
  return {
    aktif: p.aktif && Boolean(p.pixelId),
    pixelId: p.pixelId,
    event: p.event,
  };
}

/** Simpan pengaturan Meta Pixel dari panel admin. */
export async function simpanPengaturanMetaPixel(input: {
  aktif: boolean;
  pixelId: string;
  capiToken: string;
  testEventCode: string;
  event: Record<KunciEventMeta, boolean>;
}): Promise<PengaturanMetaPixel> {
  const idBersih = ekstrakPixelId(input.pixelId);
  if (idBersih === null) {
    throw new Error("ID Meta Pixel tidak valid. Masukkan 8–25 digit angka ID Pixel atau tempel kode script dari Meta Events Manager.");
  }
  const testCode = input.testEventCode.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const capiToken = input.capiToken.trim().slice(0, 512);
  const aktif = Boolean(idBersih) && input.aktif;

  await setSetting(KUNCI_AKTIF, aktif ? "1" : "0");
  await setSetting(KUNCI_ID, idBersih);
  await setSetting(KUNCI_CAPI_TOKEN, capiToken);
  await setSetting(KUNCI_TEST_CODE, testCode);
  for (const k of KUNCI_EVENT_META) {
    await setSetting(kunciEvent(k), input.event[k] ? "1" : "0");
  }

  return pengaturanMetaPixel();
}

function sha256(teks: string): string {
  return createHash("sha256").update(teks.trim().toLowerCase()).digest("hex");
}

export interface DataCapiEvent {
  kunci: KunciEventMeta;
  eventId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  urlSumber?: string;
  customData?: Record<string, unknown>;
}

/**
 * Kirim event Server-Side ke Meta Conversions API (bila Pixel aktif, event diizinkan, dan CAPI Access Token terisi).
 * Selalu gagal-aman (tidak pernah melempar error ke alur utama pengguna).
 */
export async function kirimCapiEvent(data: DataCapiEvent): Promise<boolean> {
  try {
    const cfg = await pengaturanMetaPixel();
    if (!cfg.aktif || !cfg.pixelId || !cfg.capiToken || !cfg.event[data.kunci]) return false;

    const namaEvent = EVENT_META_PIXEL[data.kunci].kode;
    const userData: Record<string, unknown> = {};
    if (data.email) userData.em = [sha256(data.email)];
    if (data.ip) userData.client_ip_address = data.ip;
    if (data.userAgent) userData.client_user_agent = data.userAgent;

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: namaEvent,
          event_time: sekarang(),
          action_source: "website",
          ...(data.eventId ? { event_id: data.eventId } : {}),
          ...(data.urlSumber ? { event_source_url: data.urlSumber } : {}),
          user_data: Object.keys(userData).length > 0 ? userData : { client_user_agent: "Server" },
          ...(data.customData ? { custom_data: data.customData } : {}),
        },
      ],
      ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
    };

    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.pixelId)}/events?access_token=${encodeURIComponent(cfg.capiToken)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Kirim event uji dari dashboard admin ke Meta Conversions API (untuk memastikan Pixel ID & Token CAPI valid).
 */
export async function ujiCapiMetaPixel(opts?: { ip?: string; userAgent?: string; email?: string }): Promise<{
  ok: boolean;
  pesan: string;
}> {
  const cfg = await pengaturanMetaPixel();
  if (!cfg.pixelId) {
    return { ok: false, pesan: "Simpan ID Meta Pixel terlebih dahulu sebelum mengirim event uji." };
  }
  if (!cfg.capiToken) {
    return {
      ok: true,
      pesan: `Browser Pixel (${cfg.pixelId}) siap & sudah memancarkan event uji PageView/Lead dari browser Anda. (Isi Access Token CAPI bila ingin menguji pengiriman server-side).`,
    };
  }

  try {
    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: "PageView",
          event_time: sekarang(),
          event_id: `test_${Date.now()}`,
          action_source: "website",
          user_data: {
            ...(opts?.email ? { em: [sha256(opts.email)] } : {}),
            ...(opts?.ip ? { client_ip_address: opts.ip } : {}),
            client_user_agent: opts?.userAgent || "MetaPixelAdminTester/1.0",
          },
        },
      ],
      ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
    };

    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.pixelId)}/events?access_token=${encodeURIComponent(cfg.capiToken)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string } };
    if (!res.ok) {
      return {
        ok: false,
        pesan: `Meta Graph API menolak: ${body.error?.message || `HTTP ${res.status}`}`,
      };
    }
    return {
      ok: true,
      pesan: `Berhasil! Meta menerima ${body.events_received ?? 1} event uji${cfg.testEventCode ? ` (Kode Uji: ${cfg.testEventCode})` : ""} untuk Pixel ${cfg.pixelId}. Cek tab Test Events di Meta Events Manager.`,
    };
  } catch (e) {
    return {
      ok: false,
      pesan: `Gagal menghubungi server Meta: ${e instanceof Error ? e.message : "Koneksi terputus"}`,
    };
  }
}

// Uji Meta Ads Pixel: ekstraksi ID dari angka langsung & potongan script HTML, penyimpanan pengaturan di PostgreSQL,
// pemisahan konfigurasi publik (tanpa membocorkan token CAPI), pengiriman server-side Conversions API (CAPI) dengan
// SHA-256 email & deduplikasi event_id, serta pengujian tombol Uji Event.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-pixel");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db } = await lib("src/lib/db.ts");
const {
  KUNCI_EVENT_META,
  ekstrakPixelId,
  kirimCapiEvent,
  konfigMetaPixelPublik,
  pengaturanMetaPixel,
  simpanPengaturanMetaPixel,
  ujiCapiMetaPixel,
} = await lib("src/lib/meta-pixel.ts");

const sql = await db();
let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

console.log("== ekstraktor pintar ID Meta Pixel ==");

await cek("ekstrakPixelId mengenali angka langsung, kode script fbq('init'), dan tag noscript img", async () => {
  assert.equal(ekstrakPixelId(""), "");
  assert.equal(ekstrakPixelId("   "), "");
  assert.equal(ekstrakPixelId("123456789012345"), "123456789012345");
  assert.equal(ekstrakPixelId("  987654321098765 \n "), "987654321098765");

  const cuplikanScript = `
    <!-- Meta Pixel Code -->
    <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '1122334455667788');
    fbq('track', 'PageView');
    </script>
    <!-- End Meta Pixel Code -->
  `;
  assert.equal(ekstrakPixelId(cuplikanScript), "1122334455667788");

  const cuplikanNoscript = `<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=5566778899001122&ev=PageView&noscript=1"/></noscript>`;
  assert.equal(ekstrakPixelId(cuplikanNoscript), "5566778899001122");

  // Input tidak sah ditolak (null)
  assert.equal(ekstrakPixelId("1234"), null);
  assert.equal(ekstrakPixelId("bukan-pixel"), null);
  assert.equal(ekstrakPixelId("<script>alert(1)</script>"), null);
});

console.log("== penyimpanan pengaturan & konfigurasi publik ==");

await cek("keadaan awal kosong: tidak aktif, semua event bawaan nyala", async () => {
  const awal = await pengaturanMetaPixel();
  assert.equal(awal.aktif, false);
  assert.equal(awal.pixelId, "");
  assert.equal(awal.capiToken, "");
  assert.equal(awal.testEventCode, "");
  for (const k of KUNCI_EVENT_META) {
    assert.equal(awal.event[k], true);
  }
  const pub = await konfigMetaPixelPublik();
  assert.equal(pub.aktif, false);
  assert.equal(pub.pixelId, "");
  assert.equal("capiToken" in pub, false, "token CAPI tidak boleh ada di objek publik");
});

await cek("simpan dari potongan script mengekstrak ID bersih & menyembunyikan token CAPI dari objek publik", async () => {
  const semuaEvent = Object.fromEntries(KUNCI_EVENT_META.map((k) => [k, true]));
  semuaEvent.lead_wa = false; // matikan 1 event untuk menguji

  const tersimpan = await simpanPengaturanMetaPixel({
    aktif: true,
    pixelId: `<script>fbq("init", "889900112233445"); fbq("track", "PageView");</script>`,
    capiToken: "EAABtestTokenRahasia123",
    testEventCode: "TEST99887",
    event: semuaEvent,
  });

  assert.equal(tersimpan.aktif, true);
  assert.equal(tersimpan.pixelId, "889900112233445");
  assert.equal(tersimpan.capiToken, "EAABtestTokenRahasia123");
  assert.equal(tersimpan.testEventCode, "TEST99887");
  assert.equal(tersimpan.event.page_view, true);
  assert.equal(tersimpan.event.lead_wa, false);
  assert.equal(tersimpan.event.purchase, true);

  const pub = await konfigMetaPixelPublik();
  assert.equal(pub.aktif, true);
  assert.equal(pub.pixelId, "889900112233445");
  assert.equal(pub.event.lead_wa, false);
  assert.equal("capiToken" in pub, false);
  assert.equal("testEventCode" in pub, false);
});

await cek("input ID tidak sah ditolak dengan pesan error jelas", async () => {
  const semuaEvent = Object.fromEntries(KUNCI_EVENT_META.map((k) => [k, true]));
  await assert.rejects(
    () =>
      simpanPengaturanMetaPixel({
        aktif: true,
        pixelId: "salah-format",
        capiToken: "",
        testEventCode: "",
        event: semuaEvent,
      }),
    /ID Meta Pixel tidak valid/
  );
});

console.log("== pengiriman Conversions API (CAPI) & uji koneksi ==");

await cek("kirimCapiEvent mengirim payload standar Graph API v21.0 dengan email ter-hash SHA-256 & event_id deduplikasi", async () => {
  const panggilan = [];
  const fetchAsli = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    panggilan.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  };

  try {
    // 1. Event yang dimatikan (lead_wa = false) tidak dikirim
    const okLead = await kirimCapiEvent({ kunci: "lead_wa" });
    assert.equal(okLead, false);
    assert.equal(panggilan.length, 0);

    // 2. Event CompleteRegistration dengan email
    const okReg = await kirimCapiEvent({
      kunci: "complete_registration",
      email: "Budi@Uji.Test ",
      ip: "203.0.113.10",
    });
    assert.equal(okReg, true);
    assert.equal(panggilan.length, 1);
    assert.match(panggilan[0].url, /graph\.facebook\.com\/v21\.0\/889900112233445\/events\?access_token=EAABtestTokenRahasia123/);
    const evReg = panggilan[0].body.data[0];
    assert.equal(evReg.event_name, "CompleteRegistration");
    assert.equal(evReg.action_source, "website");
    assert.equal(panggilan[0].body.test_event_code, "TEST99887");
    const hashHarapan = createHash("sha256").update("budi@uji.test").digest("hex");
    assert.deepEqual(evReg.user_data.em, [hashHarapan]);
    assert.equal(evReg.user_data.client_ip_address, "203.0.113.10");

    // 3. Event Purchase dengan event_id (orderId) dan custom_data IDR
    const okPur = await kirimCapiEvent({
      kunci: "purchase",
      eventId: "WA-7-1700000000-abc123",
      customData: { value: 249000, currency: "IDR", content_name: "Bisnis", content_type: "product" },
    });
    assert.equal(okPur, true);
    assert.equal(panggilan.length, 2);
    const evPur = panggilan[1].body.data[0];
    assert.equal(evPur.event_name, "Purchase");
    assert.equal(evPur.event_id, "WA-7-1700000000-abc123");
    assert.equal(evPur.custom_data.value, 249000);
    assert.equal(evPur.custom_data.currency, "IDR");

    // 4. Uji tombol Kirim Event Uji
    const hasilUji = await ujiCapiMetaPixel({ ip: "127.0.0.1", email: "admin@uji.test" });
    assert.equal(hasilUji.ok, true);
    assert.match(hasilUji.pesan, /Meta menerima 1 event uji/);
  } finally {
    globalThis.fetch = fetchAsli;
  }
});

await cek("menonaktifkan atau mengosongkan Pixel menghentikan CAPI & publik", async () => {
  const semuaEvent = Object.fromEntries(KUNCI_EVENT_META.map((k) => [k, true]));
  await simpanPengaturanMetaPixel({
    aktif: false,
    pixelId: "889900112233445",
    capiToken: "EAABtestTokenRahasia123",
    testEventCode: "",
    event: semuaEvent,
  });
  const pubMati = await konfigMetaPixelPublik();
  assert.equal(pubMati.aktif, false);
  assert.equal(pubMati.pixelId, "889900112233445");

  await simpanPengaturanMetaPixel({
    aktif: true,
    pixelId: "",
    capiToken: "",
    testEventCode: "",
    event: semuaEvent,
  });
  const kosong = await pengaturanMetaPixel();
  assert.equal(kosong.aktif, false);
  assert.equal(kosong.pixelId, "");
});

await sql.end({ timeout: 2 });
await pg.berhenti();
console.log(`\nLOLOS (${lolos} pengujian Meta Ads Pixel)`);

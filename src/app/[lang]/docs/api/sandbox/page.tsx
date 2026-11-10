import Link from "@/components/link";
import { SANDBOX_HARI_BAWAAN, SANDBOX_PORT_BAWAAN } from "@/lib/api-def";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { Bagian, Catatan, JudulHalaman, K, Tabel, metaDok } from "../_dok/kerangka";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "sandbox");

export default async function Sandbox() {
  const { t } = await teksHalaman();
  return (
    <article className="space-y-10">
      <JudulHalaman label={t("Panduan", "Guides")} judul="Sandbox">
        {t(
          "Mesin yang sama dengan production dan WhatsApp asli, tapi dibatasi supaya aman dicoba: 1 nomor bot dan 1 nomor penguji. Key keluar langsung tanpa menunggu persetujuan.",
          "The same engine as production with real WhatsApp, limited so it's safe to try: 1 bot number and 1 tester number. The key is issued instantly, no approval needed.",
        )}
      </JudulHalaman>

      <Bagian id="beda" judul={t("Sandbox vs production", "Sandbox vs production")}>
        <Tabel
          kepala={["", "Sandbox", "Production"]}
          baris={[
            [t("Key", "Key"), <K key="a">cg_test_…</K>, <K key="b">cg_live_…</K>],
            [t("Didapat", "How to get it"), t("Langsung dari portal", "Instantly from the portal"), t("Setelah pengajuan disetujui", "After your application is approved")],
            [t("Alamat mesin", "Engine address"), t(`Laptop, tanpa domain (http://localhost:${SANDBOX_PORT_BAWAAN})`, `Laptop, no domain (http://localhost:${SANDBOX_PORT_BAWAAN})`), t("Domain HTTPS publik (ALAMAT_PUBLIK)", "Public HTTPS domain (ALAMAT_PUBLIK)")],
            [t("Nomor WhatsApp", "WhatsApp numbers"), t("1 nomor bot", "1 bot number"), t("Sesuai batas aplikasi", "Per your app's limit")],
            [t("Lawan bicara", "Who it can talk to"), t("Hanya 1 nomor penguji", "Only 1 tester number"), t("Siapa saja (tetap kena anti-blokir)", "Anyone (anti-ban rules apply)")],
            [t("Fitur", "Features"), t("Semua yang dibagikan", "Everything that's shared"), t("Yang dibuka untuk aplikasi Anda", "What's enabled for your app")],
            [t("Masa berlaku", "Validity"), t(`${SANDBOX_HARI_BAWAAN} hari, bisa diperpanjang`, `${SANDBOX_HARI_BAWAAN} days, extendable`), t("Lisensi 7 hari, diperpanjang otomatis", "7-day license, renewed automatically")],
          ]}
        />
      </Bagian>

      <Bagian id="istilah" judul={t("Nomor bot & nomor penguji", "Bot number & tester number")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card p-4">
            <p className="text-[14px] font-semibold">{t("Nomor bot", "Bot number")}</p>
            <p className="mt-1 text-[13px] text-muted">{t(`Nomor WhatsApp yang di-scan ke mesin (dashboard http://localhost:${SANDBOX_PORT_BAWAAN} → Nomor → Tambah nomor). Inilah yang membalas otomatis.`, `The WhatsApp number scanned into the engine (dashboard http://localhost:${SANDBOX_PORT_BAWAAN} → Numbers → Add number). This is the one that replies.`)}</p>
          </div>
          <div className="card p-4">
            <p className="text-[14px] font-semibold">{t("Nomor penguji", "Tester number")}</p>
            <p className="mt-1 text-[13px] text-muted">{t("HP Anda sendiri. Didaftarkan dengan mengirim WA berisi kode UJI (dari portal) ke nomor bot. Hanya nomor ini yang boleh dikirimi pesan dan dilayani bot.", "Your own phone. Registered by sending the UJI code (from the portal) over WhatsApp to the bot number. Only this number can receive messages and be served by the bot.")}</p>
          </div>
        </div>
        <Catatan>
          {t("Kirim ke nomor lain ditolak ", "Sending to another number is rejected with ")}
          <K>403 bukan_nomor_penguji</K>
          {t("; chat dari nomor lain diabaikan (tidak dicatat, tanpa webhook, bot diam).", "; chats from other numbers are ignored (not stored, no webhook, the bot stays silent).")}
        </Catatan>
      </Bagian>

      <Bagian id="naik" judul={t("Naik ke production", "Going to production")}>
        <ol className="list-decimal space-y-1.5 pl-5 text-[14px]">
          <li>
            {t("Ajukan production di ", "Apply for production in the ")}
            <Link href="/developer" className="font-semibold text-accent hover:underline">
              {t("portal Developer", "Developer portal")}
            </Link>
            .
          </li>
          <li>
            {t("Setelah disetujui, ganti ", "Once approved, switch ")}
            <K>CHATGERCEP_KEY</K>
            {t(" ke key cg_live_ dan isi ", " to the cg_live_ key and fill ")}
            <K>ALAMAT_PUBLIK</K>.
          </li>
          <li>{t("Nyalakan ulang mesin. Kode aplikasi tidak berubah; data mesin dan koneksi WhatsApp tetap.", "Restart the engine. Your app code doesn't change; engine data and the WhatsApp connection stay.")}</li>
        </ol>
        <Catatan jenis="tips">{t("Setelah perpanjang sandbox di portal, klik Perbarui lisensi di dashboard mesin (atau nyalakan ulang). Sandbox tidak menerima webhook lisensi.", "After extending the sandbox in the portal, click Refresh license in the engine dashboard (or restart it). The sandbox doesn't receive license webhooks.")}</Catatan>
      </Bagian>
    </article>
  );
}

import { BATAS_BAWAAN, DAMPAK_FITUR, FITUR_API } from "@/lib/api-def";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { Bagian, Catatan, JudulHalaman, K, Tabel, metaDok } from "../_dok/kerangka";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "lisensi");

export default async function Lisensi() {
  const { t } = await teksHalaman();
  return (
    <article className="space-y-10">
      <JudulHalaman label={t("Panduan", "Guides")} judul={t("Lisensi, fitur & batas", "License, features & limits")}>
        {t("Mesin berjalan di server Anda, tapi fitur yang boleh dipakai ditentukan lisensi bertanda tangan dari ChatGerCep.", "The engine runs on your server, but which features you may use is set by a signed license from ChatGerCep.")}
      </JudulHalaman>

      <Bagian id="lisensi" judul={t("Cara kerja lisensi", "How licensing works")}>
        <ul className="list-disc space-y-1.5 pl-5 text-[14px]">
          <li>{t("Lisensi ditandatangani digital (Ed25519), berlaku 7 hari, dan diperpanjang otomatis lewat webhook ke ALAMAT_PUBLIK. Mesin hanya bertanya sekali saat menyala; tidak ada polling.", "The license is digitally signed (Ed25519), valid 7 days, and renewed automatically via webhook to ALAMAT_PUBLIK. The engine asks only once on start; there's no polling.")}</li>
          <li>{t("Lisensi habis, ditangguhkan, dicabut, atau belum dibayar = mode terbatas: API membalas 402/403 dan bot berhenti menjawab.", "An expired, suspended, revoked, or unpaid license = limited mode: the API returns 402/403 and the bot stops replying.")}</li>
        </ul>
        <Catatan jenis="tips">{t("Koneksi WhatsApp tidak pernah diputus oleh lisensi. Begitu lisensi aktif lagi, layanan langsung pulih tanpa scan ulang.", "The WhatsApp connection is never cut by licensing. Once the license is active again, service resumes without rescanning.")}</Catatan>
      </Bagian>

      <Bagian id="fitur" judul={t("Fitur & dampak bila dimatikan", "Features & what stops when disabled")}>
        <p className="text-[14px]">{t("Fitur yang dimatikan berhenti di semua jalur sekaligus: API (403 fitur_tidak_dibuka), dashboard bawaan, dan bot WhatsApp.", "A disabled feature stops on every path at once: the API (403 fitur_tidak_dibuka), the built-in dashboard, and the WhatsApp bot.")}</p>
        <Tabel
          kepala={[t("Fitur", "Feature"), t("Yang berhenti bila dimatikan", "What stops when disabled")]}
          baris={FITUR_API.map((f) => [
            <span key={f.kode}>
              <K>{f.kode}</K>
              <span className="mt-0.5 block text-[12.5px] text-muted">{f.label}</span>
            </span>,
            <span key="d" className="text-[13px]">
              {DAMPAK_FITUR[f.kode]}
            </span>,
          ])}
        />
      </Bagian>

      <Bagian id="anti-blokir" judul={t("Batas & anti-blokir WhatsApp", "Limits & WhatsApp anti-ban")}>
        <Tabel
          kepala={[t("Aturan", "Rule"), t("Bawaan", "Default")]}
          baris={[
            [t("Pesan keluar per nomor", "Outgoing messages per number"), t(`${BATAS_BAWAAN.pesan_menit}/menit, jeda acak 1–3 detik`, `${BATAS_BAWAAN.pesan_menit}/min, random 1–3 s gap`)],
            [t("Kontak baru (belum pernah chat) per nomor", "New contacts (never chatted) per number"), t(`${BATAS_BAWAAN.kontak_baru_hari}/hari, lebih dari itu 422 ditolak_anti_blokir`, `${BATAS_BAWAAN.kontak_baru_hari}/day, beyond that 422 ditolak_anti_blokir`)],
            [t("Balasan bot per chat", "Bot replies per chat"), t("Maks 10 per 10 menit, hanya chat pribadi, tampil \"mengetik\"", "Max 10 per 10 min, private chats only, shows \"typing\"")],
            [t("Nomor per mesin", "Numbers per engine"), t(`${BATAS_BAWAAN.nomor} (sandbox: 1)`, `${BATAS_BAWAAN.nomor} (sandbox: 1)`)],
            [t("Nomor WhatsApp resmi (Cloud API)", "Official WhatsApp numbers (Cloud API)"), t("Tanpa batas per menit & kontak baru dari mesin; Meta membatasi lewat tier & template", "No per-minute or new-contact limit from the engine; Meta limits via tiers & templates")],
          ]}
        />
        <Catatan>{t("Batas per aplikasi bisa berbeda dari bawaan (diatur saat persetujuan, termasuk \"tanpa batas\"); nilai yang berlaku ada di GET /status → lisensi.batas.", "Per-app limits may differ from the defaults (set on approval, including \"unlimited\"); the effective values are in GET /status → lisensi.batas.")}</Catatan>
        <Catatan jenis="awas">{t("Aturan anti-blokir tidak bisa dimatikan lewat API. Spam/blast dilarang dan bisa membuat lisensi dicabut.", "Anti-ban rules can't be turned off via the API. Spam/blasting is prohibited and may get the license revoked.")}</Catatan>
      </Bagian>

      <Bagian id="privasi" judul={t("Privasi", "Privacy")}>
        <p className="text-[14px]">{t("Isi chat, kontak, dan Informasi Usaha tidak pernah dikirim ke server ChatGerCep. Server kami hanya tahu versi mesin dan jumlah nomor.", "Chats, contacts, and Business Info are never sent to ChatGerCep's servers. We only know the engine version and number count.")}</p>
      </Bagian>
    </article>
  );
}

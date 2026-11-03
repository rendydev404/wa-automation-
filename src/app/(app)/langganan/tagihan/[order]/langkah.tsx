import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { KanalBayar } from "@/lib/harga";

/**
 * Langkah pembayaran per kanal. Komponen server: teksnya ikut HTML halaman, tidak menambah JavaScript di browser.
 * `kode` = kode perusahaan Mandiri Bill Payment (biller code dari Midtrans).
 */
type Cara = { judul: string; langkah: ReactNode[] };

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-fg">{children}</strong>;

function antarBank(bank: string, kodeBank: string): Cara {
  return {
    judul: "Dari bank lain",
    langkah: [
      <>Pilih menu <B>Transfer antarbank</B> (online / BI-FAST) di aplikasi bank kamu.</>,
      <>Pilih bank tujuan <B>{bank}</B> (kode {kodeBank}), lalu isi rekening tujuan dengan <B>nomor virtual account</B> di atas.</>,
      <>Isi nominal persis seperti total tagihan, periksa namanya, lalu konfirmasi.</>,
    ],
  };
}

function caraBayar(kanal: KanalBayar, kode?: string): Cara[] {
  switch (kanal) {
    case "qris":
      return [
        {
          judul: "Scan QRIS",
          langkah: [
            <>Buka aplikasi e-wallet atau m-banking yang mendukung QRIS (GoPay, OVO, DANA, ShopeePay, LinkAja, BCA mobile, Livin&apos;, BRImo, dan lainnya).</>,
            <>Pilih menu <B>Scan</B> / <B>Bayar</B>, lalu arahkan kamera ke kode QR di atas.</>,
            <>Membayar dari HP ini? Ketuk <B>Simpan QR</B>, lalu unggah gambarnya dari galeri di menu scan aplikasi kamu.</>,
            <>Periksa nama merchant dan nominal, lalu konfirmasi dengan PIN.</>,
          ],
        },
      ];
    case "gopay":
      return [
        { judul: "Dari HP ini", langkah: [<>Ketuk <B>Buka GoPay</B>.</>, <>Periksa nominal, lalu konfirmasi dengan PIN GoPay.</>] },
        {
          judul: "Dari HP lain",
          langkah: [<>Buka aplikasi Gojek / GoPay, lalu ketuk <B>Bayar</B> (scan).</>, <>Scan kode QR di atas, periksa nominal, lalu konfirmasi dengan PIN.</>],
        },
      ];
    case "shopeepay":
      return [
        {
          judul: "Bayar dengan ShopeePay",
          langkah: [
            <>Ketuk <B>Buka ShopeePay</B> dari HP yang terpasang aplikasi Shopee.</>,
            <>Periksa nominal, lalu konfirmasi dengan PIN ShopeePay.</>,
            <>Membuka halaman ini di komputer? Pilih metode <B>QRIS</B>: kodenya juga bisa dibayar dengan ShopeePay.</>,
          ],
        },
      ];
    case "bca":
      return [
        {
          judul: "BCA mobile",
          langkah: [<>Buka <B>m-BCA</B>, pilih <B>m-Transfer</B> lalu <B>BCA Virtual Account</B>.</>, <>Masukkan nomor virtual account di atas.</>, <>Periksa nama dan nominal, lalu masukkan PIN m-BCA.</>],
        },
        {
          judul: "KlikBCA",
          langkah: [<>Pilih <B>Transfer Dana</B> lalu <B>Transfer ke BCA Virtual Account</B>.</>, <>Masukkan nomor virtual account, lalu konfirmasi dengan KeyBCA.</>],
        },
        {
          judul: "ATM BCA",
          langkah: [<>Pilih <B>Transaksi Lainnya</B>, <B>Transfer</B>, lalu <B>ke Rekening BCA Virtual Account</B>.</>, <>Masukkan nomor virtual account, periksa detailnya, lalu konfirmasi.</>],
        },
      ];
    case "bni":
      return [
        {
          judul: "BNI Mobile Banking",
          langkah: [<>Pilih <B>Transfer</B> lalu <B>Virtual Account Billing</B>.</>, <>Masukkan nomor virtual account di atas.</>, <>Periksa detail tagihan, lalu masukkan password transaksi.</>],
        },
        {
          judul: "ATM BNI",
          langkah: [<>Pilih <B>Menu Lain</B>, <B>Transfer</B>, lalu <B>Virtual Account Billing</B>.</>, <>Masukkan nomor virtual account, periksa detailnya, lalu konfirmasi.</>],
        },
        antarBank("BNI", "009"),
      ];
    case "bri":
      return [
        { judul: "BRImo", langkah: [<>Pilih <B>Pembayaran</B> lalu <B>BRIVA</B>.</>, <>Masukkan nomor virtual account di atas.</>, <>Periksa detail tagihan, lalu masukkan PIN.</>] },
        {
          judul: "ATM BRI",
          langkah: [<>Pilih <B>Transaksi Lain</B>, <B>Pembayaran</B>, <B>Lainnya</B>, lalu <B>BRIVA</B>.</>, <>Masukkan nomor virtual account, periksa detailnya, lalu konfirmasi.</>],
        },
        antarBank("BRI", "002"),
      ];
    case "mandiri":
      return [
        {
          judul: "Livin' by Mandiri",
          langkah: [
            <>Pilih <B>Bayar</B>, lalu cari penyedia <B>Midtrans</B>{kode ? <> (kode perusahaan {kode})</> : null}.</>,
            <>Masukkan <B>kode bayar</B> di atas.</>,
            <>Periksa detail tagihan, lalu konfirmasi dengan PIN.</>,
          ],
        },
        {
          judul: "ATM Mandiri",
          langkah: [
            <>Pilih <B>Bayar/Beli</B>, <B>Lainnya</B>, lalu <B>Multi Payment</B>.</>,
            <>Masukkan kode perusahaan <B>{kode ?? "Midtrans"}</B>, lalu <B>kode bayar</B> di atas.</>,
            <>Periksa detail tagihan, lalu konfirmasi.</>,
          ],
        },
      ];
    case "permata":
      return [
        {
          judul: "PermataMobile X",
          langkah: [<>Pilih <B>Bayar Tagihan</B> lalu <B>Virtual Account</B>.</>, <>Masukkan nomor virtual account di atas.</>, <>Periksa detail tagihan, lalu konfirmasi.</>],
        },
        {
          judul: "ATM Permata",
          langkah: [<>Pilih <B>Transaksi Lainnya</B>, <B>Pembayaran</B>, <B>Pembayaran Lainnya</B>, lalu <B>Virtual Account</B>.</>, <>Masukkan nomor virtual account, lalu konfirmasi.</>],
        },
        antarBank("Permata", "013"),
      ];
  }
}

export function LangkahBayar({ kanal, kode }: { kanal: KanalBayar; kode?: string }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line">
      {caraBayar(kanal, kode).map((c, i) => (
        <details key={c.judul} open={i === 0} className="group px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-semibold [&::-webkit-details-marker]:hidden">
            {c.judul}
            <ChevronDown aria-hidden className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
          </summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] text-muted marker:text-faint">
            {c.langkah.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}

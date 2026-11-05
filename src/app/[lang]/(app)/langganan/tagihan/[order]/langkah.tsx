import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Bahasa } from "@/lib/bahasa";
import type { KanalBayar } from "@/lib/harga";

/**
 * Langkah pembayaran per kanal. Komponen server: teksnya ikut HTML halaman, tidak menambah JavaScript di browser.
 * `kode` = kode perusahaan Mandiri Bill Payment (biller code dari Midtrans). Versi Inggris (caraBayarEn) tetap menulis
 * nama menu persis seperti di aplikasi bank (umumnya berbahasa Indonesia), dengan arti dalam kurung.
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
    case "bsi":
      return [
        {
          judul: "BSI Mobile",
          langkah: [<>Pilih <B>Bayar</B> lalu <B>E-Commerce</B>, kemudian pilih <B>Midtrans</B>.</>, <>Masukkan nomor virtual account di atas.</>, <>Periksa detail tagihan, lalu masukkan PIN.</>],
        },
        {
          judul: "ATM BSI",
          langkah: [<>Pilih <B>Bayar/Beli</B>, <B>E-Commerce</B>, lalu <B>Midtrans</B>.</>, <>Masukkan nomor virtual account, periksa detailnya, lalu konfirmasi.</>],
        },
        antarBank("BSI", "451"),
      ];
    case "cimb":
      return [
        {
          judul: "OCTO Mobile",
          langkah: [<>Pilih <B>Transfer</B> lalu <B>Rekening Ponsel / CIMB Niaga</B> (atau menu <B>Bayar Tagihan</B>, <B>Virtual Account</B>).</>, <>Masukkan nomor virtual account di atas.</>, <>Periksa detail tagihan, lalu konfirmasi.</>],
        },
        {
          judul: "ATM CIMB Niaga",
          langkah: [<>Pilih <B>Pembayaran</B> lalu <B>Virtual Account</B>.</>, <>Masukkan nomor virtual account, periksa detailnya, lalu konfirmasi.</>],
        },
        antarBank("CIMB Niaga", "022"),
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

function antarBankEn(bank: string, kodeBank: string): Cara {
  return {
    judul: "From another bank",
    langkah: [
      <>Open your bank app and choose <B>interbank transfer</B> (online / BI-FAST).</>,
      <>Choose <B>{bank}</B> (bank code {kodeBank}) as the destination bank, then enter the <B>virtual account number</B> above as the account number.</>,
      <>Enter the exact invoice total, check the account name, then confirm.</>,
    ],
  };
}

function caraBayarEn(kanal: KanalBayar, kode?: string): Cara[] {
  switch (kanal) {
    case "qris":
      return [
        {
          judul: "Scan the QRIS code",
          langkah: [
            <>Open any e-wallet or mobile banking app that supports QRIS (GoPay, OVO, DANA, ShopeePay, LinkAja, BCA mobile, Livin&apos;, BRImo, and more).</>,
            <>Tap <B>Scan</B> / <B>Bayar</B> (Pay), then point your camera at the QR code above.</>,
            <>Paying from this phone? Tap <B>Save QR</B>, then upload the image from your gallery in your app&apos;s scan menu.</>,
            <>Check the merchant name and amount, then confirm with your PIN.</>,
          ],
        },
      ];
    case "gopay":
      return [
        { judul: "On this phone", langkah: [<>Tap <B>Open GoPay</B>.</>, <>Check the amount, then confirm with your GoPay PIN.</>] },
        {
          judul: "From another phone",
          langkah: [<>Open the Gojek / GoPay app, then tap <B>Bayar</B> (Pay / scan).</>, <>Scan the QR code above, check the amount, then confirm with your PIN.</>],
        },
      ];
    case "shopeepay":
      return [
        {
          judul: "Pay with ShopeePay",
          langkah: [
            <>Tap <B>Open ShopeePay</B> on a phone that has the Shopee app installed.</>,
            <>Check the amount, then confirm with your ShopeePay PIN.</>,
            <>Viewing this page on a computer? Choose the <B>QRIS</B> method instead: its code can also be paid with ShopeePay.</>,
          ],
        },
      ];
    case "bca":
      return [
        {
          judul: "BCA mobile",
          langkah: [<>Open <B>m-BCA</B>, choose <B>m-Transfer</B>, then <B>BCA Virtual Account</B>.</>, <>Enter the virtual account number above.</>, <>Check the name and amount, then enter your m-BCA PIN.</>],
        },
        {
          judul: "KlikBCA",
          langkah: [<>Choose <B>Transfer Dana</B> (Fund Transfer), then <B>Transfer ke BCA Virtual Account</B>.</>, <>Enter the virtual account number, then confirm with your KeyBCA.</>],
        },
        {
          judul: "BCA ATM",
          langkah: [
            <>Choose <B>Transaksi Lainnya</B> (Other Transactions), <B>Transfer</B>, then <B>ke Rekening BCA Virtual Account</B> (to BCA Virtual Account).</>,
            <>Enter the virtual account number, check the details, then confirm.</>,
          ],
        },
      ];
    case "bni":
      return [
        {
          judul: "BNI Mobile Banking",
          langkah: [<>Choose <B>Transfer</B>, then <B>Virtual Account Billing</B>.</>, <>Enter the virtual account number above.</>, <>Check the invoice details, then enter your transaction password.</>],
        },
        {
          judul: "BNI ATM",
          langkah: [<>Choose <B>Menu Lain</B> (Other Menu), <B>Transfer</B>, then <B>Virtual Account Billing</B>.</>, <>Enter the virtual account number, check the details, then confirm.</>],
        },
        antarBankEn("BNI", "009"),
      ];
    case "bri":
      return [
        { judul: "BRImo", langkah: [<>Choose <B>Pembayaran</B> (Payment), then <B>BRIVA</B>.</>, <>Enter the virtual account number above.</>, <>Check the invoice details, then enter your PIN.</>] },
        {
          judul: "BRI ATM",
          langkah: [
            <>Choose <B>Transaksi Lain</B> (Other Transactions), <B>Pembayaran</B> (Payment), <B>Lainnya</B> (Others), then <B>BRIVA</B>.</>,
            <>Enter the virtual account number, check the details, then confirm.</>,
          ],
        },
        antarBankEn("BRI", "002"),
      ];
    case "bsi":
      return [
        {
          judul: "BSI Mobile",
          langkah: [<>Choose <B>Bayar</B> (Pay), then <B>E-Commerce</B>, and select <B>Midtrans</B>.</>, <>Enter the virtual account number above.</>, <>Check the invoice details, then enter your PIN.</>],
        },
        {
          judul: "BSI ATM",
          langkah: [<>Choose <B>Bayar/Beli</B> (Pay/Buy), <B>E-Commerce</B>, then <B>Midtrans</B>.</>, <>Enter the virtual account number, check the details, then confirm.</>],
        },
        antarBankEn("BSI", "451"),
      ];
    case "cimb":
      return [
        {
          judul: "OCTO Mobile",
          langkah: [
            <>Choose <B>Transfer</B>, then <B>Rekening Ponsel / CIMB Niaga</B> (or the <B>Bayar Tagihan</B> (Pay Bills) menu, then <B>Virtual Account</B>).</>,
            <>Enter the virtual account number above.</>,
            <>Check the invoice details, then confirm.</>,
          ],
        },
        {
          judul: "CIMB Niaga ATM",
          langkah: [<>Choose <B>Pembayaran</B> (Payment), then <B>Virtual Account</B>.</>, <>Enter the virtual account number, check the details, then confirm.</>],
        },
        antarBankEn("CIMB Niaga", "022"),
      ];
    case "mandiri":
      return [
        {
          judul: "Livin' by Mandiri",
          langkah: [
            <>Choose <B>Bayar</B> (Pay), then search for the biller <B>Midtrans</B>{kode ? <> (company code {kode})</> : null}.</>,
            <>Enter the <B>payment code</B> above.</>,
            <>Check the invoice details, then confirm with your PIN.</>,
          ],
        },
        {
          judul: "Mandiri ATM",
          langkah: [
            <>Choose <B>Bayar/Beli</B> (Pay/Buy), <B>Lainnya</B> (Others), then <B>Multi Payment</B>.</>,
            <>Enter the company code <B>{kode ?? "Midtrans"}</B>, then the <B>payment code</B> above.</>,
            <>Check the invoice details, then confirm.</>,
          ],
        },
      ];
    case "permata":
      return [
        {
          judul: "PermataMobile X",
          langkah: [<>Choose <B>Bayar Tagihan</B> (Pay Bills), then <B>Virtual Account</B>.</>, <>Enter the virtual account number above.</>, <>Check the invoice details, then confirm.</>],
        },
        {
          judul: "Permata ATM",
          langkah: [
            <>Choose <B>Transaksi Lainnya</B> (Other Transactions), <B>Pembayaran</B> (Payment), <B>Pembayaran Lainnya</B> (Other Payments), then <B>Virtual Account</B>.</>,
            <>Enter the virtual account number, then confirm.</>,
          ],
        },
        antarBankEn("Permata", "013"),
      ];
  }
}

export function LangkahBayar({ kanal, kode, b = "id" }: { kanal: KanalBayar; kode?: string; b?: Bahasa }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line">
      {(b === "en" ? caraBayarEn : caraBayar)(kanal, kode).map((c, i) => (
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

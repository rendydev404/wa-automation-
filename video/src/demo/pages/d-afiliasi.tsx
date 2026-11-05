import { Banknote, Check, ChevronDown, Clock, Copy, Landmark, MousePointerClick, Package, Pencil, Search, Share2, TrendingUp, Users, Wallet } from "lucide-react";
import { Isi } from "../kit/ui";
import { PAKET } from "../data";

/* Halaman Afiliasi (markup disalin dari src/app/(app)/afiliasi/page.tsx & form-afiliasi.tsx). */

const angka = (n: number) => n.toLocaleString("id-ID");

export const BANK = [
  ["bca", "BCA", "Bank"],
  ["mandiri", "Bank Mandiri", "Bank"],
  ["bni", "BNI", "Bank"],
  ["bri", "BRI", "Bank"],
  ["bsi", "BSI (Bank Syariah Indonesia)", "Bank"],
  ["cimb", "CIMB Niaga", "Bank"],
  ["permata", "Bank Permata", "Bank"],
  ["seabank", "SeaBank", "Bank"],
  ["jago", "Bank Jago", "Bank"],
  ["danamon", "Bank Danamon", "Bank"],
  ["gopay", "GoPay", "E-Wallet"],
  ["ovo", "OVO", "E-Wallet"],
  ["dana", "DANA", "E-Wallet"],
  ["shopeepay", "ShopeePay", "E-Wallet"],
] as const;

export const TAUTAN_UTAMA = "https://chatgercep.com/?ref=rini-k7m2x";
export const TAUTAN_DAFTAR = "https://chatgercep.com/daftar?ref=rini-k7m2x";
export const KODE_REF = "rini-k7m2x";
export const SALDO = 149400;

export function Kepala() {
  return (
    <div>
      <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Afiliasi</p>
      <h1 className="mt-1.5 text-[28px] font-bold tracking-tight">Program Afiliasi & Komisi</h1>
      <p className="mt-1 max-w-2xl text-muted">Rekomendasikan layanan ini kepada pemilik usaha lain dan dapatkan komisi dari setiap pembelian paket.</p>
    </div>
  );
}

function RincianKomisi({ judul }: { judul: string }) {
  return (
    <section className="card p-6">
      <h3 className="flex items-center gap-2 text-[15px] font-bold">
        <Package className="size-4 text-accent" /> {judul}
      </h3>
      <p className="mt-0.5 text-[12.5px] text-muted">
        Ketentuan komisi saat ini: <strong className="font-semibold text-fg">1x per pelanggan referral yang membeli paket</strong>
      </p>
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        {PAKET.map((p) => (
          <li key={p.nama} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
            <div>
              <span className="font-bold">{p.nama}</span>
              <span className="block text-[12px] text-muted tabular-nums">Harga paket Rp{angka(p.harga)} / 30 hari</span>
            </div>
            <div className="text-right tabular-nums">
              <span className="rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success">+Rp{angka(p.komisi)}</span>
              <span className="mt-0.5 block text-[11px] text-muted">(20% dari harga)</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        * Besaran komisi per paket, siklus pemberian komisi, serta proses pencairan saldo dapat diatur sewaktu-waktu oleh admin dan mengikuti ketentuan dari pihak aplikasi.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- Sebelum bergabung
export function Onboarding({ bank, bankBuka, sorotBank, nomor, pemilik, fokus, t }: { bank: string; bankBuka: boolean; sorotBank: string | null; nomor: string; pemilik: string; fokus: "nomor" | "pemilik" | null; t: number }) {
  const terpilih = BANK.find((b) => b[0] === bank) ?? BANK[0];
  return (
    <div className="space-y-6">
      <section className="card p-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12px] font-bold text-accent">
            <Share2 className="size-3.5" /> Program Mitra Afiliasi
          </span>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Bagikan tautan, dapatkan komisi dari setiap pembelian paket</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Daftar menjadi afiliator hanya dalam 1 langkah. Setiap kali ada pelanggan baru yang mendaftar lewat tautan Anda dan membeli paket langganan, komisi langsung masuk otomatis ke saldo Anda pada pembelian paket mereka (1 kali per pelanggan referral sesuai ketentuan pihak aplikasi).
          </p>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            [Share2, "1. Bagikan Tautan Unik", "Sistem membuat kode referral acak otomatis untuk akun Anda yang siap langsung dibagikan ke calon pelanggan."],
            [TrendingUp, "2. Komisi Masuk Otomatis", "Begitu pembayaran paket pelanggan referral lunas, komisi langsung dihitung dan ditambahkan ke saldo Anda sesuai ketentuan aplikasi."],
            [Wallet, "3. Tarik ke Bank / E-Wallet", "Ajukan pencairan kapan saja setelah mencapai minimal Rp50.000."],
          ].map(([Ikon, j, x], i) => {
            const I = Ikon as typeof Share2;
            return (
              <div key={j as string} data-cur={`langkah-${i + 1}`} className="rounded-2xl border border-line bg-subtle/40 p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                  <I className="size-4" />
                </span>
                <p className="mt-3 text-[13.5px] font-bold">{j as string}</p>
                <p className="mt-1 text-[12.5px] text-muted">{x as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div data-cur="form-gabung" className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-6">
        <section className="card p-6">
          <h3 className="text-[16px] font-bold">Formulir Pendaftaran Afiliasi</h3>
          <p className="mt-0.5 text-[13px] text-muted">Langsung aktif setelah disimpan tanpa perlu menunggu verifikasi.</p>
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-line bg-subtle/40 px-4 py-3 text-[12.5px] text-muted">
              Kode tautan referral unik akan dibuat secara <strong className="font-semibold text-fg">acak otomatis</strong> oleh sistem begitu Anda bergabung.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="label">Bank atau E-Wallet tujuan komisi</span>
                <div className="relative">
                  <div data-cur="bank-pilih" className={`field flex items-center justify-between gap-3 text-left ${bankBuka ? "field-fokus" : ""}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{terpilih[1]}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">{terpilih[2]}</span>
                      <ChevronDown className="size-4 text-muted" style={{ transform: bankBuka ? "rotate(180deg)" : undefined }} />
                    </span>
                  </div>
                  {bankBuka && (
                    <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
                      <div className="relative border-b border-line p-2">
                        <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-faint" />
                        <div className="field py-1.5 pl-9 text-faint">Ketik untuk mencari…</div>
                      </div>
                      <ul className="max-h-72 overflow-hidden p-1">
                        {BANK.map(([id, nama, kat]) => {
                          const dipilih = id === bank;
                          return (
                            <li key={id} data-cur={`opsi-${id}`} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${sorotBank === id ? "bg-subtle" : ""}`}>
                              <span className="flex min-w-0 items-center gap-2">
                                <Check className={`size-4 shrink-0 text-accent ${dipilih ? "" : "invisible"}`} />
                                <span className={`block truncate text-[13.5px] ${dipilih ? "font-bold" : "font-semibold"}`}>{nama}</span>
                              </span>
                              <span className="shrink-0 rounded-md bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">{kat}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <Isi label="Nomor rekening / nomor E-Wallet" nilai={nomor} placeholder="Contoh: 1234567890" fokus={fokus === "nomor"} t={t} cur="nomor-rek" />
            </div>
            <Isi label="Nama pemilik rekening (sesuai buku tabungan / akun E-Wallet)" nilai={pemilik} placeholder="Nama lengkap pemilik rekening" fokus={fokus === "pemilik"} t={t} cur="nama-pemilik" />
            <div className="flex items-center gap-3 pt-1">
              <span data-cur="btn-gabung" className="btn btn-primary">
                <Share2 className="size-4" /> Gabung Program Afiliasi Sekarang
              </span>
            </div>
          </div>
        </section>
        <RincianKomisi judul="Rincian Komisi per Paket" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Setelah bergabung
const KOMISI = [
  ["Paket Bisnis", "ardi***@gmail.com", "2 Nov 2026"],
  ["Paket Bisnis", "nadia***@yahoo.com", "30 Okt 2026"],
  ["Paket Bisnis", "toko***@gmail.com", "26 Okt 2026"],
] as const;

export function Terdaftar({ disalin, nominal, tarikHover, diajukan, t }: { disalin: boolean; nominal: string; tarikHover: boolean; diajukan: boolean; t: number }) {
  const saldo = diajukan ? 0 : SALDO;
  const nilai = Number(nominal.replace(/[^\d]/g, "")) || 0;
  const bisa = nilai >= 50000 && nilai <= SALDO;
  void t;
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Tautan Afiliasi Anda</p>
            <h2 className="mt-1 text-lg font-bold">Bagikan & dapatkan komisi otomatis</h2>
            <p className="mt-0.5 text-[13px] text-muted">Setiap pengguna baru yang mendaftar melalui tautan Anda dan membeli paket, komisinya langsung masuk ke saldo Anda sesuai ketentuan pihak aplikasi.</p>
          </div>
          <span className="btn btn-ghost border border-line text-[12.5px]">
            <Pencil className="size-3.5" /> Ubah rekening pencairan
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
            <p className="text-[11.5px] font-semibold text-muted">Tautan ke Halaman Utama (Landing Page)</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px]">{TAUTAN_UTAMA}</code>
              <span data-cur="btn-salin-1" className="btn btn-primary shrink-0 px-3 py-2 text-[12.5px]">
                {disalin ? <Check className="size-4" /> : <Copy className="size-4" />}
                {disalin ? "Disalin" : "Salin"}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
            <p className="text-[11.5px] font-semibold text-muted">Tautan Langsung ke Pendaftaran</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px]">{TAUTAN_DAFTAR}</code>
              <span className="btn btn-ghost shrink-0 border border-line bg-surface px-3 py-2 text-[12.5px]">
                <Copy className="size-4" /> Salin
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5 text-[12.5px]">
          <span className="flex items-center gap-2 text-muted">
            <Landmark className="size-4 text-accent" />
            Rekening tujuan pencairan: <strong className="font-semibold text-fg">BCA · 1234567890</strong> a.n. <strong className="font-semibold text-fg">Rini Handayani</strong>
          </span>
          <span className="font-mono text-[12px] text-muted">Kode: {KODE_REF}</span>
        </div>
      </section>

      <section data-cur="metrik" className="grid grid-cols-4 gap-3">
        <div data-cur="metrik-saldo" className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Saldo Bisa Ditarik</span>
            <Wallet className="size-4 text-accent" />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">Rp{angka(saldo)}</p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">{diajukan ? `Rp${angka(SALDO)} sedang diproses cair` : "Sudah dicairkan Rp0"}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Total Komisi Diperoleh</span>
            <Banknote className="size-4 text-success" />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-success tabular-nums">Rp{angka(SALDO)}</p>
          <p className="mt-1 text-[12px] text-muted">Komisi pembelian pertama</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Klik Tautan & Pendaftar</span>
            <MousePointerClick className="size-4 text-accent" />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
            6 <span className="text-[14px] font-semibold text-muted">akun</span>
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">Dari 87 klik tautan unik</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Pembeli Paket</span>
            <Users className="size-4 text-accent" />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
            3 <span className="text-[14px] font-semibold text-muted">pembeli</span>
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">3 transaksi komisi tercatat</p>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-6">
        <section data-cur="form-tarik" className="card p-6">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-accent" />
            <h2 className="text-[15px] font-bold">Tarik saldo komisi (Withdraw)</h2>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            Minimal penarikan <strong className="font-semibold text-fg">Rp50.000</strong>. Dana akan dikirim ke <strong className="font-semibold text-fg">BCA (1234567890 a.n. Rini Handayani)</strong>.
          </p>
          {diajukan ? (
            <div className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-[13px] text-warning">
              Anda memiliki pengajuan penarikan sebesar <strong className="tabular-nums">Rp{angka(SALDO)}</strong> yang sedang diproses. Pengajuan baru dapat dilakukan setelah pengajuan saat ini selesai.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[13px] font-semibold text-muted">Rp</span>
                  <div className="field pl-9 tabular-nums" style={{ minHeight: 38 }}>
                    {nominal ? nominal : <span className="text-faint">Minimal 50.000</span>}
                  </div>
                </div>
                <span data-cur="btn-tarik-semua" className={`btn btn-ghost shrink-0 border border-line text-[12.5px] ${tarikHover ? "bg-subtle" : ""}`}>
                  Tarik semua (Rp{angka(SALDO)})
                </span>
                <span data-cur="btn-ajukan" className="btn btn-primary shrink-0" style={{ opacity: bisa ? 1 : 0.55 }}>
                  Ajukan penarikan
                </span>
              </div>
            </div>
          )}
        </section>
        <section className="card p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Package className="size-4 text-accent" /> Besaran Komisi per Paket
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Komisi yang Anda terima setiap kali referral membeli paket di bawah ini.</p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {PAKET.map((p) => (
              <li key={p.nama} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                <span className="font-semibold">
                  {p.nama} <span className="font-normal text-muted tabular-nums">(Rp{angka(p.harga)})</span>
                </span>
                <span className="font-bold text-success tabular-nums">
                  +Rp{angka(p.komisi)}
                  <span className="ml-1 font-normal text-muted">(20%)</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">* Besaran komisi per paket, siklus komisi (1 kali per pelanggan), serta pencairan saldo diatur oleh admin dan mengikuti ketentuan dari pihak aplikasi.</p>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">Riwayat Komisi Masuk</h2>
            <p className="text-[12px] text-muted">Otomatis tercatat saat referral Anda melunasi paket.</p>
          </div>
          <ul className="divide-y divide-line">
            {KOMISI.map(([paket, email, tgl]) => (
              <li key={email} className="flex items-center justify-between gap-3 px-5 py-3.5 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {paket} · <span className="text-muted">{email}</span>
                  </p>
                  <p className="text-[12px] text-faint tabular-nums">{tgl} · Pembelian Rp249.000 (20%)</p>
                </div>
                <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success tabular-nums">+Rp49.800</span>
              </li>
            ))}
          </ul>
        </section>
        <section data-cur="riwayat-penarikan" className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">Riwayat Penarikan Dana</h2>
            <p className="text-[12px] text-muted">Status pencairan saldo komisi ke rekening Anda.</p>
          </div>
          {diajukan ? (
            <ul className="divide-y divide-line">
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[13px]">
                <div className="min-w-0">
                  <p className="font-bold tabular-nums">
                    Rp{angka(SALDO)} <span className="font-normal text-muted">→ BCA 1234567890</span>
                  </p>
                  <p className="text-[12px] text-faint">Diajukan 11.51</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-[11.5px] font-semibold text-warning">
                  <Clock className="size-3.5" /> Menunggu diproses
                </span>
              </li>
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Belum ada riwayat penarikan komisi.</p>
          )}
        </section>
      </div>
    </div>
  );
}

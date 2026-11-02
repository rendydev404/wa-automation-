# Affiliate System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete Affiliate (Referral) program where users can self-register as affiliates, share referral links (`?ref=kode`), earn configurable per-package commissions (`persen` or `rupiah`) automatically on Midtrans and paid manual transactions, and withdraw earnings via manual transfer or Midtrans Iris Payouts.

**Architecture:** Ledger-First with atomic cached balance in PostgreSQL (`afiliator`, `komisi_afiliasi`, `penarikan_afiliasi`), 30-day `httpOnly` referral attribution cookie (`wa_ref`) handled in `proxy.ts` and registration/Google OAuth flows, and custom UI components (no native `<select>`, no emojis, solid colors).

**Tech Stack:** Next.js App Router (Server Actions + Server Components), PostgreSQL (`postgres.js`), Tailwind CSS, Lucide React icons, Midtrans Snap & Iris API.

---

### Task 1: Database Migration v15 (`src/lib/db.ts`)

**Files:**
- Modify: `src/lib/db.ts`

**Step 1: Add migration v15 to `MIGRASI` in `src/lib/db.ts`**
- Add `komisi_jenis` (`'persen' | 'rupiah'`, default `'persen'`) and `komisi_nilai` (`integer`, default `20`) to `paket`.
- Add `referred_by` (`integer REFERENCES users(id) ON DELETE SET NULL`) to `users` with partial index `users_referred_by_idx`.
- Create tables `afiliator`, `komisi_afiliasi`, and `penarikan_afiliasi` with proper constraints and composite indexes.

---

### Task 2: Core Affiliate Engine & Midtrans Iris Integration (`src/lib/afiliasi.ts` & `src/lib/midtrans.ts`)

**Files:**
- Create: `src/lib/afiliasi-def.ts`
- Create: `src/lib/afiliasi.ts`
- Modify: `src/lib/midtrans.ts`

**Step 1: Create `src/lib/afiliasi-def.ts` (client-safe constants & helpers)**
- Define `COOKIE_REF = "wa_ref"`, `UMUR_COOKIE_REF = 30 * 86400`.
- Define `DAFTAR_BANK` (BCA, Mandiri, BNI, BRI, BSI, CIMB Niaga, Permata, Seabank, Bank Jago, GoPay, OVO, DANA, ShopeePay) with Iris bank codes for automatic disbursement.
- Define `JenisKomisi = "persen" | "rupiah"`, `StatusAfiliator = "menunggu" | "aktif" | "nonaktif"`, `StatusPenarikan = "menunggu" | "selesai" | "ditolak"`.
- Define pure helper `hitungKomisiPaket(hargaBayar: number, jenis: JenisKomisi, nilai: number): number`.

**Step 2: Add Midtrans Iris Payout helper in `src/lib/midtrans.ts`**
- Add `konfigIris()` reading `MIDTRANS_IRIS_KEY` (and `MIDTRANS_MODE`).
- Add `kirimPayoutIris()` calling Midtrans Iris `/iris/api/v1/payouts` endpoint with Basic auth and idempotency key.

**Step 3: Create `src/lib/afiliasi.ts` (server-only database & business logic)**
- `pengaturanAfiliasi()` & `simpanPengaturanAfiliasi()` (`afiliasi_aktif`, `afiliasi_persetujuan`: `'otomatis' | 'manual'`, `afiliasi_siklus`: `'pertama' | 'berulang'`, `afiliasi_min_tarik`: default `50000`).
- `catatKlikReferral(kode: string)`: validates code format and increments `afiliator.klik` where `status = 'aktif'`.
- `terapkanReferral(userId: number, kode: string | undefined)`: links `users.referred_by` to the active affiliate's `user_id` (preventing self-referral).
- `daftarAfiliator(userId: number, data)`: creates affiliate profile with custom code & bank details.
- `ubahProfilAfiliator(userId: number, data)`: updates code and/or bank details.
- `prosesKomisiTransaksi(tx: Tx, info)`: runs inside the same DB transaction when a package purchase becomes `lunas` (Midtrans or paid manual admin). Checks if buyer has `referred_by`, checks `afiliasi_siklus` (`pertama` vs `berulang`), computes commission from the package's `komisi_jenis` and `komisi_nilai`, inserts into `komisi_afiliasi` (`ON CONFLICT (transaksi_id) DO NOTHING`), and atomically increments `afiliator.saldo` and `afiliator.total_komisi`.
- `ajukanPenarikan(userId: number, nominal: number)`: locks `afiliator` row (`FOR UPDATE`), verifies `status === 'aktif'` and `saldo >= nominal >= minTarik`, deducts `saldo`, and inserts `penarikan_afiliasi`.
- `prosesPenarikanAdmin(admin, id, aksi)`: handles `'manual'` (mark completed with reference/notes), `'iris'` (disburse via Midtrans Iris API then mark completed), or `'tolak'` (refund `nominal` back to `afiliator.saldo` atomically).
- Query functions for user dashboard (`ringkasanAfiliasiUser`) and admin panel (`ringkasanAfiliasiAdmin`, `daftarAfiliatorAdmin`, `daftarPenarikanAdmin`, `daftarKomisiAdmin`).

---

### Task 3: Package Commission Config & Transaction Hook (`src/lib/langganan.ts`, `src/lib/paket-custom-def.ts`, `src/lib/paket-custom.ts`)

**Files:**
- Modify: `src/lib/langganan.ts`
- Modify: `src/lib/paket-custom-def.ts`
- Modify: `src/lib/paket-custom.ts`

**Step 1: Extend `Paket` and `PaketCustom` with `komisi_jenis` and `komisi_nilai`**
- Update `KOLOM_PAKET`, `Paket`, and `simpanPaket` in `src/lib/langganan.ts`.
- Update `PaketCustom`, `BAWAAN_CUSTOM`, `rapikanCustom`, `periksaCustom` in `src/lib/paket-custom-def.ts` and `tulis` in `src/lib/paket-custom.ts` so Custom Package commission settings sync to its mirror row in `paket`.

**Step 2: Trigger `prosesKomisiTransaksi` on paid transactions**
- In `terapkanStatus` (`src/lib/langganan.ts`), after activating subscription and setting `langganan_id`, call `prosesKomisiTransaksi(tx, { transaksiId: t.id, userId: t.user_id, paketId: t.paket_id, namaPaket: t.nama_paket, jumlahBayar: t.jumlah })`.
- In `berikanPaketManual` (`src/lib/langganan.ts`), after inserting the paid transaction (`RETURNING id`), if `jumlah > 0 && o.metode !== "kompensasi"`, call `prosesKomisiTransaksi(tx, ...)`.

---

### Task 4: Referral Cookie Attribution (`src/proxy.ts`, `src/app/actions.ts`, `src/app/api/auth/google/callback/route.ts`, `src/app/api/ref/route.ts`)

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/app/actions.ts`
- Modify: `src/app/api/auth/google/callback/route.ts`

**Step 1: Capture `?ref=kode` in `src/proxy.ts` & record clicks**
- When `request.nextUrl.searchParams.get("ref")` is present on public/auth routes (`/`, `/daftar`, `/login`), validate code format (`/^[a-z0-9-]{3,24}$/`) and set cookie `wa_ref` (30 days, `httpOnly`, `sameSite: lax`).
- Also trigger click counter when user lands on `/daftar` or `/` with `?ref=`.

**Step 2: Apply referral on signup (`daftarAction` & Google OAuth callback)**
- In `daftarAction` (`src/app/actions.ts`), read `cookies().get(COOKIE_REF)?.value`, call `terapkanReferral(akun.id, refKode)`, and delete `COOKIE_REF`.
- In `/api/auth/google/callback/route.ts`, when `akun.baru` is true, read `COOKIE_REF`, call `terapkanReferral(akun.id, refKode)`, and delete `COOKIE_REF`.

---

### Task 5: Server Actions (`src/app/actions.ts`)

**Files:**
- Modify: `src/app/actions.ts`

**Step 1: Add User & Admin Affiliate Server Actions**
- `daftarAfiliasiAction`: User joins affiliate program (custom code + bank details).
- `ubahAfiliasiAction`: User updates referral code or bank details.
- `tarikKomisiAction`: User requests withdrawal.
- `adminAturanAfiliasiAction`: Admin updates affiliate program settings.
- `adminStatusAfiliatorAction`: Admin approves / activates / deactivates an affiliate.
- `adminProsesPenarikanAction`: Admin processes withdrawal (`manual`, `iris`, or `tolak`).
- Update `adminPaketAction` to save `komisi_jenis` and `komisi_nilai`.

---

### Task 6: Custom UI Components & Pages (User `/afiliasi` & Admin `/admin/afiliasi` + `/admin/paket`)

**Files:**
- Create: `src/components/pilih-opsi.tsx` (Reusable Custom Dropdown component — no native `<select>`)
- Create: `src/app/(app)/afiliasi/page.tsx`
- Create: `src/app/(app)/afiliasi/form-afiliasi.tsx`
- Create: `src/app/(admin)/admin/afiliasi/page.tsx`
- Create: `src/app/(admin)/admin/afiliasi/form-afiliasi-admin.tsx`
- Modify: `src/components/navigasi.tsx` (Add "Afiliasi" menu item with `Share2` icon)
- Modify: `src/app/(admin)/admin/nav-admin.tsx` (Add "Afiliasi" menu item with `Share2` icon)
- Modify: `src/app/(admin)/admin/form-admin.tsx` & `src/app/(admin)/admin/bagian.tsx` & `src/app/(admin)/admin/paket-custom.tsx` (Add commission controls per package)

---

### Task 7: Automated Tests & Build Verification (`uji/uji-afiliasi.mjs`)

**Files:**
- Create: `uji/uji-afiliasi.mjs`

**Step 1: Write and run comprehensive integration test `uji/uji-afiliasi.mjs` + `npm run build`**
- Test affiliate registration, referral attribution, per-package commission calculation (`persen` and `rupiah`), `pertama` vs `berulang` commission cycles, Midtrans & manual admin payment commission triggers, idempotency, withdrawal request, manual payout approval, and withdrawal rejection (balance refund).

// Uji fungsional & keamanan end-to-end (browser sungguhan) terhadap server dari mulai.mjs. Mulai dari database kosong.
const { chromium } = require("playwright");
const fs = require("fs");
const B = process.env.B || "http://127.0.0.1:3999";
const hasil = [];
const kasus = async (id, nama, fn) => {
  const t0 = Date.now();
  try { const ket = await fn(); hasil.push({ id, nama, ok: true, ket: ket || "", ms: Date.now() - t0 }); }
  catch (e) { hasil.push({ id, nama, ok: false, ket: String(e.message || e).split("\n")[0].slice(0, 200), ms: Date.now() - t0 }); }
  const h = hasil.at(-1); console.log(`${h.ok ? "LULUS" : "GAGAL"} ${id} ${nama}${h.ket ? " — " + h.ket : ""}`);
};
const harus = (k, pesan) => { if (!k) throw new Error(pesan); };
const acak = Date.now().toString(36);
(async () => {
  const br = await chromium.launch();
  const baru = async () => { const c = await br.newContext({ locale: "id-ID" }); return [c, await c.newPage()]; };
  const masuk = async (p, email, pw) => {
    await p.goto(B + "/login"); await p.fill("#email", email); await p.fill("#password", pw);
    await p.click("button[type=submit]");
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  };
  const daftar = async (p, nama, email, pw) => {
    await p.goto(B + "/daftar"); await p.fill("#nama", nama); await p.fill("#email", email); await p.fill("#password", pw); await p.fill("#ulang", pw);
    await p.check("input[name=setuju]"); await p.click("button[type=submit]");
    await p.waitForURL((u) => !u.pathname.startsWith("/daftar"), { timeout: 15000 });
  };
  const PW = "RahasiaUji#2026";
  const tutupTur = async (p) => { const t = p.getByRole("button", { name: "Tutup panduan" }); try { await t.waitFor({ timeout: 2500 }); await t.click(); } catch {} };
  const budiEmail = `budi-${acak}@uji.test`, sariEmail = `sari-${acak}@uji.test`;
  const [cBudi, budi] = await baru();
  let nomorId;

  await kasus("F-01", "Pendaftaran akun baru lewat /daftar", async () => { await daftar(budi, "Budi Uji", budiEmail, PW); return "diarahkan ke " + new URL(budi.url()).pathname; });
  await kasus("F-02", "Validasi daftar: password tidak sama ditolak", async () => {
    const [c, p] = await baru(); await p.goto(B + "/daftar");
    await p.fill("#nama", "X Uji"); await p.fill("#email", `x-${acak}@uji.test`); await p.fill("#password", PW); await p.fill("#ulang", PW + "beda");
    await p.check("input[name=setuju]"); await p.click("button[type=submit]"); await p.waitForTimeout(1500);
    harus(new URL(p.url()).pathname === "/daftar", "akun tetap dibuat"); const t = await p.locator("form").innerText(); await c.close(); return t.split("\n").find((l) => /sama|cocok/i.test(l)) || "tetap di /daftar";
  });
  await kasus("F-03", "Tambah nomor WhatsApp (dialog → halaman nomor + QR)", async () => {
    await budi.goto(B + "/dashboard"); await budi.getByRole("button", { name: "Tambah nomor" }).first().click();
    await budi.fill("input[name=label]", "CS Uji"); await budi.getByRole("button", { name: /Buat & tampilkan QR/ }).click();
    await budi.waitForURL(/\/nomor\/\d+/, { timeout: 20000 }); nomorId = Number(budi.url().match(/\/nomor\/(\d+)/)[1]); return "nomor id " + nomorId;
  });
  await kasus("F-04", "Tambah base knowledge (teks) dan tampil di daftar", async () => {
    await budi.goto(`${B}/nomor/${nomorId}`, { waitUntil: "networkidle" }); await tutupTur(budi);
    await budi.getByRole("tab", { name: "Tulis teks" }).click();
    await budi.fill("#judul", "Info usaha uji"); await budi.fill("#isi", "Kami buka setiap hari pukul 09.00 sampai 21.00. Harga paket A Rp25.000.");
    await budi.getByRole("button", { name: "Tambahkan" }).click(); await budi.waitForTimeout(2500);
    harus(await budi.getByText("Info usaha uji").count() > 0, "dokumen tidak muncul"); return "dokumen tersimpan";
  });
  await kasus("F-05", "Histori percakapan tampil + info penghapusan otomatis 30 hari", async () => {
    harus(await budi.getByText("Histori percakapan").count() > 0, "panel histori tidak ada");
    harus(await budi.getByText(/disimpan 30 hari/).count() > 0, "info 30 hari tidak ada"); return "ada";
  });
  await kasus("F-06", "Batas topik/instruksi nomor dapat disimpan (Pengaturan)", async () => {
    await tutupTur(budi); const n = await budi.locator("textarea[name=instruksi]").count(); harus(n > 0, "kolom instruksi tidak ditemukan");
    await budi.locator("textarea[name=instruksi]").first().fill("Jawab singkat dan sopan.");
    const form = budi.locator("form", { has: budi.locator("textarea[name=instruksi]") }).first();
    await form.locator("button[type=submit]").first().click(); await budi.waitForTimeout(2000);
    await budi.reload({ waitUntil: "networkidle" }); const v = await budi.locator("textarea[name=instruksi]").first().inputValue();
    harus(v.includes("Jawab singkat"), "nilai tidak tersimpan"); return "tersimpan setelah reload";
  });

  const [cSari, sari] = await baru();
  await kasus("S-01", "Kontrol akses: pengguna lain tidak bisa membuka nomor milik orang lain (IDOR)", async () => {
    await daftar(sari, "Sari Uji", sariEmail, PW);
    const r = await sari.goto(`${B}/nomor/${nomorId}`); const t = await sari.locator("body").innerText();
    await sari.getByText("Nomor tidak ditemukan").waitFor({ timeout: 8000 });
    harus(!(await sari.content()).includes("CS Uji"), "data nomor bocor di HTML"); return `ditampilkan "Nomor tidak ditemukan" (HTTP ${r.status()} karena streaming), data tidak terkirim`;
  });
  await kasus("S-02", "Kontrol akses API: histori nomor orang lain ditolak", async () => {
    const r = await sari.request.get(`${B}/api/percakapan?number_id=${nomorId}`); harus(r.status() === 404 || r.status() === 403, `status ${r.status()}`); return `status ${r.status()}`;
  });
  await kasus("S-03", "Pengguna biasa tidak bisa membuka panel admin", async () => {
    await sari.goto(`${B}/admin`); const p = new URL(sari.url()).pathname; const t = await sari.locator("body").innerText();
    harus(!p.startsWith("/admin") || /tidak ditemukan|404/i.test(t), "panel admin terbuka untuk pengguna biasa"); return p.startsWith("/admin") ? "ditolak (halaman 404)" : "dialihkan ke " + p;
  });
  await kasus("S-04", "CSRF: POST API dari origin lain ditolak", async () => {
    const r = await sari.request.post(`${B}/api/knowledge/upload`, { headers: { Origin: "https://jahat.example" }, multipart: { number_id: String(nomorId) } });
    harus(r.status() === 403, `status ${r.status()}`); return `status ${r.status()}`;
  });
  await kasus("S-05", "Cookie sesi HttpOnly + SameSite", async () => {
    const k = (await cBudi.cookies()).find((c) => c.name === "wa_sesi"); harus(k, "cookie tidak ada");
    harus(k.httpOnly && (k.sameSite === "Lax" || k.sameSite === "Strict"), JSON.stringify(k)); return `httpOnly=${k.httpOnly} sameSite=${k.sameSite} secure=${k.secure} (secure aktif di HTTPS)`;
  });

  const [cAdm, adm] = await baru();
  await kasus("F-07", "Admin login & melihat daftar pengguna", async () => {
    await masuk(adm, "admin@uji.test", "AdminUji#2026"); await adm.goto(`${B}/admin/pengguna?cari=${encodeURIComponent(budiEmail)}`);
    harus(await adm.getByText(budiEmail).count() > 0, "pengguna baru tidak terlihat"); return "ada";
  });
  await kasus("F-08", "Admin memilih penyedia AI per akun (Hermes)", async () => {
    await adm.getByRole("link", { name: `Kelola ${budiEmail}` }).click(); await adm.waitForURL(/\/admin\/pengguna\/\d+/); await tutupTur(adm);
    await adm.locator("label", { hasText: /^Hermes$/ }).click(); await adm.locator("form", { hasText: "Penyedia AI untuk semua nomor" }).getByRole("button", { name: "Simpan" }).click();
    await adm.getByText(/kini dijawab Hermes/).waitFor({ timeout: 8000 }); return "tersimpan";
  });
  await kasus("F-09", "Admin mengatur kuota perangkat pengguna", async () => {
    await adm.fill("#kuota", "2"); await adm.locator("form", { has: adm.locator("#kuota") }).getByRole("button", { name: "Simpan" }).click();
    await adm.getByText("Tersimpan.").first().waitFor({ timeout: 8000 }); return "tersimpan";
  });
  await kasus("S-06", "Blokir akun: sesi pengguna langsung dicabut", async () => {
    await adm.goto(`${B}/admin/pengguna?cari=${encodeURIComponent(sariEmail)}`); await adm.getByRole("link", { name: `Kelola ${sariEmail}` }).click();
    await adm.waitForURL(/\/admin\/pengguna\/\d+/); await adm.fill("#alasan", "Uji blokir"); await adm.getByRole("button", { name: "Blokir akun" }).click();
    await adm.getByText(/Akun diblokir/).first().waitFor({ timeout: 8000 });
    await sari.goto(`${B}/dashboard`); await sari.waitForURL(/\/login/, { timeout: 8000 }); return "dialihkan ke /login";
  });
  await kasus("S-07", "Akun diblokir tidak bisa login", async () => {
    await sari.fill("#email", sariEmail); await sari.fill("#password", PW); await sari.click("button[type=submit]"); await sari.waitForTimeout(2000);
    harus(new URL(sari.url()).pathname === "/login", "berhasil masuk"); return (await sari.locator("form").innerText()).split("\n").find((l) => /blokir/i.test(l)) || "ditolak";
  });
  await kasus("F-10", "Logout menghapus sesi", async () => {
    await budi.goto(`${B}/dashboard`); await budi.getByRole("button", { name: /Keluar/ }).first().click(); await budi.waitForURL(/\/login|\/$/, { timeout: 10000 });
    await budi.goto(`${B}/dashboard`); await budi.waitForURL(/\/login/, { timeout: 8000 }); return "dialihkan ke /login";
  });
  await kasus("S-08", "Password salah ditolak dengan pesan umum (tidak membocorkan akun)", async () => {
    const [c, p] = await baru(); await p.goto(B + "/login"); await p.fill("#email", budiEmail); await p.fill("#password", "salah-sekali-123"); await p.click("button[type=submit]");
    await p.waitForTimeout(1500); const a = await p.locator("form").innerText();
    await p.fill("#email", `tidakada-${acak}@uji.test`); await p.fill("#password", "salah-sekali-123"); await p.click("button[type=submit]"); await p.waitForTimeout(1500);
    const b = await p.locator("form").innerText(); await c.close();
    const pa = a.split("\n").find((l) => /salah|tidak/i.test(l)), pb = b.split("\n").find((l) => /salah|tidak/i.test(l));
    harus(pa && pa === pb, `pesan berbeda: "${pa}" vs "${pb}"`); return pa;
  });
  await kasus("S-09", "Pembatasan percobaan login (brute force) per IP", async () => {
    const [c, p] = await baru(); let pesan = "";
    for (let i = 0; i < 12; i++) { await p.goto(B + "/login"); await p.fill("#email", `tebak${i}-${acak}@uji.test`); await p.fill("#password", "tebak-tebak-" + i); await p.click("button[type=submit]"); await p.waitForTimeout(700); pesan = await p.locator("form").innerText(); if (/Terlalu banyak/i.test(pesan)) { await c.close(); return `dibatasi setelah 10 percobaan / 5 menit per IP (tercapai di percobaan ke-${i + 1} skrip ini, termasuk percobaan uji sebelumnya)`; } }
    await c.close(); throw new Error("tidak ada pembatasan setelah 12 percobaan");
  });
  await kasus("S-10", "Header CF-Connecting-IP palsu tidak bisa melewati batas percobaan login", async () => {
    const c = await br.newContext({ extraHTTPHeaders: { "CF-Connecting-IP": "203.0.113." + Math.floor(Math.random() * 250) } }); const p = await c.newPage();
    await p.goto(B + "/login"); await p.fill("#email", `palsu-${acak}@uji.test`); await p.fill("#password", "tebak-palsu-1"); await p.click("button[type=submit]"); await p.waitForTimeout(1000);
    const t = await p.locator("form").innerText(); await c.close(); harus(/Terlalu banyak/i.test(t), "batas terlewati dengan IP palsu"); return "tetap dibatasi";
  });
  await kasus("S-11", "Header keamanan HTTP (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy)", async () => {
    const r = await fetch(B + "/login"); const h = (k) => r.headers.get(k);
    const kurang = ["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"].filter((k) => !h(k));
    harus(!kurang.length && !h("x-powered-by"), "kurang: " + kurang.join(", ")); return "lengkap, X-Powered-By disembunyikan";
  });
  await br.close();
  fs.writeFileSync("hasil-e2e.json", JSON.stringify(hasil, null, 1));
  console.log(`\n${hasil.filter((h) => h.ok).length}/${hasil.length} lulus`);
})();

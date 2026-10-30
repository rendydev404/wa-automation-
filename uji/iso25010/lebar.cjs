// Tampilan di 5 lebar layar (320-1920 px): tidak boleh ada gulir horizontal. Jalankan setelah e2e.cjs (butuh nomor 1).
const { chromium } = require("playwright"); const fs = require("fs");
const B = "http://127.0.0.1:3999";
(async () => {
  const br = await chromium.launch(); const out = [];
  for (const w of [320, 414, 768, 1024, 1920]) {
    const c = await br.newContext({ viewport: { width: w, height: 800 }, extraHTTPHeaders: { "X-Forwarded-For": "10.9.8." + (w % 250) } }); const p = await c.newPage();
    const cek = async (u) => { await p.goto(B + u, { waitUntil: "networkidle" }); const l = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); out.push({ w, u, luap: l }); };
    for (const u of ["/", "/login", "/daftar"]) await cek(u);
    await p.goto(B + "/login"); await p.fill("#email", "admin@uji.test"); await p.fill("#password", "AdminUji#2026"); await p.click("button[type=submit]"); await p.waitForURL((x) => !x.pathname.startsWith("/login"));
    for (const u of ["/dashboard", "/nomor/1", "/langganan", "/akun", "/admin", "/admin/pengguna", "/admin/pengguna/2", "/admin/paket", "/admin/ai"]) await cek(u);
    if (w === 320) 
    await c.close();
  }
  await br.close(); fs.writeFileSync("hasil-lebar.json", JSON.stringify(out));
  const buruk = out.filter((x) => x.luap > 0); console.log(`${out.length} kombinasi halaman×lebar, luapan horizontal: ${buruk.length}`, JSON.stringify(buruk));
})();

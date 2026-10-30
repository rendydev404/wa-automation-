// Jelajah semua halaman: waktu muat, galat konsol, pelanggaran aksesibilitas (axe, WCAG 2.1 AA), luapan horizontal di HP.
const { chromium } = require("playwright");
const fs = require("fs");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const B = "http://127.0.0.1:3999";
const HAL_PUBLIK = ["/", "/login", "/daftar"];
const HAL_AKUN = ["/dashboard", "/akun", "/langganan", "/admin", "/admin/pengguna", "/admin/ai", "/admin/paket", "/admin/transaksi", "/admin/log", "/admin/aturan", "/admin/pembayaran"];
(async () => {
  const extra = (process.argv[2] || "").split(",").filter(Boolean);
  const browser = await chromium.launch();
  const hasil = [];
  for (const [label, vp] of [["desktop", { width: 1366, height: 800 }], ["hp", { width: 375, height: 740 }]]) {
    const ctx = await browser.newContext({ viewport: vp, locale: "id-ID", extraHTTPHeaders: { "X-Forwarded-For": "10.9.9." + (label === "hp" ? 2 : 1) } });
    const page = await ctx.newPage();
    const galat = [];
    page.on("console", (m) => m.type() === "error" && galat.push(m.text()));
    page.on("pageerror", (e) => galat.push("pageerror: " + e.message));
    const periksa = async (url) => {
      galat.length = 0;
      const t0 = Date.now();
      const r = await page.goto(B + url, { waitUntil: "networkidle" });
      const ms = Date.now() - t0;
      await page.addScriptTag({ content: AXE });
      const axe = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, contoh: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) }));
      });
      const luap = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      
      hasil.push({ label, url: page.url().replace(B, ""), minta: url, status: r.status(), ms, galat: [...galat], axe, luap });
    };
    for (const u of HAL_PUBLIK) await periksa(u);
    await page.goto(B + "/login");
    await page.fill("#email", "admin@uji.test");
    await page.fill("#password", "AdminUji#2026");
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }), page.click("button[type=submit]")]);
    for (const u of [...HAL_AKUN, ...extra]) await periksa(u);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync("hasil-jelajah.json", JSON.stringify(hasil, null, 1));
  for (const h of hasil) console.log(`${h.label.padEnd(7)} ${h.minta.padEnd(22)} ${h.status} ${String(h.ms).padStart(5)}ms galat=${h.galat.length} axe=${h.axe.map((a) => `${a.id}(${a.impact},${a.n})`).join(",") || "-"} luap=${h.luap}${h.url !== h.minta ? " -> " + h.url : ""}`);
})();

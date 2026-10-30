// Uji beban: 20 koneksi serentak x 10 detik per endpoint, memori (RSS) proses server dipantau.
const autocannon = require("autocannon"); const fs = require("fs"); const { chromium } = require("playwright");
async function ambilKuki() {
  const b = await chromium.launch(); const c = await b.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "10.9.9.7" } }); const p = await c.newPage();
  await p.goto("http://127.0.0.1:3999/login"); await p.fill("#email", "admin@uji.test"); await p.fill("#password", "AdminUji#2026");
  await p.click("button[type=submit]"); await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  const k = (await c.cookies()).find((x) => x.name === "wa_sesi"); await b.close(); return `wa_sesi=${k.value}`;
}
const target = [
  ["GET /api/health", "/api/health", false],
  ["GET / (landing)", "/", false],
  ["GET /login", "/login", false],
  ["GET /dashboard (login)", "/dashboard", true],
  ["GET /api/wa/status (login)", "/api/wa/status", true],
  ["GET /api/percakapan (login)", "/api/percakapan?number_id=1&ringkasan=1", true],
];
(async () => {
  const kuki = await ambilKuki();
  const pid = Number(require("child_process").execSync("pgrep -f '^next-server' | head -1").toString().trim());
  const rss = () => Math.round(Number(fs.readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/)[1]) / 1024);
  const hasil = []; const rssAwal = rss(); let rssPuncak = rssAwal;
  for (const [nama, jalur, auth] of target) {
    const t = setInterval(() => (rssPuncak = Math.max(rssPuncak, rss())), 250);
    const r = await autocannon({ url: "http://127.0.0.1:3999" + jalur, connections: 20, duration: 10, headers: auth ? { cookie: kuki } : {} });
    clearInterval(t);
    const x = { nama, rps: Math.round(r.requests.average), p50: r.latency.p50, p90: r.latency.p90, p99: r.latency.p99, maks: r.latency.max, galat: r.errors + r.timeouts + r.non2xx, total: r.requests.total };
    hasil.push(x); console.log(JSON.stringify(x));
  }
  const out = { hasil, rssAwal, rssPuncak, rssAkhir: rss(), cpu: require("os").cpus().length + " vCPU " + require("os").cpus()[0].model };
  fs.writeFileSync("hasil-beban.json", JSON.stringify(out, null, 1)); console.log(out.rssAwal, out.rssPuncak, out.rssAkhir, out.cpu);
})();

/**
 * HTML landing page per industri (port dari paket chatgercep-lp: src/template.mjs). Satu template untuk semua industri;
 * isi per industri dari lp/industri/<slug>.json. Harga paket, paket Custom, dan ID Meta Pixel TIDAK ditulis tetap di sini:
 * datang dari pengaturan admin saat permintaan (src/lib/lp/halaman.ts), jadi LP selalu sama dengan harga yang bisa dibeli.
 *
 * Seluruh teks dari JSON di-escape. Skrip runtime (lp/aset/lp.js) hanya memakai textContent / teks ter-escape.
 */
import { MASA_ID, syaratJaminan } from "@/lib/jaminan-def";
import { tingkatPaket } from "@/lib/tingkat-paket";
import { UMUR_HISTORI_HARI } from "@/lib/format";
import { MEREK, NOMOR_WA_DEMO, NOMOR_WA_TAMPIL, PERUSAHAAN } from "@/lib/merek";
import type { IndustriLp } from "./industri";

const LOGO_PATH = "M23.74 76.26A50 40.5 0 1 1 85.06 70.68L50 98.6L50 79.8L36.9 79.8L64.45 52.25L72.3 60.1L79.12 29.22L48.25 36.05L56.1 43.9Z";
export const logoSvg = (cls = ""): string =>
  `<svg viewBox="0 0 100 100" aria-hidden="true" class="${cls}"><path d="${LOGO_PATH}" fill="currentColor"/><circle cx="94.76" cy="75.68" r="4.68" fill="currentColor"/></svg>`;

const P = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const IKON: Record<string, string> = {
  box: P('<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  shirt: P('<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 01-8 0z"/>'),
  sparkle: P('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/>'),
  car: P('<path d="M5 17h14M5 17a2 2 0 11-4 0v-4l2-5a2 2 0 012-1h10a2 2 0 012 1l2 5v4a2 2 0 11-4 0"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M3 12h18"/>'),
  flask: P('<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21h11.6a2 2 0 001.7-2.5L14 9V3"/><path d="M7 15h10"/>'),
  wrench: P('<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z"/>'),
  truck: P('<path d="M1 4h13v12H1zM14 8h4l3 4v4h-7"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/>'),
  plane: P('<path d="M17.8 19.2L16 11l3.5-3.5a2.1 2.1 0 00-3-3L13 8 4.8 6.2 3.3 7.7l6.7 3.8-3 3H4.5L3 16l4 1 1 4 1.5-1.5V17l3-3 3.8 6.7z"/>'),
  utensils: P('<path d="M3 2v7a3 3 0 003 3v10M9 2v7a3 3 0 01-3 3M6 2v5M21 15V2a5 5 0 00-5 5v6a2 2 0 002 2h3zm0 0v7"/>'),
  check: P('<path d="M20 6L9 17l-5-5"/>'),
  bolt: P('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),
  clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  repeat: P('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  target: P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  hand: P('<path d="M18 11V6a2 2 0 00-4 0v5M14 10V4a2 2 0 00-4 0v6M10 10.5V6a2 2 0 00-4 0v8"/><path d="M18 8a2 2 0 014 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 012.8-2.8L7 15"/>'),
  chat: P('<path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.4A8 8 0 1121 12z"/>'),
  book: P('<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z"/><path d="M20 17v4H6.5"/>'),
  reply: P('<path d="M9 17l-5-5 5-5"/><path d="M20 18v-2a4 4 0 00-4-4H4"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
  shield: P('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),
  arrow: P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  play: P('<path d="M6 4l14 8-14 8V4z"/>'),
  // Ikon kartu harga, sama dengan landing utama (lucide Rocket/Trophy/Crown/Flame).
  rocket: P('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'),
  trophy: P('<path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/>'),
  crown: P('<path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"/>'),
  flame: P('<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 002.5 2.5z"/>'),
  chatWa: P('<path d="M7.9 20A9 9 0 104 16.1L2 22z"/>'),
};
const IKON_MANFAAT = ["bolt", "clock", "repeat", "info", "target", "hand"];

const esc = (s: unknown = ""): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const rp = (n: number) => "Rp" + n.toLocaleString("id-ID");
const fmt = (n: number) => n.toLocaleString("id-ID");
/** JSON di dalam <script>: "<" di-escape supaya teks seperti "</script>" tidak menutup tag. */
const jsonAman = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Nomor WhatsApp ChatGerCep (sama dengan tombol "Coba Tes Bot WA" di landing utama). */
const URL_CS = `https://wa.me/${NOMOR_WA_DEMO}`;
const urlCs = (teks: string) => `${URL_CS}?text=${encodeURIComponent(teks)}`;
export const TEKS_GARANSI = `Garansi uang kembali 100% dengan periode pengajuan ${MASA_ID} sesuai syarat dan ketentuan.`;

export interface PaketLp {
  kode: string;
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
  deskripsi: string;
  unggulan: boolean;
}

export interface CustomLp {
  nama: string;
  label: string; // harga (Rp…) atau teks bebas seperti "Hubungi kami"
  catatan: string;
  poin: string;
  tombol: string;
  href: string;
  luar: boolean; // tautan WhatsApp (tab baru)
}

export interface DataLp {
  paket: PaketLp[];
  custom: CustomLp | null;
  metaPixelId: string;
  /** Ada berkas public/lp-assets/og/<slug>.png. */
  adaOg: boolean;
  asal: string; // https://chatgercep.com
  css: string;
  js: string;
}

const kepalaFont = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;

export function renderLp(ind: IndustriLp, semua: IndustriLp[], d: DataLp): string {
  const t = ind.theme;
  const canonical = `${d.asal}/${ind.slug}`;
  const reg = "/daftar";
  const termurah = d.paket.length ? d.paket.reduce((a, b) => (b.harga < a.harga ? b : a)) : null;
  const ikonInd = IKON[t.icon] ?? IKON.chat;

  const cards = ind.hero.cards
    .map(
      (c) => `
      <div class="fcard ${esc(c.pos)}" aria-hidden="true"><small>${esc(c.kicker)}</small><b>${esc(c.title)}</b><ul>${c.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`,
    )
    .join("");

  const heroVisual = ind.image_assets.hero
    ? `<div class="stage-photo"><img src="${esc(ind.image_assets.hero)}" alt="${esc(ind.image_assets.hero_alt)}" width="720" height="900" fetchpriority="high"></div>`
    : `<div class="stage-art" aria-hidden="true">${(
        [
          ["8%", "10%", 120],
          ["64%", "62%", 160],
          ["70%", "8%", 70],
          ["14%", "70%", 80],
        ] as const
      )
        .map(([x, y, s]) => `<span class="art-icon" style="left:${x};top:${y};width:${s}px;height:${s}px">${ikonInd}</span>`)
        .join("")}</div>`;

  const phone = (id: string, label: string) => `
      <div class="phone" role="img" aria-label="${esc(label)}">
        <span class="sim-tag">Simulasi percakapan</span>
        <div class="phone-screen">
          <div class="wa-head"><span class="wa-av">${esc(ind.demo_conversations.business_initials)}</span><div><b>${esc(ind.demo_conversations.business_name)}</b><small>online · dibalas AI</small></div></div>
          <div class="wa-body" id="${id}" aria-live="polite"></div>
          <div class="wa-foot"><div>Ketik pesan</div></div>
        </div>
      </div>`;

  const pains = ind.pain_points
    .map(
      (p, i) => `
        <article class="pain rv"><span class="n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></article>`,
    )
    .join("");

  const maps = ind.solutions.map((s) => `<div class="map rv"><b>${esc(s.pain)}</b><p>${esc(s.answer)}</p></div>`).join("");

  const flow = (
    [
      ["chat", "Pelanggan mengirim chat"],
      ["book", "AI membaca knowledge usaha Anda"],
      ["reply", "AI memberikan jawaban"],
      ["repeat", "Pelanggan melanjutkan percakapan"],
      ["user", "Admin mengambil alih bila diperlukan"],
    ] as const
  )
    .map(([ic, tx]) => `<li>${IKON[ic]}<span>${tx}</span></li>`)
    .join("");

  const tabs = ind.demo_conversations.scenarios
    .map((s, i) => {
      const awal = s.messages[0]?.text ?? "";
      return `
          <button class="tab" role="tab" aria-selected="${i === 0}" aria-controls="demo-wa"><span class="k">${i + 1}</span><span>${esc(s.label)}<small>${esc(awal.slice(0, 46))}${awal.length > 46 ? "…" : ""}</small></span></button>`;
    })
    .join("");

  const bens = ind.benefits
    .map(
      (b, i) => `
        <div class="ben rv"><span class="ic">${IKON[IKON_MANFAAT[i % IKON_MANFAAT.length]]}</span><div><h3>${esc(b.title)}</h3><p>${esc(b.body)}</p></div></div>`,
    )
    .join("");

  const steps = [
    ["Daftar dan pilih paket", "Buat akun dalam satu menit. 1 nomor bisa disambungkan untuk setup dan uji bot sebelum berlangganan."],
    ["Sambungkan WhatsApp lewat QR", "Buka WhatsApp → Perangkat tertaut → scan. Nomor tetap sama, HP tetap bisa dipakai."],
    [`Isi info ${ind.industry_short}`, "Katalog, daftar harga, FAQ, jam buka, dan aturan usaha Anda."],
    // Pemilih template di pengaturan nomor (src/components/instruksi-nomor.tsx), isi dari lp/prompt/<slug>.md.
    [`Pilih template AI ${ind.industry_name}`, "Gaya bicara, pertanyaan kualifikasi, dan batasan sudah disiapkan untuk industri Anda."],
    ["Uji percakapan", "Coba tanya seperti pelanggan, lalu rapikan knowledge sampai jawabannya pas."],
    ["Aktifkan AI", "AI mulai membantu melayani pelanggan. Anda bisa mengambil alih kapan saja."],
  ]
    .map(([h, p]) => `<div class="step rv"><div><h3>${esc(h)}</h3><p>${esc(p)}</p></div></div>`)
    .join("");

  // Kartu harga = tampilan "Pilih paket" landing utama (src/components/landing/harga.tsx + kartu-custom.tsx varian landing).
  const IKON_TINGKAT: Record<string, string> = { starter: IKON.rocket, bisnis: IKON.trophy, pro: IKON.crown };
  const kartuPaket = d.paket
    .map((p) => {
      const ikon = IKON_TINGKAT[tingkatPaket(p.kode, p.nama) ?? ""] ?? IKON.sparkle;
      const poin = [
        `${fmt(p.kuota_nomor)} nomor WhatsApp`,
        `${fmt(p.kuota_balasan)} balasan AI/${p.durasi_hari} hari`,
        "Product knowledge & belajar dari balasanmu",
        `Histori percakapan ${UMUR_HISTORI_HARI} hari & statistik`,
      ];
      return `
        <article class="hg-kartu${p.unggulan ? " top" : ""} rv">${p.unggulan ? `<span class="hg-tag">${IKON.flame}Paling Banyak Dipilih</span>` : ""}
          <div class="hg-judul"><span class="hg-ikon">${ikon}</span><div><h3>${esc(p.nama)}</h3>${p.deskripsi ? `<p>${esc(p.deskripsi)}</p>` : ""}</div></div>
          <p class="hg-harga"><b>${rp(p.harga)}</b><span>/${p.durasi_hari} hari</span></p>
          <ul>${poin.map((x) => `<li><span class="hg-cek">${IKON.check}</span>${esc(x)}</li>`).join("")}</ul>
          <a class="hg-btn${p.unggulan ? " utama" : ""}" href="${reg}" data-cta="plan_${esc(p.kode)}" data-plan="${esc(p.kode)}" data-value="${p.harga}">Langsung Aktif Sekarang ${IKON.arrow}</a>
        </article>`;
    })
    .join("");
  const c = d.custom;
  const kartuCustom = c
    ? `
        <article class="hg-custom rv">
          <div><span class="hg-lencana">${esc(c.nama)}</span>${c.catatan ? `<p class="hg-cat">${esc(c.catatan)}</p>` : ""}<p class="hg-label">${esc(c.label)}</p></div>
          <ul><li><span class="hg-cek">${IKON.check}</span>${esc(c.poin)}</li></ul>
          <a class="hg-btn" href="${esc(c.href)}" data-cta="plan_custom"${c.luar ? ' target="_blank" rel="noopener"' : ""}>${c.luar ? IKON.chatWa : ""}${esc(c.tombol)}</a>
        </article>`
    : "";
  const syarat = syaratJaminan((id) => id)
    .map((x, i) => `<li><span>${i + 1}</span>${esc(x)}</li>`)
    .join("");
  const kotakGaransi = `
        <div class="hg-garansi rv" id="garansi">
          <div class="hg-g-atas">
            <div class="hg-g-kiri"><span class="hg-perisai">${IKON.shield}</span><p><span>Garansi uang kembali</span><b>${esc(MASA_ID)}</b></p></div>
            <i aria-hidden="true"></i>
            <div class="hg-g-teks"><p><strong>Coba langsung, tanpa trial.</strong></p><p>Jika dalam ${esc(MASA_ID)} pertama ChatGerCep tidak gercep atau tidak sesuai yang kami janjikan, <mark>uang kamu kami kembalikan 100%.</mark></p></div>
          </div>
          <div class="hg-g-syarat"><p>Syarat &amp; ketentuan garansi</p><ol>${syarat}</ol></div>
        </div>`;
  const jumlahKartu = d.paket.length + (c ? 1 : 0);

  const faq = ind.faq
    .map(
      (f) => `
        <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`,
    )
    .join("");

  const lain = semua
    .filter((x) => x.slug !== ind.slug)
    .map((x) => `<a href="/${x.slug}">${esc(x.industry_name)}</a>`)
    .join(" · ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: `${MEREK} untuk ${ind.industry_name}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: d.paket.map((p) => ({ "@type": "Offer", name: p.nama, price: p.harga, priceCurrency: "IDR" })),
        url: canonical,
        publisher: { "@type": "Organization", name: PERUSAHAAN },
      },
      { "@type": "FAQPage", mainEntity: ind.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };

  const runtime = {
    industry: ind.slug,
    landing_page: "/" + ind.slug,
    content_name: ind.cta_tracking.content_name,
    tracking: { meta_pixel_id: d.metaPixelId, tiktok_pixel_id: "", ga4_id: "" },
    demo: ind.demo_conversations.scenarios,
  };

  const og = d.adaOg
    ? `<meta property="og:image" content="${d.asal}/lp-assets/og/${ind.slug}.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">`
    : `<meta name="twitter:card" content="summary">`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(ind.seo_metadata.title)}</title>
<meta name="description" content="${esc(ind.seo_metadata.description)}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#0b1813">
<meta property="og:type" content="website">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="${MEREK}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(ind.seo_metadata.og_title)}">
<meta property="og:description" content="${esc(ind.seo_metadata.og_description)}">
${og}
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-icon.png">
${kepalaFont}
<style>${d.css}</style>
<script type="application/ld+json">${jsonAman(jsonLd)}</script>
</head>
<body style="--ind:${esc(t.accent)};--ind-soft:${esc(t.accent_soft)};--ind-ink:${esc(t.accent_ink)};--ind-glow:${esc(t.glow)}">
<a class="sr" href="#main">Langsung ke konten</a>
<header class="top">
  <div class="wrap">
    <a class="logo" href="/" aria-label="${MEREK}, ke beranda">${logoSvg()}<b>Chat<span>GerCep</span></b></a>
    <nav aria-label="Navigasi"><a class="hide-sm" href="#demo">Demo</a><a class="hide-sm" href="#harga">Harga</a><a href="/login">Masuk</a><a class="nav-cta" href="${reg}" data-cta="nav_daftar">Daftar</a></nav>
  </div>
</header>

<main id="main">
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <span class="badge">${ikonInd}${esc(ind.hero.badge)}</span>
      <h1>${esc(ind.hero.title)} <em>${esc(ind.hero.title_highlight)}</em></h1>
      <p class="sub">${esc(ind.hero.subtitle)}</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="${reg}" data-cta="hero_primary">Aktifkan AI untuk Usaha Saya ${IKON.arrow}</a>
        <a class="btn btn-ghost" href="#demo" data-cta="hero_demo">${IKON.play} Lihat Demo Percakapan</a>
      </div>
      ${termurah ? `<p class="price-chip">Mulai <strong>${rp(termurah.harga)}</strong> / ${termurah.durasi_hari} hari</p>` : ""}
      <div class="hero-meta"><span>${IKON.check}Pakai nomor WhatsApp yang sama</span><span>${IKON.check}Setup & uji bot gratis</span><span>${IKON.check}Garansi ${MASA_ID}*</span></div>
    </div>
    <div class="stage">
      ${heroVisual}
      ${phone("hero-wa", `Simulasi chat WhatsApp ${ind.demo_conversations.business_name} yang dibalas AI`)}
      ${cards}
    </div>
  </div>
</section>

<section class="s" aria-labelledby="h-masalah">
  <div class="wrap">
    <div class="head"><span class="eyebrow">Yang sering terjadi di ${esc(ind.industry_short)}</span><h2 id="h-masalah">Kenal dengan situasi ini?</h2></div>
    <div class="pains${ind.pain_points.length === 4 ? " n4" : ""}">${pains}
    </div>
  </div>
</section>

<section class="s sol" aria-labelledby="h-solusi">
  <div class="wrap sol-grid">
    <div>
      <span class="eyebrow">Solusi ${MEREK}</span>
      <h2 id="h-solusi">AI yang menjawab dari informasi ${esc(ind.industry_short)} Anda sendiri.</h2>
      <p class="lead" style="margin-bottom:28px">AI hanya menyampaikan fakta yang Anda berikan. Kalau informasinya tidak ada, AI berkata terus terang dan meneruskan ke Anda.</p>
      <ol class="flow" aria-label="Alur kerja">${flow}</ol>
    </div>
    <div class="maps">${maps}</div>
  </div>
</section>

<section class="s demo" id="demo" aria-labelledby="h-demo">
  <div class="wrap demo-grid">
    <div>
      <span class="eyebrow">Demo interaktif</span>
      <h2 id="h-demo">Coba lihat cara AI melayani pelanggan ${esc(ind.industry_short)}.</h2>
      <p class="lead" style="margin-bottom:26px">Pilih skenario. Contoh ini memakai usaha fiktif <b>${esc(ind.demo_conversations.business_name)}</b> dengan data harga contoh.</p>
      <div class="tabs" role="tablist" aria-label="Skenario demo">${tabs}
      </div>
      <p class="demo-note">${IKON.info}<span>Simulasi untuk ilustrasi, bukan percakapan pelanggan sungguhan. Jawaban AI di akun Anda mengikuti knowledge yang Anda isi.</span></p>
    </div>
    <div style="text-align:center">
      ${phone("demo-wa", "Demo simulasi percakapan WhatsApp")}
      <button class="replay" id="replay" type="button">${IKON.repeat.replace("<svg", '<svg width="16" height="16"')} Putar ulang</button>
    </div>
  </div>
</section>

<section class="s" aria-labelledby="h-manfaat">
  <div class="wrap">
    <div class="head center"><span class="eyebrow">Manfaat utama</span><h2 id="h-manfaat">Yang Anda dapatkan setelah AI aktif</h2></div>
    <div class="bens">${bens}
    </div>
  </div>
</section>

<section class="s sol" aria-labelledby="h-cara">
  <div class="wrap">
    <div class="head center"><span class="eyebrow">Cara kerja</span><h2 id="h-cara">Dari daftar sampai AI aktif</h2></div>
    <div class="steps">${steps}
    </div>
    <p class="req"><b>Syarat nomor:</b> matikan Pesan salam & Pesan tidak di tempat di WhatsApp Business, lepas auto-reply lain dari nomor itu, dan nomor bukan WhatsApp Business API.</p>
  </div>
</section>

${
  jumlahKartu
    ? `<section class="s hg" id="harga" aria-labelledby="h-harga">
  <div class="wrap">
    <div class="head center"><span class="eyebrow">Harga</span><h2 id="h-harga">Pilih paket, <em>langsung aktif.</em></h2><p class="lead">Tanpa kontrak. Perpanjang kapan saja, kuota balasan AI langsung bertambah.</p></div>
    <div class="hg-grid">${kartuPaket}${kartuCustom}${kotakGaransi}
      <p class="hg-catatan">Belum yakin? Daftar dulu. 1 nomor bisa disambungkan untuk setup dan uji bot sebelum berlangganan. <a href="/garansi">Baca syarat garansi</a></p>
    </div>
  </div>
</section>`
    : `<section class="s" id="harga" aria-labelledby="h-harga"><div class="wrap"><div class="head center"><span class="eyebrow">Harga</span><h2 id="h-harga">Lihat paket terbaru</h2><p class="lead">Daftar harga lengkap ada di <a href="/#harga">halaman utama</a>.</p></div></div></section>`
}

<section class="s sol" aria-labelledby="h-faq">
  <div class="wrap">
    <div class="head center"><span class="eyebrow">FAQ ${esc(ind.industry_name)}</span><h2 id="h-faq">Pertanyaan yang sering diajukan</h2></div>
    <div class="faq">${faq}
    </div>
  </div>
</section>

<section class="s final" aria-labelledby="h-final">
  <div class="wrap">
    <h2 id="h-final">Jangan Biarkan Calon Pelanggan Menunggu Balasan WhatsApp Lagi.</h2>
    <p>Daftar dalam satu menit, sambungkan nomor ${esc(ind.industry_short)} Anda, isi knowledge, dan biarkan AI membantu menjawab 24 jam.</p>
    <a class="btn btn-primary" href="${reg}" data-cta="final">Aktifkan ${MEREK} Sekarang ${IKON.arrow}</a>
    <p class="other-ind">${MEREK} juga untuk: ${lain}</p>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <span>© ${esc(PERUSAHAAN)}. ${MEREK} adalah produk dan layanan milik ${esc(PERUSAHAAN)}.</span>
    <span><a href="/">Beranda</a><a href="/garansi">Syarat garansi</a><a href="${esc(urlCs(`Halo ${MEREK}, saya mau tanya soal ${MEREK} untuk usaha ${ind.industry_short}.`))}" target="_blank" rel="noopener" data-cta="footer_cs">Customer Service</a></span>
  </div>
</footer>

${termurah ? `<div class="sticky" id="sticky">
  <div class="p">Mulai<b>${rp(termurah.harga)}</b></div>
  <a class="btn btn-primary" href="${reg}" data-cta="sticky_mobile">Aktifkan AI Sekarang</a>
</div>` : ""}

<script>window.CG_LP=${jsonAman(runtime)};</script>
<script>${d.js}</script>
</body>
</html>`;
}

/** Halaman /garansi: syarat jaminan yang sama persis dengan yang diperiksa server (jaminan-def.ts). */
export function renderGaransi(syarat: string[], d: Pick<DataLp, "asal" | "css">): string {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Syarat Garansi Uang Kembali | ${MEREK}</title>
<meta name="description" content="${esc(TEKS_GARANSI)}">
<link rel="canonical" href="${d.asal}/garansi">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
${kepalaFont}
<style>${d.css} .doc{max-width:760px;margin:0 auto;padding:110px 20px 80px}.doc h1{font-size:2rem;letter-spacing:-.02em;margin:0 0 8px}.doc h2{font-size:1.15rem;margin:32px 0 8px}.doc li{margin:8px 0}.doc a{color:var(--c-accent)}</style></head>
<body><header class="top" style="position:absolute;background:var(--c-ink)"><div class="wrap"><a class="logo" href="/" aria-label="${MEREK}, ke beranda">${logoSvg()}<b>Chat<span>GerCep</span></b></a><nav aria-label="Navigasi"><a href="/login">Masuk</a><a class="nav-cta" href="/daftar">Daftar</a></nav></div></header>
<main class="doc">
<h1>Syarat Garansi Uang Kembali</h1>
<p>${esc(TEKS_GARANSI)}</p>
<h2>Syarat &amp; ketentuan</h2>
<ol>${syarat.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
<h2>Cara mengajukan</h2>
<p>Masuk ke akun Anda, buka halaman <b>Langganan</b>, lalu tekan tombol pengajuan garansi dan tuliskan alasannya. Butuh bantuan? Hubungi kami lewat WhatsApp <a href="${esc(urlCs(`Halo ${MEREK}, saya mau tanya soal garansi uang kembali.`))}" target="_blank" rel="noopener">${NOMOR_WA_TAMPIL}</a>.</p>
</main>
<footer><div class="wrap"><span>© ${esc(PERUSAHAAN)}.</span><span><a href="/">Beranda</a></span></div></footer>
</body></html>`;
}

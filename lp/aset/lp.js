/* ChatGerCep Industry LP runtime: consent, pixel, UTM, CTA tracking, demo, sticky */
(function () {
  "use strict";
  var LP = window.CG_LP || {};
  var T = LP.tracking || {};
  var ind = LP.industry, lpPath = LP.landing_page;
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v, persist) { try { (persist ? localStorage : sessionStorage).setItem(k, v); } catch (e) {} }
  };

  /* ---------- UTM capture (first touch per sesi) ---------- */
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "ttclid", "gclid"];
  var qs = new URLSearchParams(location.search), utm = {};
  UTM_KEYS.forEach(function (k) {
    var v = qs.get(k) || store.get("cg_" + k);
    if (v) { utm[k] = v; store.set("cg_" + k, v); }
  });
  store.set("cg_industry", ind, true);
  store.set("cg_landing_page", lpPath, true);

  /* ---------- Pixel loader (hanya setelah consent bila diwajibkan) ---------- */
  var loaded = false, queue = [];
  function loadPixels() {
    if (loaded) return; loaded = true;
    if (T.meta_pixel_id) {
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      fbq("init", T.meta_pixel_id);
    }
    if (T.tiktok_pixel_id) {
      !function (w, d, t) { w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || []; ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"]; ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } }; for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.load = function (e) { var i = "https://analytics.tiktok.com/i18n/pixel/events.js"; ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i; ttq._t = ttq._t || {}; ttq._t[e] = +new Date; var o = d.createElement("script"); o.type = "text/javascript"; o.async = !0; o.src = i + "?sdkid=" + e + "&lib=" + t; var a = d.getElementsByTagName("script")[0]; a.parentNode.insertBefore(o, a) }; ttq.load(T.tiktok_pixel_id) }(window, document, "ttq");
    }
    if (T.ga4_id) {
      var g = document.createElement("script"); g.async = true; g.src = "https://www.googletagmanager.com/gtag/js?id=" + T.ga4_id; document.head.appendChild(g);
      window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); };
      gtag("js", new Date()); gtag("config", T.ga4_id, { send_page_view: false });
    }
    queue.forEach(function (a) { send(a[0], a[1]); }); queue = [];
  }

  var META_STD = { PageView: 1, ViewContent: 1, InitiateCheckout: 1, Purchase: 1, Lead: 1, CompleteRegistration: 1 };
  var TT_MAP = { ViewContent: "ViewContent", InitiateCheckout: "InitiateCheckout", ClickCTA: "ClickButton", Purchase: "CompletePayment" };
  var GA_MAP = { PageView: "page_view", ViewContent: "view_item", ClickCTA: "click_cta", InitiateCheckout: "begin_checkout", Purchase: "purchase" };

  function send(name, params) {
    var p = Object.assign({ industry: ind, landing_page: lpPath, content_category: ind }, utm, params || {});
    try {
      if (window.fbq) {
        if (name === "PageView") fbq("track", "PageView");
        else if (META_STD[name]) fbq("track", name, p); else fbq("trackCustom", name, p);
      }
      if (window.ttq) { if (name === "PageView") ttq.page(); else ttq.track(TT_MAP[name] || name, p); }
      if (window.gtag) gtag("event", GA_MAP[name] || name, p);
    } catch (e) {}
    (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: "cg_" + name }, p));
  }
  function track(name, params) {
    if (name === "Purchase") return; // Purchase TIDAK pernah dikirim dari LP. Kirim dari server setelah pembayaran sukses.
    if (loaded || !T.require_consent) { loadPixels(); send(name, params); } else queue.push([name, params]);
  }
  window.cgTrack = track;

  /* ---------- Consent ---------- */
  var anyPixel = T.meta_pixel_id || T.tiktok_pixel_id || T.ga4_id;
  var consent = store.get("cg_consent");
  var bar = document.getElementById("consent");
  if (anyPixel && T.require_consent && consent !== "yes") {
    if (consent !== "no" && bar) bar.classList.add("on");
  } else if (anyPixel) loadPixels();
  if (bar) bar.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var ok = b.dataset.c === "yes"; store.set("cg_consent", ok ? "yes" : "no", true);
    bar.classList.remove("on"); if (ok) loadPixels(); else queue = [];
  });

  track("PageView");
  track("ViewContent", { content_name: LP.content_name, content_type: "landing_page" });

  /* ---------- CTA: append UTM + industri, track ---------- */
  document.querySelectorAll("[data-cta]").forEach(function (a) {
    var href = a.getAttribute("href");
    if (a.tagName === "A" && href && href.charAt(0) !== "#") {
      var u = new URL(href, location.origin);
      var own = u.host === location.host || /(^|\.)chatgercep\.com$/.test(u.host);
      if (own) {
        u.searchParams.set("industry", ind); u.searchParams.set("landing_page", lpPath);
        if (a.dataset.plan) u.searchParams.set("paket", a.dataset.plan);
        Object.keys(utm).forEach(function (k) { u.searchParams.set(k, utm[k]); });
        a.setAttribute("href", u.host === location.host ? u.pathname + u.search + u.hash : u.toString());
      }
    }
    a.addEventListener("click", function () {
      var params = { cta_id: a.dataset.cta, cta_text: (a.textContent || "").trim().slice(0, 60) };
      if (a.dataset.plan) params.plan = a.dataset.plan;
      track("ClickCTA", params);
      if (a.dataset.plan) track("InitiateCheckout", { plan: a.dataset.plan, value: +a.dataset.value || 0, currency: "IDR" });
    });
  });

  /* ---------- Demo WhatsApp interaktif ---------- */
  var scenarios = LP.demo || [];
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clock(i) { var m = 14 + i; return "21." + (m < 10 ? "0" + m : m); }
  function Player(body, opts) {
    var timers = [];
    function play(idx) {
      timers.forEach(clearTimeout); timers = []; body.innerHTML = "";
      var msgs = (scenarios[idx] || {}).messages || [], t = 250;
      msgs.forEach(function (m, i) {
        var isAI = m.from === "a";
        if (isAI) {
          timers.push(setTimeout(function () { var ty = el("div", "typing", "<i></i><i></i><i></i>"); ty.id = "ty"; body.appendChild(ty); scroll(); }, t));
          t += opts.fast ? 700 : 1100;
        }
        timers.push(setTimeout(function () {
          var ty = body.querySelector(".typing"); if (ty) ty.remove();
          var b = el("div", "bub " + (isAI ? "a" : "c"));
          var inner = "";
          if (isAI) inner += '<span class="ai-tag">AI</span><br>';
          if (m.image) inner += '<div class="img">' + (m.image === "transfer" ? "🧾 bukti_transfer.jpg" : "📷 foto.jpg") + "</div>";
          else inner += esc(m.text);
          inner += '<span class="t">' + clock(i) + (isAI ? "" : " ✓✓") + "</span>";
          b.innerHTML = inner; body.appendChild(b); scroll();
        }, t));
        t += isAI ? (opts.fast ? 900 : 1500) : (opts.fast ? 700 : 1000);
      });
      if (opts.loop) timers.push(setTimeout(function () { play((idx + 1) % scenarios.length); }, t + 3200));
    }
    this.play = play;
    function scroll() { body.scrollTop = body.scrollHeight; }
  }

  // hero phone: loop otomatis
  var heroBody = document.getElementById("hero-wa");
  if (heroBody && scenarios.length) {
    var hp = new Player(heroBody, { loop: true, fast: true });
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    hp.play(0);
  }
  // demo section: tab interaktif
  var demoBody = document.getElementById("demo-wa"), tabs = document.querySelectorAll(".tab"), current = 0, started = false;
  if (demoBody) {
    var dp = new Player(demoBody, { loop: false });
    tabs.forEach(function (tb, i) {
      tb.addEventListener("click", function () {
        current = i; started = true;
        tabs.forEach(function (x) { x.setAttribute("aria-selected", x === tb ? "true" : "false"); });
        dp.play(i); track("DemoScenario", { scenario: scenarios[i] && scenarios[i].id });
      });
    });
    var rp = document.getElementById("replay"); if (rp) rp.addEventListener("click", function () { dp.play(current); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en, ob) { if (en[0].isIntersecting && !started) { started = true; dp.play(0); ob.disconnect(); } }, { threshold: .35 }).observe(demoBody);
    } else dp.play(0);
  }

  /* ---------- Sticky CTA mobile ---------- */
  var sticky = document.getElementById("sticky"), heroEl = document.querySelector(".hero"), finalEl = document.querySelector(".final");
  if (sticky && "IntersectionObserver" in window) {
    var heroVis = true, finalVis = false;
    var upd = function () { sticky.classList.toggle("on", !heroVis && !finalVis); };
    new IntersectionObserver(function (e) { heroVis = e[0].isIntersecting; upd(); }, { threshold: 0.05 }).observe(heroEl);
    if (finalEl) new IntersectionObserver(function (e) { finalVis = e[0].isIntersecting; upd(); }).observe(finalEl);
  }

  /* ---------- Reveal ---------- */
  var rv = document.querySelectorAll(".rv");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { rootMargin: "0px 0px -8% 0px" });
    rv.forEach(function (x) { io.observe(x); });
  } else rv.forEach(function (x) { x.classList.add("in"); });
})();

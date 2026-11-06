// Service worker khusus push notification admin (src/lib/push.ts). Sengaja TIDAK menangani "fetch" dan tidak menyimpan
// cache apa pun: halaman & API tetap diambil langsung dari server seperti biasa.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { judul: e.data ? e.data.text() : "" };
  }
  const judul = d.judul || "ChatGerCep";
  e.waitUntil(
    self.registration.showNotification(judul, {
      body: d.isi || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: d.id ? `notif-${d.id}` : undefined,
      data: { id: d.id || null, tautan: d.tautan || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { id, tautan } = e.notification.data || {};
  const tujuan = new URL(tautan || "/admin", self.location.origin).href;
  e.waitUntil(
    (async () => {
      // Tandai dibaca di lonceng (cookie sesi ikut terkirim karena sama asal).
      if (id) {
        fetch("/api/notifikasi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
      }
      const jendela = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const ada = jendela.find((w) => new URL(w.url).origin === self.location.origin);
      if (ada) {
        await ada.focus();
        if ("navigate" in ada) return ada.navigate(tujuan).catch(() => self.clients.openWindow(tujuan));
        return;
      }
      return self.clients.openWindow(tujuan);
    })(),
  );
});

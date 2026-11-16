/**
 * Pertanyaan umum landing page. Satu sumber untuk tiga tempat: bagian FAQ di halaman, data terstruktur FAQPage
 * (Google & mesin AI), dan /llms.txt. Jawaban ditulis berdiri sendiri (bisa dikutip tanpa konteks halaman).
 */
import type { T } from "@/lib/bahasa";
import { MEREK } from "@/lib/merek";

export const faqLanding = (t: T) => [
  {
    t: t(`Apa itu ${MEREK}?`, `What is ${MEREK}?`),
    j: t(
      `${MEREK} adalah asisten AI untuk WhatsApp yang membalas chat pelanggan usaha Anda secara otomatis 24 jam. Nomor WhatsApp yang sudah ada disambungkan lewat scan QR, lalu AI menjawab berdasarkan Informasi Usaha yang Anda isi (produk, harga, jam buka, FAQ) tanpa mengarang.`,
      `${MEREK} is an AI assistant for WhatsApp that replies to your business's customer chats automatically, 24/7. You connect the WhatsApp number you already have with a QR scan, and the AI answers from the Business Info you provide (products, prices, opening hours, FAQs) without making things up.`,
    ),
  },
  {
    t: t(`Usaha apa saja yang cocok memakai ${MEREK}?`, `Which businesses is ${MEREK} for?`),
    j: t(
      "Usaha yang banyak menerima chat pertanyaan berulang di WhatsApp: toko online, laundry, klinik kecantikan, rental mobil, bengkel, catering, travel umrah, kursus dan les, distributor, maupun jasa lain. AI menjawab pertanyaan harga, stok, jadwal, dan cara order, sementara Anda fokus melayani.",
      "Any business that gets lots of repeated questions on WhatsApp: online stores, laundries, beauty clinics, car rentals, repair shops, caterers, Umrah travel agents, courses and tutoring, distributors, and other services. The AI handles questions about prices, stock, schedules, and how to order while you focus on serving customers.",
    ),
  },
  {
    t: t("Apakah nomor WhatsApp saya aman?", "Is my WhatsApp number safe?"),
    j: t(
      "Nomor tersambung sebagai perangkat tertaut, sama seperti WhatsApp Web. Anda bisa memutusnya kapan saja dari dashboard atau dari HP (Perangkat tertaut → Keluar).",
      "Your number connects as a linked device, just like WhatsApp Web. You can disconnect it anytime from the dashboard or from your phone (Linked devices → Log out).",
    ),
  },
  {
    t: t("Bisa dipakai WhatsApp Business?", "Does it work with WhatsApp Business?"),
    j: t(
      "Bisa. WhatsApp biasa maupun WhatsApp Business, selama bisa membuka menu Perangkat tertaut. Matikan dulu balasan otomatis bawaan WhatsApp Business (Pesan salam & Pesan tidak di tempat) dan layanan auto-reply lain di nomor itu, supaya pelanggan tidak menerima balasan ganda.",
      "Yes. Both regular WhatsApp and WhatsApp Business work, as long as you can open the Linked devices menu. Just turn off WhatsApp Business's built-in auto-replies (Greeting message and Away message) and any other auto-reply service on that number first, so customers don't get duplicate replies.",
    ),
  },
  {
    t: t("Bagaimana kalau AI tidak tahu jawabannya?", "What if the AI doesn't know the answer?"),
    j: t(
      "AI dilarang menebak. Bila informasinya tidak ada di Informasi Usaha, AI berkata terus terang dan meneruskan ke Anda.",
      "The AI isn't allowed to guess. If the answer isn't in your Business Info, it says so honestly and hands the chat over to you.",
    ),
  },
  {
    t: t("Berapa nomor yang bisa saya sambungkan?", "How many numbers can I connect?"),
    j: t(
      "Setiap akun bisa menyambungkan 1 nomor untuk setup dan Uji bot, bahkan sebelum berlangganan. Butuh lebih banyak nomor untuk tim atau beberapa lini layanan? Pilih paket Bisnis atau Pro di bagian Harga.",
      "Every account can connect 1 number to set up and test the bot, even before subscribing. Need more for your team or several service lines? Choose a larger plan in the Pricing section.",
    ),
  },
  {
    t: t("Apa yang terjadi kalau kuota balasan AI habis?", "What happens when my AI replies run out?"),
    j: t(
      "AI berhenti membalas sementara dan chat tetap masuk ke HP-mu seperti biasa. Perpanjang atau naikkan paket, AI langsung aktif lagi.",
      "The AI pauses and chats keep arriving on your phone as usual. Renew or upgrade your plan and the AI is back on right away.",
    ),
  },
  {
    t: t("Bolehkah untuk broadcast/promo massal?", "Can I use it for broadcasts or bulk promotions?"),
    j: t(
      "Tidak. Layanan ini untuk membalas pelanggan yang menghubungi Anda. Akun yang dipakai untuk spam akan diblokir.",
      "No. This service is for replying to customers who message you. Accounts used for spam will be banned.",
    ),
  },
];

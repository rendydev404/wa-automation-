/**
 * Nama merek yang tampil di seluruh app (judul tab, logo, kaki halaman, pesan WhatsApp bawaan). Ubah di sini saja.
 * Logo menulisnya dua warna: MEREK_DEPAN (tinta) + MEREK_BELAKANG (hijau merek), lihat components/logo.tsx.
 */
export const MEREK_DEPAN = "Chat";
export const MEREK_BELAKANG = "GerCep";
export const MEREK = `${MEREK_DEPAN}${MEREK_BELAKANG}`;

export const NOMOR_WA_DEMO = "62895354873838";
export const NOMOR_WA_TAMPIL = "+62 895-3548-73838";
export const URL_WA_DEMO = `https://wa.me/${NOMOR_WA_DEMO}?text=${encodeURIComponent(`Halo ${MEREK}, saya mau coba tes secepat apa AI membalas chat ini.`)}`;

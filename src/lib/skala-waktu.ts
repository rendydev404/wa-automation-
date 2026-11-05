/**
 * Pengali waktu untuk uji otomatis: env WA_SKALA_WAKTU (0 < x < 1, mis. "0.2") memperpendek timer jembatan WhatsApp
 * (jeda sebelum AI membalas, simulasi mengetik, jeda sambung ulang, ...) dengan faktor yang sama, sehingga urutan
 * kejadian tetap sama tetapi uji selesai jauh lebih cepat. Produksi tidak memasangnya: skala() = identitas.
 * Batas waktu (timeout) sengaja tidak diskalakan: yang menentukan urutan kejadian hanya jeda/jendela waktu.
 */
const f = Number(process.env.WA_SKALA_WAKTU);
export const SKALA_WAKTU = Number.isFinite(f) && f > 0 && f < 1 ? f : 1;

export const skala = (ms: number): number => (SKALA_WAKTU === 1 ? ms : Math.max(1, Math.round(ms * SKALA_WAKTU)));

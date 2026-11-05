/**
 * Ukuran & waktu video demo. Semua waktu di skrip adalah DETIK (bukan frame) supaya FPS bisa diganti
 * (REMOTION_FPS=30 untuk pratinjau cepat, 60 untuk hasil akhir yang mulus).
 */
export const FPS = Number(process.env.REMOTION_FPS) || 60;

/** Kanvas video. */
export const CW = 1920;
export const CH = 1080;

/** Jendela browser: ukuran logis 1440 px lebar (layout desktop `lg`), diskalakan S kali ke kanvas. */
export const PAD = 40;
export const WIN_W = 1440;
export const S = (CW - PAD * 2) / WIN_W;
export const WIN_H = (CH - PAD * 2) / S;
export const CHROME_H = 52;
export const VP_W = WIN_W;
export const VP_H = WIN_H - CHROME_H;

export const MEREK_URL = "chatgercep.com";

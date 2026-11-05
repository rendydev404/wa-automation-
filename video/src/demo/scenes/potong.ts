import { type Seg, S } from "../kit/timemap";

/**
 * Peta potong + percepat tiap scene (detik ASLI scene). Bagian yang tidak tercantum dilewati; v > 1 dipercepat.
 * Caption otomatis disembunyikan bila setelah dipercepat tampil kurang dari ±1,2 detik, jadi segmen yang ingin
 * dibaca penonton dibiarkan 1x-2x, sedangkan pengetikan/loading/perpindahan halaman dipercepat 3x-8x.
 * Total target: ±2 menit.
 */
export const POTONG: Record<string, Seg[]> = {
  intro: [S(0, 5.0, 1.4)],
  landing: [S(0.5, 4.7, 1.4), S(4.7, 9.8, 4), S(9.9, 13.0, 1.3), S(13.0, 16.6, 4), S(24.4, 26.5, 4), S(26.5, 30.7, 1.5), S(30.7, 31.7, 2), S(31.7, 33.9, 1.1)],
  daftar: [S(0.5, 2.9, 1.2), S(2.9, 7.1, 3), S(7.1, 11.7, 1.9), S(11.7, 17.6, 3.5)],
  mulai: [S(0.8, 4.6, 1.4), S(4.6, 23.7, 8), S(23.7, 31.6, 4), S(31.6, 34.4, 1.2)],
  sambung: [S(5.5, 9.6, 1.8), S(9.6, 10.0, 4), S(18.9, 23.1, 1.3), S(23.1, 28.8, 2.3), S(28.8, 31.2, 5), S(31.2, 35.5, 2.4)],
  knowledge: [S(0.6, 5.4, 1.8), S(5.4, 13.9, 3.2), S(13.9, 20.7, 2.8), S(20.7, 28.2, 2.8), S(28.8, 34.1, 2.6)],
  uji: [S(0.6, 3.8, 1.2), S(3.8, 6.3, 3), S(6.3, 11.2, 2.2), S(11.2, 19.2, 4.5), S(19.2, 23.4, 1.5)],
  atur: [S(0.5, 8.3, 3), S(9.3, 15.7, 2.8), S(16.9, 24.9, 3.4), S(26.7, 30.6, 1.4)],
  live: [S(0.3, 6.5, 2), S(6.5, 10.9, 1.7), S(10.9, 14.9, 4.5), S(14.9, 19.1, 1.7), S(19.1, 26.0, 4.6), S(28.8, 35.4, 2.4)],
  pantau: [S(0.3, 2.5, 1.1), S(2.5, 8.2, 3.2), S(8.2, 10.9, 1.5)],
  langganan: [S(4.7, 8.7, 1.6), S(8.7, 21.5, 5.5), S(21.5, 26.5, 2.4), S(26.5, 32.2, 5), S(32.2, 36.5, 2)],
  afiliasi: [S(0.5, 4.3, 1.7), S(4.3, 11.3, 5), S(11.3, 14.1, 1.4), S(19.0, 22.4, 4), S(22.4, 26.1, 1.8)],
  outro: [S(0.2, 9.4, 2)],
};

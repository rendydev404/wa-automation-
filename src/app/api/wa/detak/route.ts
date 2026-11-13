import { fiturBoleh } from "@/lib/mesin/lisensi";
import { type UbahDetak, dengarDetak, ringkasAktivitas } from "@/lib/aktivitas";
import { nomorMilik, semuaNomor } from "@/lib/numbers";
import { staf } from "@/lib/peran";
import { getUser } from "@/lib/session";

/** Aliran ditutup server setelah ini; EventSource menyambung lagi sendiri (daftar nomor ikut segar). */
const UMUR_ALIRAN_MS = 10 * 60_000;
/** Komentar SSE berkala supaya proxy tidak memutus koneksi yang diam. */
const DETAK_JAGA_MS = 25_000;
/** Beberapa perubahan beruntun (mis. mengetik lalu terkirim) digabung jadi satu kiriman. */
const GABUNG_MS = 120;

/**
 * Aliran langsung (Server-Sent Events) detak AI untuk maskot dashboard: kapan nomor-nomor MILIK akun ini sedang
 * mengetik balasan di WhatsApp dan kapan balasan terkirim, saat itu juga (bukan menunggu polling 20 detik).
 * Hanya mengirim saat ada perubahan pada nomor akun ini; tanpa query selama aliran berjalan (semua dari memori).
 * Admin/staf menerima detak semua nomor, sama seperti /api/wa/status.
 */
export async function GET(req: Request) {
  if (!fiturBoleh("nomor")) return Response.json({ error: "Fitur ini dinonaktifkan oleh ChatGerCep." }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: "Sesi berakhir." }, { status: 401 });
  const daftar = (staf(user.peran) ? await semuaNomor() : await nomorMilik(user.id)).map((n) => ({ id: n.id, sesi: n.sesi }));
  const ids = new Set(daftar.map((n) => n.id));
  const sesi = new Set(daftar.map((n) => n.sesi));
  const penyandi = new TextEncoder();

  let berhenti = (): void => {};
  const aliran = new ReadableStream<Uint8Array>({
    start(c) {
      let tutup = false;
      let gabung: ReturnType<typeof setTimeout> | null = null;
      const tulis = (s: string): void => {
        if (tutup) return;
        try {
          c.enqueue(penyandi.encode(s));
        } catch {
          berhenti();
        }
      };
      const kirim = (): void => {
        gabung = null;
        tulis(`data: ${JSON.stringify(ringkasAktivitas(daftar))}\n\n`);
      };
      const lepas = dengarDetak((u: UbahDetak) => {
        if ("sesi" in u ? !sesi.has(u.sesi) : !ids.has(u.numberId)) return;
        if (!gabung) gabung = setTimeout(kirim, GABUNG_MS);
      });
      const jaga = setInterval(() => tulis(": jaga\n\n"), DETAK_JAGA_MS);
      const umur = setTimeout(() => berhenti(), UMUR_ALIRAN_MS);
      berhenti = () => {
        if (tutup) return;
        tutup = true;
        lepas();
        clearInterval(jaga);
        clearTimeout(umur);
        if (gabung) clearTimeout(gabung);
        try {
          c.close();
        } catch {
          // sudah tertutup
        }
      };
      req.signal.addEventListener("abort", () => berhenti(), { once: true });
      tulis("retry: 3000\n\n");
      kirim();
    },
    cancel() {
      berhenti();
    },
  });
  return new Response(aliran, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

import { Bot, Clock, Copy, MessagesSquare, RefreshCw, Search, Smartphone, Trash2, User } from "lucide-react";
import { Pill } from "../kit/ui";
import { PELANGGAN } from "../data";

/** Histori percakapan (components/conversation-history.tsx) untuk satu pelanggan; keadaannya dikirim dari scene. */

export interface PesanDash {
  dari: "pelanggan" | "ai" | "manusia";
  teks: string;
  jam: string;
  /** 0..1 kemunculan. */
  muncul: number;
}

/** Estimasi tinggi gelembung (px) untuk memutuskan apakah daftar sudah melebihi panel (rata bawah seperti gulir ke bawah). */
const taksir = (m: PesanDash) => 62 + Math.ceil(m.teks.length / 46) * 21 + 10;

function TeksWa({ teks }: { teks: string }) {
  return (
    <>
      {teks.split(/(\*[^*\n]+\*)/g).map((b, i) => (b.length > 2 && b.startsWith("*") && b.endsWith("*") ? <b key={i}>{b.slice(1, -1)}</b> : <span key={i}>{b}</span>))}
    </>
  );
}

const awalan = (d: PesanDash["dari"]) => (d === "ai" ? "AI: " : d === "manusia" ? "Admin: " : "");

export function HistoriS({
  pesan,
  ada,
  dipilih,
  jeda,
  prospek,
  lebar = 790,
  tinggi = 540,
  munculItem = 1,
}: {
  pesan: PesanDash[];
  ada: boolean;
  dipilih: boolean;
  jeda: boolean;
  prospek: boolean;
  lebar?: number;
  tinggi?: number;
  munculItem?: number;
}) {
  const vis = pesan.filter((m) => m.muncul > 0.001);
  const masuk = vis.filter((m) => m.dari === "pelanggan").length;
  const bot = vis.filter((m) => m.dari === "ai").length;
  const manusia = vis.filter((m) => m.dari === "manusia").length;
  const terakhir = vis[vis.length - 1];
  const rata = vis.reduce((a, m) => a + taksir(m), 0) > tinggi - 150;
  return (
    <section className="card overflow-hidden" style={{ width: lebar }}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <MessagesSquare className="size-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-bold tracking-tight">Histori percakapan</h2>
              <Pill nada="abu">{ada ? 1 : 0} pelanggan</Pill>
            </div>
            <p className="hint mt-0.5 max-w-[470px]">
              {ada ? `${masuk} pesan pelanggan · ${bot} balasan AI · ${manusia} balasan manusia` : "Belum ada percakapan yang tercatat di nomor ini. Pesan pelanggan, balasan AI, dan balasan manusia dari HP akan muncul terstruktur di sini."}
            </p>
            <p className="hint mt-1 flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" />
              Riwayat chat disimpan 30 hari. Pesan yang lebih lama terhapus otomatis.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {ada && (
            <span className="btn btn-danger h-8 px-3 text-xs">
              <Trash2 className="size-3.5" /> Hapus semua
            </span>
          )}
          <span className="btn btn-ghost h-8 px-3 text-xs">
            <RefreshCw className="size-3.5" /> Segarkan
          </span>
        </div>
      </div>

      <div className="grid" style={{ height: tinggi, gridTemplateColumns: "270px minmax(0,1fr)" }}>
        {/* Kolom kiri */}
        <div className="flex min-h-0 flex-col border-r border-line">
          <div className="space-y-2.5 border-b border-line p-3.5">
            <div className="relative flex items-center">
              <Search className="absolute left-3 size-4 text-faint" />
              <div className="field py-1.5 pr-9 pl-9 text-[13px]">
                <span className="text-faint">Cari nama, nomor WA, atau isi pesan…</span>
              </div>
            </div>
            <div className="grid grid-cols-3 rounded-xl bg-subtle p-1">
              {["Semua", "Dibalas AI", "Manusia"].map((l, i) => (
                <span key={l} className={`rounded-lg px-2 py-1.5 text-center text-xs font-semibold ${i === 0 ? "bg-surface text-fg shadow-card" : "text-muted"}`}>
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {!ada ? (
              <div className="px-5 py-14 text-center">
                <p className="text-[13.5px] font-semibold text-fg">Belum ada histori percakapan</p>
                <p className="hint mt-1">Saat pelanggan mengirim chat ke nomor WhatsApp ini, percakapannya langsung tampil di sini.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line" style={{ opacity: munculItem }}>
                <li data-cur="dash-item-1">
                  <div className={`flex w-full items-start gap-3 px-4 py-3.5 text-left ${dipilih ? "bg-accent-soft/55" : ""}`}>
                    <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${dipilih ? "bg-accent text-on-accent" : "bg-subtle text-muted"}`}>
                      <User className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[13.5px] font-semibold text-fg">{PELANGGAN.nama}</p>
                        <span className="shrink-0 text-[11px] text-faint tabular-nums">{terakhir?.jam ?? "14:02"}</span>
                      </div>
                      <p className="truncate text-[11.5px] text-muted tabular-nums">{PELANGGAN.telp}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-muted">
                        <span className="font-medium text-fg">{terakhir ? awalan(terakhir.dari) : ""}</span>
                        {terakhir?.teks.replace(/\n/g, " ") ?? "—"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 font-semibold text-accent tabular-nums">
                          <Bot className="size-3" /> {bot}
                        </span>
                        {manusia > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 font-semibold text-warning tabular-nums">
                            <Smartphone className="size-3" /> {manusia}
                          </span>
                        )}
                        {jeda && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 font-medium text-muted">
                            <Clock className="size-3" /> Dijeda manusia
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* Kolom kanan */}
        <div className="flex min-h-0 min-w-0 flex-col bg-subtle/35">
          {!dipilih ? (
            <div className="m-auto px-6 py-16 text-center">
              <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-subtle text-muted">
                <MessagesSquare className="size-5" />
              </span>
              <p className="text-[14px] font-semibold text-fg">Pilih percakapan</p>
              <p className="hint mt-1 max-w-xs">Klik salah satu pelanggan di sebelah kiri untuk melihat seluruh riwayat tanya-jawabnya.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-bold text-fg">{PELANGGAN.nama}</p>
                    {jeda && (
                      <span data-cur="dash-pill-jeda">
                        <Pill nada="kuning">AI sedang jeda (ditangani manusia)</Pill>
                      </span>
                    )}
                    {prospek && <Pill nada="hijau">Prospek</Pill>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="inline-flex items-center gap-1 font-medium text-muted tabular-nums">
                      {PELANGGAN.telp} <Copy className="size-3 text-faint" />
                    </span>
                    <span>
                      {masuk} masuk · {bot} AI · {manusia} manusia
                    </span>
                  </div>
                </div>
                <span className="btn btn-danger h-8 px-2.5 text-xs">
                  <Trash2 className="size-3.5" /> Hapus
                </span>
              </div>
              <div className={`flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-5 py-4 ${rata ? "justify-end" : "justify-start"}`}>
                {vis.length > 0 && <p className="mb-1 text-center text-[11.5px] text-faint">Pesan yang lebih lama dari 30 hari terhapus otomatis.</p>}
                {vis.length > 0 && (
                  <div className="my-1 flex justify-center">
                    <span className="rounded-full border border-line bg-surface px-3 py-0.5 text-[11px] font-semibold text-muted">3 Nov 2026</span>
                  </div>
                )}
                {vis.map((m, i) => {
                  const pel = m.dari === "pelanggan";
                  const botM = m.dari === "ai";
                  return (
                    <div key={i} className={`flex max-w-[80%] min-w-0 shrink-0 flex-col ${pel ? "self-start" : "self-end"}`} style={{ opacity: m.muncul, transform: `translateY(${(1 - m.muncul) * 14}px)` }}>
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${
                          pel ? "rounded-bl-md border border-line bg-surface text-fg" : botM ? "rounded-br-md bg-accent text-on-accent" : "rounded-br-md border border-line-strong bg-warning-soft text-fg"
                        }`}
                      >
                        <div className={`mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold ${pel ? "text-muted" : botM ? "text-on-accent/85" : "text-warning"}`}>
                          <span className="inline-flex items-center gap-1">
                            {pel ? (
                              <>
                                <User className="size-3" /> Pelanggan
                              </>
                            ) : botM ? (
                              <>
                                <Bot className="size-3" /> Balasan AI
                              </>
                            ) : (
                              <>
                                <Smartphone className="size-3" /> Balasan Manusia (HP)
                              </>
                            )}
                          </span>
                          <span className="font-normal tabular-nums">{m.jam} WIB</span>
                        </div>
                        <div>
                          <TeksWa teks={m.teks} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

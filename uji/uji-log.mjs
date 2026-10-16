// Uji log aman: libsignal asli memanggil console dengan objek sesi berisi kunci privat; yang
// sampai ke stdout/stderr harus tanpa kunci itu, sementara log lain tidak berubah.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-log.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { pasangLogAman } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/log-aman.ts")).href);
const { SessionRecord } = createRequire(import.meta.url)("libsignal");

/** Jalankan fn dan kembalikan semua yang ditulis ke stdout + stderr. */
function tangkap(fn) {
  let isi = "";
  const asli = [process.stdout.write, process.stderr.write];
  process.stdout.write = process.stderr.write = (b) => ((isi += String(b)), true);
  try {
    fn();
  } finally {
    [process.stdout.write, process.stderr.write] = asli;
  }
  return isi;
}

const RAHASIA = Buffer.from("d00dfeedcafebabe0123456789abcdef", "hex");
const hexBuffer = "d0 0d fe ed ca fe ba be"; // cara util.inspect mencetak Buffer
const sesiBaru = () => ({
  _chains: { abc: { chainKey: { counter: 0, key: RAHASIA }, chainType: 1, messageKeys: {} } },
  registrationId: 42,
  currentRatchet: { ephemeralKeyPair: { pubKey: Buffer.alloc(33, 5), privKey: RAHASIA }, rootKey: RAHASIA, previousCounter: 0 },
  indexInfo: { baseKey: Buffer.alloc(33, 7), baseKeyType: 1, closed: -1, used: 1, created: 1, remoteIdentityKey: Buffer.alloc(33, 9) },
});

// Kendali: tanpa filter, libsignal memang membocorkan kunci (kalau tidak, uji di bawah tidak membuktikan apa-apa).
const bocor = tangkap(() => new SessionRecord().closeSession(sesiBaru()));
assert.ok(bocor.includes("Closing session:") && bocor.includes(hexBuffer), "libsignal tidak lagi mencetak sesi; periksa ulang uji ini");

pasangLogAman();
pasangLogAman(); // dipasang dua kali tidak membungkus dua kali

const rec = new SessionRecord();
const s = sesiBaru();
const keluaran = tangkap(() => {
  rec.closeSession(s); // console.info "Closing session:"
  rec.closeSession(s); // console.warn "Session already closed"
  rec.openSession(s); // console.info "Opening session:"
  console.error("galat", sesiBaru());
});
assert.ok(!keluaran.includes(hexBuffer), `kunci privat masih tercetak:\n${keluaran}`);
assert.ok(!keluaran.includes("currentRatchet"), "isi sesi masih tercetak");
assert.match(keluaran, /Closing session: \[sesi Signal disembunyikan\]/);
assert.match(keluaran, /Session already closed \[sesi Signal disembunyikan\]/);
assert.match(keluaran, /Opening session: \[sesi Signal disembunyikan\]/);
assert.equal(keluaran.match(/disembunyikan/g).length, 4);

// Log lain tidak berubah, termasuk objek biasa dan galat.
const biasa = tangkap(() => {
  console.info("[wa x] terhubung");
  console.warn("data", { a: 1 });
  console.error("[wa] gagal:", new Error("putus"));
});
assert.match(biasa, /\[wa x\] terhubung/);
assert.match(biasa, /data \{ a: 1 \}/);
assert.match(biasa, /Error: putus/);
assert.ok(!biasa.includes("disembunyikan"));

console.log("LOLOS uji log aman (libsignal asli: kunci sesi tidak tercetak, log lain utuh)");

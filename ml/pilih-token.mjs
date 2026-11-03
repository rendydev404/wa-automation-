// Langkah 1 pemangkasan model (lihat ml/README.md): pilih token XLM-R yang dipertahankan.
// Pakai: node ml/pilih-token.mjs <folder model asli> <folder dataset> <folder keluaran> <berkas simpan-id.json>
// Yang dipertahankan: token khusus, semua token yang dipakai korpus Indonesia/Inggris (MASSIVE id-ID & en-US tanpa
// partisi test, komentar & kamus slang Indonesia, SMS Indonesia, knowledge di repo), TOP_LATIN token berhuruf
// Latin/angka/simbol dengan skor Unigram tertinggi, dan semua token berisi emoji. Partisi test MASSIVE sengaja tidak
// dipakai memilih supaya bisa menguji model pangkasan pada kalimat yang belum pernah "dilihat".
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Tokenizer } from "@huggingface/tokenizers";

const [asli, dataset, keluar, berkasId] = process.argv.slice(2);
if (!berkasId) throw new Error("pakai: node ml/pilih-token.mjs <model asli> <dataset> <keluaran> <simpan-id.json>");
const TOP_LATIN = 30_000;

const tj = JSON.parse(readFileSync(path.join(asli, "tokenizer.json"), "utf8"));
const tc = JSON.parse(readFileSync(path.join(asli, "tokenizer_config.json"), "utf8"));
const tok = new Tokenizer(tj, tc);
const vocab = tj.model.vocab;

const korpus = [];
for (const loc of ["id-ID", "en-US"])
  for (const l of readFileSync(path.join(dataset, `1.1/data/${loc}.jsonl`), "utf8").trim().split("\n")) {
    const r = JSON.parse(l);
    if (r.partition !== "test") korpus.push(r.utt);
  }
for (const f of ["colloquial-indonesian-lexicon.csv", "new_kamusalay.csv", "dataset_sms_spam_v1.csv"]) korpus.push(...readFileSync(path.join(dataset, f), "latin1").split("\n"));
const telusuri = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) telusuri(p);
    else if (/\.(txt|md)$/.test(e.name)) korpus.push(...readFileSync(p, "utf8").split("\n"));
  }
};
telusuri("knowledge-cs");
telusuri("knowledge-video-ai");

const simpan = new Set([0, 1, 2, 3]);
for (const t of korpus) for (const v of [t, t.toLowerCase()]) for (const id of tok.encode(v).ids) simpan.add(id);
const dariKorpus = simpan.size;
const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{S}▁]+$/u;
const EMOJI = /\p{Extended_Pictographic}/u;
vocab
  .map(([p, s], i) => ({ p, s, i }))
  .filter((x) => LATIN.test(x.p))
  .sort((a, b) => b.s - a.s)
  .slice(0, TOP_LATIN)
  .forEach((x) => simpan.add(x.i));
vocab.forEach(([p], i) => {
  if (EMOJI.test(p) || (LATIN.test(p) && [...p.replace(/^▁/, "")].length <= 1)) simpan.add(i);
});
const ids = [...simpan].filter((i) => i < vocab.length - 1).sort((a, b) => a - b); // <mask> (terakhir) tidak dipakai
const peta = new Map(ids.map((lama, baru) => [lama, baru]));

// tokenizer.json baru: vocab disusun ulang, id token khusus & post-processor ikut dipetakan.
const baru = structuredClone(tj);
baru.model.vocab = ids.map((i) => vocab[i]);
baru.model.unk_id = peta.get(tj.model.unk_id);
baru.added_tokens = tj.added_tokens.filter((a) => peta.has(a.id)).map((a) => ({ ...a, id: peta.get(a.id) }));
const petakanPost = (pp) => {
  if (!pp) return pp;
  if (pp.type === "Sequence") return { ...pp, processors: pp.processors.map(petakanPost) };
  if (pp.special_tokens) for (const st of Object.values(pp.special_tokens)) st.ids = st.ids.map((i) => peta.get(i));
  if (pp.sep) pp.sep[1] = peta.get(pp.sep[1]);
  if (pp.cls) pp.cls[1] = peta.get(pp.cls[1]);
  return pp;
};
baru.post_processor = petakanPost(baru.post_processor);
const tcBaru = { ...tc };
delete tcBaru.mask_token; // <mask> tidak ikut dipertahankan

mkdirSync(keluar, { recursive: true });
writeFileSync(path.join(keluar, "tokenizer.json"), JSON.stringify(baru));
writeFileSync(path.join(keluar, "tokenizer_config.json"), JSON.stringify(tcBaru, null, 2));
writeFileSync(berkasId, JSON.stringify(ids));
console.log(`korpus ${korpus.length} baris -> ${dariKorpus} token; total dipertahankan ${ids.length} dari ${vocab.length}`);

// Langkah 3 pemangkasan (lihat ml/README.md): bandingkan model pangkasan dengan model asli pada kalimat yang TIDAK
// dipakai memilih token (partisi test MASSIVE id-ID & en-US), lalu ukur RAM & latensi model pangkasan saja.
// Pakai: node --expose-gc ml/uji-pangkas.mjs <folder model asli> <folder dataset>
import { readFileSync } from "node:fs";
import path from "node:path";
import { Tokenizer } from "@huggingface/tokenizers";
import ort from "onnxruntime-node";

const [asli, dataset] = process.argv.slice(2);
const mb = () => Math.round(process.memoryUsage().rss / 1048576);

async function muat(dir, berkas) {
  const tok = new Tokenizer(JSON.parse(readFileSync(path.join(dir, "tokenizer.json"), "utf8")), JSON.parse(readFileSync(path.join(dir, "tokenizer_config.json"), "utf8")));
  const s = await ort.InferenceSession.create(path.join(dir, berkas), { intraOpNumThreads: 1, interOpNumThreads: 1, enableCpuMemArena: false });
  return async (teks) => {
    const ids = tok.encode(`query: ${teks}`).ids.slice(0, 128);
    const n = ids.length;
    const out = await s.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, n]),
      attention_mask: new ort.Tensor("int64", new BigInt64Array(n).fill(1n), [1, n]),
      token_type_ids: new ort.Tensor("int64", new BigInt64Array(n), [1, n]),
    });
    const h = out[s.outputNames[0]].data;
    const d = h.length / n;
    const v = new Float32Array(d);
    for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) v[j] += h[i * d + j];
    const norm = Math.hypot(...v);
    return v.map((x) => x / norm);
  };
}

const uji = [];
for (const loc of ["id-ID", "en-US"])
  for (const l of readFileSync(path.join(dataset, `1.1/data/${loc}.jsonl`), "utf8").trim().split("\n")) {
    const r = JSON.parse(l);
    if (r.partition === "test") uji.push(r.utt);
  }
const contoh = uji.filter((_, i) => i % 10 === 0).concat(["kak brp hrg shawarma jumbo?? 🙏", "gw mau order 5 bs dianter ga", "anjir lu bot y wkwkwk", "makasih kakk 🙏🙏", "lokasi outlet terdekat dmn ya kak"]);

const r0 = mb();
const pangkas = await muat("ml/model", "model.onnx");
global.gc?.();
const rPangkas = mb() - r0;
const lat = [];
const vp = [];
for (const t of contoh) {
  const a = performance.now();
  vp.push(await pangkas(t));
  lat.push(performance.now() - a);
}
lat.sort((a, b) => a - b);
console.log(`model pangkasan: +${rPangkas} MB RSS, latensi p50 ${lat[lat.length >> 1].toFixed(1)} ms, p95 ${lat[Math.floor(lat.length * 0.95)].toFixed(1)} ms (${contoh.length} kalimat)`);

const penuh = await muat(asli, "model_quantized.onnx");
const sim = [];
for (let i = 0; i < contoh.length; i++) {
  const v = await penuh(contoh[i]);
  sim.push(v.reduce((s, x, j) => s + x * vp[i][j], 0));
}
const urut = [...sim].sort((a, b) => a - b);
console.log(`kemiripan embedding pangkasan vs asli: rata ${(sim.reduce((a, b) => a + b) / sim.length).toFixed(4)}, terendah ${urut[0].toFixed(4)}, persentil-5 ${urut[Math.floor(urut.length * 0.05)].toFixed(4)}`);
console.log(`identik (>0.9999): ${sim.filter((s) => s > 0.9999).length}/${sim.length}`);

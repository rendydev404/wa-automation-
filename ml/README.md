# ML penyaring prospek

Model kecil yang berjalan di dalam app (tanpa layanan luar) untuk memilah pesan WhatsApp: prospek, netral, ucapan penutup, atau bukan prospek. Ia hanya **menyaring**; yang menjawab pelanggan tetap AI utama (Hermes/Claude). Alurnya ada di `src/lib/prospek.ts`, bagian murninya di `src/lib/prospek-def.ts`, dan pemasangannya ke jalur WhatsApp di `src/lib/bridge.ts`.

## Isi folder

| Berkas | Isi |
|---|---|
| `model/model.onnx` | [multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small) terkuantisasi int8 (revisi `97cb8f96`), kosakatanya dipangkas dari 250.002 menjadi 40.036 token (Indonesia, Inggris, slang, emoji). 37,7 MB. |
| `model/tokenizer.json`, `model/tokenizer_config.json` | Tokenizer yang dipangkas dengan cara yang sama (id token dipetakan ulang). |
| `kepala.json` | Kepala klasifikasi terlatih (regresi softmax 384 -> 4 label, 15 KB), plus bobot campuran kepala/kNN, tau, dan ambang yang dipilih saat pelatihan. |
| `benih.bin` | 3.814 contoh berlabel untuk kNN (vektor int8 + bobot, format `WAB2`), 1,5 MB. |
| `data/latih-*.txt` | Kasus latihan chat WA yang ditulis dan dilabeli manual: 401 prospek dari 60+ jenis usaha (termasuk keluhan kasar dan kata "jebakan" seperti slot jadwal/burung gacor/bonus), 51 netral, 119 penutup, 287 bukan (iseng, menguji bot, curhat, chat pribadi nyasar, PR, politik, spam, penipuan, judi). |
| `data/uji-mandiri.json` | 320 pesan uji dari 48 jenis usaha, ditulis penulis lain **tanpa melihat data latih**. Dibagi dua: separuh "dev" (kesalahannya boleh dipelajari) dan separuh "FINAL" (dikunci, isinya tidak pernah dicetak). |
| `latih.mjs` | Pelatihan: variasi gaya ketik otomatis, embedding, gradient descent (Adam, bobot kelas seimbang), pemilihan setelan pada data non-FINAL, lalu satu kali uji FINAL. |
| `pilih-token.mjs`, `pangkas.py`, `uji-pangkas.mjs` | Skrip pemangkasan model dan pengujiannya. |

## Angka terukur (laptop dev, Windows, Node 24, 1 thread)

- Latensi embedding: p50 **6,0 ms**, p95 9,7 ms per pesan.
- RAM: model asli +380 MB RSS, model pangkasan **+85 MB**. Di server hasil build: 254 MB menjadi 347 MB RSS.
- Uji stres: 4.706 embedding dalam 30 dtk dari 8 pemanggil serentak (±6,4 ms/pesan), RSS stabil 202 MB; 8 kali dimatikan mendadak di tengah inferensi tanpa crash.
- Kesetiaan pangkasan pada 600 kalimat yang tidak dipakai saat memilih token (partisi test MASSIVE): kemiripan rata-rata 0,9995 dengan model asli, dan 581/600 identik.

## Hasil pelatihan (setelan app: bobot kepala 0,5, tau 0,05, ambang lewati 0,75)

| Data uji (tidak pernah dilatih) | Sebelum dilatih (benih MASSIVE saja, ambang 0,9) | Setelah dilatih |
|---|---|---|
| Pesan pelanggan berbagai usaha yang salah dilewati | 15/131 (11,5%) | 1/129 (0,8%), dan itu ucapan terima kasih |
| Pertanyaan pelanggan CS yang salah dilewati | 16/62 (25,8%) | 1/60 (1,7%) |
| Uji mandiri FINAL: prospek yang salah dilewati | – | **0/74** |
| Uji mandiri FINAL: sapaan yang salah dilewati | – | 1/12 |
| Uji mandiri FINAL: ucapan penutup yang dikenali | – | 14/15 (93%) |
| Uji mandiri FINAL: iseng/spam yang dikenali | – | 22/50 (44%) |
| Spam & judi yang dikenali | 4/56 (7%) | 43/56 (77%) |
| SMS penipuan/promo asli yang dikenali | 52/574 (9%) | 221/574 (39%) |

ML sengaja dibuat hati-hati ("ragu = balas"). Di app, ML hanya melewati pesan di chat yang sudah dibisukan AI utama dan ucapan penutup. Pesan yang mirip knowledge nomor itu tidak pernah dilewati. Setiap nomor mulai di **mode magang**, dan ujian malam di `prospek.ts` baru mengaktifkannya bila presisi keputusan "lewati" pada pengalaman nomor itu sendiri ≥ 97%.

## Dataset

- **MASSIVE 1.1** (Amazon, CC BY 4.0), `id-ID`, partisi train+dev. Perintah asisten virtual (alarm, cuaca, musik, lelucon, dll.) dipakai sebagai contoh "bukan" prospek. Pesan-antar makanan, tiket, dan taksi dipakai sebagai contoh "prospek", dan sapaan sebagai "netral".
- **SMS spam Indonesia** dan **kamus slang** dari [nadyatyandra/IndonesianSMSSpamDetector](https://github.com/nadyatyandra/IndonesianSMSSpamDetector). Keduanya hanya dipakai untuk memilih token dan untuk evaluasi lokal. Lisensinya tidak dicantumkan, jadi tidak ikut dikirim sebagai benih.
- Sisanya dipelajari otomatis dari chat nyata tiap nomor: label AI utama, hasil nyata (pesanan/katalog diteruskan), dan koreksi kesalahan.

## Membangun ulang

Butuh Python dengan `onnx==1.18.0` + `numpy`. Pakai path pendek di Windows karena ada batas panjang path.

```bash
mkdir -p data/model/e5-small data/dataset
R=97cb8f96eaed1a1f0dac821239943e854fce9c36
for f in onnx/model_quantized.onnx tokenizer.json tokenizer_config.json; do curl -sSfL -o "data/model/e5-small/$(basename $f)" "https://huggingface.co/Xenova/multilingual-e5-small/resolve/$R/$f"; done
curl -sSfL https://amazon-massive-nlu-dataset.s3.amazonaws.com/amazon-massive-dataset-1.1.tar.gz | tar -xz -C data/dataset 1.1/data/id-ID.jsonl 1.1/data/en-US.jsonl
B=https://raw.githubusercontent.com/nadyatyandra/IndonesianSMSSpamDetector/main/dataset
for f in dataset_sms_spam_v1.csv colloquial-indonesian-lexicon.csv new_kamusalay.csv; do curl -sSfL -o data/dataset/$f $B/$f; done

node ml/pilih-token.mjs data/model/e5-small data/dataset ml/model data/dataset/simpan-id.json
python ml/pangkas.py data/model/e5-small/model_quantized.onnx data/dataset/simpan-id.json ml/model/model.onnx
node --expose-gc ml/uji-pangkas.mjs data/model/e5-small data/dataset
node --no-warnings --import ./uji/loader.mjs ml/latih.mjs data/dataset   # ±1 menit: kepala.json + benih.bin + laporan uji
```

CI memasang `ONNXRUNTIME_NODE_INSTALL=skip` supaya `npm ci` di Linux tidak mengunduh biner CUDA (lakukan hal yang sama bila memasang di Linux sendiri). Paket deploy hanya membawa pustaka CPU Linux (lihat `next.config.ts`, `deploy.yml`, `deploy/deploy.sh`).

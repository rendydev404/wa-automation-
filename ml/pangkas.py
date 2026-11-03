# Langkah 2 pemangkasan model (lihat ml/README.md): buang baris embedding token yang tidak dipertahankan.
# Pakai: python ml/pangkas.py <model_quantized.onnx asli> <simpan-id.json> <model.onnx keluaran>
# Hanya tensor embedding kata (uint8 [vocab, 384]) yang diubah; seluruh lapisan transformer tetap sama, jadi untuk
# kalimat yang token-nya dipertahankan, hasil embedding identik dengan model asli.
import json
import sys

import numpy as np
import onnx
from onnx import numpy_helper

asli, simpan_id, keluar = sys.argv[1:4]
m = onnx.load(asli)
ids = np.array(json.load(open(simpan_id, encoding="utf-8")), dtype=np.int64)
for i, init in enumerate(m.graph.initializer):
    if init.name == "embeddings.word_embeddings.weight_quantized":
        w = numpy_helper.to_array(init)
        baru = numpy_helper.from_array(np.ascontiguousarray(w[ids]), init.name)
        m.graph.initializer[i].CopyFrom(baru)
        print(f"embedding {w.shape} -> {w[ids].shape}")
        break
else:
    raise SystemExit("tensor embedding tidak ditemukan")
onnx.save(m, keluar)

"""Keras suara VO per frame (30 fps) untuk lip-sync maskot.

Pakai: python skrip/amplitudo-vo.py <vo.mp3> <keluaran.ts> [NAMA_KONSTANTA]
MP3 diubah ke WAV mono lewat ffmpeg bawaan Remotion, lalu RMS tiap 1/30 detik -> dB -> (dB+45)/31 (0..1),
dihaluskan rata-rata 2 frame. Hasilnya file TS berisi satu array angka.
"""
import math
import os
import subprocess
import sys
import tempfile
import wave

FPS = 30

src, out = sys.argv[1], sys.argv[2]
nama = sys.argv[3] if len(sys.argv) > 3 else "AMPLITUDO_VO"

wav = os.path.join(tempfile.mkdtemp(), "vo.wav")
subprocess.run(f'npx remotion ffmpeg -hide_banner -loglevel error -y -i "{src}" -ac 1 -ar 16000 "{wav}"', shell=True, check=True)

with wave.open(wav) as w:
    laju = w.getframerate()
    data = w.readframes(w.getnframes())
sampel = [int.from_bytes(data[i : i + 2], "little", signed=True) / 32768 for i in range(0, len(data), 2)]

per = laju // FPS
nilai = []
for i in range(0, len(sampel), per):
    blok = sampel[i : i + per]
    rms = math.sqrt(sum(s * s for s in blok) / max(1, len(blok)))
    db = 20 * math.log10(max(rms, 1e-6))
    nilai.append(min(1.0, max(0.0, (db + 45) / 31)))
halus = [(nilai[i] + nilai[max(0, i - 1)]) / 2 for i in range(len(nilai))]

with open(out, "w", encoding="utf-8") as f:
    f.write(f"// Dihasilkan skrip/amplitudo-vo.py dari {os.path.basename(src)} ({len(halus)} frame, 30 fps). Jangan diubah manual.\n")
    f.write(f"export const {nama}: readonly number[] = [{','.join(f'{v:.2f}'.rstrip('0').rstrip('.') or '0' for v in halus)}];\n")
print(len(halus), "frame")

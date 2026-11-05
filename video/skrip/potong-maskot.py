import sys, cv2, numpy as np
src, out, dbg = sys.argv[1], sys.argv[2], sys.argv[3]
im = cv2.imread(src, cv2.IMREAD_UNCHANGED)  # BGRA
H, W = im.shape[:2]
b, g, r, a = [im[:, :, i].astype(int) for i in range(4)]
ada = a > 10
hijau = (g > r + 25) & (g > b + 25)
yy, xx = np.mgrid[0:H, 0:W]

def poli(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 255)
    return m > 0

def atas_garis(p, q):  # piksel di atas garis p->q
    (x1, y1), (x2, y2) = p, q
    return yy < y1 + (xx - x1) * (y2 - y1) / (x2 - x1)

# Kepala: semua di atas garis leher
kepala = ada & (yy < 532)
# Lengan kiri (penonton): area kiri di bawah lengan baju, bukan hijau
lk_poli = poli([(0, 615), (292, 615), (292, 785), (330, 800), (380, 815), (430, 842), (462, 880), (472, 1035), (0, 1035)])
lengan_kiri = ada & lk_poli & ~hijau
# Lengan kanan: tangan di depan kaos + lengan bawah, di bawah manset kanan
cuff = ((945, 908), (1137, 815))
lka_poli = poli([(680, 828), (936, 828), (946, 905), (1137, 812), (1185, 812), (1185, 1125), (680, 1125)])
lengan_kanan = ada & lka_poli & ~hijau & ~atas_garis(*cuff) | (ada & lka_poli & ~hijau & (xx < 940))
# Lengan baju kanan (salinan, menutup sambungan lengan kanan)
baju_kanan = ada & poli([(925, 575), (1050, 600), (1150, 760), (1150, 830), (946, 912), (925, 880)]) & atas_garis(*cuff)
baju_kanan &= ~(lengan_kanan & (xx < 940))

putih_px = (r > 150) & (g > 150) & (b > 150) & (np.abs(r - g) < 40) & (np.abs(g - b) < 40)
dekat_putih = cv2.dilate(putih_px.astype(np.uint8), np.ones((25, 25), np.uint8)) > 0
lengan_kiri &= dekat_putih & ~((yy > 885) & (xx > 450))
lengan_kanan &= dekat_putih
baju_kanan &= ~lengan_kanan
badan = ada & ~kepala & ~lengan_kiri & ~lengan_kanan
badan_awal = badan.copy()

def simpan(nama, mask, gambar=im):
    o = gambar.copy()
    o[:, :, 3] = np.where(mask, gambar[:, :, 3], 0)
    cv2.imwrite(f"{out}/{nama}.png", o)

# Badan: tambal lubang lengan kanan (di dalam kaos) + rintisan leher
lubang_penuh = cv2.dilate(lengan_kanan.astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
dasar = im[:, :, :3].copy()
hijau_kaos = np.median(im[900:1100, 500:900, :3][hijau[900:1100, 500:900]], axis=0).astype(np.uint8)
dasar[(xx >= 958) & (yy > 830) & ~badan_awal] = hijau_kaos  # sisi luar kaos diisi hijau agar tambalan tidak memutih
bgr = cv2.inpaint(dasar, lubang_penuh, 9, cv2.INPAINT_TELEA)
bgr = np.where((lubang_penuh > 0)[:, :, None], bgr, im[:, :, :3])
lubang = np.where(xx < 958, lubang_penuh, 0).astype(np.uint8)
badan_img = np.dstack([bgr, im[:, :, 3]])
badan_mask = badan | (lubang > 0)
leher = poli([(628, 470), (782, 470), (782, 545), (628, 545)])
warna_leher = im[548, 705, :3]
badan_img[leher] = list(warna_leher) + [255]
badan_mask |= leher
badan_img[:, :, 3] = np.where(badan_mask, 255 * (badan_img[:, :, 3] > 0) | (lubang > 0) * 255 | leher * 255, 0).astype(np.uint8)
simpan("badan", badan_mask, badan_img)

# Rintisan lengan (di bawah lengan baju) supaya sendi tidak bolong saat berputar
putih = [232, 228, 228, 255]
lk = im.copy(); lk[:, :, 3] = np.where(lengan_kiri, im[:, :, 3], 0)
cv2.fillPoly(lk, [np.array([(300, 765), (470, 790), (470, 880), (300, 805)], np.int32)], putih)
cv2.imwrite(f"{out}/lengan-kiri.png", lk)
lka = im.copy(); lka[:, :, 3] = np.where(lengan_kanan, im[:, :, 3], 0)
cv2.fillPoly(lka, [np.array([(955, 860), (1120, 790), (1140, 840), (965, 915)], np.int32)], putih)
cv2.imwrite(f"{out}/lengan-kanan.png", lka)
simpan("baju-kanan", baju_kanan)
simpan("kepala", kepala)

# Debug: warnai tiap lapisan
d = np.full((H, W, 3), 255, np.uint8)
for m, c in [(badan, (90, 200, 90)), (lengan_kiri, (230, 120, 60)), (lengan_kanan, (60, 80, 230)), (baju_kanan, (200, 60, 200)), (kepala, (60, 200, 220))]:
    d[m] = c
cv2.imwrite(dbg, cv2.resize(d, (W // 2, H // 2)))

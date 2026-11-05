import sys, cv2, numpy as np
src, out, dbg = sys.argv[1], sys.argv[2], sys.argv[3]
im = cv2.imread(src, cv2.IMREAD_UNCHANGED)
H, W = im.shape[:2]
b, g, r, a = [im[:, :, i].astype(int) for i in range(4)]
ada = a > 10
hijau = (g > r + 25) & (g > b + 25)
yy, xx = np.mgrid[0:H, 0:W]
def poli(pts):
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.array(pts, np.int32)], 255); return m > 0
putih_px = (r > 150) & (g > 150) & (b > 150) & (np.abs(r - g) < 40) & (np.abs(g - b) < 40)
dekat = lambda m, k: cv2.dilate(m.astype(np.uint8), np.ones((k, k), np.uint8)) > 0
dekat_putih, dekat_hijau = dekat(putih_px, 25), dekat(hijau, 7)

kepala = ada & (yy < 452) & ~((xx < 296) & (yy > 360) & ~((xx > 240) & (yy < 428)))
lengan_kiri = ada & poli([(60, 365), (300, 365), (292, 600), (300, 695), (372, 702), (385, 750), (60, 750)]) & ~hijau & dekat_putih & ~dekat_hijau
lengan_kanan = ada & poli([(712, 705), (830, 690), (900, 700), (900, 1110), (712, 1110)]) & ~hijau & dekat_putih & ~dekat_hijau
celana = ada & (yy > 938) & ~hijau | (ada & (yy > 1330))  # sepatu ada hijaunya
celana &= ~lengan_kanan
kaki_kiri = celana & (xx < 546)
kaki_kanan = celana & (xx >= 546)
badan = ada & ~kepala & ~lengan_kiri & ~lengan_kanan & ~celana

def simpan(nama, mask, img=im):
    o = img.copy(); o[:, :, 3] = np.where(mask, img[:, :, 3], 0); cv2.imwrite(f"{out}/{nama}.png", o)

putih = [232, 228, 228, 255]
lk = im.copy(); lk[:, :, 3] = np.where(lengan_kiri, im[:, :, 3], 0)
cv2.fillPoly(lk, [np.array([(300, 600), (390, 620), (390, 688), (305, 672)], np.int32)], putih)
cv2.imwrite(f"{out}/lengan-kiri.png", lk)
lka = im.copy(); lka[:, :, 3] = np.where(lengan_kanan, im[:, :, 3], 0)
cv2.fillPoly(lka, [np.array([(712, 640), (800, 630), (808, 670), (720, 692)], np.int32)], putih)
cv2.imwrite(f"{out}/lengan-kanan.png", lka)
warna_celana = [int(v) for v in im[1100, 450, :3]] + [255]
for nama, m, rintis in [("kaki-kiri", kaki_kiri, [(372, 900), (546, 900), (546, 990), (372, 990)]), ("kaki-kanan", kaki_kanan, [(546, 900), (712, 900), (712, 990), (546, 990)])]:
    o = im.copy(); o[:, :, 3] = np.where(m, im[:, :, 3], 0)
    cv2.fillPoly(o, [np.array(rintis, np.int32)], warna_celana)
    cv2.imwrite(f"{out}/{nama}.png", o)
bd = im.copy(); bd[:, :, 3] = np.where(badan, im[:, :, 3], 0)
cv2.fillPoly(bd, [np.array([(488, 395), (608, 395), (608, 462), (488, 462)], np.int32)], [int(v) for v in im[470, 545, :3]] + [255])
cv2.imwrite(f"{out}/badan.png", bd)
simpan("kepala", kepala)

d = np.full((H, W, 3), 255, np.uint8)
for m, c in [(badan, (90, 200, 90)), (lengan_kiri, (230, 120, 60)), (lengan_kanan, (60, 80, 230)), (kaki_kiri, (200, 60, 200)), (kaki_kanan, (200, 160, 60)), (kepala, (60, 200, 220))]:
    d[m] = c
cv2.imwrite(dbg, cv2.resize(d, (W // 2, H // 2)))

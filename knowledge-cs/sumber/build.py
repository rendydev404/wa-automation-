"""Bangun PDF + MD base knowledge dari isi/*.txt (urut nama berkas).

Format:
  # Nama Bagian          -> bagian baru
  ## Judul Kartu         -> kartu baru (satu kartu = satu halaman = satu potongan knowledge)
  - butir                -> butir daftar
  teks biasa             -> paragraf (baris kosong memisahkan paragraf)

Satu halaman PDF diekstrak dashboard sebagai satu paragraf, lalu dipotong per <=1.200 karakter.
Karena itu tiap kartu dijaga <= BATAS karakter supaya tidak pernah terbelah di tengah.
"""
import base64, html, re, subprocess, sys, pathlib

DIR = pathlib.Path(__file__).parent
BATAS = 1185
KAKI = "Suka Shawarma · Base Knowledge CS"
KAKI_MITRA = "Suka Shawarma · Base Knowledge Kemitraan"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def urai(teks):
    bagian, kartu = None, None
    semua = []
    for baris in teks.splitlines():
        b = baris.rstrip()
        if b.startswith("# "):
            bagian = b[2:].strip()
        elif b.startswith("## "):
            kartu = {"bagian": bagian, "judul": b[3:].strip(), "blok": []}
            semua.append(kartu)
        elif kartu is None:
            continue
        elif not b.strip():
            kartu["blok"].append(None)
        elif b.startswith("- "):
            if kartu["blok"] and isinstance(kartu["blok"][-1], list):
                kartu["blok"][-1].append(b[2:].strip())
            else:
                kartu["blok"].append([b[2:].strip()])
        else:
            # Satu baris = satu paragraf.
            kartu["blok"].append(b.strip())
    for k in semua:
        k["blok"] = [x for x in k["blok"] if x]
    return semua


def teks_kartu(k, no, kaki=None):
    baris = [k["bagian"], k["judul"]]
    for blok in k["blok"]:
        baris += blok if isinstance(blok, list) else [blok]
    baris.append(f"{kaki or KAKI} {no}")
    return "\n".join(baris)


def fmt(s):
    s = html.escape(s, quote=False)
    # Nomor telepon, tautan, dan kata bertanda hubung tidak boleh terbelah di akhir baris:
    # baris yang terbelah terekstrak sebagai "0822-9932-\n5621".
    s = re.sub(r"(?<![\w*])([\w.@:#]*[-/@][\w.@:/#?=,;-]*\w)", r'<span class="utuh">\1</span>', s)
    return re.sub(r"\*([^*]+)\*", r"<b>\1</b>", s)


def polos(s):
    return re.sub(r"\*([^*]+)\*", r"\1", s)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "pdf"
    mitra = mode == "kemitraan"
    global KAKI
    if mitra:
        KAKI = KAKI_MITRA
    sumber = DIR / {"data": "data", "kemitraan": "isi-kemitraan"}.get(mode, "isi")
    kartu = urai(chr(10).join(f.read_text(encoding="utf-8") for f in sorted(sumber.glob("*.txt"))))
    gagal = False
    for i, k in enumerate(kartu, 1):
        n = len(polos(teks_kartu(k, i)))
        k["n"] = n
        if n > BATAS:
            gagal = True
            print(f"TERLALU PANJANG ({n}): {k['judul']}")
    total = sum(k["n"] for k in kartu)
    print(f"{len(kartu)} kartu, {total} karakter, terpendek {min(k['n'] for k in kartu)}, terpanjang {max(k['n'] for k in kartu)}")
    if gagal and "--paksa" not in sys.argv:
        sys.exit(1)

    logo = base64.b64encode((DIR / "logo.webp").read_bytes()).decode()
    css = (DIR / "gaya.css").read_text(encoding="utf-8")
    hal = []
    bagian_lalu = None
    for i, k in enumerate(kartu, 1):
        isi = []
        for blok in k["blok"]:
            if isinstance(blok, list):
                isi.append("<ul>" + "".join(f"<li>{fmt(x)}</li>" for x in blok) + "</ul>")
            else:
                kelas = ' class="kunci"' if blok.startswith("Kata kunci:") else ""
                isi.append(f"<p{kelas}>{fmt(blok)}</p>")
        sampul = " sampul" if i == 1 else ""
        gambar = f'<img class="logo" src="data:image/webp;base64,{logo}" alt="">' if i == 1 else ""
        # h2 tersembunyi per bagian baru -> jadi bookmark PDF tanpa menambah teks halaman
        hal.append(
            f'<section class="page{sampul}">{gambar}<div class="sec">{fmt(k["bagian"])}</div>'
            f'<h1>{fmt(k["judul"])}</h1><div class="isi">{"".join(isi)}</div>'
            f'<div class="foot"><span>{KAKI}</span><span>{i}</span></div></section>'
        )
        bagian_lalu = k["bagian"]
    doc = (
        f'<!doctype html><html lang="id"><head><meta charset="utf-8"><title>{"Base Knowledge Kemitraan Suka Shawarma" if mitra else "Base Knowledge CS Suka Shawarma"}</title>'
        f'<link rel="stylesheet" href="fonts/local.css"><style>{css}</style></head><body>{"".join(hal)}</body></html>'
    )
    (DIR / "kb.html").write_text(doc, encoding="utf-8")

    # Kembaran teks: satu kartu = satu paragraf (baris tunggal di dalam, baris kosong di antara kartu).
    md = []
    for i, k in enumerate(kartu, 1):
        baris = [f"[{k['bagian']}] {k['judul']}"]
        for blok in k["blok"]:
            baris += [f"- {polos(x)}" for x in blok] if isinstance(blok, list) else [polos(blok)]
        md.append("\n".join(baris))
    nama_md = {"data": "Data-Menu-Harga-Promo-Outlet.md", "kemitraan": "Base-Knowledge-Kemitraan-Suka-Shawarma.md"}.get(mode, "Base-Knowledge-CS-Suka-Shawarma.md")
    (DIR / nama_md).write_text((chr(10) * 2).join(md) + chr(10), encoding="utf-8")
    if mode == "data":
        print("md:", nama_md)
        return

    pdf = DIR / "kb.pdf"
    r = subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf}", (DIR / "kb.html").as_uri()],
        capture_output=True, text=True, timeout=180,
    )
    import pymupdf
    d = pymupdf.open(pdf)
    toc, lalu = [], None
    for i, k in enumerate(kartu, 1):
        if k["bagian"] != lalu:
            toc.append([1, k["bagian"], i]); lalu = k["bagian"]
        toc.append([2, polos(k["judul"]), i])
    d.set_toc(toc)
    if mitra:
        d.set_metadata({"title": "Base Knowledge Kemitraan Suka Shawarma", "author": "Suka Shawarma", "subject": "Base knowledge kemitraan untuk asisten WhatsApp", "keywords": "Suka Shawarma, kemitraan, franchise, base knowledge"})
        keluar = DIR.parent / "Base-Knowledge-Kemitraan-Suka-Shawarma.pdf"
    else:
        d.set_metadata({"title": "Base Knowledge Customer Service Suka Shawarma", "author": "Suka Shawarma", "subject": "Base knowledge asisten WhatsApp", "keywords": "Suka Shawarma, customer service, base knowledge"})
        keluar = DIR / "Base-Knowledge-CS-Suka-Shawarma.pdf"
    d.save(keluar, garbage=3, deflate=True)
    print("pdf:", keluar.stat().st_size, "byte,", d.page_count, "halaman")


if __name__ == "__main__":
    main()

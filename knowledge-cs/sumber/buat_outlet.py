"""Tulis data/30-outlet.txt dari daftar outlet aktif (sumber: tabel outlets + pesanan 30 hari terakhir)."""
import pathlib


def K(lat, lng):
    return f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"


SEMUA = "GoFood, GrabFood, dan ShopeeFood"
# (nama, wilayah, kecamatan, alamat, peta, aplikasi pesan-antar, ada di situs pesan online, kata kunci tambahan)
O = [
    ("BNR", "Kota Bogor", "Bogor Selatan", "Jl. Bukit Nirwana Raya No.3, Mulyaharja, Kec. Bogor Selatan, Kota Bogor, Jawa Barat 16135", "https://maps.app.goo.gl/1Mo7Ma6v6McAfCyZ7", SEMUA, True, "bnr, bukit nirwana raya, mulyaharja, kitchen, suka shawarma kitchen, bogor selatan"),
    ("Empang", "Kota Bogor", "Bogor Selatan", "Jl. Pahlawan No.10A, Empang, Kec. Bogor Selatan, Kota Bogor, Jawa Barat 16132", "https://maps.app.goo.gl/3XX1dMon2aFqEc7z9", SEMUA, True, "empang, jalan pahlawan, bogor selatan"),
    ("Cimanggu", "Kota Bogor", "Tanah Sereal", "Ruko Bukit Cimanggu City, Jl. Bukit Cimanggu City Raya No.3A, Cibadak, Kec. Tanah Sereal, Kota Bogor, Jawa Barat 16165", "https://maps.app.goo.gl/keHGRtwSNcaMNbNn8", SEMUA, True, "cimanggu, bukit cimanggu city, bcc, cibadak, tanah sereal"),
    ("Pajajaran", "Kota Bogor", "Bogor Timur", "Jl. Raya Pajajaran No.21, RT.03/RW.06, Sukasari, Kec. Bogor Timur, Kota Bogor, Jawa Barat 16142", "https://maps.app.goo.gl/u5qzaaXNyFDCw83L9", SEMUA, True, "pajajaran, padjajaran, sukasari, bogor timur"),
    ("Dramaga", "Kota Bogor", "Bogor Barat", "Jl. Raya Dramaga No.15, RT.03/RW.03, Margajaya, Kec. Bogor Barat, Kota Bogor, Jawa Barat 16116", "https://maps.app.goo.gl/kjdhXWBJB4F3p1378", SEMUA, True, "dramaga, darmaga, margajaya, bogor barat"),
    ("Cibinong", "Kabupaten Bogor", "Cibinong", "Jl. Raya Sukahati No.35, Sukahati, Kec. Cibinong, Kabupaten Bogor, Jawa Barat 16913", "https://maps.app.goo.gl/RSZCK4CKHyvji4uK8", SEMUA, True, "cibinong, sukahati"),
    ("Kota Wisata Cibubur", "Kabupaten Bogor", "Gunung Putri", "Ruko Fresh Market Blok FMR 5, Jl. Boulevard Kota Wisata No.11, Ciangsana, Kec. Gunung Putri, Kabupaten Bogor, Jawa Barat 16968", "https://maps.app.goo.gl/y4eGdTV9j1hGLQbX7", SEMUA, True, "cibubur, kota wisata, fresh market, ciangsana, gunung putri"),
    ("Ciseeng", "Kabupaten Bogor", "Ciseeng", "Jl. H. Mawi No.17, Parigi Mekar, Kec. Ciseeng, Kabupaten Bogor, Jawa Barat 16120", "https://maps.app.goo.gl/SGPd9WkLhBHtJXP86", SEMUA, False, "ciseeng, parigi mekar"),
    ("Sentul", "Kabupaten Bogor", "Babakan Madang", "Jl. Raya Babakan Madang, Citaringgul, Kec. Babakan Madang, Kabupaten Bogor, Jawa Barat (dekat RM Rajo Balado)", K(-6.562316, 106.86102), SEMUA, True, "sentul, babakan madang, citaringgul"),
    ("Cileungsi", "Kabupaten Bogor", "Cileungsi", "Cileungsi, Kabupaten Bogor, Jawa Barat. Alamat jalan lengkapnya belum ada di data, jadi berikan tautan peta", K(-6.3899039, 106.9867841), "GoFood dan ShopeeFood", True, "cileungsi, metland cileungsi"),
    ("Cicurug", "Kabupaten Sukabumi", "Cicurug", "Jl. Siliwangi, Cicurug, Kec. Cicurug, Kabupaten Sukabumi, Jawa Barat 43359", K(-6.783306, 106.781924), SEMUA, True, "cicurug, sukabumi, jalan siliwangi"),
    ("Beji", "Kota Depok", "Beji", "Jl. H. Asmawi No.44, Beji, Kec. Beji, Kota Depok, Jawa Barat 16421", "https://maps.app.goo.gl/niCbBChrqKDkxL1c8", SEMUA, True, "beji, depok, jalan haji asmawi"),
    ("Depok Sukmajaya", "Kota Depok", "Sukmajaya", "Jl. K.H.M. Yusuf Raya, Mekar Jaya, Kec. Sukmajaya, Kota Depok, Jawa Barat 16411", "https://maps.app.goo.gl/TJDyhiBLPMU9GrXf9", SEMUA, True, "sukmajaya, depok, mekar jaya, jalan kh m yusuf"),
    ("Sawangan", "Kota Depok", "Pancoran Mas", "Jl. Raya Sawangan, Mampang, Kec. Pancoran Mas, Kota Depok, Jawa Barat 16435", K(-6.3945632, 106.7940041), SEMUA, True, "sawangan, depok, mampang, pancoran mas"),
    ("Jagakarsa", "Jakarta Selatan", "Jagakarsa", "Jl. Raya Jagakarsa No.159, RT.13/RW.1, Jagakarsa, Kec. Jagakarsa, Jakarta Selatan 12620", "https://maps.app.goo.gl/vsujPCoa77Rg77VG6", SEMUA, True, "jagakarsa, jakarta selatan, jaksel"),
    ("Kalisari", "Jakarta Timur", "Pasar Rebo", "Jl. Kalisari No.13, RT.6/RW.2, Kalisari, Kec. Pasar Rebo, Jakarta Timur 13790", "https://maps.app.goo.gl/Hi6rPCD9eYZxEEsa8", SEMUA, True, "kalisari, kali sari, pasar rebo, jakarta timur, jaktim"),
    ("Jatiwaringin", "Kota Bekasi", "Pondok Gede", "Jl. Raya Jatiwaringin No.51, Jatiwaringin, Kec. Pondok Gede, Kota Bekasi, Jawa Barat 17411", "https://maps.app.goo.gl/MpwxJhouK4DEjZk16", SEMUA, True, "jatiwaringin, pondok gede, bekasi"),
    ("Pekayon", "Kota Bekasi", "Bekasi Selatan", "Jl. Pulo Ribung No.1, Pekayon Jaya, Kec. Bekasi Selatan, Kota Bekasi, Jawa Barat 17147", "https://maps.app.goo.gl/4Unngc9S6GWbc57q6", SEMUA, True, "pekayon, pulo ribung, bekasi selatan, bekasi"),
    ("Cirendeu", "Kota Tangerang Selatan", "Ciputat Timur", "Jl. Raya Cirendeu, Pisangan, Kec. Ciputat Timur, Kota Tangerang Selatan, Banten", "https://maps.app.goo.gl/fvzb4QR7Hmfi2ki46", SEMUA, True, "cirendeu, pisangan, ciputat, ciputat timur, tangsel, tangerang selatan"),
    ("Pamulang", "Kota Tangerang Selatan", "Pamulang", "Jl. Suryakencana No.54, Pamulang Barat, Kec. Pamulang, Kota Tangerang Selatan, Banten 15411", K(-6.3468928, 106.7351637), SEMUA, True, "pamulang, pamulang barat, surya kencana, tangsel, tangerang selatan"),
    ("Ciledug", "Kota Tangerang", "Karang Tengah", "Jl. Raden Saleh, RT.002/RW.015, Karang Tengah, Kec. Karang Tengah, Kota Tangerang, Banten 15157", K(-6.2121779, 106.71225), None, True, "ciledug, cileduk, cileudug, karang tengah, raden saleh, tangerang"),
]

T = ["# Outlet dan Jam Buka", ""]
T += [
    "## Jam buka outlet Suka Shawarma",
    "Semua outlet Suka Shawarma buka setiap hari, Senin sampai Minggu, pukul 14.00 sampai 22.00 WIB. Jam buka ini sama untuk semua outlet, per 14 Oktober 2026.",
    "- Outlet mulai melayani pukul 14.00 WIB dan tutup pukul 22.00 WIB.",
    "- Di situs pesan online order.sukashawarma.com, pilihan waktu ambil tersedia dari pukul 14.00 sampai 21.45 WIB.",
    "- Menjelang tutup, sebagian menu bisa sudah habis. Sarankan pelanggan datang sebelum pukul 21.30.",
    "- Layanan Big Order (pesanan besar untuk acara) menerima pesanan setiap hari pukul 13.00 sampai 20.00 WIB lewat WhatsApp Big Order.",
    "Jadwal khusus tanggal merah, Ramadan, dan Lebaran belum ada di data. Kalau ditanya, katakan kamu belum punya infonya.",
    "Pakai waktu sekarang untuk menjawab apakah outlet sedang buka. Contoh: kalau sekarang pukul 10.00, outlet belum buka dan baru buka pukul 14.00.",
    "Kata kunci: jam buka, buka jam berapa, tutup jam berapa, jam operasional, hari ini buka, sekarang buka, masih buka, sudah tutup, minggu buka, sabtu, setiap hari, pagi, siang, malam, last order.",
    "",
]
wil = {}
for o in O:
    wil.setdefault(o[1], []).append(o[0])
T += ["## Daftar semua outlet Suka Shawarma yang aktif", f"Per 14 Oktober 2026 ada {len(O)} outlet Suka Shawarma yang aktif melayani pelanggan:"]
for w, ns in wil.items():
    T.append(f"- {w}: " + ", ".join(ns) + ".")
T += [
    "Semua outlet buka setiap hari pukul 14.00 sampai 22.00 WIB. Alamat lengkap dan tautan peta tiap outlet ada di data outlet masing-masing.",
    "Kalau pelanggan menanyakan outlet yang tidak ada di daftar ini, katakan outlet itu tidak ada di daftar outlet aktif saat ini, lalu tawarkan outlet terdekat dari daftar. Daftar outlet di situs atau unggahan lama bisa berbeda karena belum diperbarui.",
    "Kata kunci: daftar outlet, list outlet, semua cabang, cabang mana saja, lokasi, outlet terdekat, cabang terdekat, dekat sini, ada di mana saja, kota mana, berapa cabang, bogor, depok, jakarta, bekasi, tangerang, sukabumi.",
    "",
]
for nama, wilayah, kec, alamat, peta, app, online, kk in O:
    pendek = nama.split(" (")[0]
    T.append(f"## Outlet Suka Shawarma {nama}, {wilayah}")
    T.append(f"Suka Shawarma {pendek} adalah outlet Suka Shawarma di {wilayah}, Kecamatan {kec}.")
    T.append(f"- Alamat outlet {pendek}: {alamat}.")
    T.append(f"- Jam buka outlet {pendek}: setiap hari pukul 14.00 sampai 22.00 WIB.")
    T.append(f"- Peta lokasi (Google Maps): {peta}")
    if app:
        T.append(f"- Pesan antar dari outlet {pendek}: tersedia di {app}.")
    else:
        T.append(f"- Pesan antar: outlet {pendek} belum tercatat melayani GoFood, GrabFood, atau ShopeeFood. Pembelian dilakukan langsung di outlet.")
    if online:
        T.append(f"- Pesan online ambil di outlet: bisa lewat order.sukashawarma.com, pilih outlet {pendek}.")
    else:
        T.append(f"- Pesan online ambil di outlet: outlet {pendek} belum ada di situs order.sukashawarma.com.")
    T.append(f"Harga menu di outlet {pendek} sama dengan outlet lain.")
    T.append(f"Kata kunci: outlet {pendek.lower()}, cabang {pendek.lower()}, alamat, lokasi, dimana, di mana, sebelah mana, daerah mana, maps, peta, shareloc, rute, {kk}.")
    T.append("")
pathlib.Path(__file__).with_name("data").joinpath("30-outlet.txt").write_text("\n".join(T), encoding="utf-8")
print(len(O), "outlet")

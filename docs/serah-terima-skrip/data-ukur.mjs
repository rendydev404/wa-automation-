// Data contoh seukuran produksi untuk ukur-navigasi.mjs & profil-query.mjs (database sementara, bukan produksi).
export async function isiData(sql, { admin, user, kini }) {
  // 2.000 akun lain (hash password sama, tidak dipakai login)
  await sql`INSERT INTO users(email, nama, password_hash, peran, created_at)
            SELECT 'akun' || g || '@contoh.test', 'Akun ' || g, ${admin.password_hash}, 'user', ${kini} - g * 600 FROM generate_series(1, 2000) g`;
  // 10 nomor milik budi + 1.500 nomor milik akun lain
  await sql`INSERT INTO numbers(sesi, wa_id, label, created_at, user_id)
            SELECT 'sb' || g, '62811000' || lpad(g::text, 4, '0'), 'Toko Budi ' || g, ${kini}, ${user.id} FROM generate_series(1, 10) g`;
  await sql`INSERT INTO numbers(sesi, wa_id, label, created_at, user_id)
            SELECT 's' || g, '62812' || lpad(g::text, 7, '0'), 'Nomor ' || g, ${kini}, (SELECT id FROM users WHERE email = 'akun' || (1 + g % 2000) || '@contoh.test') FROM generate_series(1, 1500) g`;
  // statistik 90 hari semua nomor
  await sql`INSERT INTO stats(number_id, tanggal, masuk, dibalas, gagal)
            SELECT n.id, (now() AT TIME ZONE 'Asia/Jakarta')::date - d, (random() * 80)::int, (random() * 60)::int, (random() * 2)::int
              FROM numbers n, generate_series(0, 89) d`;
  // percakapan: 400 per nomor budi, 40 per nomor lain; 12 pesan per percakapan budi
  await sql`INSERT INTO percakapan(number_id, kunci, telepon, nama, cuplikan, masuk_n, bot_n, terakhir_pada)
            SELECT n.id, 'k' || n.id || '-' || g, '6285' || lpad((n.id * 1000 + g)::text, 9, '0'), 'Pelanggan ' || g, 'Halo kak, masih ada stok?', 6, 6, ${kini} - g * 300
              FROM numbers n, generate_series(1, CASE WHEN n.user_id = ${user.id} THEN 400 ELSE 40 END) g`;
  await sql`INSERT INTO pesan_chat(percakapan_id, peran, teks, waktu)
            SELECT p.id, (g % 2)::smallint, 'Pesan contoh nomor ' || g || ' tentang produk dan harga.', p.terakhir_pada - (12 - g) * 30
              FROM percakapan p JOIN numbers n ON n.id = p.number_id AND n.user_id = ${user.id}, generate_series(1, 12) g`;
  // pemakaian AI 180 hari: ±300 ribu baris, ditulis urut waktu seperti produksi (baris masuk saat balasan dibuat)
  await sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, model, token_masuk, token_keluar, biaya_usd, ms)
            SELECT number_id, waktu, 'hermes', 'claude', 1200, 180, 0.0021, 1800 FROM (
              SELECT n.id AS number_id, ${kini} - (random() * 180 * 86400)::int AS waktu FROM numbers n, generate_series(1, 200) g) x
             ORDER BY waktu`;
  // transaksi 3.000, log admin 5.000, notifikasi 300 untuk budi & admin, analitik 60 hari
  const paket = await sql`SELECT id, nama, harga FROM paket ORDER BY id`;
  await sql`INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, dibuat, dibayar)
            SELECT 'WA-' || u.id || '-' || g, u.id, ${paket[1].id}, ${paket[1].nama}, ${paket[1].harga},
                   (ARRAY['lunas','menunggu','gagal','kedaluwarsa'])[1 + g % 4], ${kini} - g * 900, CASE WHEN g % 4 = 0 THEN ${kini} - g * 900 END
              FROM generate_series(1, 3000) g JOIN users u ON u.email = 'akun' || (1 + g % 2000) || '@contoh.test'`;
  await sql`INSERT INTO admin_log(admin_id, admin, aksi, sasaran, detail, waktu)
            SELECT ${admin.id}, 'admin@contoh.test', 'ubah_kuota', 'akun' || g || '@contoh.test', 'kuota 3', ${kini} - g * 120 FROM generate_series(1, 5000) g`;
  for (const u of [admin, user])
    await sql`INSERT INTO notifikasi(user_id, jenis, judul, isi, dibuat, dibaca)
              SELECT ${u.id}, 'info', 'Notifikasi ' || g, 'Isi notifikasi contoh ' || g, ${kini} - g * 3600, CASE WHEN g > 5 THEN ${kini}::bigint END FROM generate_series(1, 300) g`;
  await sql`INSERT INTO analitik_harian(tanggal, jenis, kunci, label, user_id, n, terakhir)
            SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date - d, (g % 3)::smallint, '/halaman-' || (g % 40), CASE WHEN g % 3 = 1 THEN 'Tombol ' || (g % 25) ELSE '' END,
                   (SELECT id FROM users WHERE email = 'akun' || (1 + g % 300) || '@contoh.test'), 1 + g % 9, ${kini}
              FROM generate_series(0, 59) d, generate_series(1, 600) g ON CONFLICT DO NOTHING`;
  // 400 langganan aktif + 600 yang sudah berakhir (KPI berbayar, kuota menipis, langganan berakhir)
  await sql`INSERT INTO langganan(user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber)
            SELECT u.id, ${paket[1].id}, ${paket[1].nama}, ${kini} - (g % 25) * 86400 - CASE WHEN g > 400 THEN 40 * 86400 ELSE 0 END,
                   ${kini} + (30 - g % 25) * 86400 - CASE WHEN g > 400 THEN 40 * 86400 ELSE 0 END, 3, 3500, 'midtrans'
              FROM generate_series(1, 1000) g JOIN users u ON u.email = 'akun' || g || '@contoh.test'`;
  await sql`ANALYZE`;
}

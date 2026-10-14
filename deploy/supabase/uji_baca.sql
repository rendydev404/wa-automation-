select length(hasil::text) as karakter, jsonb_array_length(hasil->'outlet') outlet, jsonb_array_length(hasil->'menu') menu, jsonb_array_length(hasil->'promo') promo, hasil->'berikutnya' berikutnya, (select jsonb_agg(e->>'nama') from jsonb_array_elements(hasil->'menu') e) menu_nama, (select jsonb_agg(concat(e->>'nama',' | ',e->>'wilayah',' | ',e->'aplikasi')) from jsonb_array_elements(hasil->'outlet') e) outlet_nama from (
  with outlet_aktif as (
    select o.id, o.name, o.address, o.region, o.lat, o.lng, o.open_hour, o.close_hour, o.type
      from public.outlets o
     where o.type in ('internal', 'mitra') and o.is_active and o.status = 'active' and o.deleted_at is null
       and o.address is not null and o.lat is not null and o.lng is not null
  ),
  tutup as (
    select distinct on (t.outlet_id) t.outlet_id, t.sampai, t.alasan
      from public.outlet_tutup_sementara t
     where t.dicabut_pada is null and t.sampai > now()
     order by t.outlet_id, t.sampai desc
  ),
  menu as (
    select m.id, m.name, m.description, m.price, m.channel_prices, m.is_package, m.sort_order,
           c.name as kategori, coalesce(c.sort_order, 999) as kategori_urut
      from public.menu_items m
      left join public.categories c on c.id = m.category_id
     where m.outlet_id is null and m.is_available and m.price > 0
       and m.strike_price is null                                  -- harga coret = deal TikTok, bukan menu outlet
       and coalesce(cardinality(m.available_outlets), 0) = 0       -- menu khusus satu-dua outlet tidak ikut
  ),
  promo as (
    select p.promo_name, p.scope, p.discount_type, p.discount_value, p.min_purchase, p.buy_quantity, p.get_quantity,
           p.apply_to_food_apps, p.start_date, p.end_date, p.daily_start_time, p.daily_end_time, p.daily_schedule, p.usage_limit,
           mi.name as menu, rw.name as hadiah,
           array_agg(distinct oa.name order by oa.name) filter (where oa.id is not null) as outlet,
           bool_or(p.outlet_id is null) as semua_outlet
      from public.outlet_promos p
      left join outlet_aktif oa on oa.id = p.outlet_id
      left join public.menu_items mi on mi.id = p.menu_item_id
      left join public.menu_items rw on rw.id = p.reward_menu_item_id
     where p.is_active and (p.end_date is null or p.end_date > now())
       and (p.outlet_id is null or oa.id is not null)
     group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
  )
  select jsonb_build_object(
    'versi', 0,
    'dibuat', now(),
    'outlet', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nama', oa.name, 'alamat', oa.address, 'wilayah', oa.region, 'lat', oa.lat, 'lng', oa.lng,
               'buka', to_char(oa.open_hour, 'HH24.MI'), 'tutup', to_char(oa.close_hour, 'HH24.MI'),
               'tutup_sementara_sampai', t.sampai, 'alasan_tutup', t.alasan,
               -- Aplikasi pesan-antar yang benar-benar dipakai outlet ini dalam 30 hari terakhir (indeks outlet+channel).
               'aplikasi', (select coalesce(jsonb_agg(k.ch order by k.ch), '[]'::jsonb)
                              from unnest(array['gofood', 'grabfood', 'shopeefood']) as k(ch)
                             where exists (select 1 from public.orders x
                                            where x.outlet_id = oa.id and x.channel = k.ch and x.created_at > now() - interval '30 days'))
             ) order by oa.region nulls last, oa.name)
        from outlet_aktif oa left join tutup t on t.outlet_id = oa.id), '[]'::jsonb),
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nama', m.name, 'deskripsi', m.description, 'kategori', m.kategori, 'harga', m.price,
               'gofood', m.channel_prices ->> 'gofood', 'grabfood', m.channel_prices ->> 'grabfood', 'shopeefood', m.channel_prices ->> 'shopeefood',
               'isi', (select jsonb_agg(mp.quantity || 'x ' || i.name || coalesce(' atau ' || oi.name, '') order by i.name)
                         from public.menu_packages mp
                         join public.menu_items i on i.id = mp.menu_item_id
                         left join public.menu_items oi on oi.id = mp.or_menu_item_id
                        where mp.package_id = m.id),
               'harga_khusus_outlet', (select jsonb_agg(jsonb_build_object('outlet', oa.name, 'harga', mop.price, 'tersedia', mop.is_available) order by oa.name)
                                         from public.menu_outlet_prices mop join outlet_aktif oa on oa.id = mop.outlet_id
                                        where mop.menu_item_id = m.id and (mop.price is distinct from m.price or not mop.is_available))
             ) order by m.kategori_urut, m.kategori, m.sort_order, m.name)
        from menu m), '[]'::jsonb),
    'promo', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.start_date nulls first, pr.promo_name) from promo pr), '[]'::jsonb),
    -- Batas waktu terdekat (promo mulai/berakhir, outlet buka lagi): dashboard menarik ulang tepat saat itu.
    'berikutnya', (select min(w) from (
        select p.start_date as w from public.outlet_promos p where p.is_active and p.start_date > now()
        union all select p.end_date from public.outlet_promos p where p.is_active and p.end_date > now()
        union all select t.sampai from tutup t) b)
  ) as hasil
) z
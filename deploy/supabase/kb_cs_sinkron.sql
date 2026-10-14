-- Sinkron otomatis menu, harga, promo, dan status outlet ke asisten WhatsApp (dashboard wa.sukapost.tech).
--
-- Cara kerja:
--  1. Trigger di tabel menu/harga/promo/outlet menyala HANYA bila kolom yang dilihat pelanggan berubah
--     (penjualan, stok, pemakaian kuota promo tidak memicu apa pun). Per transaksi paling banyak satu sinyal.
--  2. Sinyal = POST kecil bertanda tangan HMAC lewat pg_net (asinkron: tidak menahan transaksi kasir)
--     berisi nomor versi saja, tanpa data. Kalau url_ping kosong, tidak ada yang dikirim.
--  3. Dashboard lalu menarik ringkasan lewat public.kb_cs_ambil(kunci). Fungsi itu hanya mengembalikan
--     kolom untuk pelanggan (nama, deskripsi, harga outlet & aplikasi, isi paket, promo aktif, outlet aktif).
--     Tanpa kunci yang benar, fungsi mengembalikan null.
--
-- Semua fungsi trigger dibungkus EXCEPTION: kegagalan sinyal tidak pernah menggagalkan simpan di kasir.
-- Rahasia (kunci tarik, rahasia HMAC) TIDAK ada di berkas ini; diisi terpisah (lihat bagian akhir).

create schema if not exists kb_cs;
revoke all on schema kb_cs from public, anon, authenticated;

create table if not exists kb_cs.pengaturan (
  id          smallint primary key default 1 check (id = 1),
  url_ping    text,          -- mis. https://wa.sukapost.tech/api/sinkron ; null = tidak mengirim sinyal
  kunci_hash  text,          -- sha256 (hex) dari kunci tarik; kunci aslinya hanya ada di env dashboard
  diubah_pada timestamptz not null default now()
);
insert into kb_cs.pengaturan (id) values (1) on conflict (id) do nothing;
revoke all on kb_cs.pengaturan from public, anon, authenticated;

create sequence if not exists kb_cs.versi;

-- ---------- Sinyal ----------

create or replace function kb_cs.tandai() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_rahasia text;
  v_badan jsonb;
  v_waktu text;
begin
  -- Satu sinyal per transaksi, walau banyak baris/tabel berubah di dalamnya.
  if current_setting('kb_cs.sudah', true) = '1' then
    return null;
  end if;
  perform set_config('kb_cs.sudah', '1', true);

  update kb_cs.pengaturan set diubah_pada = clock_timestamp() where id = 1 returning url_ping into v_url;
  if coalesce(v_url, '') = '' then
    perform nextval('kb_cs.versi');
    return null;
  end if;
  select s.decrypted_secret into v_rahasia from vault.decrypted_secrets s where s.name = 'kb_cs_rahasia_ping';
  if v_rahasia is null then
    return null;
  end if;

  v_waktu := floor(extract(epoch from clock_timestamp()))::bigint::text;
  v_badan := jsonb_build_object('versi', nextval('kb_cs.versi'), 'tabel', tg_table_name);
  perform net.http_post(
    url := v_url,
    body := v_badan,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-KB-Waktu', v_waktu,
      -- Ditandatangani persis teks yang dikirim pg_net (jsonb -> text).
      'X-KB-Tanda', encode(extensions.hmac(v_waktu || '.' || v_badan::text, v_rahasia, 'sha256'), 'hex')
    ),
    timeout_milliseconds := 5000
  );
  return null;
exception when others then
  return null;
end $$;
revoke all on function kb_cs.tandai() from public, anon, authenticated;

-- INSERT/DELETE: per pernyataan. UPDATE: per baris, hanya bila kolom yang terlihat pelanggan berubah
-- (kondisi WHEN dievaluasi tanpa memanggil fungsi, jadi update lain nyaris tanpa biaya).
drop trigger if exists kb_cs_menu_ubah on public.menu_items;
create trigger kb_cs_menu_ubah after update on public.menu_items for each row
  when ((old.name, old.description, old.price, old.channel_prices, old.is_available, old.category_id, old.strike_price, old.available_outlets, old.outlet_id, old.sort_order, old.is_package)
        is distinct from (new.name, new.description, new.price, new.channel_prices, new.is_available, new.category_id, new.strike_price, new.available_outlets, new.outlet_id, new.sort_order, new.is_package))
  execute function kb_cs.tandai();
drop trigger if exists kb_cs_menu_tambah_hapus on public.menu_items;
create trigger kb_cs_menu_tambah_hapus after insert or delete on public.menu_items for each statement execute function kb_cs.tandai();

drop trigger if exists kb_cs_kategori on public.categories;
create trigger kb_cs_kategori after insert or update or delete on public.categories for each statement execute function kb_cs.tandai();

drop trigger if exists kb_cs_paket on public.menu_packages;
create trigger kb_cs_paket after insert or update or delete on public.menu_packages for each statement execute function kb_cs.tandai();

drop trigger if exists kb_cs_harga_outlet_ubah on public.menu_outlet_prices;
create trigger kb_cs_harga_outlet_ubah after update on public.menu_outlet_prices for each row
  when ((old.price, old.is_available, old.menu_item_id, old.outlet_id) is distinct from (new.price, new.is_available, new.menu_item_id, new.outlet_id))
  execute function kb_cs.tandai();
drop trigger if exists kb_cs_harga_outlet_tambah_hapus on public.menu_outlet_prices;
create trigger kb_cs_harga_outlet_tambah_hapus after insert or delete on public.menu_outlet_prices for each statement execute function kb_cs.tandai();

-- current_usage (pemakaian kuota) sengaja tidak ikut: berubah di tiap transaksi berpromo.
drop trigger if exists kb_cs_promo_ubah on public.outlet_promos;
create trigger kb_cs_promo_ubah after update on public.outlet_promos for each row
  when ((old.is_active, old.promo_name, old.scope, old.menu_item_id, old.discount_type, old.discount_value, old.min_purchase, old.start_date, old.end_date,
         old.daily_start_time, old.daily_end_time, old.daily_schedule, old.buy_quantity, old.get_quantity, old.reward_menu_item_id, old.apply_to_food_apps,
         old.outlet_id, old.excluded_menu_item_ids, old.usage_limit)
        is distinct from
        (new.is_active, new.promo_name, new.scope, new.menu_item_id, new.discount_type, new.discount_value, new.min_purchase, new.start_date, new.end_date,
         new.daily_start_time, new.daily_end_time, new.daily_schedule, new.buy_quantity, new.get_quantity, new.reward_menu_item_id, new.apply_to_food_apps,
         new.outlet_id, new.excluded_menu_item_ids, new.usage_limit))
  execute function kb_cs.tandai();
drop trigger if exists kb_cs_promo_tambah_hapus on public.outlet_promos;
create trigger kb_cs_promo_tambah_hapus after insert or delete on public.outlet_promos for each statement execute function kb_cs.tandai();

drop trigger if exists kb_cs_outlet_ubah on public.outlets;
create trigger kb_cs_outlet_ubah after update on public.outlets for each row
  when ((old.name, old.address, old.lat, old.lng, old.type, old.is_active, old.status, old.deleted_at, old.open_hour, old.close_hour, old.region)
        is distinct from (new.name, new.address, new.lat, new.lng, new.type, new.is_active, new.status, new.deleted_at, new.open_hour, new.close_hour, new.region))
  execute function kb_cs.tandai();
drop trigger if exists kb_cs_outlet_tambah_hapus on public.outlets;
create trigger kb_cs_outlet_tambah_hapus after insert or delete on public.outlets for each statement execute function kb_cs.tandai();

drop trigger if exists kb_cs_tutup_sementara on public.outlet_tutup_sementara;
create trigger kb_cs_tutup_sementara after insert or update or delete on public.outlet_tutup_sementara for each statement execute function kb_cs.tandai();

-- ---------- Ringkasan untuk dashboard ----------

create or replace function public.kb_cs_ambil(p_kunci text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hash text;
  v_hasil jsonb;
begin
  select p.kunci_hash into v_hash from kb_cs.pengaturan p where p.id = 1;
  if v_hash is null or p_kunci is null or encode(extensions.digest(p_kunci, 'sha256'), 'hex') <> v_hash then
    return null;
  end if;

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
    'versi', (select last_value from kb_cs.versi),
    'dibuat', coalesce((select diubah_pada from kb_cs.pengaturan where id = 1), now()),
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
                                        where mop.menu_item_id = m.id and ((mop.price is not null and mop.price > 0 and mop.price <> m.price) or not mop.is_available))
             ) order by m.kategori_urut, m.kategori, m.sort_order, m.name)
        from menu m), '[]'::jsonb),
    'promo', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.start_date nulls first, pr.promo_name) from promo pr), '[]'::jsonb),
    -- Batas waktu terdekat (promo mulai/berakhir, outlet buka lagi): dashboard menarik ulang tepat saat itu.
    'berikutnya', (select min(w) from (
        select p.start_date as w from public.outlet_promos p where p.is_active and p.start_date > now()
        union all select p.end_date from public.outlet_promos p where p.is_active and p.end_date > now()
        union all select t.sampai from tutup t) b)
  ) into v_hasil;
  return v_hasil;
end $$;
revoke all on function public.kb_cs_ambil(text) from public;
grant execute on function public.kb_cs_ambil(text) to anon, authenticated, service_role;

-- ---------- Pengaturan (dijalankan terpisah, JANGAN disimpan di berkas) ----------
-- update kb_cs.pengaturan set kunci_hash = encode(extensions.digest('<KUNCI_TARIK>', 'sha256'), 'hex'), diubah_pada = now() where id = 1;
-- select vault.create_secret('<RAHASIA_HMAC>', 'kb_cs_rahasia_ping', 'Rahasia tanda tangan sinyal sinkron CS');
-- update kb_cs.pengaturan set url_ping = 'https://wa.sukapost.tech/api/sinkron', diubah_pada = now() where id = 1;   -- setelah dashboard versi baru jalan

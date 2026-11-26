-- Data demo Jangkau. Semua entitas sintetis; tidak ada data warga nyata.
-- Jalankan setelah 0001_init.sql:
--   psql "$PGURL" -f packages/db/seeds/demo.sql
--
-- Akun demo dibuat lewat Supabase Admin API (lihat README), bukan di sini,
-- karena password harus dikelola auth.users. Seed ini hanya mengisi profil
-- dan data domain yang dirujuk oleh akun tersebut.

-- ---------------------------------------------------------------- profil

insert into public.profiles (id, full_name, phone, role)
select u.id, 'Demo Pelapor', '081200000001', 'resident'
from auth.users u
where u.email = 'demo.pelapor@jangkau.test'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

insert into public.profiles (id, full_name, phone, role)
select u.id, 'Demo Admin', '081200000002', 'admin'
from auth.users u
where u.email = 'demo.admin@jangkau.test'
on conflict (id) do update set role = excluded.role;

-- ---------------------------------------------------------------- pos

insert into public.relief_posts (id, name, address, regency, province, location, radius_m, headcount, capacity, status)
values
  ('a1000000-0000-4000-8000-000000000001',
   'Pos Pengungsian Balai Desa Sukamaju', 'Jl. Raya Sukamaju 12', 'Malang', 'Jawa Timur',
   'SRID=4326;POINT(112.633300 -7.966600)'::geography, 500, 120, 200, 'active'),
  ('a1000000-0000-4000-8000-000000000002',
   'Pos Pengungsian SDN 3 Tanjungrejo', 'Jl. Pendidikan 4', 'Malang', 'Jawa Timur',
   'SRID=4326;POINT(112.640100 -7.971200)'::geography, 300, 85, 120, 'active'),
  ('a1000000-0000-4000-8000-000000000003',
   'Pos Pengungsian GOR Kecamatan', 'Jl. Olahraga 1', 'Malang', 'Jawa Timur',
   'SRID=4326;POINT(112.628000 -7.960000)'::geography, 800, 240, 400, 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- stok

insert into public.stock_items (post_id, name, category, unit, quantity, low_stock_threshold)
values
  ('a1000000-0000-4000-8000-000000000001', 'Air mineral 600ml', 'water', 'dus', 12, 20),
  ('a1000000-0000-4000-8000-000000000001', 'Beras', 'food', 'karung', 30, 10),
  ('a1000000-0000-4000-8000-000000000001', 'Selimut', 'clothing', 'lembar', 8, 25),
  ('a1000000-0000-4000-8000-000000000002', 'Air mineral 600ml', 'water', 'dus', 4, 10),
  ('a1000000-0000-4000-8000-000000000002', 'Masker medis', 'health', 'kotak', 6, 5),
  ('a1000000-0000-4000-8000-000000000003', 'Beras', 'food', 'karung', 55, 20),
  ('a1000000-0000-4000-8000-000000000003', 'Matras', 'shelter', 'lembar', 40, 15)
on conflict (post_id, name) do nothing;

-- ---------------------------------------------------------------- laporan

insert into public.reports (
  id, client_uuid, post_id, reporter_id, body_text, category, severity,
  location, captured_at, status
)
select
  'b1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000011',
  'a1000000-0000-4000-8000-000000000001',
  p.id,
  'Pos ini kekurangan air bersih untuk 120 pengungsi. Persediaan tinggal 12 dus.',
  'water', 'high',
  'SRID=4326;POINT(112.633400 -7.966700)'::geography,
  now() - interval '3 hours', 'validated'
from public.profiles p where p.full_name = 'Demo Pelapor'
on conflict (id) do nothing;

insert into public.reports (
  id, client_uuid, post_id, reporter_id, body_text, category, severity,
  location, captured_at, status
)
select
  'b1000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000012',
  'a1000000-0000-4000-8000-000000000001',
  p.id,
  'Butuh 30 selimut tambahan, malam ini suhu turun dan anak-anak kedinginan.',
  'clothing', 'critical',
  'SRID=4326;POINT(112.633200 -7.966500)'::geography,
  now() - interval '2 hours', 'validated'
from public.profiles p where p.full_name = 'Demo Pelapor'
on conflict (id) do nothing;

insert into public.reports (
  id, client_uuid, post_id, reporter_id, body_text, category, severity,
  location, captured_at, status
)
select
  'b1000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000013',
  'a1000000-0000-4000-8000-000000000002',
  p.id,
  'Air minum habis, sisa 4 dus untuk 85 orang. Mohon kirim hari ini.',
  'water', 'critical',
  'SRID=4326;POINT(112.640000 -7.971100)'::geography,
  now() - interval '50 minutes', 'validated'
from public.profiles p where p.full_name = 'Demo Pelapor'
on conflict (id) do nothing;

-- ---------------------------------------------------------------- organisasi

insert into public.organizations (
  id, name, legal_type, legal_doc_key, pic_name, pic_phone, pic_email, verification_status, verified_at
)
values
  ('c1000000-0000-4000-8000-000000000001',
   'Yayasan Peduli Malang', 'yayasan', 'org-docs/demo/akta.pdf',
   'Siti Rahma', '081200000010', 'siti@pedulimalang.test', 'verified', now()),
  ('c1000000-0000-4000-8000-000000000002',
   'Komunitas Relawan Tanggap', 'komunitas', 'org-docs/demo/sk.pdf',
   'Bayu Prakoso', '081200000011', 'bayu@tanggap.test', 'pending', null)
on conflict (id) do nothing;

insert into public.organization_members (organization_id, profile_id, member_role)
select 'c1000000-0000-4000-8000-000000000001', u.id, 'owner'
from auth.users u
where u.email = 'demo.org@jangkau.test'
on conflict do nothing;

-- ---------------------------------------------------------------- kampanye

insert into public.campaigns (
  id, report_id, organization_id, title, summary, target_amount, status,
  reporter_confirmed_by, reporter_confirmed_at, activated_at
)
select
  'd1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'Air bersih untuk Pos Balai Desa Sukamaju',
  'Pengadaan air mineral dan tandon darurat untuk 120 pengungsi.',
  2500000, 'active',
  p.id, now() - interval '2 hours', now() - interval '2 hours'
from public.profiles p where p.full_name = 'Demo Pelapor'
on conflict (id) do nothing;

insert into public.budget_items (campaign_id, name, category, quantity, unit, unit_cost, note)
values
  ('d1000000-0000-4000-8000-000000000001', 'Air mineral 600ml', 'water', 60, 'dus', 45000, 'Kebutuhan 3 hari'),
  ('d1000000-0000-4000-8000-000000000001', 'Tandon air 500L', 'water', 2, 'unit', 900000, 'Penampungan sementara'),
  ('d1000000-0000-4000-8000-000000000001', 'Biaya angkut', 'other', 1, 'paket', 400000, 'Dari gudang ke pos')
on conflict do nothing;

-- ---------------------------------------------------------------- ringkasan

select
  (select count(*) from public.relief_posts) as pos,
  (select count(*) from public.stock_items) as stok,
  (select count(*) from public.reports) as laporan,
  (select count(*) from public.campaigns) as kampanye;

-- Jangkau — data demo untuk Final Day.
-- Idempoten: UUID tetap + on conflict do nothing, aman dijalankan berulang.
--
-- Akun demo (password semua: Jangkau2026!)
--   demo.admin@jangkau.test      admin
--   demo.pelapor@jangkau.test    warga, punya lencana Pelapor
--   demo.org@jangkau.test        penyalur organisasi, terverifikasi
--   demo.relawan@jangkau.test    penyalur relawan, terverifikasi
--   demo.kreator@jangkau.test    penyalur kreator, terverifikasi
--   demo.warga1..5@jangkau.test  warga, sebagian punya lencana Donatur
--
-- Foto: Wikimedia Commons, lisensi CC BY / CC BY-SA / public domain.
-- Kredit lengkap ada di README bagian "Kredit foto demo".

begin;

-- ============================================================ 1. pengguna tambahan
-- 75 akun pengisi supaya ambang 50 dukungan bisa didemokan apa adanya,
-- bukan dengan memalsukan like_count.
insert into auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role
)
select ('20000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000',
       'warga' || g || '@jangkau.test',
       crypt('Jangkau2026!', gen_salt('bf')),
       now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', 'Warga Demo ' || g),
       now(), now(), 'authenticated', 'authenticated'
  from generate_series(1, 75) g
on conflict (id) do nothing;

-- ============================================================ 2. peran khusus
update profiles set is_admin = true where id = '5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4';

-- Akun demo yang dibuat sebelum skema baru belum punya account_type di metadata
-- auth, jadi diselaraskan di sini supaya UI menampilkan tipe akun yang benar.
update profiles
   set account_type = 'distributor'
 where id in ('a9fa8043-2f56-41da-9e3c-c38d29a6b29d',
              '5165d200-f27e-49c6-b740-23c7add9c7ba',
              '2f0da1a0-677b-42d7-a77b-baf8a9d56a6e');

insert into distributor_profiles (profile_id, label, display_name, bio, home_city, contact_email, contact_phone, social_url, follower_count, verification_status, verified_at, verified_by)
values
  ('a9fa8043-2f56-41da-9e3c-c38d29a6b29d','organization','Yayasan Siaga Nusantara',
   'Yayasan kemanusiaan yang bergerak di respons bencana sejak 2014. Fokus pada logistik pangan dan air bersih.',
   'Malang','halo@siaganusantara.test','0341000001','https://instagram.com/siaganusantara', 18400,
   'verified', now(), '5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4'),
  ('5165d200-f27e-49c6-b740-23c7add9c7ba','volunteer','Budi Santoso',
   'Relawan lapangan, 6 tahun terlibat di posko pengungsian Jawa Timur.',
   'Malang','budi@jangkau.test','081200000002', null, null,
   'verified', now(), '5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4'),
  ('2f0da1a0-677b-42d7-a77b-baf8a9d56a6e','creator','Rangga Prasetya',
   'Kreator konten kemanusiaan. Meliput langsung dari lokasi bencana.',
   'Bandung','rangga@jangkau.test','081200000003','https://instagram.com/ranggaprasetya', 96000,
   'verified', now(), '5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4')
on conflict (profile_id) do nothing;

-- ============================================================ 3. event
insert into disaster_events (id, title, disaster_type, summary, location, radius_m, village, district, regency, province, severity, status, cover_media_key, first_reported_at, last_activity_at, created_by)
values
  ('e0000000-0000-4000-8000-000000000001','Banjir Bandang Gunung Arjuna',
   'flash_flood','Air bah dari lereng Arjuna menerjang tiga dusun dalam satu malam. Warga mengungsi ke balai desa dan masjid.',
   st_setsrid(st_makepoint(112.6005,-7.9005),4326)::geography, 1500,
   'Sumberpucung','Kromengan','Malang','Jawa Timur', 4,'open',
   'posts/2026/11/jakarta-flood-2020.webp', now() - interval '2 days', now() - interval '40 minutes',
   '1c414d44-911d-4860-a56f-db8e5c43fa2e'),

  ('e0000000-0000-4000-8000-000000000002','Kebakaran Pasar Atas Bukittinggi',
   'fire','Api menghanguskan 40 kios dan merambat ke permukiman padat di belakang pasar.',
   st_setsrid(st_makepoint(100.3692,-0.3055),4326)::geography, 1200,
   'Pasar Atas','Guguk Panjang','Bukittinggi','Sumatera Barat', 5,'monitoring',
   'posts/2026/11/tangerang-prison-fire.webp', now() - interval '5 days', now() - interval '3 hours',
   '18f473eb-851c-4c51-917f-f3bda576c9b2'),

  ('e0000000-0000-4000-8000-000000000003','Erupsi Gunung Merapi',
   'volcanic_eruption','Hujan abu vulkanik melanda lima desa di lereng selatan. Warga dievakuasi ke barak pengungsian.',
   st_setsrid(st_makepoint(110.4461,-7.5407),4326)::geography, 3000,
   'Kaliurang','Pakem','Sleman','DI Yogyakarta', 3,'open',
   'posts/2026/11/merapi-eruption.webp', now() - interval '12 hours', now() - interval '2 hours',
   'f9315f1c-0a82-4878-afb6-fdd42beac9af'),

  ('e0000000-0000-4000-8000-000000000004','Tanah Longsor Cianjur',
   'landslide','Longsor menimbun akses jalan desa dan merusak 12 rumah. Tim SAR masih melakukan pencarian.',
   st_setsrid(st_makepoint(107.1346,-6.8167),4326)::geography, 2000,
   'Cugenang','Cugenang','Cianjur','Jawa Barat', 4,'monitoring',
   'posts/2026/11/semarang-flood.webp', now() - interval '4 days', now() - interval '6 hours',
   'd44d757e-affa-477e-a72a-ef5e47336e04'),

  ('e0000000-0000-4000-8000-000000000005','Gempa Lombok Utara',
   'earthquake','Gempa merusak ratusan bangunan sekolah dan rumah warga di tiga kecamatan.',
   st_setsrid(st_makepoint(116.2800,-8.3500),4326)::geography, 2500,
   'Tanjung','Tanjung','Lombok Utara','Nusa Tenggara Barat', 3,'open',
   'posts/2026/11/jakarta-flood-tanjung-duren.webp', now() - interval '6 days', now() - interval '1 day',
   '13879bda-33cd-4e3c-b242-75f9e16d90e2')
on conflict (id) do nothing;

-- ============================================================ 4. post + media
-- Post memakai client_uuid tetap supaya seed bisa dijalankan ulang.
insert into posts (id, client_uuid, event_id, author_id, body, location, accuracy_m, place_label, captured_at, is_primary, ai_category, ai_confidence, ai_model)
values
  ('f0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001','1c414d44-911d-4860-a56f-db8e5c43fa2e',
   'Air bah masuk jam 2 pagi. Tiga dusun terendam, warga mengungsi ke balai desa. Butuh air bersih, selimut, dan makanan bayi.',
   st_setsrid(st_makepoint(112.6006,-7.9006),4326)::geography, 12,'Dusun Krajan', now() - interval '2 days', true,'water',0.91,'ag/gemini-3.8-flash-high'),

  ('f0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000001','f9315f1c-0a82-4878-afb6-fdd42beac9af',
   'Jembatan dusun sebelah putus, akses bantuan harus lewat jalan atas. Di posko masjid ada 120 orang, sebagian balita.',
   st_setsrid(st_makepoint(112.6040,-7.8970),4326)::geography, 25,'Dusun Wetan', now() - interval '1 day 20 hours', false,'shelter',0.84,'ag/gemini-3.8-flash-high'),

  ('f0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003',
   'e0000000-0000-4000-8000-000000000002','18f473eb-851c-4c51-917f-f3bda576c9b2',
   'Kebakaran Pasar Atas, 40 kios habis. Warga sekarang mengungsi di gedung serbaguna dan butuh pakaian serta perlengkapan tidur.',
   st_setsrid(st_makepoint(100.3693,-0.3056),4326)::geography, 18,'Pasar Atas', now() - interval '5 days', true,'clothing',0.89,'ag/gemini-3.8-flash-high'),

  ('f0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000004',
   'e0000000-0000-4000-8000-000000000003','f9315f1c-0a82-4878-afb6-fdd42beac9af',
   'Hujan abu sejak subuh, atap rumah tebal abu. Warga butuh masker, air bersih, dan susu untuk anak-anak.',
   st_setsrid(st_makepoint(110.4462,-7.5408),4326)::geography, 30,'Kaliurang', now() - interval '12 hours', true,'health',0.87,'ag/gemini-3.8-flash-high'),

  ('f0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000005',
   'e0000000-0000-4000-8000-000000000004','d44d757e-affa-477e-a72a-ef5e47336e04',
   'Longsor menutup jalan utama. Dua dusun terisolasi, butuh makanan dan obat-obatan segera.',
   st_setsrid(st_makepoint(107.1347,-6.8168),4326)::geography, 22,'Cugenang', now() - interval '4 days', true,'food',0.92,'ag/gemini-3.8-flash-high'),

  ('f0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000006',
   'e0000000-0000-4000-8000-000000000005','13879bda-33cd-4e3c-b242-75f9e16d90e2',
   'Gempa merusak sekolah dan 200 rumah. Warga tidur di halaman, butuh terpal dan selimut.',
   st_setsrid(st_makepoint(116.2801,-8.3501),4326)::geography, 15,'Tanjung', now() - interval '6 days', true,'shelter',0.88,'ag/gemini-3.8-flash-high'),

  ('f0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000008',
   'e0000000-0000-4000-8000-000000000002','f9315f1c-0a82-4878-afb6-fdd42beac9af',
   'Kios saya ikut terbakar. Sekarang saya dan keluarga di posko masjid, butuh perlengkapan tidur dan susu untuk bayi.',
   st_setsrid(st_makepoint(100.3699,-0.3052),4326)::geography, 20,'Belakang Pasar', now() - interval '4 days 20 hours', false,'shelter',0.83,'ag/gemini-3.8-flash-high'),

  ('f0000000-0000-4000-8000-000000000007','c0000000-0000-4000-8000-000000000007',
   'e0000000-0000-4000-8000-000000000005','b05ed853-3953-43cf-a671-a8997fe1361f',
   'Posko di lapangan desa sudah berdiri, tapi tenda masih kurang. Anak-anak butuh pakaian kering.',
   st_setsrid(st_makepoint(116.2830,-8.3520),4326)::geography, 40,'Lapangan Tanjung', now() - interval '5 days 18 hours', false,'clothing',0.81,'ag/gemini-3.8-flash-high')
on conflict (id) do nothing;

insert into post_media (post_id, r2_key, mime_type, size_bytes, width, height, sort_order)
values
  ('f0000000-0000-4000-8000-000000000001','posts/2026/11/jakarta-flood-2020.webp','image/webp',281396,1600,1200,0),
  ('f0000000-0000-4000-8000-000000000003','posts/2026/11/tangerang-prison-fire.webp','image/webp',280736,1600,1067,0),
  ('f0000000-0000-4000-8000-000000000004','posts/2026/11/merapi-eruption.webp','image/webp',324748,1600,1408,0),
  ('f0000000-0000-4000-8000-000000000005','posts/2026/11/semarang-flood.webp','image/webp',144236,1600,1052,0),
  ('f0000000-0000-4000-8000-000000000006','posts/2026/11/jakarta-flood-tanjung-duren.webp','image/webp',670692,1600,2133,0)
on conflict (r2_key) do nothing;

-- ============================================================ 5. dukungan
-- 62 dukungan untuk event 1, 54 untuk event 5, 12 untuk event 3.
insert into event_likes (event_id, profile_id)
select 'e0000000-0000-4000-8000-000000000001',
       ('20000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid
  from generate_series(1, 62) g
on conflict do nothing;

insert into event_likes (event_id, profile_id)
select 'e0000000-0000-4000-8000-000000000005',
       ('20000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid
  from generate_series(1, 54) g
on conflict do nothing;

insert into event_likes (event_id, profile_id)
select 'e0000000-0000-4000-8000-000000000003',
       ('20000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid
  from generate_series(1, 12) g
on conflict do nothing;

-- pelapor juga ikut mendukung event lain, supaya feed terasa hidup
insert into event_likes (event_id, profile_id) values
  ('e0000000-0000-4000-8000-000000000005','1c414d44-911d-4860-a56f-db8e5c43fa2e'),
  ('e0000000-0000-4000-8000-000000000003','18f473eb-851c-4c51-917f-f3bda576c9b2'),
  ('e0000000-0000-4000-8000-000000000004','f9315f1c-0a82-4878-afb6-fdd42beac9af')
on conflict do nothing;

-- ============================================================ 6. penanggung jawab
insert into pic_assignments (id, event_id, distributor_id, status, pitch, applied_at, reviewed_by, reviewed_at, approved_at)
values
  ('d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002',
   'a9fa8043-2f56-41da-9e3c-c38d29a6b29d','approved',
   'Kami sudah menurunkan tim logistik ke lokasi sejak H+1. Akan menangani dua posko utama dan melaporkan setiap pembelian dengan foto struk.',
   now() - interval '4 days', '5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4', now() - interval '4 days', now() - interval '4 days'),

  ('d0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002',
   '2f0da1a0-677b-42d7-a77b-baf8a9d56a6e','approved',
   'Saya meliput langsung dari Bukittinggi dan akan menyalurkan bantuan pakaian serta perlengkapan tidur lewat posko gedung serbaguna.',
   now() - interval '3 days', '5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4', now() - interval '3 days', now() - interval '3 days'),

  ('d0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000004',
   '5165d200-f27e-49c6-b740-23c7add9c7ba','approved',
   'Saya relawan lokal Cianjur. Sudah survei dua dusun terisolasi dan akan menyalurkan makanan serta obat lewat jalur alternatif.',
   now() - interval '3 days', '5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4', now() - interval '3 days', now() - interval '3 days'),

  -- pengajuan yang masih menunggu, untuk demo antrean admin
  ('d0000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000001',
   '5165d200-f27e-49c6-b740-23c7add9c7ba','applied',
   'Saya warga Malang dan sudah membantu evakuasi di dusun Krajan. Ingin menangani posko balai desa sampai pemulihan selesai.',
   now() - interval '5 hours', null, null, null)
on conflict (event_id, distributor_id) do nothing;

-- ============================================================ 7. posko, kebutuhan, stok
insert into relief_posts (id, event_id, name, address, location, radius_m, headcount, capacity, origin, status, surveyed_at, created_by)
values
  ('a0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002',
   'Posko Gedung Serbaguna','Jl. Ahmad Yani, Pasar Atas',
   st_setsrid(st_makepoint(100.3695,-0.3058),4326)::geography, 300, 340, 400,'distributor','active',
   now() - interval '4 days','a9fa8043-2f56-41da-9e3c-c38d29a6b29d'),

  ('a0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002',
   'Posko Masjid Raya','Jl. Sudirman, belakang pasar',
   st_setsrid(st_makepoint(100.3701,-0.3049),4326)::geography, 250, 180, 220,'distributor','active',
   now() - interval '3 days','2f0da1a0-677b-42d7-a77b-baf8a9d56a6e'),

  ('a0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000004',
   'Posko Balai Desa Cugenang','Jl. Raya Cugenang',
   st_setsrid(st_makepoint(107.1350,-6.8171),4326)::geography, 300, 260, 300,'reporter','active',
   now() - interval '3 days','5165d200-f27e-49c6-b740-23c7add9c7ba'),

  -- posko yang belum disurvei: tidak muncul di halaman publik
  ('a0000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000001',
   'Posko Balai Desa Sumberpucung','Dusun Krajan',
   st_setsrid(st_makepoint(112.6008,-7.9008),4326)::geography, 300, 210, null,'reporter','draft',
   null,'1c414d44-911d-4860-a56f-db8e5c43fa2e')
on conflict (id) do nothing;

insert into posko_needs (id, posko_id, item_name, category, unit, quantity_needed, quantity_fulfilled, priority, status, note)
values
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Air mineral','water','dus',300,180,1,'partial','Kebutuhan paling mendesak'),
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Selimut','shelter','lembar',340,120,2,'partial',null),
  ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','Pakaian anak','clothing','set',200,0,2,'open',null),
  ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','Makanan siap saji','food','porsi',1000,600,1,'partial',null),
  ('b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','Masker','health','box',50,50,3,'fulfilled',null),
  ('b0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000002','Perlengkapan tidur','shelter','set',180,60,1,'partial',null),
  ('b0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000002','Susu bayi','food','kaleng',120,40,1,'partial',null),
  ('b0000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-000000000002','Obat luka bakar','health','box',30,10,2,'partial',null),
  ('b0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000003','Beras','food','karung',150,45,1,'partial',null),
  ('b0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000003','Obat-obatan','health','box',40,12,1,'partial',null),
  ('b0000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000003','Terpal','shelter','lembar',120,0,2,'open',null)
on conflict (id) do nothing;

insert into posko_stock (id, posko_id, item_name, category, unit, quantity)
values
  ('b0000000-0000-4000-8000-000000000101','a0000000-0000-4000-8000-000000000001','Air mineral','water','dus',180),
  ('b0000000-0000-4000-8000-000000000102','a0000000-0000-4000-8000-000000000001','Selimut','shelter','lembar',120),
  ('b0000000-0000-4000-8000-000000000103','a0000000-0000-4000-8000-000000000001','Makanan siap saji','food','porsi',600),
  ('b0000000-0000-4000-8000-000000000104','a0000000-0000-4000-8000-000000000002','Perlengkapan tidur','shelter','set',60),
  ('b0000000-0000-4000-8000-000000000105','a0000000-0000-4000-8000-000000000002','Susu bayi','food','kaleng',40),
  ('b0000000-0000-4000-8000-000000000106','a0000000-0000-4000-8000-000000000003','Beras','food','karung',45)
on conflict (posko_id, item_name) do nothing;

insert into stock_logs (stock_id, delta, reason, note, actor_id)
select s.id, s.quantity, 'opname'::stock_reason, 'Stok awal hasil survei', s.updated_by
  from posko_stock s
 where s.id in ('b0000000-0000-4000-8000-000000000101','b0000000-0000-4000-8000-000000000102',
                'b0000000-0000-4000-8000-000000000103','b0000000-0000-4000-8000-000000000104',
                'b0000000-0000-4000-8000-000000000105','b0000000-0000-4000-8000-000000000106')
   and s.quantity > 0
   and not exists (select 1 from stock_logs l where l.stock_id = s.id);

-- ============================================================ 8. donasi
insert into donations (id, pic_assignment_id, event_id, posko_id, donor_id, donor_name, is_anonymous, amount, status, midtrans_order_id, payment_type, paid_at, claim_token, guest_email)
values
  ('90000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000001','18f473eb-851c-4c51-917f-f3bda576c9b2','Ayu Lestari',false,2500000,'paid','JK-DEMO-0001','qris',now() - interval '4 days','tok-demo-0001',null),

  ('90000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000001','f9315f1c-0a82-4878-afb6-fdd42beac9af','Dimas Prakoso',false,1500000,'paid','JK-DEMO-0002','qris',now() - interval '4 days','tok-demo-0002',null),

  ('90000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000001',null,'Donatur Anonim',true,3000000,'paid','JK-DEMO-0003','qris',now() - interval '3 days','tok-demo-0003',null),

  ('90000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000002','d44d757e-affa-477e-a72a-ef5e47336e04','Rina Wati',false,2000000,'paid','JK-DEMO-0004','qris',now() - interval '3 days','tok-demo-0004',null),

  ('90000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000002',null,'Tamu Baik',false,1500000,'paid','JK-DEMO-0005','qris',now() - interval '2 days','tok-demo-0005','tamu@jangkau.test'),

  ('90000000-0000-4000-8000-000000000006','d0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000004',
   'a0000000-0000-4000-8000-000000000003','b05ed853-3953-43cf-a671-a8997fe1361f','Maya Sari',false,1000000,'paid','JK-DEMO-0006','qris',now() - interval '2 days','tok-demo-0006',null),

  ('90000000-0000-4000-8000-000000000007','d0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000004',
   'a0000000-0000-4000-8000-000000000003','13879bda-33cd-4e3c-b242-75f9e16d90e2','Hendra Gunawan',false,2000000,'paid','JK-DEMO-0007','qris',now() - interval '1 day','tok-demo-0007',null),

  -- donasi tamu yang belum diklaim: bahan demo alur klaim di design.md §6.2
  ('90000000-0000-4000-8000-000000000008','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000001',null,'Tamu Peduli',false,750000,'paid','JK-DEMO-0008','qris',now() - interval '1 day','tok-demo-0008','tamu2@jangkau.test'),

  -- donasi yang masih menunggu pembayaran: bahan demo state pending
  ('90000000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000001','b05ed853-3953-43cf-a671-a8997fe1361f','Maya Sari',false,500000,'pending','JK-DEMO-0009','qris',null,'tok-demo-0009',null)
on conflict (id) do nothing;

update donations set expires_at = now() + interval '15 minutes' where id = '90000000-0000-4000-8000-000000000009';

-- ============================================================ 9. pencairan + bukti belanja
-- Pencairan dibuat berstatus 'requested' lebih dulu, lalu di-update ke 'transferred'.
-- Kalau langsung di-insert sebagai 'transferred', trigger ledger tidak pernah jalan
-- dan saldo penanggung jawab akan tampak lebih besar dari yang sebenarnya.
--
-- Insert dijaga `where not exists`, bukan `on conflict do nothing`: trigger
-- BEFORE INSERT fn_guard_disbursement berjalan SEBELUM konflik terdeteksi,
-- sehingga percobaan insert ulang akan ditolak karena saldo sudah berkurang.
insert into disbursements (id, pic_assignment_id, seq, amount, status, purpose, requested_at, approved_by, approved_at, is_simulated)
select v.id, v.pic_assignment_id, v.seq, v.amount, v.status, v.purpose, v.requested_at, v.approved_by, v.approved_at, v.is_simulated
  from (values
    ('80000000-0000-4000-8000-000000000001'::uuid,'d0000000-0000-4000-8000-000000000001'::uuid,1::smallint,2800000::numeric,'requested'::disbursement_status,
     'Pengadaan air mineral dan makanan siap saji tahap 1', now() - interval '3 days','5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4'::uuid, now() - interval '3 days', true),
    ('80000000-0000-4000-8000-000000000002'::uuid,'d0000000-0000-4000-8000-000000000003'::uuid,1::smallint,1200000::numeric,'requested'::disbursement_status,
     'Pengadaan beras dan obat-obatan tahap 1', now() - interval '2 days','5f576a43-940f-4c4d-b2f7-f61bc0c8b9c4'::uuid, now() - interval '2 days', true)
  ) as v(id, pic_assignment_id, seq, amount, status, purpose, requested_at, approved_by, approved_at, is_simulated)
 where not exists (select 1 from disbursements d where d.id = v.id);

update disbursements d
   set status = 'transferred', transferred_at = now() - interval '3 days'
 where d.id = '80000000-0000-4000-8000-000000000001'
   and d.status = 'requested'
   and not exists (select 1 from ledger_entries l where l.disbursement_id = d.id);

update disbursements d
   set status = 'transferred', transferred_at = now() - interval '2 days'
 where d.id = '80000000-0000-4000-8000-000000000002'
   and d.status = 'requested'
   and not exists (select 1 from ledger_entries l where l.disbursement_id = d.id);

insert into expenses (id, disbursement_id, posko_id, item_name, category, quantity, unit, amount, merchant, purchased_at, receipt_r2_key, note, status, created_by)
values
  ('70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   'Air mineral 200 dus','water',200,'dus',1800000,'Toko Sumber Rejeki', current_date - 2,
   'receipts/demo/air-mineral.webp','Struk asli disimpan di posko', 'confirmed','a9fa8043-2f56-41da-9e3c-c38d29a6b29d'),

  ('70000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   'Makanan siap saji 100 porsi','food',100,'porsi',1000000,'Dapur Umum Bukittinggi', current_date - 2,
   'receipts/demo/makanan.webp',null,'submitted','a9fa8043-2f56-41da-9e3c-c38d29a6b29d'),

  ('70000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003',
   'Beras 40 karung','food',40,'karung',800000,'CV Tani Makmur', current_date - 1,
   'receipts/demo/beras.webp',null,'confirmed','5165d200-f27e-49c6-b740-23c7add9c7ba'),

  ('70000000-0000-4000-8000-000000000004','80000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003',
   'Obat-obatan dasar','health',20,'box',400000,'Apotek Sehat', current_date - 1,
   'receipts/demo/obat.webp',null,'submitted','5165d200-f27e-49c6-b740-23c7add9c7ba')
on conflict (id) do nothing;

-- konfirmasi pelapor: dua diterima, satu diterima sebagian, satu belum dikonfirmasi
insert into expense_confirmations (expense_id, profile_id, decision, note)
values
  ('70000000-0000-4000-8000-000000000001','18f473eb-851c-4c51-917f-f3bda576c9b2','received',
   'Air mineral sudah sampai di posko, 200 dus sesuai catatan. Terima kasih.'),
  ('70000000-0000-4000-8000-000000000001','f9315f1c-0a82-4878-afb6-fdd42beac9af','received',
   'Saya bantu terima di posko, jumlahnya sesuai.'),
  ('70000000-0000-4000-8000-000000000003','d44d757e-affa-477e-a72a-ef5e47336e04','partial',
   'Beras datang 35 karung, kurang 5 karung dari catatan.')
on conflict (expense_id, profile_id) do nothing;

-- ============================================================ 10. moderasi & verifikasi
insert into content_reports (id, reporter_id, event_id, reason, note, status)
values
  ('60000000-0000-4000-8000-000000000001','18f473eb-851c-4c51-917f-f3bda576c9b2',
   'e0000000-0000-4000-8000-000000000003','duplicate',
   'Sepertinya ini bencana yang sama dengan laporan erupsi Merapi sebelumnya.','open')
on conflict (id) do nothing;

insert into verification_documents (id, profile_id, kind, r2_key, mime_type, size_bytes, note, review_status)
values
  ('50000000-0000-4000-8000-000000000001','2f0da1a0-677b-42d7-a77b-baf8a9d56a6e','follower_stats',
   'verification/demo/kreator-followers.pdf','application/pdf', 245000,
   'Statistik pengikut Instagram per November 2026','pending')
on conflict (r2_key) do nothing;

commit;

-- ============================================================ ringkasan
select 'event' as entitas, count(*) as jumlah from disaster_events
union all select 'post', count(*) from posts
union all select 'like', count(*) from event_likes
union all select 'posko aktif tersurvei', count(*) from relief_posts where status = 'active' and surveyed_at is not null
union all select 'penanggung jawab approved', count(*) from pic_assignments where status = 'approved'
union all select 'donasi lunas', count(*) from donations where status = 'paid'
union all select 'entri ledger', count(*) from ledger_entries
union all select 'bukti belanja', count(*) from expenses
union all select 'konfirmasi pelapor', count(*) from expense_confirmations;

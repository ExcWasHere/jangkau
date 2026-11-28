-- Jangkau — asal lokasi unggahan.
--
-- Sampai sekarang setiap unggahan wajib membawa titik GPS perangkat, dan
-- trigger `fn_guard_post_location` menolak yang di luar radius. Itu klaim yang
-- benar, tapi menutup pintu bagi warga yang GPS-nya mati, ditolak izinnya, atau
-- tidak pernah memberi fix di tengah bencana.
--
-- Solusinya bukan melonggarkan radius, melainkan mencatat **asal** titik itu:
--   device — dari GPS perangkat, ikut validasi radius
--   manual — diketik/dipilih pengguna di peta, tidak membuktikan apa pun
--
-- Unggahan manual selalu masuk antrean tinjauan admin, sehingga klaim produk
-- tetap jujur: "lokasi dari perangkat" hanya untuk yang benar dari perangkat.

-- Dijaga `if not exists` lewat blok DO: `create type` tidak punya bentuk
-- idempoten, dan migrasi ini aman dijalankan ulang.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'location_source') then
    create type location_source as enum ('device', 'manual');
  end if;
end
$$;

alter table posts
  add column if not exists location_source location_source not null default 'device';

-- Index parsial untuk antrean tinjauan; `needs_review` sudah punya index dari
-- migrasi 0003, ini menambah kemampuan menyaring berdasarkan asal lokasi.
create index if not exists posts_manual_location_idx
  on posts (created_at desc)
  where location_source = 'manual';

-- ============================================================ tinjauan: alasan

/**
 * Alasan sebuah unggahan masuk antrean tinjauan.
 *
 * Satu kolom teks bebas lebih jujur daripada enum: alasannya bisa bertumpuk
 * (digabung AI dengan keyakinan menengah DAN lokasinya manual), dan admin
 * perlu tahu keduanya. Disimpan sebagai array teks agar bisa disaring.
 */
alter table posts
  add column if not exists review_reasons text[] not null default '{}';

comment on column posts.review_reasons is
  'Alasan unggahan perlu ditinjau: merge_low_confidence, manual_location, ai_unavailable.';

-- ============================================================ trigger radius

/**
 * Radius hanya berlaku untuk titik dari perangkat.
 *
 * Titik manual tidak membuktikan keberadaan pelapor di lokasi, jadi
 * memaksakan radius di sana hanya menolak laporan yang sah tanpa menambah
 * kepercayaan apa pun. Yang menjaga laporan manual adalah tinjauan admin.
 */
create or replace function fn_guard_post_location() returns trigger
language plpgsql as $$
declare
  v_center    geography;
  v_radius    integer;
  v_tolerance integer;
  v_distance  numeric;
begin
  select location, radius_m into v_center, v_radius
    from disaster_events where id = new.event_id;

  if v_center is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = '23503';
  end if;

  if new.location_source = 'manual' then
    return new;
  end if;

  v_tolerance := fn_setting_int('post_max_distance_m', 5000);
  v_distance  := st_distance(new.location, v_center);

  if v_distance > v_radius + v_tolerance then
    raise exception 'POST_OUTSIDE_RADIUS'
      using errcode = '23514',
            detail  = format('distance_m=%s limit_m=%s', round(v_distance), v_radius + v_tolerance);
  end if;

  return new;
end;
$$;

-- ============================================================ akurasi minimum

/**
 * Titik dari perangkat dengan akurasi sangat buruk ditandai untuk tinjauan.
 *
 * Akurasi 3 km bisa berarti perangkat memakai menara seluler, bukan satelit —
 * titiknya masih berguna sebagai petunjuk, tapi tidak cukup untuk memastikan
 * pelapor berada di radius. Ambang 1000 m dipilih longgar: radius event
 * terkecil 100 m, jadi akurasi di atas itu sudah tidak membuktikan apa pun.
 */
create or replace function fn_flag_poor_accuracy() returns trigger
language plpgsql as $$
begin
  if new.location_source = 'device'
     and new.accuracy_m is not null
     and new.accuracy_m > 1000
     and not ('poor_accuracy' = any(new.review_reasons)) then
    new.review_reasons := array_append(new.review_reasons, 'poor_accuracy');
    new.needs_review := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_post_accuracy on posts;
create trigger trg_post_accuracy
  before insert or update of accuracy_m, location_source on posts
  for each row execute function fn_flag_poor_accuracy();

-- ============================================================ backfill

-- Unggahan lama semuanya dari perangkat; pastikan tidak ada yang bernilai NULL
-- dan alasan tinjauan yang sudah ada tercatat.
update posts
   set review_reasons = array_append(review_reasons, 'merge_low_confidence')
 where needs_review = true
   and not ('merge_low_confidence' = any(review_reasons))
   and ai_similarity is not null;

-- ============================================================ bersihkan alasan

/**
 * Alasan tinjauan dibersihkan setelah diputuskan.
 *
 * Tanpa ini, unggahan yang sudah ditinjau tetap membawa `review_reasons` lama.
 * Kalau nanti ia masuk antrean lagi karena alasan berbeda, admin melihat
 * campuran alasan lama dan baru dan tidak bisa tahu mana yang masih berlaku.
 * Riwayat keputusan tetap ada di `audit_logs`.
 */
create or replace function fn_clear_review_reasons(p_post_id uuid)
returns void
language sql security definer set search_path = public as $$
  update posts
     set review_reasons = '{}'
   where id = p_post_id;
$$;

revoke all on function fn_clear_review_reasons(uuid) from public;
grant execute on function fn_clear_review_reasons(uuid) to authenticated, service_role;

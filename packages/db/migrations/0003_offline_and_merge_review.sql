-- Jangkau — antrean offline dan tinjauan penggabungan AI.
--
-- Migrasi ini menambah dua hal:
--   1. `fn_split_post` — memisahkan satu unggahan dari berita hasil
--      penggabungan, untuk kasus AI salah menggabung.
--   2. Index untuk antrean tinjauan penggabungan di dasbor admin.
--
-- Aman dijalankan berulang: semua objek memakai `if not exists` /
-- `create or replace`.

-- ============================================================ 1. index tinjauan

-- Antrean admin menyaring unggahan yang ditandai `needs_review`. Index parsial
-- jauh lebih kecil daripada index penuh, karena normalnya tabel berisi ribuan
-- unggahan sementara yang perlu ditinjau hanya belasan.
create index if not exists posts_needs_review_idx
  on posts (created_at desc)
  where needs_review = true;

-- ============================================================ 2. pisahkan unggahan

/**
 * Memisahkan satu unggahan dari beritanya menjadi berita baru.
 *
 * Dipakai saat admin menilai bahwa AI salah menggabung. Unggahan yang
 * dipindahkan menjadi unggahan utama berita baru, dan berita lama tetap
 * memiliki unggahan utamanya sendiri — kalau tidak, kartu berita lama
 * kehilangan foto dan judulnya.
 *
 * Satu transaksi: kalau ada langkah yang gagal, tidak ada unggahan yang
 * berpindah setengah jalan.
 */
create or replace function fn_split_post(
  p_post_id uuid,
  p_title text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_post        posts;
  v_source      disaster_events;
  v_new_event   uuid;
  v_new_title   text;
  v_next_primary uuid;
begin
  select * into v_post from posts where id = p_post_id for update;

  if v_post.id is null then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_source from disaster_events where id = v_post.event_id for update;

  if v_source.id is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_new_title := coalesce(
    nullif(btrim(p_title), ''),
    nullif(btrim(v_post.place_label), ''),
    left(regexp_replace(v_post.body, '\s+', ' ', 'g'), 120)
  );

  insert into disaster_events (
    title, disaster_type, summary, location, radius_m,
    village, district, regency, province, severity, status,
    cover_media_key, first_reported_at, last_activity_at, created_by
  )
  values (
    v_new_title,
    v_source.disaster_type,
    left(v_post.body, 2000),
    v_post.location,
    1500,
    v_post.place_label,
    v_source.district,
    v_source.regency,
    v_source.province,
    v_source.severity,
    'open',
    (select m.r2_key from post_media m where m.post_id = p_post_id order by m.sort_order limit 1),
    v_post.captured_at,
    now(),
    v_post.author_id
  )
  returning id into v_new_event;

  -- Unggahan yang dipisahkan menjadi unggahan utama berita baru.
  update posts
     set event_id = v_new_event,
         is_primary = true,
         needs_review = false,
         ai_similarity = null
   where id = p_post_id;

  -- Berita lama harus tetap punya unggahan utama. Kalau yang dipindahkan
  -- ternyata unggahan utama, promosikan unggahan tertua yang tersisa.
  if v_post.is_primary then
    select id into v_next_primary
      from posts
     where event_id = v_source.id and status = 'published'
     order by created_at asc
     limit 1;

    if v_next_primary is not null then
      update posts set is_primary = true where id = v_next_primary;
    end if;
  end if;

  -- Judul berita lama tidak diubah: judul adalah hasil penggabungan yang
  -- disetujui admin, dan menggantinya otomatis bisa menghapus nama lokasi
  -- yang benar.

  insert into audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'post.split', 'posts', p_post_id,
          jsonb_build_object('from_event', v_source.id, 'to_event', v_new_event, 'title', v_new_title));

  return v_new_event;
end;
$$;

revoke all on function fn_split_post(uuid, text) from public;
grant execute on function fn_split_post(uuid, text) to authenticated, service_role;

-- ============================================================ 3. setujui penggabungan

/**
 * Menyetujui penggabungan yang ditandai AI, sehingga unggahan itu keluar dari
 * antrean tinjauan tanpa dipindahkan.
 */
create or replace function fn_accept_merge(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_event uuid;
begin
  update posts
     set needs_review = false
   where id = p_post_id
  returning event_id into v_event;

  if v_event is null then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'post.merge_accepted', 'posts', p_post_id,
          jsonb_build_object('event', v_event));
end;
$$;

revoke all on function fn_accept_merge(uuid) from public;
grant execute on function fn_accept_merge(uuid) to authenticated, service_role;

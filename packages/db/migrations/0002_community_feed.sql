-- Jangkau — skema komunitas bencana.
-- Sumber kebenaran: database-schema.md §4–§6. Ubah dokumen itu lebih dulu.
--
-- Migrasi ini MENGGANTIKAN 0001_init.sql sepenuhnya: alur laporan-kebutuhan +
-- RAB + organisasi diganti post bencana + event hasil merge + penanggung jawab
-- + ledger donasi. Tabel lama dihapus (isinya hanya data uji).
--
-- Dijalankan di Supabase (Postgres 17, PostGIS 3.3.7, pgvector 0.8.2).

-- ============================================================ 0. bersihkan skema lama

-- Trigger lama di auth.users merujuk kolom profiles.full_name yang sudah tidak ada
-- dan membuat SEMUA pembuatan user gagal. Wajib dibuang sebelum tabel lama di-drop.
drop trigger if exists trg_profile_from_auth on auth.users;

drop view if exists public_reports, public_posts, public_organizations,
                    public_campaigns, public_stock cascade;

drop table if exists audit_logs, app_settings, stock_logs, stock_items,
                     tranche_receipts, tranches, donations, budget_items, campaigns,
                     report_votes, report_media, reports,
                     organization_members, organizations, relief_posts, profiles cascade;

drop type if exists app_role, org_verification_status, org_member_role, report_status,
                    campaign_status, tranche_status, media_kind, severity_level,
                    post_status, need_category, donation_status, stock_reason cascade;

-- sisa fungsi skema lama yang masih bisa terpanggil
drop function if exists fn_profile_from_auth() cascade;
drop function if exists fn_report_geofence() cascade;
drop function if exists fn_vote_count() cascade;
drop function if exists fn_tranche_guard() cascade;
drop function if exists fn_report_candidates(uuid, integer) cascade;
drop function if exists apply_stock_movement(uuid, numeric, stock_reason, uuid, uuid, text, uuid) cascade;

-- ============================================================ 1. ekstensi
create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
create extension if not exists vector;

-- ============================================================ 2. enum
create type account_type          as enum ('resident','distributor');
create type badge_kind            as enum ('reporter','funder');
create type distributor_label     as enum ('organization','volunteer','creator');
create type verification_status   as enum ('unverified','pending','verified','rejected','suspended');
create type verification_doc_kind as enum ('legal_deed','sk_kemenkumham','pic_identity','pic_selfie','org_letter','social_profile','follower_stats','field_proof','other');
create type doc_review_status     as enum ('pending','approved','rejected');
create type disaster_type         as enum ('flood','flash_flood','landslide','volcanic_eruption','earthquake','tsunami','fire','storm','drought','other');
create type event_status          as enum ('open','monitoring','resolved','archived');
create type post_status           as enum ('published','hidden','removed');
create type moderation_reason     as enum ('hoax','duplicate','irrelevant','graphic','other');
create type moderation_status     as enum ('open','reviewed','actioned','dismissed');
create type posko_status          as enum ('draft','active','closed');
create type posko_origin          as enum ('reporter','distributor');
create type need_category         as enum ('food','water','health','shelter','clothing','sanitation','energy','education','other');
create type need_status           as enum ('open','partial','fulfilled','cancelled');
create type assignment_status     as enum ('applied','approved','rejected','revoked');
create type donation_status       as enum ('pending','paid','expired','failed','refunded');
create type ledger_entry_kind     as enum ('donation_in','disbursement_out','refund','fee');
create type disbursement_status   as enum ('locked','requested','approved','transferred','rejected');
create type expense_status        as enum ('submitted','confirmed','disputed');
create type receipt_decision      as enum ('received','partial','not_received');
create type stock_reason          as enum ('need_update','donation','distribution','adjustment','opname');

-- ============================================================ 3. identitas
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  username     text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  avatar_key   text,
  phone        text,
  account_type account_type not null default 'resident',
  is_admin     boolean not null default false,
  locale       text not null default 'id' check (locale in ('id','en')),
  theme        text not null default 'dark' check (theme in ('dark','light','system')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table profile_badges (
  profile_id      uuid not null references profiles(id) on delete cascade,
  badge           badge_kind not null,
  first_earned_at timestamptz not null default now(),
  primary key (profile_id, badge)
);

create table distributor_profiles (
  profile_id          uuid primary key references profiles(id) on delete cascade,
  label               distributor_label not null,
  display_name        text not null,
  bio                 text check (char_length(bio) <= 600),
  home_city           text,
  contact_email       text,
  contact_phone       text,
  social_url          text,
  follower_count      integer check (follower_count >= 0),
  verification_status verification_status not null default 'unverified',
  verified_at         timestamptz,
  verified_by         uuid references profiles(id),
  rejection_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint distributor_verified_consistency
    check (verification_status <> 'verified' or verified_at is not null)
);

create table verification_documents (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references distributor_profiles(profile_id) on delete cascade,
  kind             verification_doc_kind not null,
  r2_key           text not null unique,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes between 1 and 10485760),
  note             text,
  review_status    doc_review_status not null default 'pending',
  reviewed_by      uuid references profiles(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now()
);
create index verification_documents_profile_idx on verification_documents (profile_id, created_at desc);
create unique index verification_documents_one_pending_idx
  on verification_documents (profile_id, kind)
  where review_status = 'pending';

-- ============================================================ 4. bencana & post
create table disaster_events (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (char_length(title) between 4 and 160),
  disaster_type      disaster_type not null default 'other',
  summary            text check (char_length(summary) <= 2000),
  location           geography(Point,4326) not null,
  radius_m           integer not null default 1500 check (radius_m between 100 and 50000),
  village            text,
  district           text,
  regency            text,
  province           text,
  severity           smallint not null default 3 check (severity between 1 and 5),
  status             event_status not null default 'open',
  post_count         integer not null default 0 check (post_count >= 0),
  like_count         integer not null default 0 check (like_count >= 0),
  approved_pic_count integer not null default 0 check (approved_pic_count >= 0),
  cover_media_key    text,
  embedding          vector(768),
  first_reported_at  timestamptz not null default now(),
  last_activity_at   timestamptz not null default now(),
  merged_into_id     uuid references disaster_events(id),
  created_by         uuid references profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint event_not_self_merged check (merged_into_id is null or merged_into_id <> id)
);
create index disaster_events_location_gix on disaster_events using gist (location);
create index disaster_events_feed_idx     on disaster_events (status, last_activity_at desc);
create index disaster_events_title_trgm   on disaster_events using gin (title gin_trgm_ops);

create table posts (
  id            uuid primary key default gen_random_uuid(),
  client_uuid   uuid not null unique,
  event_id      uuid not null references disaster_events(id) on delete cascade,
  author_id     uuid not null references profiles(id) on delete cascade,
  body          text not null check (char_length(body) between 10 and 2000),
  location      geography(Point,4326) not null,
  accuracy_m    numeric(8,2) check (accuracy_m >= 0),
  place_label   text,
  captured_at   timestamptz not null,
  status        post_status not null default 'published',
  ai_category   need_category,
  ai_confidence numeric(4,3) check (ai_confidence between 0 and 1),
  ai_similarity numeric(4,3) check (ai_similarity between 0 and 1),
  ai_model      text,
  needs_review  boolean not null default false,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index posts_event_idx    on posts (event_id, created_at desc);
create index posts_author_idx   on posts (author_id, created_at desc);
create index posts_location_gix on posts using gist (location);
create index posts_body_trgm    on posts using gin (body gin_trgm_ops);
create unique index posts_one_primary_idx on posts (event_id) where is_primary;

create table post_media (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  r2_key     text not null unique,
  mime_type  text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  width      integer check (width > 0),
  height     integer check (height > 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index post_media_post_idx on post_media (post_id, sort_order);

create table event_likes (
  event_id   uuid not null references disaster_events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
create index event_likes_profile_idx on event_likes (profile_id, created_at desc);

create table event_merges (
  id                 uuid primary key default gen_random_uuid(),
  source_event_id    uuid not null unique references disaster_events(id) on delete cascade,
  target_event_id    uuid not null references disaster_events(id) on delete cascade,
  similarity         numeric(4,3) check (similarity between 0 and 1),
  model              text,
  decided_by         text not null default 'ai' check (decided_by in ('ai','admin')),
  decided_by_profile uuid references profiles(id),
  created_at         timestamptz not null default now(),
  constraint merge_not_self check (source_event_id <> target_event_id)
);

create table content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  event_id    uuid references disaster_events(id) on delete cascade,
  post_id     uuid references posts(id) on delete cascade,
  reason      moderation_reason not null,
  note        text check (char_length(note) <= 500),
  status      moderation_status not null default 'open',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint content_reports_target check (event_id is not null or post_id is not null)
);
create index content_reports_queue_idx on content_reports (status, created_at);

-- ============================================================ 5. posko
create table relief_posts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references disaster_events(id) on delete cascade,
  name        text not null check (char_length(name) between 3 and 120),
  address     text,
  location    geography(Point,4326) not null,
  radius_m    integer not null default 300 check (radius_m between 10 and 5000),
  headcount   integer not null default 0 check (headcount >= 0),
  capacity    integer check (capacity >= 0),
  origin      posko_origin not null default 'reporter',
  status      posko_status not null default 'draft',
  surveyed_at timestamptz,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index relief_posts_event_idx    on relief_posts (event_id, status);
create index relief_posts_location_gix on relief_posts using gist (location);

create table posko_needs (
  id                 uuid primary key default gen_random_uuid(),
  posko_id           uuid not null references relief_posts(id) on delete cascade,
  item_name          text not null check (char_length(item_name) between 2 and 80),
  category           need_category not null default 'other',
  unit               text not null default 'unit',
  quantity_needed    numeric(12,2) not null check (quantity_needed > 0),
  quantity_fulfilled numeric(12,2) not null default 0 check (quantity_fulfilled >= 0),
  priority           smallint not null default 3 check (priority between 1 and 5),
  status             need_status not null default 'open',
  note               text,
  updated_by         uuid references profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint need_not_overfulfilled check (quantity_fulfilled <= quantity_needed)
);
create index posko_needs_posko_idx on posko_needs (posko_id, priority);

create table posko_stock (
  id         uuid primary key default gen_random_uuid(),
  posko_id   uuid not null references relief_posts(id) on delete cascade,
  item_name  text not null check (char_length(item_name) between 2 and 80),
  category   need_category not null default 'other',
  unit       text not null default 'unit',
  quantity   numeric(12,2) not null default 0 check (quantity >= 0),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (posko_id, item_name)
);

create table stock_logs (
  id         uuid primary key default gen_random_uuid(),
  stock_id   uuid not null references posko_stock(id) on delete cascade,
  delta      numeric(12,2) not null check (delta <> 0),
  reason     stock_reason not null,
  note       text,
  actor_id   uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index stock_logs_stock_idx on stock_logs (stock_id, created_at desc);

-- ============================================================ 6. penanggung jawab & uang
create table pic_assignments (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references disaster_events(id) on delete cascade,
  distributor_id uuid not null references distributor_profiles(profile_id) on delete cascade,
  status         assignment_status not null default 'applied',
  pitch          text check (char_length(pitch) between 50 and 500),
  applied_at     timestamptz not null default now(),
  reviewed_by    uuid references profiles(id),
  reviewed_at    timestamptz,
  review_note    text,
  approved_at    timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (event_id, distributor_id),
  constraint pic_decision_consistency
    check (status not in ('approved','rejected','revoked') or reviewed_at is not null)
);
create index pic_assignments_event_idx on pic_assignments (event_id, status);
create index pic_assignments_dist_idx  on pic_assignments (distributor_id, status);

create table donations (
  id                      uuid primary key default gen_random_uuid(),
  pic_assignment_id       uuid not null references pic_assignments(id) on delete restrict,
  event_id                uuid not null references disaster_events(id) on delete restrict,
  posko_id                uuid references relief_posts(id) on delete set null,
  donor_id                uuid references profiles(id) on delete set null,
  donor_name              text,
  is_anonymous            boolean not null default false,
  amount                  numeric(14,2) not null check (amount >= 1000),
  currency                char(3) not null default 'IDR',
  status                  donation_status not null default 'pending',
  midtrans_order_id       text not null unique,
  midtrans_transaction_id text,
  payment_type            text,
  qr_string               text,
  qr_url                  text,
  expires_at              timestamptz,
  paid_at                 timestamptz,
  claim_token             text not null unique,
  guest_email             text,
  claimed_by              uuid references profiles(id) on delete set null,
  claimed_at              timestamptz,
  raw_notification        jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint donation_claim_consistency
    check (claimed_at is null or claimed_by is not null)
);
create index donations_assignment_idx  on donations (pic_assignment_id, status);
create index donations_donor_idx       on donations (donor_id, created_at desc);
create index donations_event_idx       on donations (event_id, status);
create index donations_guest_email_idx on donations (lower(guest_email)) where guest_email is not null;

create table disbursements (
  id                uuid primary key default gen_random_uuid(),
  pic_assignment_id uuid not null references pic_assignments(id) on delete restrict,
  seq               smallint not null check (seq >= 1),
  amount            numeric(14,2) not null check (amount > 0),
  status            disbursement_status not null default 'locked',
  purpose           text,
  requested_at      timestamptz,
  approved_by       uuid references profiles(id),
  approved_at       timestamptz,
  transferred_at    timestamptz,
  is_simulated      boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (pic_assignment_id, seq)
);

create table ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  pic_assignment_id uuid not null references pic_assignments(id) on delete restrict,
  donation_id       uuid references donations(id) on delete set null,
  disbursement_id   uuid references disbursements(id) on delete set null,
  kind              ledger_entry_kind not null,
  amount            numeric(14,2) not null check (amount <> 0),
  note              text,
  created_at        timestamptz not null default now()
);
create index ledger_entries_assignment_idx on ledger_entries (pic_assignment_id, created_at);
create index ledger_entries_donation_idx   on ledger_entries (donation_id);
create unique index ledger_entries_one_per_donation_idx
  on ledger_entries (donation_id) where donation_id is not null;
create unique index ledger_entries_one_per_disbursement_idx
  on ledger_entries (disbursement_id) where disbursement_id is not null;

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  disbursement_id uuid not null references disbursements(id) on delete cascade,
  posko_id        uuid references relief_posts(id) on delete set null,
  item_name       text not null check (char_length(item_name) between 2 and 120),
  category        need_category not null default 'other',
  quantity        numeric(12,2) check (quantity > 0),
  unit            text,
  amount          numeric(14,2) not null check (amount > 0),
  merchant        text,
  purchased_at    date,
  receipt_r2_key  text not null,
  note            text,
  status          expense_status not null default 'submitted',
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index expenses_disbursement_idx on expenses (disbursement_id);

create table expense_confirmations (
  expense_id uuid not null references expenses(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  decision   receipt_decision not null,
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (expense_id, profile_id)
);
create index expense_confirmations_profile_idx on expense_confirmations (profile_id, created_at desc);

-- ============================================================ 7. operasional
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_inbox_idx on notifications (profile_id, created_at desc);

create table app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id         bigserial primary key,
  actor_id   uuid references profiles(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity, entity_id);

insert into app_settings (key, value) values
  ('trending_threshold_likes', '50'::jsonb),
  ('event_default_radius_m',   '1500'::jsonb),
  ('post_max_distance_m',      '5000'::jsonb),
  ('merge_auto_threshold',     '0.86'::jsonb),
  ('merge_review_threshold',   '0.72'::jsonb),
  ('merge_window_days',        '7'::jsonb),
  ('min_donation_idr',         '1000'::jsonb),
  ('donation_expiry_minutes',  '15'::jsonb),
  ('disbursement_max_pct',     '40'::jsonb),
  ('max_photos_per_post',      '4'::jsonb)
on conflict (key) do nothing;

-- ============================================================ 8. fungsi bantu
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function fn_setting_int(p_key text, p_default integer) returns integer
language sql stable as $$
  select coalesce((select (value #>> '{}')::integer from app_settings where key = p_key), p_default);
$$;

create or replace function fn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, avatar_key, account_type)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1), 'Pengguna Jangkau'),
    new.raw_user_meta_data->>'avatar_url',
    case when new.raw_user_meta_data->>'account_type' = 'distributor'
         then 'distributor'::account_type else 'resident'::account_type end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================ 9. trigger konsistensi
create or replace function fn_sync_like_count() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update disaster_events
       set like_count = like_count + 1, last_activity_at = now()
     where id = new.event_id;
    return new;
  else
    update disaster_events
       set like_count = greatest(like_count - 1, 0)
     where id = old.event_id;
    return old;
  end if;
end;
$$;

create or replace function fn_sync_post_count() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    update disaster_events e
       set post_count = (select count(*) from posts p where p.event_id = e.id and p.status = 'published')
     where e.id = old.event_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    update disaster_events e
       set post_count = (select count(*) from posts p where p.event_id = e.id and p.status = 'published'),
           last_activity_at = now()
     where e.id = new.event_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function fn_sync_pic_count() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    update disaster_events e
       set approved_pic_count = (select count(*) from pic_assignments a where a.event_id = e.id and a.status = 'approved')
     where e.id = old.event_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    update disaster_events e
       set approved_pic_count = (select count(*) from pic_assignments a where a.event_id = e.id and a.status = 'approved')
     where e.id = new.event_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function fn_badge_reporter() returns trigger
language plpgsql as $$
begin
  insert into profile_badges (profile_id, badge)
  values (new.author_id, 'reporter')
  on conflict (profile_id, badge) do nothing;
  return new;
end;
$$;

create or replace function fn_guard_post_location() returns trigger
language plpgsql as $$
declare
  v_center geography;
  v_radius integer;
  v_tolerance integer;
  v_distance numeric;
begin
  select location, radius_m into v_center, v_radius
    from disaster_events where id = new.event_id;

  if v_center is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = '23503';
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

create or replace function fn_guard_pic_assignment() returns trigger
language plpgsql as $$
declare
  v_verification verification_status;
begin
  select verification_status into v_verification
    from distributor_profiles where profile_id = new.distributor_id;

  if v_verification is null then
    raise exception 'DISTRIBUTOR_PROFILE_MISSING' using errcode = '23514';
  end if;

  if new.status in ('applied','approved') and v_verification <> 'verified' then
    raise exception 'DISTRIBUTOR_NOT_VERIFIED' using errcode = '42501';
  end if;

  if new.status = 'approved' then
    if new.reviewed_by = new.distributor_id then
      raise exception 'SELF_APPROVAL_FORBIDDEN' using errcode = '42501';
    end if;
    if new.approved_at is null then
      new.approved_at := now();
    end if;
    if new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

create or replace function fn_guard_donation() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from pic_assignments a
     where a.id = new.pic_assignment_id
       and a.event_id = new.event_id
       and a.status = 'approved'
  ) then
    raise exception 'PIC_NOT_APPROVED_FOR_EVENT' using errcode = '23514';
  end if;

  if new.posko_id is not null and not exists (
    select 1 from relief_posts r where r.id = new.posko_id and r.event_id = new.event_id
  ) then
    raise exception 'POSKO_NOT_IN_EVENT' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- donasi lunas -> ledger + lencana donatur + notifikasi.
-- fires on INSERT juga supaya donasi yang langsung tercatat lunas tetap konsisten.
create or replace function fn_donation_paid() returns trigger
language plpgsql as $$
declare
  v_first_time boolean;
begin
  v_first_time := case
    when tg_op = 'INSERT' then new.status = 'paid'
    else new.status = 'paid' and old.status is distinct from 'paid'
  end;

  if not v_first_time then
    return new;
  end if;

  insert into ledger_entries (pic_assignment_id, donation_id, kind, amount, note)
  values (new.pic_assignment_id, new.id, 'donation_in', new.amount,
          'donasi ' || new.midtrans_order_id)
  on conflict (donation_id) where donation_id is not null do nothing;

  if new.donor_id is not null then
    insert into profile_badges (profile_id, badge)
    values (new.donor_id, 'funder')
    on conflict (profile_id, badge) do nothing;

    insert into notifications (profile_id, kind, title, body, link)
    values (new.donor_id, 'donation_paid', 'Donasi diterima',
            'Donasi Anda sebesar Rp' || to_char(new.amount, 'FM999G999G999') || ' sudah tercatat.',
            '/donasi/' || new.id);
  end if;

  return new;
end;
$$;

create or replace function fn_guard_disbursement() returns trigger
language plpgsql as $$
declare
  v_available numeric;
  v_max_pct   numeric;
  v_prev_ok   boolean;
begin
  if new.status in ('locked','rejected') then
    return new;
  end if;

  select coalesce(sum(amount), 0) into v_available
    from ledger_entries where pic_assignment_id = new.pic_assignment_id;

  if new.amount > v_available then
    raise exception 'INSUFFICIENT_BALANCE'
      using errcode = '23514',
            detail  = format('available=%s requested=%s', v_available, new.amount);
  end if;

  v_max_pct := fn_setting_int('disbursement_max_pct', 40);
  if new.amount > round(v_available * v_max_pct / 100.0, 2) then
    raise exception 'TRANCHE_EXCEEDS_LIMIT'
      using errcode = '23514',
            detail  = format('max_pct=%s available=%s', v_max_pct, v_available);
  end if;

  if new.seq > 1 then
    select exists (
      select 1
        from disbursements d
        join expenses x on x.disbursement_id = d.id
        join expense_confirmations c on c.expense_id = x.id and c.decision = 'received'
       where d.pic_assignment_id = new.pic_assignment_id
         and d.seq = new.seq - 1
    ) into v_prev_ok;

    if not v_prev_ok then
      raise exception 'PREVIOUS_TRANCHE_UNCONFIRMED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function fn_disbursement_ledger() returns trigger
language plpgsql as $$
begin
  if new.status = 'transferred' and old.status is distinct from 'transferred' then
    insert into ledger_entries (pic_assignment_id, disbursement_id, kind, amount, note)
    values (new.pic_assignment_id, new.id, 'disbursement_out', -new.amount,
            'pencairan tahap ' || new.seq)
    on conflict (disbursement_id) where disbursement_id is not null do nothing;
  end if;
  return new;
end;
$$;

create or replace function fn_guard_expense_confirmation() returns trigger
language plpgsql as $$
declare
  v_event uuid;
  v_distributor uuid;
begin
  select a.event_id, a.distributor_id into v_event, v_distributor
    from expenses x
    join disbursements d on d.id = x.disbursement_id
    join pic_assignments a on a.id = d.pic_assignment_id
   where x.id = new.expense_id;

  if v_event is null then
    raise exception 'EXPENSE_NOT_FOUND' using errcode = '23503';
  end if;

  if v_distributor = new.profile_id then
    raise exception 'SELF_CONFIRMATION_FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1 from posts p where p.event_id = v_event and p.author_id = new.profile_id
  ) then
    raise exception 'ONLY_EVENT_REPORTERS_CAN_CONFIRM' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function fn_merge_events(
  p_source uuid,
  p_target uuid,
  p_similarity numeric default null,
  p_model text default null,
  p_actor uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_source disaster_events;
  v_target disaster_events;
begin
  if p_source = p_target then
    raise exception 'MERGE_SELF' using errcode = '22023';
  end if;

  select * into v_source from disaster_events where id = p_source for update;
  select * into v_target from disaster_events where id = p_target for update;

  if v_source.id is null or v_target.id is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_source.merged_into_id is not null or v_target.merged_into_id is not null then
    raise exception 'EVENT_ALREADY_MERGED' using errcode = '22023';
  end if;

  update posts set event_id = p_target where event_id = p_source;
  update relief_posts set event_id = p_target where event_id = p_source;

  insert into event_likes (event_id, profile_id, created_at)
  select p_target, profile_id, created_at from event_likes where event_id = p_source
  on conflict (event_id, profile_id) do nothing;
  delete from event_likes where event_id = p_source;

  update donations d
     set pic_assignment_id = t.id, event_id = p_target
    from pic_assignments s
    join pic_assignments t
      on t.event_id = p_target and t.distributor_id = s.distributor_id
   where d.pic_assignment_id = s.id and s.event_id = p_source;

  update disbursements b
     set pic_assignment_id = t.id
    from pic_assignments s
    join pic_assignments t
      on t.event_id = p_target and t.distributor_id = s.distributor_id
   where b.pic_assignment_id = s.id and s.event_id = p_source;

  update ledger_entries l
     set pic_assignment_id = t.id
    from pic_assignments s
    join pic_assignments t
      on t.event_id = p_target and t.distributor_id = s.distributor_id
   where l.pic_assignment_id = s.id and s.event_id = p_source;

  delete from pic_assignments s
   where s.event_id = p_source
     and exists (
       select 1 from pic_assignments t
        where t.event_id = p_target and t.distributor_id = s.distributor_id
     );

  update pic_assignments set event_id = p_target where event_id = p_source;

  update disaster_events e
     set post_count = (select count(*) from posts p where p.event_id = e.id and p.status = 'published'),
         like_count = (select count(*) from event_likes l where l.event_id = e.id),
         last_activity_at = now()
   where e.id in (p_source, p_target);

  update disaster_events
     set merged_into_id = p_target,
         status = 'archived',
         post_count = 0,
         like_count = 0,
         approved_pic_count = 0
   where id = p_source;

  insert into event_merges (source_event_id, target_event_id, similarity, model, decided_by, decided_by_profile)
  values (p_source, p_target, p_similarity, p_model,
          case when p_actor is null then 'ai' else 'admin' end, p_actor);

  insert into audit_logs (actor_id, action, entity, entity_id, payload)
  values (p_actor, 'event.merge', 'disaster_events', p_target,
          jsonb_build_object('source', p_source, 'similarity', p_similarity, 'model', p_model));
end;
$$;

create or replace function fn_stock_move(
  p_stock_id uuid,
  p_delta numeric,
  p_reason stock_reason,
  p_note text default null,
  p_actor uuid default null
) returns numeric
language plpgsql as $$
declare
  v_after numeric;
begin
  update posko_stock
     set quantity = quantity + p_delta,
         updated_by = p_actor,
         updated_at = now()
   where id = p_stock_id
  returning quantity into v_after;

  if v_after is null then
    raise exception 'STOCK_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into stock_logs (stock_id, delta, reason, note, actor_id)
  values (p_stock_id, p_delta, p_reason, p_note, p_actor);

  return v_after;
end;
$$;

-- ============================================================ 10. trigger
create trigger trg_profiles_touch      before update on profiles             for each row execute function fn_touch_updated_at();
create trigger trg_distributor_touch   before update on distributor_profiles for each row execute function fn_touch_updated_at();
create trigger trg_events_touch        before update on disaster_events      for each row execute function fn_touch_updated_at();
create trigger trg_posts_touch         before update on posts                for each row execute function fn_touch_updated_at();
create trigger trg_relief_posts_touch  before update on relief_posts         for each row execute function fn_touch_updated_at();
create trigger trg_needs_touch         before update on posko_needs          for each row execute function fn_touch_updated_at();
create trigger trg_pic_touch           before update on pic_assignments      for each row execute function fn_touch_updated_at();
create trigger trg_donations_touch     before update on donations            for each row execute function fn_touch_updated_at();
create trigger trg_disbursements_touch before update on disbursements        for each row execute function fn_touch_updated_at();
create trigger trg_expenses_touch      before update on expenses             for each row execute function fn_touch_updated_at();

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function fn_handle_new_user();

create trigger trg_like_count
  after insert or delete on event_likes
  for each row execute function fn_sync_like_count();

create trigger trg_post_count
  after insert or update or delete on posts
  for each row execute function fn_sync_post_count();

create trigger trg_pic_count
  after insert or update or delete on pic_assignments
  for each row execute function fn_sync_pic_count();

create trigger trg_badge_reporter
  after insert on posts
  for each row execute function fn_badge_reporter();

create trigger trg_post_location
  before insert or update of location, event_id on posts
  for each row execute function fn_guard_post_location();

create trigger trg_pic_guard
  before insert or update on pic_assignments
  for each row execute function fn_guard_pic_assignment();

create trigger trg_donation_guard
  before insert or update of pic_assignment_id, event_id, posko_id on donations
  for each row execute function fn_guard_donation();

create trigger trg_donation_paid
  after insert or update on donations
  for each row execute function fn_donation_paid();

create trigger trg_disbursement_guard
  before insert or update on disbursements
  for each row execute function fn_guard_disbursement();

create trigger trg_disbursement_ledger
  after update on disbursements
  for each row execute function fn_disbursement_ledger();

create trigger trg_expense_confirmation_guard
  before insert on expense_confirmations
  for each row execute function fn_guard_expense_confirmation();

-- ============================================================ 11. view publik
create view v_event_uploaders as
select p.event_id,
       p.author_id,
       pr.display_name,
       pr.username,
       pr.avatar_key,
       count(*)::int     as post_count,
       min(p.created_at) as first_post_at
  from posts p
  join profiles pr on pr.id = p.author_id
 where p.status = 'published'
 group by p.event_id, p.author_id, pr.display_name, pr.username, pr.avatar_key;

create view v_event_feed as
select e.id,
       e.title,
       e.disaster_type,
       e.summary,
       e.status,
       st_y(e.location::geometry) as lat,
       st_x(e.location::geometry) as lng,
       e.village,
       e.district,
       e.regency,
       e.province,
       e.radius_m,
       e.severity,
       e.like_count,
       e.post_count,
       e.approved_pic_count,
       e.cover_media_key,
       e.first_reported_at,
       e.last_activity_at,
       case
         when e.approved_pic_count > 0 then 'pantau'
         when e.like_count >= fn_setting_int('trending_threshold_likes', 50) then 'leaderboard'
         else 'terbaru'
       end as section,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'id', u.author_id,
                  'name', u.display_name,
                  'username', u.username,
                  'post_count', u.post_count
                ) order by u.first_post_at)
           from v_event_uploaders u
          where u.event_id = e.id
       ), '[]'::jsonb) as uploaders,
       (select count(*) from relief_posts r where r.event_id = e.id and r.status = 'active') as posko_count
  from disaster_events e
 where e.merged_into_id is null
   and e.status <> 'archived';

create view v_profiles_public as
select p.id,
       p.display_name,
       p.username,
       p.avatar_key,
       p.account_type,
       coalesce((select jsonb_agg(b.badge) from profile_badges b where b.profile_id = p.id), '[]'::jsonb) as badges,
       d.label               as distributor_label,
       d.verification_status,
       d.social_url
  from profiles p
  left join distributor_profiles d on d.profile_id = p.id;

create view v_posko_public as
select r.id,
       r.event_id,
       r.name,
       r.address,
       r.headcount,
       r.capacity,
       st_y(r.location::geometry) as lat,
       st_x(r.location::geometry) as lng,
       r.surveyed_at,
       coalesce(sum(n.quantity_needed), 0)    as total_needed,
       coalesce(sum(n.quantity_fulfilled), 0) as total_fulfilled,
       count(n.id) filter (where n.status <> 'fulfilled') as open_need_count
  from relief_posts r
  left join posko_needs n on n.posko_id = r.id
 where r.status = 'active'
   and r.surveyed_at is not null
 group by r.id;

create view v_pic_balances as
select a.id                as pic_assignment_id,
       a.event_id,
       a.distributor_id,
       coalesce(sum(l.amount), 0)                                              as balance,
       coalesce(sum(l.amount) filter (where l.kind = 'donation_in'), 0)        as total_in,
       coalesce(-sum(l.amount) filter (where l.kind = 'disbursement_out'), 0)  as total_out,
       count(distinct l.donation_id) filter (where l.kind = 'donation_in')     as donation_count
  from pic_assignments a
  left join ledger_entries l on l.pic_assignment_id = a.id
 where a.status = 'approved'
 group by a.id;

create view v_pic_public as
select b.pic_assignment_id,
       b.event_id,
       b.distributor_id,
       d.label,
       d.display_name,
       d.bio,
       d.verification_status,
       d.social_url,
       d.follower_count,
       b.total_in,
       b.total_out,
       b.balance,
       b.donation_count,
       (select count(*) from pic_assignments a2
         where a2.distributor_id = b.distributor_id and a2.status = 'approved') as handled_event_count,
       (select count(*) from relief_posts r where r.event_id = b.event_id and r.status = 'active') as posko_count
  from v_pic_balances b
  join distributor_profiles d on d.profile_id = b.distributor_id;

-- ============================================================ 12. RLS
alter table profiles              enable row level security;
alter table profile_badges        enable row level security;
alter table distributor_profiles  enable row level security;
alter table verification_documents enable row level security;
alter table disaster_events       enable row level security;
alter table posts                 enable row level security;
alter table post_media            enable row level security;
alter table event_likes           enable row level security;
alter table event_merges          enable row level security;
alter table content_reports       enable row level security;
alter table relief_posts          enable row level security;
alter table posko_needs           enable row level security;
alter table posko_stock           enable row level security;
alter table stock_logs            enable row level security;
alter table pic_assignments       enable row level security;
alter table donations             enable row level security;
alter table disbursements         enable row level security;
alter table ledger_entries        enable row level security;
alter table expenses              enable row level security;
alter table expense_confirmations enable row level security;
alter table notifications         enable row level security;
alter table app_settings          enable row level security;
alter table audit_logs            enable row level security;

create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or fn_is_admin());
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and is_admin = (select is_admin from profiles where id = auth.uid()));

create policy badges_select on profile_badges for select to authenticated using (true);

create policy distributor_select on distributor_profiles for select to authenticated
  using (profile_id = auth.uid() or fn_is_admin() or verification_status = 'verified');
create policy distributor_insert on distributor_profiles for insert to authenticated
  with check (profile_id = auth.uid() and verification_status = 'unverified');
create policy distributor_update on distributor_profiles for update to authenticated
  using (profile_id = auth.uid() and verification_status in ('unverified','rejected'))
  with check (profile_id = auth.uid() and verification_status in ('unverified','pending'));

create policy docs_select on verification_documents for select to authenticated
  using (profile_id = auth.uid() or fn_is_admin());
create policy docs_insert on verification_documents for insert to authenticated
  with check (profile_id = auth.uid() and review_status = 'pending');

create policy events_select on disaster_events for select using (true);
create policy events_admin_write on disaster_events for all to authenticated
  using (fn_is_admin()) with check (fn_is_admin());

create policy posts_select on posts for select
  using (status = 'published' or author_id = auth.uid() or fn_is_admin());
create policy posts_insert on posts for insert to authenticated
  with check (author_id = auth.uid());
create policy posts_update_own on posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete_own on posts for delete to authenticated
  using (author_id = auth.uid() or fn_is_admin());

create policy post_media_select on post_media for select using (true);
create policy post_media_insert on post_media for insert to authenticated
  with check (exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));

create policy likes_select on event_likes for select using (true);
create policy likes_insert on event_likes for insert to authenticated
  with check (profile_id = auth.uid());
create policy likes_delete on event_likes for delete to authenticated
  using (profile_id = auth.uid());

create policy merges_select on event_merges for select using (true);
create policy merges_admin_write on event_merges for all to authenticated
  using (fn_is_admin()) with check (fn_is_admin());

create policy reports_insert on content_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_admin on content_reports for all to authenticated
  using (fn_is_admin()) with check (fn_is_admin());

create policy posko_select on relief_posts for select using (true);
create policy posko_insert on relief_posts for insert to authenticated
  with check (created_by = auth.uid());
create policy posko_update on relief_posts for update to authenticated
  using (created_by = auth.uid() or fn_is_admin())
  with check (created_by = auth.uid() or fn_is_admin());

create policy needs_select on posko_needs for select using (true);
create policy needs_write on posko_needs for all to authenticated
  using (exists (select 1 from relief_posts r where r.id = posko_id and (r.created_by = auth.uid() or fn_is_admin())))
  with check (exists (select 1 from relief_posts r where r.id = posko_id and (r.created_by = auth.uid() or fn_is_admin())));

create policy stock_select on posko_stock for select using (true);
create policy stock_write on posko_stock for all to authenticated
  using (exists (select 1 from relief_posts r where r.id = posko_id and (r.created_by = auth.uid() or fn_is_admin())))
  with check (exists (select 1 from relief_posts r where r.id = posko_id and (r.created_by = auth.uid() or fn_is_admin())));

create policy stock_logs_select on stock_logs for select using (true);

create policy pic_select on pic_assignments for select to authenticated
  using (status = 'approved' or distributor_id = auth.uid() or fn_is_admin());
create policy pic_insert on pic_assignments for insert to authenticated
  with check (distributor_id = auth.uid() and status = 'applied');
create policy pic_admin_update on pic_assignments for update to authenticated
  using (fn_is_admin()) with check (fn_is_admin());

create policy donations_select on donations for select to authenticated
  using (donor_id = auth.uid() or claimed_by = auth.uid() or fn_is_admin());
create policy donations_insert on donations for insert to authenticated
  with check (donor_id = auth.uid() or donor_id is null);

create policy disbursements_select on disbursements for select to authenticated
  using (fn_is_admin() or exists (
    select 1 from pic_assignments a
     where a.id = pic_assignment_id and a.distributor_id = auth.uid()
  ));
create policy disbursements_distributor_write on disbursements for insert to authenticated
  with check (exists (
    select 1 from pic_assignments a
     where a.id = pic_assignment_id and a.distributor_id = auth.uid() and a.status = 'approved'
  ));
create policy disbursements_update on disbursements for update to authenticated
  using (fn_is_admin() or exists (
    select 1 from pic_assignments a
     where a.id = pic_assignment_id and a.distributor_id = auth.uid() and a.status = 'approved'
  ));

create policy ledger_select on ledger_entries for select using (true);

create policy expenses_select on expenses for select using (true);
create policy expenses_insert on expenses for insert to authenticated
  with check (exists (
    select 1 from disbursements d
      join pic_assignments a on a.id = d.pic_assignment_id
     where d.id = disbursement_id and a.distributor_id = auth.uid() and a.status = 'approved'
  ));
create policy expenses_update on expenses for update to authenticated
  using (exists (
    select 1 from disbursements d
      join pic_assignments a on a.id = d.pic_assignment_id
     where d.id = disbursement_id and a.distributor_id = auth.uid()
  ));

create policy confirmations_select on expense_confirmations for select using (true);
create policy confirmations_insert on expense_confirmations for insert to authenticated
  with check (profile_id = auth.uid());

create policy notifications_select on notifications for select to authenticated
  using (profile_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy settings_select on app_settings for select using (true);
create policy settings_admin on app_settings for all to authenticated
  using (fn_is_admin()) with check (fn_is_admin());

create policy audit_admin on audit_logs for select to authenticated using (fn_is_admin());

-- ============================================================ 13. backfill profil dari auth.users
insert into profiles (id, display_name, account_type)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1), 'Pengguna Jangkau'),
       case when u.raw_user_meta_data->>'account_type' = 'distributor'
            then 'distributor'::account_type else 'resident'::account_type end
  from auth.users u
on conflict (id) do nothing;

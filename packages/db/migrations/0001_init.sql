-- Jangkau — skema awal.
-- Sumber kebenaran: prd-databaseSchema.md §4. Ubah dokumen itu lebih dulu.
-- Dijalankan di Supabase (Postgres 15+) lewat `supabase db push`.

create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type app_role                as enum ('resident','organization','admin');
create type post_status             as enum ('active','closed','inactive');
create type org_verification_status as enum ('pending','verified','rejected','suspended');
create type org_member_role         as enum ('owner','staff');
create type need_category           as enum ('food','water','health','shelter','clothing','sanitation','energy','other');
create type severity_level          as enum ('low','medium','high','critical');
create type report_status           as enum ('pending','validated','eligible','taken_up','rejected','merged');
create type campaign_status         as enum ('draft','awaiting_confirmation','active','funded','in_progress','completed','cancelled');
create type donation_status         as enum ('pending','paid','expired','failed','refunded');
create type tranche_status          as enum ('planned','receipts_submitted','goods_confirmed','released','disputed');
create type media_kind              as enum ('report_photo','receipt','org_document','campaign_photo','avatar');
create type stock_reason            as enum ('report','donation','distribution','adjustment','opname');

-- ---------------------------------------------------------------- tables

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  phone      text,
  role       app_role not null default 'resident',
  avatar_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table relief_posts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  regency    text,
  province   text,
  location   geography(Point,4326) not null,
  radius_m   integer not null default 300 check (radius_m between 10 and 20000),
  headcount  integer not null default 0 check (headcount >= 0),
  capacity   integer check (capacity >= 0),
  status     post_status not null default 'active',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index relief_posts_location_gix on relief_posts using gist (location);

create table organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  legal_type          text,
  legal_doc_key       text not null,
  pic_name            text not null,
  pic_phone           text not null,
  pic_email           text,
  verification_status org_verification_status not null default 'pending',
  verified_by         uuid references profiles(id),
  verified_at         timestamptz,
  rejection_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id      uuid not null references profiles(id) on delete cascade,
  member_role     org_member_role not null default 'staff',
  created_at      timestamptz not null default now(),
  primary key (organization_id, profile_id)
);
create index organization_members_profile_idx on organization_members (profile_id);

create table reports (
  id                  uuid primary key default gen_random_uuid(),
  client_uuid         uuid not null unique,
  post_id             uuid not null references relief_posts(id),
  reporter_id         uuid not null references profiles(id),
  body_text           text,
  transcript          text,
  category            need_category not null default 'other',
  ai_category         need_category,
  ai_confidence       numeric(4,3) check (ai_confidence between 0 and 1),
  ai_model            text,
  severity            severity_level not null default 'medium',
  headcount_delta     integer,
  location            geography(Point,4326) not null,
  location_accuracy_m numeric(8,2),
  captured_at         timestamptz not null,
  status              report_status not null default 'pending',
  geofence_ok         boolean not null default false,
  upvote_count        integer not null default 0,
  merged_into_id      uuid references reports(id),
  reject_reason       text,
  created_at          timestamptz not null default now(),
  synced_at           timestamptz not null default now(),
  constraint reports_has_content check (body_text is not null or transcript is not null)
);
create index reports_post_status_idx on reports (post_id, status);
create index reports_feed_idx        on reports (status, upvote_count desc, captured_at desc);
create index reports_reporter_idx    on reports (reporter_id, created_at desc);
create index reports_location_gix    on reports using gist (location);

create table report_media (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references reports(id) on delete cascade,
  r2_key     text not null unique,
  kind       media_kind not null default 'report_photo',
  mime_type  text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index report_media_report_idx on report_media (report_id);

create table report_embeddings (
  report_id  uuid primary key references reports(id) on delete cascade,
  embedding  vector(768) not null,
  model      text not null,
  created_at timestamptz not null default now()
);
create index report_embeddings_hnsw on report_embeddings using hnsw (embedding vector_cosine_ops);

create table report_votes (
  report_id  uuid not null references reports(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, profile_id)
);

create table campaigns (
  id                    uuid primary key default gen_random_uuid(),
  report_id             uuid not null unique references reports(id),
  organization_id       uuid not null references organizations(id),
  title                 text not null,
  summary               text,
  target_amount         numeric(14,2) not null check (target_amount > 0),
  raised_amount         numeric(14,2) not null default 0 check (raised_amount >= 0),
  status                campaign_status not null default 'draft',
  budget_doc_key        text,
  reporter_confirmed_by uuid references profiles(id),
  reporter_confirmed_at timestamptz,
  activated_at          timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint campaigns_active_needs_confirmation
    check (status <> 'active' or reporter_confirmed_at is not null)
);
create index campaigns_status_idx on campaigns (status, created_at desc);
create index campaigns_org_idx    on campaigns (organization_id);

create table budget_items (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name        text not null,
  category    need_category not null default 'other',
  quantity    numeric(12,2) not null check (quantity > 0),
  unit        text not null,
  unit_cost   numeric(14,2) not null check (unit_cost >= 0),
  subtotal    numeric(14,2) generated always as (quantity * unit_cost) stored,
  note        text,
  created_at  timestamptz not null default now()
);
create index budget_items_campaign_idx on budget_items (campaign_id);

create table donations (
  id                      uuid primary key default gen_random_uuid(),
  campaign_id             uuid not null references campaigns(id),
  donor_id                uuid references profiles(id),
  donor_name              text,
  amount                  numeric(14,2) not null check (amount > 0),
  currency                char(3) not null default 'IDR',
  status                  donation_status not null default 'pending',
  midtrans_order_id       text not null unique,
  midtrans_transaction_id text,
  payment_type            text,
  paid_at                 timestamptz,
  expires_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index donations_campaign_status_idx on donations (campaign_id, status);
create index donations_donor_idx          on donations (donor_id, created_at desc);

create table tranches (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references campaigns(id) on delete cascade,
  seq                smallint not null check (seq >= 1),
  amount             numeric(14,2) not null check (amount > 0),
  status             tranche_status not null default 'planned',
  purpose            text,
  released_at        timestamptz,
  released_by        uuid references profiles(id),
  goods_confirmed_at timestamptz,
  goods_confirmed_by uuid references profiles(id),
  created_at         timestamptz not null default now(),
  unique (campaign_id, seq)
);

create table tranche_receipts (
  id          uuid primary key default gen_random_uuid(),
  tranche_id  uuid not null references tranches(id) on delete cascade,
  r2_key      text not null unique,
  vendor      text,
  amount      numeric(14,2) check (amount >= 0),
  purchased_at date,
  uploaded_by uuid not null references profiles(id),
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index tranche_receipts_tranche_idx on tranche_receipts (tranche_id);

create table stock_items (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid not null references relief_posts(id) on delete cascade,
  name                text not null,
  category            need_category not null default 'other',
  unit                text not null default 'pcs',
  quantity            numeric(12,2) not null default 0,
  low_stock_threshold numeric(12,2) not null default 0,
  updated_at          timestamptz not null default now(),
  unique (post_id, name)
);
create index stock_items_post_idx on stock_items (post_id);

create table stock_logs (
  id             uuid primary key default gen_random_uuid(),
  stock_item_id  uuid not null references stock_items(id) on delete cascade,
  delta          numeric(12,2) not null,
  quantity_after numeric(12,2) not null,
  reason         stock_reason not null,
  ref_report_id  uuid references reports(id),
  ref_tranche_id uuid references tranches(id),
  note           text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index stock_logs_item_idx on stock_logs (stock_item_id, created_at desc);

create table app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id         bigserial primary key,
  actor_id   uuid references profiles(id),
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity, entity_id);

-- ---------------------------------------------------------------- functions

create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function fn_profile_from_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function fn_report_geofence() returns trigger
language plpgsql as $$
declare
  v_location geography(Point,4326);
  v_radius   integer;
begin
  select location, radius_m into v_location, v_radius
  from relief_posts where id = new.post_id;

  if v_location is null then
    raise exception 'relief_post_not_found' using errcode = '23503';
  end if;

  new.geofence_ok := st_dwithin(new.location, v_location, v_radius);
  return new;
end;
$$;

create or replace function fn_vote_count() returns trigger
language plpgsql as $$
declare
  v_report    uuid;
  v_count     integer;
  v_threshold integer;
begin
  -- NEW tidak ter-assign pada trigger DELETE, jadi cabang per operasi.
  if tg_op = 'DELETE' then
    v_report := old.report_id;
  else
    v_report := new.report_id;
  end if;

  select count(*) into v_count from report_votes where report_id = v_report;

  select (value #>> '{}')::integer into v_threshold
  from app_settings where key = 'upvote_threshold';
  v_threshold := coalesce(v_threshold, 5);

  update reports
     set upvote_count = v_count,
         status = case
           when status in ('pending','validated') and v_count >= v_threshold then 'eligible'::report_status
           when status = 'eligible' and v_count < v_threshold then 'validated'::report_status
           else status
         end
   where id = v_report;

  return null;
end;
$$;

create or replace function fn_donation_paid() returns trigger
language plpgsql as $$
declare
  v_raised numeric(14,2);
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    select coalesce(sum(amount), 0) into v_raised
    from donations where campaign_id = new.campaign_id and status = 'paid';

    update campaigns
       set raised_amount = v_raised,
           status = case
             when status = 'active' and v_raised >= target_amount then 'funded'::campaign_status
             else status
           end
     where id = new.campaign_id;
  end if;

  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;

  return new;
end;
$$;

create or replace function fn_tranche_guard() returns trigger
language plpgsql as $$
declare
  v_released numeric(14,2);
  v_raised   numeric(14,2);
  v_prev     tranche_status;
  v_receipts integer;
begin
  if new.status = 'released' and old.status is distinct from 'released' then
    if new.goods_confirmed_at is null then
      raise exception 'goods_not_confirmed';
    end if;

    select count(*) into v_receipts from tranche_receipts where tranche_id = new.id;
    if v_receipts = 0 then
      raise exception 'no_receipts';
    end if;

    if new.seq > 1 then
      select status into v_prev from tranches
      where campaign_id = new.campaign_id and seq = new.seq - 1;
      if v_prev is distinct from 'released' then
        raise exception 'previous_tranche_not_released';
      end if;
    end if;

    select coalesce(sum(amount), 0) into v_released from tranches
    where campaign_id = new.campaign_id and status = 'released';
    select raised_amount into v_raised from campaigns where id = new.campaign_id;

    if v_released + new.amount > v_raised then
      raise exception 'tranche_exceeds_raised';
    end if;

    new.released_at := coalesce(new.released_at, now());
  end if;

  return new;
end;
$$;

-- Kandidat duplikat: laporan lain di pos yang sama dengan kemiripan >= threshold.
create or replace function fn_similar_reports(
  p_post_id   uuid,
  p_embedding vector(768),
  p_threshold numeric default 0.86,
  p_limit     integer default 5
) returns table (report_id uuid, similarity numeric)
language sql stable as $$
  select e.report_id, round((1 - (e.embedding <=> p_embedding))::numeric, 4) as similarity
  from report_embeddings e
  join reports r on r.id = e.report_id
  where r.post_id = p_post_id
    and r.status not in ('merged','rejected')
    and (1 - (e.embedding <=> p_embedding)) >= p_threshold::double precision
  order by e.embedding <=> p_embedding
  limit p_limit;
$$;

-- Satu-satunya jalan mengubah stok. Baris dikunci agar dua penulisan
-- bersamaan tidak saling menimpa.
create or replace function apply_stock_movement(
  p_stock_item_id uuid,
  p_delta         numeric,
  p_reason        stock_reason,
  p_ref_report    uuid default null,
  p_ref_tranche   uuid default null,
  p_note          text default null,
  p_actor         uuid default null
) returns stock_logs
language plpgsql security definer set search_path = public as $$
declare
  v_item stock_items;
  v_log  stock_logs;
begin
  if p_delta = 0 then
    raise exception 'delta_must_be_nonzero';
  end if;

  select * into v_item from stock_items where id = p_stock_item_id for update;
  if not found then
    raise exception 'stock_item_not_found';
  end if;

  if v_item.quantity + p_delta < 0 then
    raise exception 'insufficient_stock';
  end if;

  update stock_items
     set quantity = quantity + p_delta, updated_at = now()
   where id = p_stock_item_id
   returning * into v_item;

  insert into stock_logs (stock_item_id, delta, quantity_after, reason, ref_report_id, ref_tranche_id, note, created_by)
  values (p_stock_item_id, p_delta, v_item.quantity, p_reason, p_ref_report, p_ref_tranche, p_note, p_actor)
  returning * into v_log;

  return v_log;
end;
$$;

-- ---------------------------------------------------------------- triggers

create trigger trg_profiles_touch        before update on profiles        for each row execute function fn_touch_updated_at();
create trigger trg_relief_posts_touch    before update on relief_posts    for each row execute function fn_touch_updated_at();
create trigger trg_organizations_touch   before update on organizations   for each row execute function fn_touch_updated_at();
create trigger trg_campaigns_touch       before update on campaigns       for each row execute function fn_touch_updated_at();
create trigger trg_donations_touch       before update on donations       for each row execute function fn_touch_updated_at();
create trigger trg_stock_items_touch     before update on stock_items     for each row execute function fn_touch_updated_at();

create trigger trg_profile_from_auth
  after insert on auth.users
  for each row execute function fn_profile_from_auth();

create trigger trg_report_geofence
  before insert or update of location, post_id on reports
  for each row execute function fn_report_geofence();

create trigger trg_report_vote_count
  after insert or delete on report_votes
  for each row execute function fn_vote_count();

create trigger trg_donation_paid
  before update of status on donations
  for each row execute function fn_donation_paid();

create trigger trg_tranche_guard
  before update of status on tranches
  for each row execute function fn_tranche_guard();

-- ---------------------------------------------------------------- views

-- Dipakai halaman publik: tidak mengekspos identitas pelapor.
create view public_reports with (security_invoker = false) as
select r.id,
       r.post_id,
       r.body_text,
       r.transcript,
       r.category,
       r.severity,
       r.status,
       r.upvote_count,
       r.captured_at,
       r.created_at,
       r.merged_into_id
from reports r
where r.status in ('validated','eligible','taken_up');

create view public_posts with (security_invoker = false) as
select p.id, p.name, p.address, p.regency, p.province,
       st_y(p.location::geometry) as lat,
       st_x(p.location::geometry) as lng,
       p.radius_m, p.headcount, p.capacity, p.status, p.created_at
from relief_posts p;

create view public_organizations with (security_invoker = false) as
select o.id, o.name, o.legal_type, o.verification_status, o.created_at
from organizations o
where o.verification_status = 'verified';

create view public_campaigns with (security_invoker = false) as
select c.id, c.report_id, c.organization_id, c.title, c.summary,
       c.target_amount, c.raised_amount, c.status, c.created_at
from campaigns c
where c.status in ('active','funded','in_progress','completed');

create view public_stock with (security_invoker = false) as
select s.id, s.post_id, s.name, s.category, s.unit, s.quantity,
       s.low_stock_threshold, s.updated_at,
       (s.quantity <= s.low_stock_threshold) as is_low
from stock_items s;

-- ---------------------------------------------------------------- rls

alter table profiles              enable row level security;
alter table relief_posts          enable row level security;
alter table organizations         enable row level security;
alter table organization_members  enable row level security;
alter table reports               enable row level security;
alter table report_media          enable row level security;
alter table report_embeddings     enable row level security;
alter table report_votes          enable row level security;
alter table campaigns             enable row level security;
alter table budget_items          enable row level security;
alter table donations             enable row level security;
alter table tranches              enable row level security;
alter table tranche_receipts      enable row level security;
alter table stock_items           enable row level security;
alter table stock_logs            enable row level security;
alter table app_settings          enable row level security;
alter table audit_logs            enable row level security;

-- SECURITY DEFINER wajib: fungsi ini dipanggil dari dalam policy pada tabel
-- yang sama dengan yang dibacanya, sehingga invoker-mode akan rekursi tak
-- berujung (mis. policy profiles -> fn_is_admin -> profiles).
create or replace function fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function fn_my_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select organization_id from organization_members where profile_id = auth.uid();
$$;

-- profiles
create policy profiles_self_read on profiles
  for select to authenticated using (id = auth.uid() or fn_is_admin());
create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- relief_posts: baca publik lewat view; tulis hanya admin
create policy posts_read on relief_posts
  for select to authenticated using (true);
create policy posts_admin_write on relief_posts
  for all to authenticated using (fn_is_admin()) with check (fn_is_admin());

-- organizations
create policy org_member_read on organizations
  for select to authenticated
  using (id in (select fn_my_org_ids()) or fn_is_admin());
create policy org_owner_insert on organizations
  for insert to authenticated with check (true);
create policy org_admin_write on organizations
  for update to authenticated using (fn_is_admin()) with check (fn_is_admin());

create policy org_members_read on organization_members
  for select to authenticated
  using (profile_id = auth.uid() or organization_id in (select fn_my_org_ids()) or fn_is_admin());
create policy org_members_insert on organization_members
  for insert to authenticated
  with check (profile_id = auth.uid() or organization_id in (select fn_my_org_ids()));

-- reports
create policy reports_own_read on reports
  for select to authenticated
  using (reporter_id = auth.uid() or status in ('validated','eligible','taken_up') or fn_is_admin());
create policy reports_insert on reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_admin_update on reports
  for update to authenticated using (fn_is_admin()) with check (fn_is_admin());

create policy report_media_read on report_media
  for select to authenticated
  using (exists (
    select 1 from reports r
    where r.id = report_media.report_id
      and (r.reporter_id = auth.uid() or r.status in ('validated','eligible','taken_up') or fn_is_admin())
  ));
create policy report_media_insert on report_media
  for insert to authenticated
  with check (exists (select 1 from reports r where r.id = report_media.report_id and r.reporter_id = auth.uid()));

-- embeddings: hanya API (service_role)
create policy report_embeddings_admin on report_embeddings
  for all to authenticated using (fn_is_admin()) with check (fn_is_admin());

-- votes
create policy votes_read on report_votes for select to authenticated using (true);
create policy votes_insert on report_votes
  for insert to authenticated with check (profile_id = auth.uid());
create policy votes_delete on report_votes
  for delete to authenticated using (profile_id = auth.uid());

-- campaigns & budget
create policy campaigns_public_read on campaigns
  for select to authenticated
  using (status in ('active','funded','in_progress','completed')
         or organization_id in (select fn_my_org_ids())
         or fn_is_admin());
create policy campaigns_org_write on campaigns
  for all to authenticated
  using (organization_id in (select fn_my_org_ids()) or fn_is_admin())
  with check (organization_id in (select fn_my_org_ids()) or fn_is_admin());

create policy budget_items_read on budget_items
  for select to authenticated
  using (exists (
    select 1 from campaigns c
    where c.id = budget_items.campaign_id
      and (c.status in ('active','funded','in_progress','completed')
           or c.organization_id in (select fn_my_org_ids())
           or fn_is_admin())
  ));
create policy budget_items_write on budget_items
  for all to authenticated
  using (exists (select 1 from campaigns c where c.id = budget_items.campaign_id and c.organization_id in (select fn_my_org_ids())))
  with check (exists (select 1 from campaigns c where c.id = budget_items.campaign_id and c.organization_id in (select fn_my_org_ids())));

-- donations
create policy donations_read on donations
  for select to authenticated
  using (donor_id = auth.uid()
         or exists (select 1 from campaigns c where c.id = donations.campaign_id and c.organization_id in (select fn_my_org_ids()))
         or fn_is_admin());
create policy donations_insert on donations
  for insert to authenticated with check (donor_id = auth.uid());

-- tranches & receipts
create policy tranches_read on tranches
  for select to authenticated
  using (exists (select 1 from campaigns c where c.id = tranches.campaign_id and c.organization_id in (select fn_my_org_ids()))
         or fn_is_admin());
create policy tranches_write on tranches
  for all to authenticated
  using (exists (select 1 from campaigns c where c.id = tranches.campaign_id and c.organization_id in (select fn_my_org_ids())) or fn_is_admin())
  with check (exists (select 1 from campaigns c where c.id = tranches.campaign_id and c.organization_id in (select fn_my_org_ids())) or fn_is_admin());

create policy tranche_receipts_read on tranche_receipts
  for select to authenticated
  using (exists (
    select 1 from tranches t join campaigns c on c.id = t.campaign_id
    where t.id = tranche_receipts.tranche_id
      and (c.organization_id in (select fn_my_org_ids()) or fn_is_admin())
  ));
create policy tranche_receipts_insert on tranche_receipts
  for insert to authenticated
  with check (uploaded_by = auth.uid());

-- stock
create policy stock_items_read on stock_items for select to authenticated using (true);
create policy stock_items_write on stock_items
  for all to authenticated using (fn_is_admin()) with check (fn_is_admin());

create policy stock_logs_read on stock_logs
  for select to authenticated
  using (fn_is_admin() or created_by = auth.uid());

-- settings & audit
create policy app_settings_admin on app_settings
  for all to authenticated using (fn_is_admin()) with check (fn_is_admin());
create policy audit_logs_admin on audit_logs
  for select to authenticated using (fn_is_admin());

-- ---------------------------------------------------------------- grants

grant select on public_reports, public_posts, public_organizations, public_campaigns, public_stock to anon, authenticated;
grant execute on function fn_similar_reports(uuid, vector, numeric, integer) to service_role;
grant execute on function apply_stock_movement(uuid, numeric, stock_reason, uuid, uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------- settings

insert into app_settings (key, value) values
  ('upvote_threshold',     '5'::jsonb),
  ('similarity_threshold', '0.86'::jsonb),
  ('max_upload_bytes',     '10485760'::jsonb),
  ('tranche_max_ratio',    '0.5'::jsonb)
on conflict (key) do nothing;

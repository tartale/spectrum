-- Spectrum core schema.
-- Privacy model: RLS is the boundary. Users can read only their own profile;
-- discovery of other families happens exclusively through security-definer
-- RPCs that return coarse, intentional fields (never exact coordinates,
-- emails, or phone numbers). No photos exist anywhere in the data model.

create extension if not exists cube;
create extension if not exists earthdistance;

create type user_role as enum ('parent', 'admin');
create type verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type location_range_type as enum ('radius', 'same_city', 'same_neighborhood');
create type verification_request_status as enum ('pending', 'approved', 'rejected');
create type question_kind as enum ('multi_select', 'single_select', 'scale', 'free_text');
create type match_status as enum ('interested', 'mutual', 'declined');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role user_role not null default 'parent',
  verification_status verification_status not null default 'unverified',
  -- Set by admin approval flow from the verified address. Only ever exposed
  -- to other users as a computed distance, never directly.
  latitude double precision,
  longitude double precision,
  city text,
  neighborhood text,
  range_type location_range_type not null default 'same_city',
  range_radius_km numeric not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Parent'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper predicates used inside policies. security definer so policy checks
-- on profiles don't recurse into profiles' own RLS.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and verification_status = 'verified'
  );
$$;

create policy "profiles: read own" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid())
  -- role and verification_status changes go through admin RPCs
  with check (id = auth.uid());

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Prevent users from escalating role / verification via their own update.
create function public.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.verification_status := old.verification_status;
    new.latitude := old.latitude;
    new.longitude := old.longitude;
    new.city := old.city;
    new.neighborhood := old.neighborhood;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- ---------------------------------------------------------------------------
-- children — per-child compatibility profile. Nickname only, no photos.
-- ---------------------------------------------------------------------------
create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  nickname text not null,
  birth_year int not null check (birth_year between 1990 and 2100),
  likes text[] not null default '{}',
  dislikes text[] not null default '{}',
  triggers text[] not null default '{}',
  activity_preferences text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.children enable row level security;

create policy "children: parent full access" on public.children
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create trigger children_touch before update on public.children
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- verification_requests — manual admin review of ID + proof of address.
-- Documents live in the private 'verification-docs' storage bucket.
-- ---------------------------------------------------------------------------
create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  id_doc_path text not null,
  address_doc_path text not null,
  -- The address the user claims; admin verifies it against the document.
  -- Geocoded on approval, then only lat/lng + city + neighborhood are kept
  -- on the profile.
  address_text text not null,
  status verification_request_status not null default 'pending',
  reviewer_id uuid references public.profiles (id),
  reviewer_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.verification_requests enable row level security;

create policy "verification: owner read" on public.verification_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy "verification: owner create" on public.verification_requests
  for insert with check (user_id = auth.uid());

-- Admin decision: approves/rejects, stamps profile, records geocoded location.
create function public.review_verification(
  request_id uuid,
  approve boolean,
  notes text default null,
  geocoded_lat double precision default null,
  geocoded_lng double precision default null,
  geocoded_city text default null,
  geocoded_neighborhood text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.verification_requests;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into req from public.verification_requests where id = request_id for update;
  if req.id is null then
    raise exception 'verification request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'request already reviewed';
  end if;

  update public.verification_requests
  set status = case when approve then 'approved'::verification_request_status
                    else 'rejected'::verification_request_status end,
      reviewer_id = auth.uid(),
      reviewer_notes = notes,
      reviewed_at = now()
  where id = request_id;

  update public.profiles
  set verification_status = case when approve then 'verified'::verification_status
                                 else 'rejected'::verification_status end,
      latitude = case when approve then geocoded_lat else latitude end,
      longitude = case when approve then geocoded_lng else longitude end,
      city = case when approve then geocoded_city else city end,
      neighborhood = case when approve then geocoded_neighborhood else neighborhood end
  where id = req.user_id;
end;
$$;

-- Submitting a request moves the profile to 'pending'.
create function public.mark_verification_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set verification_status = 'pending'
  where id = new.user_id and verification_status in ('unverified', 'rejected');
  return new;
end;
$$;

create trigger verification_pending after insert on public.verification_requests
  for each row execute function public.mark_verification_pending();

-- ---------------------------------------------------------------------------
-- questionnaire — versioned so questions can evolve without losing answers.
-- ---------------------------------------------------------------------------
create table public.questionnaire_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.questionnaire_versions (id) on delete cascade,
  kind question_kind not null,
  prompt text not null,
  options jsonb not null default '[]',
  -- Scoring dimension consumed by the matcher: likes | dislikes | triggers |
  -- activity | age | logistics. Lets the questionnaire change without
  -- changing scorer code.
  dimension text not null,
  sort_order int not null default 0
);

create table public.answers (
  child_id uuid not null references public.children (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  values jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (child_id, question_id)
);

alter table public.questionnaire_versions enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

create policy "questionnaire versions: authenticated read" on public.questionnaire_versions
  for select using (auth.uid() is not null);

create policy "questions: authenticated read" on public.questions
  for select using (auth.uid() is not null);

create policy "answers: parent of child" on public.answers
  for all using (
    exists (select 1 from public.children c where c.id = child_id and c.parent_id = auth.uid())
  )
  with check (
    exists (select 1 from public.children c where c.id = child_id and c.parent_id = auth.uid())
  );

create trigger answers_touch before update on public.answers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- discovery — the only path to other families' data. Respects both sides'
-- range preferences; returns distance, never coordinates.
-- ---------------------------------------------------------------------------
create function public.nearby_families()
returns table (
  child_id uuid,
  nickname text,
  birth_year int,
  likes text[],
  dislikes text[],
  triggers text[],
  activity_preferences text[],
  parent_display_name text,
  city text,
  neighborhood text,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.nickname,
    c.birth_year,
    c.likes,
    c.dislikes,
    c.triggers,
    c.activity_preferences,
    p.display_name,
    p.city,
    p.neighborhood,
    round((earth_distance(
      ll_to_earth(me.latitude, me.longitude),
      ll_to_earth(p.latitude, p.longitude)
    ) / 1000.0)::numeric, 1)::double precision
  from public.profiles me
  join public.profiles p
    on p.id <> me.id
   and p.verification_status = 'verified'
   and p.latitude is not null
  join public.children c on c.parent_id = p.id
  where me.id = auth.uid()
    and me.verification_status = 'verified'
    and me.latitude is not null
    -- my range preference
    and case me.range_type
          when 'radius' then earth_distance(
            ll_to_earth(me.latitude, me.longitude),
            ll_to_earth(p.latitude, p.longitude)) <= me.range_radius_km * 1000
          when 'same_city' then p.city is not distinct from me.city
          when 'same_neighborhood' then p.neighborhood is not distinct from me.neighborhood
        end
    -- their range preference, symmetrically respected
    and case p.range_type
          when 'radius' then earth_distance(
            ll_to_earth(me.latitude, me.longitude),
            ll_to_earth(p.latitude, p.longitude)) <= p.range_radius_km * 1000
          when 'same_city' then p.city is not distinct from me.city
          when 'same_neighborhood' then p.neighborhood is not distinct from me.neighborhood
        end;
$$;

-- ---------------------------------------------------------------------------
-- matches + interest flow. A row is created when the first parent expresses
-- interest; it becomes mutual (and a conversation opens) when the other
-- parent reciprocates.
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  child_a uuid not null references public.children (id) on delete cascade,
  child_b uuid not null references public.children (id) on delete cascade,
  score int not null check (score between 0 and 100),
  status match_status not null default 'interested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (child_a < child_b),
  unique (child_a, child_b)
);

create table public.match_interests (
  match_id uuid not null references public.matches (id) on delete cascade,
  parent_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, parent_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches (id) on delete cascade,
  parent_a uuid not null references public.profiles (id),
  parent_b uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;
alter table public.match_interests enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create function public.is_match_parent(m public.matches)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children c
    where c.id in (m.child_a, m.child_b) and c.parent_id = auth.uid()
  );
$$;

create policy "matches: participants read" on public.matches
  for select using (public.is_match_parent(matches));

create policy "match_interests: participants read" on public.match_interests
  for select using (
    exists (select 1 from public.matches m
            where m.id = match_id and public.is_match_parent(m))
  );

create policy "conversations: participants" on public.conversations
  for select using (auth.uid() in (parent_a, parent_b));

create policy "messages: participants read" on public.messages
  for select using (
    exists (select 1 from public.conversations cv
            where cv.id = conversation_id and auth.uid() in (cv.parent_a, cv.parent_b))
  );

create policy "messages: participant send" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.conversations cv
                where cv.id = conversation_id and auth.uid() in (cv.parent_a, cv.parent_b))
  );

-- Express interest in pairing my child with another child. Creates the match
-- row on first interest, flips to mutual + opens a conversation on the second.
create function public.express_interest(
  my_child_id uuid,
  other_child_id uuid,
  score int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
  m public.matches;
  other_parent uuid;
begin
  if not public.is_verified() then
    raise exception 'verified members only';
  end if;
  if not exists (select 1 from public.children c
                 where c.id = my_child_id and c.parent_id = auth.uid()) then
    raise exception 'not your child profile';
  end if;
  select parent_id into other_parent from public.children where id = other_child_id;
  if other_parent is null or other_parent = auth.uid() then
    raise exception 'invalid target child';
  end if;

  a := least(my_child_id, other_child_id);
  b := greatest(my_child_id, other_child_id);

  insert into public.matches (child_a, child_b, score)
  values (a, b, express_interest.score)
  on conflict (child_a, child_b) do update set updated_at = now()
  returning * into m;

  insert into public.match_interests (match_id, parent_id)
  values (m.id, auth.uid())
  on conflict do nothing;

  if exists (select 1 from public.match_interests
             where match_id = m.id and parent_id = other_parent) then
    update public.matches set status = 'mutual', updated_at = now()
    where id = m.id and status <> 'mutual';

    insert into public.conversations (match_id, parent_a, parent_b)
    values (m.id, least(auth.uid(), other_parent), greatest(auth.uid(), other_parent))
    on conflict (match_id) do nothing;
  end if;

  return m.id;
end;
$$;

create function public.decline_match(match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matches m set status = 'declined', updated_at = now()
  where m.id = decline_match.match_id and public.is_match_parent(m);
end;
$$;

-- ---------------------------------------------------------------------------
-- storage — private bucket for verification documents only. This is the only
-- upload path in the entire app; there is deliberately no photo storage.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false);

create policy "verification docs: owner upload" on storage.objects
  for insert with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "verification docs: owner and admin read" on storage.objects
  for select using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

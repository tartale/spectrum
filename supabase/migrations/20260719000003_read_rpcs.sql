-- Enriched read models. Base-table RLS deliberately prevents reading the other
-- family's children/profile rows, so list screens get exactly the fields they
-- need through security-definer functions instead.

create function public.my_matches()
returns table (
  match_id uuid,
  status match_status,
  score int,
  my_child_id uuid,
  my_child_nickname text,
  other_child_id uuid,
  other_child_nickname text,
  other_parent_name text,
  i_am_interested boolean,
  they_are_interested boolean,
  conversation_id uuid,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select m.id, m.status, m.score, m.updated_at,
           ca.id as my_id, ca.nickname as my_nick,
           cb.id as other_id, cb.nickname as other_nick, cb.parent_id as other_parent
    from public.matches m
    join public.children ca on ca.id = m.child_a
    join public.children cb on cb.id = m.child_b
    where ca.parent_id = auth.uid()
    union all
    select m.id, m.status, m.score, m.updated_at,
           cb.id, cb.nickname,
           ca.id, ca.nickname, ca.parent_id
    from public.matches m
    join public.children ca on ca.id = m.child_a
    join public.children cb on cb.id = m.child_b
    where cb.parent_id = auth.uid() and ca.parent_id <> cb.parent_id
  )
  select
    mine.id,
    mine.status,
    mine.score,
    mine.my_id,
    mine.my_nick,
    mine.other_id,
    mine.other_nick,
    op.display_name,
    exists (select 1 from public.match_interests mi
            where mi.match_id = mine.id and mi.parent_id = auth.uid()),
    exists (select 1 from public.match_interests mi
            where mi.match_id = mine.id and mi.parent_id = mine.other_parent),
    cv.id,
    mine.updated_at
  from mine
  join public.profiles op on op.id = mine.other_parent
  left join public.conversations cv on cv.match_id = mine.id
  order by mine.updated_at desc;
$$;

create function public.my_conversations()
returns table (
  conversation_id uuid,
  match_id uuid,
  other_parent_name text,
  last_message text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cv.id,
    cv.match_id,
    op.display_name,
    lm.body,
    lm.created_at
  from public.conversations cv
  join public.profiles op
    on op.id = case when cv.parent_a = auth.uid() then cv.parent_b else cv.parent_a end
  left join lateral (
    select body, created_at from public.messages
    where conversation_id = cv.id
    order by created_at desc limit 1
  ) lm on true
  where auth.uid() in (cv.parent_a, cv.parent_b)
  order by coalesce(lm.created_at, cv.created_at) desc;
$$;

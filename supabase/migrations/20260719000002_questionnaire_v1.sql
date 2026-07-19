-- Questionnaire v1 + answer sync.
-- Answers are the versioned source of truth; a trigger projects them into the
-- children.* dimension arrays that discovery and the matcher consume, so the
-- questionnaire can evolve without changing scorer or discovery code.

create function public.sync_child_dimensions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_child uuid := coalesce(new.child_id, old.child_id);
begin
  update public.children c
  set likes = coalesce(dims.likes, '{}'),
      dislikes = coalesce(dims.dislikes, '{}'),
      triggers = coalesce(dims.triggers, '{}'),
      activity_preferences = coalesce(dims.activity, '{}')
  from (
    select
      array_agg(distinct v) filter (where q.dimension = 'likes') as likes,
      array_agg(distinct v) filter (where q.dimension = 'dislikes') as dislikes,
      array_agg(distinct v) filter (where q.dimension = 'triggers') as triggers,
      array_agg(distinct v) filter (where q.dimension = 'activity') as activity
    from public.answers a
    join public.questions q on q.id = a.question_id
    cross join lateral jsonb_array_elements_text(a.values) as v
    where a.child_id = target_child
      and q.kind in ('multi_select', 'single_select')
  ) dims
  where c.id = target_child;
  return null;
end;
$$;

create trigger answers_sync_dimensions
  after insert or update or delete on public.answers
  for each row execute function public.sync_child_dimensions();

-- ---------------------------------------------------------------------------
-- Version 1 content
-- ---------------------------------------------------------------------------
do $$
declare
  v1 uuid;
begin
  insert into public.questionnaire_versions (version, active)
  values (1, true)
  returning id into v1;

  insert into public.questions (version_id, kind, prompt, options, dimension, sort_order) values
  (v1, 'multi_select', 'What does your child love?',
   '["Animals", "Trains & vehicles", "Dinosaurs", "Video games", "Drawing & art", "Music", "Building blocks / LEGO", "Water play", "Books & stories", "Numbers & puzzles", "Outdoor play", "Cooking & baking"]',
   'likes', 1),

  (v1, 'multi_select', 'Which activities work best for a playdate?',
   '["Playground", "Quiet indoor play", "Swimming", "Walks & nature", "Board games", "Video games together", "Arts & crafts", "Trampoline park", "Library visits"]',
   'activity', 2),

  (v1, 'multi_select', 'What tends to be hard for your child? Knowing this helps us suggest compatible settings.',
   '["Loud noises", "Crowded places", "Bright lights", "Being touched unexpectedly", "Sharing toys", "Changes in routine", "Dogs or other animals", "Certain food textures or smells", "Waiting or taking turns"]',
   'triggers', 3),

  (v1, 'multi_select', 'Anything your child strongly dislikes?',
   '["Rough play", "Competitive games", "Messy play", "Singing & dancing", "Team sports", "Screens-off activities"]',
   'dislikes', 4),

  (v1, 'single_select', 'How does your child communicate?',
   '["Fully verbal", "Some words and phrases", "AAC device or signs", "Mostly nonverbal"]',
   'communication', 5),

  (v1, 'single_select', 'How does your child usually play with others?',
   '["Mostly parallel play (alongside other kids)", "A mix of parallel and interactive", "Mostly interactive play"]',
   'interaction_style', 6),

  (v1, 'scale', 'Energy level during play',
   '["Calm and low-key", "Somewhere in between", "High energy"]',
   'energy', 7),

  (v1, 'single_select', 'Preferred group size',
   '["One-on-one only", "Small group (2-3 kids)", "Either works"]',
   'group_size', 8),

  (v1, 'free_text', 'Anything else other parents should know to make a playdate successful?',
   '[]',
   'notes', 9);
end;
$$;

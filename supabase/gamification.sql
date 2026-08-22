-- ============================================================
-- GAMIFICATION SYSTEM (XP / levels / achievements / titles)
-- Appended in one block; every statement below is idempotent
-- (create-if-not-exists / drop-if-exists-then-create / upsert),
-- same convention as the rest of this file. See the section
-- comments below for the full design rationale.
-- ============================================================

-- ============================================================
-- GAMIFICATION SYSTEM: XP, levels, achievements/titles, badges.
--
-- Server-authoritative by construction: every table here either has zero
-- client-facing write policies (xp_events, user_achievements) or only a
-- narrow owner-scoped one (user_gamification's selected title, via a
-- SECURITY DEFINER function, same pattern as respond_to_follow_request /
-- set_comment_pinned above). XP and achievement unlocks are only ever
-- granted by AFTER INSERT/UPDATE triggers on posts/post_likes/post_comments/
-- follows/post_saves, never by direct client writes.
--
-- Achievements, once unlocked, are never revoked (no delete path exists on
-- user_achievements at all) — this is deliberate: a post being deleted
-- later must not un-earn a title a user already has, matching the "Viral
-- Tarif drops to 97 likes, stays unlocked" requirement.
-- ============================================================

create table if not exists public.achievement_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  title text not null,
  description text not null,
  category text not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum', 'legendary')),
  icon_key text not null,
  xp_reward integer not null default 0,
  hidden boolean not null default false,
  sort_order integer not null default 0,
  requirement jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists achievement_definitions_key_key on public.achievement_definitions (key);
create index if not exists achievement_definitions_category_idx on public.achievement_definitions (category);

alter table public.achievement_definitions enable row level security;

-- ============================================================
-- user_achievements: unlock ledger. This table only ever contains rows for
-- achievements a user HAS earned — there is no "locked" row — so a public
-- `using (true)` SELECT policy directly satisfies "another user's unlocked
-- achievements are visible" without needing an RPC for that part. No
-- INSERT/UPDATE/DELETE policies at all: the only way a row appears here is
-- through evaluate_user_achievements() below, which runs as a SECURITY
-- DEFINER function and therefore bypasses RLS entirely on its own writes.
-- Created here (ahead of achievement_definitions' own policy just below)
-- because that policy's subquery references this table, and CREATE POLICY
-- validates referenced tables exist at creation time.
-- ============================================================
create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievement_definitions (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  progress_value numeric,
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_achievement_id_idx on public.user_achievements (achievement_id);
create index if not exists user_achievements_user_unlocked_idx on public.user_achievements (user_id, unlocked_at desc);

alter table public.user_achievements enable row level security;

drop policy if exists "unlocked achievements are publicly readable" on public.user_achievements;
create policy "unlocked achievements are publicly readable"
  on public.user_achievements for select
  using (true);

-- Definitions are public catalog data (like a game's achievement list) with
-- one exception: a `hidden` (secret) achievement's title/description/
-- requirement must not be readable by anyone until at least one player has
-- unlocked it — a plain `using (true)` policy would let a client read a
-- secret's exact requirement straight out of the table regardless of what
-- any RPC chooses to redact, since PostgREST can select the base table
-- directly. Once any user has actually unlocked it, showing the row to
-- everyone leaks nothing per-user (no numbers, no progress) — it just stops
-- being a mystery, the same way a Steam secret achievement becomes visible
-- once someone's actually earned it.
drop policy if exists "achievement definitions are readable unless hidden and unearned" on public.achievement_definitions;
create policy "achievement definitions are readable unless hidden and unearned"
  on public.achievement_definitions for select
  using (
    hidden = false
    or exists (select 1 from public.user_achievements ua where ua.achievement_id = achievement_definitions.id)
  );

-- ============================================================
-- user_gamification: one row per user, xp/level/selected title.
--
-- Row-level SELECT is public (`using (true)`) so a profile's *level* and
-- *selected title* can be embedded directly into ordinary queries (e.g. a
-- feed's author join) without a round trip through get_public_gamification.
-- Raw `xp` must stay private to everyone except the owner though — spec's
-- public profile mockups only ever show "Level 34 / Baş Şef", never a raw
-- XP number or progress bar for someone else. RLS is row-scoped, not
-- column-scoped, so that split is enforced the same way profiles.email is
-- locked down above: revoke table-wide SELECT, re-grant only the safe
-- columns. The owner's own `xp` is still readable — just only through
-- get_my_gamification() below, a SECURITY DEFINER function that bypasses
-- this column grant entirely (it runs as the table owner).
--
-- No UPDATE policy exists at all — not even a self-scoped one — because
-- every column here (xp, level, selected_title_achievement_id) needs
-- cross-row validation before it can change (xp/level are derived from
-- xp_events; selected_title_achievement_id must reference an achievement
-- this same user actually owns). Both writes go through SECURITY DEFINER
-- functions only (award_xp, select_profile_title below), matching this
-- schema's existing convention (respond_to_follow_request, set_comment_pinned)
-- of "function instead of policy whenever a write needs more than a plain
-- ownership check".
-- ============================================================
create table if not exists public.user_gamification (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  xp bigint not null default 0,
  level integer not null default 1,
  selected_title_achievement_id uuid references public.achievement_definitions (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.user_gamification enable row level security;

drop policy if exists "gamification rows are readable" on public.user_gamification;
create policy "gamification rows are readable"
  on public.user_gamification for select
  using (true);

revoke select on public.user_gamification from anon, authenticated;
grant select (user_id, level, selected_title_achievement_id, updated_at)
  on public.user_gamification to anon, authenticated;

-- ============================================================
-- xp_events: append-only, idempotent XP ledger — the anti-farm backbone.
-- Never exposed to clients at all (RLS on, zero policies, same pattern as
-- auth_rate_limits/ai_rate_limits) since it's purely internal bookkeeping,
-- not a feature. idempotency_key is what makes every award exactly-once:
-- callers build it from a *permanent* logical relationship (e.g.
-- 'post_like:<post_id>:<liker_id>'), never from a row's current existence,
-- so unlike/relike, unfollow/refollow, etc. can never re-earn the same XP
-- (see award_xp below).
-- ============================================================
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  source_type text,
  source_id uuid,
  xp_amount integer not null,
  idempotency_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists xp_events_idempotency_key_key on public.xp_events (idempotency_key);
create index if not exists xp_events_user_type_created_idx on public.xp_events (user_id, event_type, created_at);

alter table public.xp_events enable row level security;
-- Zero policies added deliberately — no client role can read or write this
-- table at all, only SECURITY DEFINER functions (which bypass RLS).

-- ============================================================
-- Level curve: deterministic, quadratic, progressively harder — no lookup
-- table. Anchors from spec: L1=0, L2=100, L3=250, L4=450, L5=700 XP. Their
-- deltas (100, 150, 200, 250) have a constant second difference of 50, i.e.
-- the XP needed to go from level L-1 to L is 50*L — summing that gives the
-- closed form below. Verified against all five anchors exactly; stays sane
-- indefinitely (threshold(100) ≈ 252,450 total XP, not an absurd number for
-- a long-lived app's most engaged users).
-- ============================================================
create or replace function public.gamification_level_threshold(p_level integer)
returns bigint
language sql
immutable
as $$
  select 25::bigint * greatest(p_level, 1) * greatest(p_level, 1) + 25::bigint * greatest(p_level, 1) - 50;
$$;

create or replace function public.gamification_level_for_xp(p_xp bigint)
returns integer
language sql
immutable
as $$
  select greatest(1, floor((-25 + sqrt(5625 + 100.0 * greatest(p_xp, 0))) / 50))::integer;
$$;

-- Global rank name, purely a function of level — independent of the level
-- curve itself, so retuning the XP curve later never has to touch this.
create or replace function public.gamification_rank_name(p_level integer)
returns text
language sql
immutable
as $$
  select case
    when p_level >= 100 then 'Tarifim Efsanesi'
    when p_level >= 75 then 'Lezzet Efsanesi'
    when p_level >= 60 then 'Mutfak Üstadı'
    when p_level >= 50 then 'Usta Şef'
    when p_level >= 40 then 'Lezzet Virtüözü'
    when p_level >= 30 then 'Baş Şef'
    when p_level >= 25 then 'Mutfak Şefi'
    when p_level >= 20 then 'Tarif Ustası'
    when p_level >= 15 then 'Lezzet Avcısı'
    when p_level >= 10 then 'Ev Aşçısı'
    when p_level >= 5 then 'Mutfak Çırağı'
    else 'Mutfak Meraklısı'
  end;
$$;

-- ============================================================
-- award_xp: the ONLY path any XP ever moves through. Internal-only — no
-- grant to anon/authenticated (EXECUTE on a new function is granted to
-- PUBLIC by default, same footgun noted at increment_post_share above, so
-- this must be explicitly revoked). Only callable from other SECURITY
-- DEFINER functions in this file, which run as the function owner and so
-- don't need an explicit grant to call it themselves.
--
-- Idempotency: relies entirely on xp_events.idempotency_key's unique index.
-- If the insert is swallowed by ON CONFLICT (this exact event already
-- happened), nothing else runs — no double-count, ever, regardless of how
-- many times a caller retries or how a client toggles the underlying
-- interaction.
-- ============================================================
create or replace function public.award_xp(
  p_user_id uuid,
  p_event_type text,
  p_source_type text,
  p_source_id uuid,
  p_amount integer,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 or p_idempotency_key is null then
    return;
  end if;

  insert into public.xp_events (user_id, event_type, source_type, source_id, xp_amount, idempotency_key)
  values (p_user_id, p_event_type, p_source_type, p_source_id, p_amount, p_idempotency_key)
  on conflict (idempotency_key) do nothing;

  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    return;
  end if;

  insert into public.user_gamification (user_id, xp, level, updated_at)
  values (p_user_id, p_amount, public.gamification_level_for_xp(p_amount), now())
  on conflict (user_id) do update set
    xp = public.user_gamification.xp + excluded.xp,
    level = public.gamification_level_for_xp(public.user_gamification.xp + excluded.xp),
    updated_at = now();
end;
$$;

revoke execute on function public.award_xp(uuid, text, text, uuid, integer, text) from public;
revoke execute on function public.award_xp(uuid, text, text, uuid, integer, text) from anon;
revoke execute on function public.award_xp(uuid, text, text, uuid, integer, text) from authenticated;

-- Small helper behind the daily anti-farm caps on comment/post-create XP —
-- internal-only, same revoke treatment.
create or replace function public.gamification_daily_event_count(p_user_id uuid, p_event_type text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.xp_events
  where user_id = p_user_id and event_type = p_event_type and created_at > now() - interval '1 day';
$$;

revoke execute on function public.gamification_daily_event_count(uuid, text) from public;
revoke execute on function public.gamification_daily_event_count(uuid, text) from anon;
revoke execute on function public.gamification_daily_event_count(uuid, text) from authenticated;

-- ============================================================
-- compute_user_stats: ONE function computing every number any achievement
-- requirement could need, in a single call — this is what keeps achievement
-- evaluation from turning into "100 COUNT(*) queries per profile load". It
-- runs a fixed ~20 indexed aggregate subqueries for exactly one user, not
-- one query per achievement definition (there are ~160 of those, evaluated
-- in-memory against this one JSONB snapshot instead).
--
-- Self-interactions are excluded here, not just at the XP-awarding trigger
-- call sites — liking/commenting/saving your own post can't inflate an
-- achievement's *unlock* threshold either, even though the schema doesn't
-- (and won't, this migration doesn't change that) block a user from
-- self-liking/self-saving their own content at the row level.
-- ============================================================
create or replace function public.compute_user_stats(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tag_counts jsonb;
  v_xp bigint;
  v_level integer;
  v_result jsonb;
begin
  select coalesce(jsonb_object_agg(s.tag, s.cnt), '{}'::jsonb) into v_tag_counts
  from (
    select t.tag, count(*) as cnt
    from public.posts p, unnest(p.tags) as t(tag)
    where p.author_id = p_user_id
    group by t.tag
  ) s;

  select xp, level into v_xp, v_level from public.user_gamification where user_id = p_user_id;

  select jsonb_build_object(
    'post_count', (select count(*) from public.posts where author_id = p_user_id),
    'tag_counts', v_tag_counts,
    'distinct_categories', (select count(*) from jsonb_object_keys(v_tag_counts)),

    'total_likes_received', (
      select count(*)
      from public.post_likes pl
      join public.posts p on p.id = pl.post_id
      where p.author_id = p_user_id and pl.user_id <> p_user_id
    ),
    'best_single_post_likes', (
      select coalesce(max(s.like_count), 0)
      from (
        select count(*) as like_count
        from public.post_likes pl
        join public.posts p on p.id = pl.post_id
        where p.author_id = p_user_id and pl.user_id <> p_user_id
        group by pl.post_id
      ) s
    ),
    'dessert_likes', (
      select count(*)
      from public.post_likes pl
      join public.posts p on p.id = pl.post_id
      where p.author_id = p_user_id and pl.user_id <> p_user_id and 'dessert' = any(p.tags)
    ),

    'comments_received', (
      select count(*)
      from public.post_comments c
      join public.posts p on p.id = c.post_id
      where p.author_id = p_user_id and c.author_id <> p_user_id
    ),
    'comments_written', (
      select count(*)
      from public.post_comments c
      join public.posts p on p.id = c.post_id
      where c.author_id = p_user_id and p.author_id is distinct from p_user_id
    ),

    'followers', (select count(*) from public.follows where following_id = p_user_id and status = 'accepted'),
    'following', (select count(*) from public.follows where follower_id = p_user_id and status = 'accepted'),

    'saves_received', (
      select count(*)
      from public.post_saves s
      join public.posts p on p.id = s.post_id
      where p.author_id = p_user_id and s.user_id <> p_user_id
    ),
    'saved_count', (select count(*) from public.post_saves where user_id = p_user_id),

    'active_days', (select count(distinct date_trunc('day', created_at)) from public.posts where author_id = p_user_id),
    'active_months', (select count(distinct date_trunc('month', created_at)) from public.posts where author_id = p_user_id),

    'xp_total', coalesce(v_xp, 0),
    'level', coalesce(v_level, 1),

    'achievement_count', (select count(*) from public.user_achievements where user_id = p_user_id),
    'legendary_count', (
      select count(*)
      from public.user_achievements ua
      join public.achievement_definitions ad on ad.id = ua.achievement_id
      where ua.user_id = p_user_id and ad.tier = 'legendary'
    ),
    'distinct_achievement_categories', (
      select count(distinct ad.category)
      from public.user_achievements ua
      join public.achievement_definitions ad on ad.id = ua.achievement_id
      where ua.user_id = p_user_id
    ),

    -- Backs the two "gece" hidden achievements — Europe/Istanbul so "gece"
    -- lines up with a Turkish user's actual local night, not UTC's.
    'night_post_count', (
      select count(*) from public.posts
      where author_id = p_user_id
        and extract(hour from (created_at at time zone 'Europe/Istanbul')) < 4
    ),
    'early_breakfast_post_count', (
      select count(*) from public.posts
      where author_id = p_user_id
        and 'breakfast' = any(tags)
        and extract(hour from (created_at at time zone 'Europe/Istanbul')) < 6
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.compute_user_stats(uuid) from public;
revoke execute on function public.compute_user_stats(uuid) from anon;
revoke execute on function public.compute_user_stats(uuid) from authenticated;

-- ============================================================
-- gamification_requirement_met: the generic evaluator. One dispatcher over
-- a fixed set of requirement `type`s (see the CATEGORY comment at the top
-- of the seed data below for the full list) instead of one-off logic
-- scattered per achievement — new achievements are just new rows, never
-- new code, as long as their shape fits an existing type. 'combined'
-- recurses over a `requirements` array and ANDs the results.
-- ============================================================
create or replace function public.gamification_requirement_met(p_stats jsonb, p_requirement jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_type text := p_requirement ->> 'type';
  v_threshold numeric := (p_requirement ->> 'threshold')::numeric;
  v_category text := p_requirement ->> 'category';
  v_item jsonb;
begin
  if v_type = 'combined' then
    for v_item in select * from jsonb_array_elements(p_requirement -> 'requirements')
    loop
      if not public.gamification_requirement_met(p_stats, v_item) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if v_type = 'category_post_count' then
    return coalesce((p_stats -> 'tag_counts' ->> v_category)::numeric, 0) >= v_threshold;
  end if;

  return coalesce(
    (p_stats ->> (case v_type
      when 'post_count' then 'post_count'
      when 'total_likes_received' then 'total_likes_received'
      when 'single_post_likes' then 'best_single_post_likes'
      when 'dessert_likes' then 'dessert_likes'
      when 'comments_received' then 'comments_received'
      when 'comments_written' then 'comments_written'
      when 'followers' then 'followers'
      when 'following' then 'following'
      when 'saves_received' then 'saves_received'
      when 'saved_count' then 'saved_count'
      when 'distinct_categories' then 'distinct_categories'
      when 'active_days' then 'active_days'
      when 'active_months' then 'active_months'
      when 'xp_total' then 'xp_total'
      when 'achievement_count' then 'achievement_count'
      when 'legendary_count' then 'legendary_count'
      when 'level' then 'level'
      when 'distinct_achievement_categories' then 'distinct_achievement_categories'
      when 'night_post_count' then 'night_post_count'
      when 'early_breakfast_post_count' then 'early_breakfast_post_count'
      else null
    end))::numeric,
    0
  ) >= v_threshold;
end;
$$;

-- gamification_progress_for: same dispatch table as gamification_requirement_met
-- above, but returns {"current":.., "target":..} (or {"parts":[...]} for a
-- combined requirement) instead of a boolean — backs the OWNER-only locked-
-- achievement progress display ("17 / 25"). Never called for another user's
-- profile — get_public_gamification below never invokes this.
create or replace function public.gamification_progress_for(p_stats jsonb, p_requirement jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_type text := p_requirement ->> 'type';
  v_threshold numeric := (p_requirement ->> 'threshold')::numeric;
  v_category text := p_requirement ->> 'category';
  v_current numeric;
  v_parts jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if v_type = 'combined' then
    for v_item in select * from jsonb_array_elements(p_requirement -> 'requirements')
    loop
      v_parts := v_parts || jsonb_build_array(public.gamification_progress_for(p_stats, v_item));
    end loop;
    return jsonb_build_object('parts', v_parts);
  end if;

  if v_type = 'category_post_count' then
    v_current := coalesce((p_stats -> 'tag_counts' ->> v_category)::numeric, 0);
  else
    v_current := coalesce(
      (p_stats ->> (case v_type
        when 'post_count' then 'post_count'
        when 'total_likes_received' then 'total_likes_received'
        when 'single_post_likes' then 'best_single_post_likes'
        when 'dessert_likes' then 'dessert_likes'
        when 'comments_received' then 'comments_received'
        when 'comments_written' then 'comments_written'
        when 'followers' then 'followers'
        when 'following' then 'following'
        when 'saves_received' then 'saves_received'
        when 'saved_count' then 'saved_count'
        when 'distinct_categories' then 'distinct_categories'
        when 'active_days' then 'active_days'
        when 'active_months' then 'active_months'
        when 'xp_total' then 'xp_total'
        when 'achievement_count' then 'achievement_count'
        when 'legendary_count' then 'legendary_count'
        when 'level' then 'level'
        when 'distinct_achievement_categories' then 'distinct_achievement_categories'
        when 'night_post_count' then 'night_post_count'
        when 'early_breakfast_post_count' then 'early_breakfast_post_count'
        else null
      end))::numeric,
      0
    );
  end if;

  return jsonb_build_object('current', v_current, 'target', v_threshold, 'type', v_type, 'category', v_category);
end;
$$;

-- ============================================================
-- evaluate_user_achievements: internal-only (no client grant at all — see
-- refresh_my_gamification below for the client-facing entry point). Called
-- directly, with an explicit target uuid, from every event trigger below
-- and from backfill_gamification — none of those callers are the acting
-- session's own auth.uid() (e.g. Alice liking Bob's post evaluates Bob),
-- so this function deliberately has no auth.uid() check of its own; access
-- control is enforced by simply never granting EXECUTE to a client role.
--
-- Re-loops (capped at 3 passes, recomputing stats fresh each time) so a
-- meta-achievement keyed on achievement_count/legendary_count can unlock in
-- the same call that produces the achievements it's counting, without an
-- extra round trip.
-- ============================================================
create or replace function public.evaluate_user_achievements(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats jsonb;
  v_def record;
  v_new_unlocks integer;
  v_iteration integer := 0;
begin
  if p_user_id is null then
    return;
  end if;

  loop
    v_iteration := v_iteration + 1;
    v_new_unlocks := 0;
    v_stats := public.compute_user_stats(p_user_id);

    for v_def in
      select ad.id, ad.xp_reward, ad.requirement
      from public.achievement_definitions ad
      where not exists (
        select 1 from public.user_achievements ua
        where ua.user_id = p_user_id and ua.achievement_id = ad.id
      )
    loop
      if public.gamification_requirement_met(v_stats, v_def.requirement) then
        insert into public.user_achievements (user_id, achievement_id, unlocked_at)
        values (p_user_id, v_def.id, now())
        on conflict (user_id, achievement_id) do nothing;

        if found then
          v_new_unlocks := v_new_unlocks + 1;
          perform public.award_xp(
            p_user_id, 'achievement_unlock', 'achievement', v_def.id, v_def.xp_reward,
            'achievement:' || v_def.id::text || ':' || p_user_id::text
          );
        end if;
      end if;
    end loop;

    exit when v_new_unlocks = 0 or v_iteration >= 3;
  end loop;
end;
$$;

revoke execute on function public.evaluate_user_achievements(uuid) from public;
revoke execute on function public.evaluate_user_achievements(uuid) from anon;
revoke execute on function public.evaluate_user_achievements(uuid) from authenticated;

-- ============================================================
-- Event-driven triggers. Each one is a small, single-purpose AFTER INSERT
-- (or INSERT OR UPDATE, for follows — see below) function that (a) decides
-- whether XP applies at all, excluding self-interactions and official
-- (author_id IS NULL) posts explicitly, (b) awards XP through award_xp's
-- permanent idempotency keys, and (c) calls evaluate_user_achievements for
-- whichever user(s) the event could affect. None of this requires touching
-- the existing insert/delete logic in the app's hooks at all — every XP/
-- achievement effect is a pure side effect of writes the client already
-- makes today.
-- ============================================================

-- ---- posts ---------------------------------------------------
-- Official posts (author_id is null — the seeded "Tarifim Mutfağı" catalog,
-- see posts' own comment above) never earn XP or feed into anyone's stats.
-- A daily cap on post_create-type XP (not on achievement unlocks, which key
-- off the live, un-cappable post_count) closes the one XP-farm vector a
-- permanent per-relationship idempotency key can't: creating and deleting
-- trivial posts in a loop, each with a fresh id and therefore a fresh key.
create or replace function public.handle_gamification_post_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.author_id is null then
    return new;
  end if;

  if public.gamification_daily_event_count(new.author_id, 'post_create') < 10 then
    perform public.award_xp(new.author_id, 'post_create', 'post', new.id, 20, 'post_create:' || new.id::text);
  end if;

  perform public.evaluate_user_achievements(new.author_id);
  return new;
end;
$$;

drop trigger if exists gamification_post_created on public.posts;
create trigger gamification_post_created
  after insert on public.posts
  for each row execute function public.handle_gamification_post_created();

-- ---- post_likes ------------------------------------------------
-- Self-likes (liking your own post) are excluded — the schema doesn't block
-- them at the row level, so this trigger is the actual enforcement point.
-- Idempotency key is the permanent (post, liker) pair, not the like row's
-- existence, so unlike -> like never re-awards.
create or replace function public.handle_gamification_post_like_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select author_id into v_owner from public.posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;

  perform public.award_xp(
    v_owner, 'like_received', 'post_like', new.post_id, 2,
    'post_like:' || new.post_id::text || ':' || new.user_id::text
  );

  perform public.evaluate_user_achievements(v_owner);
  return new;
end;
$$;

drop trigger if exists gamification_post_like_created on public.post_likes;
create trigger gamification_post_like_created
  after insert on public.post_likes
  for each row execute function public.handle_gamification_post_like_created();

-- ---- post_comments ------------------------------------------------
-- Self-comments (commenting on your own post) earn no XP on either side —
-- this is the "commenting repeatedly on your own content" exploit the spec
-- calls out by name. A 2-character minimum blocks empty/whitespace spam
-- from earning XP without touching what the app allows someone to *post*.
-- Daily caps (writer and receiver, independently) are the anti-farm
-- mechanism for an interaction that — unlike likes/follows/saves — has no
-- natural one-per-pair ceiling.
create or replace function public.handle_gamification_post_comment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if char_length(trim(new.body)) < 2 then
    return new;
  end if;

  select author_id into v_owner from public.posts where id = new.post_id;

  if v_owner is not null and v_owner <> new.author_id then
    if public.gamification_daily_event_count(new.author_id, 'comment_write') < 15 then
      perform public.award_xp(
        new.author_id, 'comment_write', 'comment', new.id, 2, 'comment_write:' || new.id::text
      );
    end if;

    if public.gamification_daily_event_count(v_owner, 'comment_received') < 30 then
      perform public.award_xp(
        v_owner, 'comment_received', 'comment', new.id, 4, 'comment_received:' || new.id::text
      );
    end if;

    perform public.evaluate_user_achievements(v_owner);
  end if;

  perform public.evaluate_user_achievements(new.author_id);
  return new;
end;
$$;

drop trigger if exists gamification_post_comment_created on public.post_comments;
create trigger gamification_post_comment_created
  after insert on public.post_comments
  for each row execute function public.handle_gamification_post_comment_created();

-- ---- post_saves ------------------------------------------------
-- Self-saves excluded, same reasoning as self-likes above. Evaluates both
-- the post owner (saves_received-based achievements) and the saver
-- (saved_count-based "own collection" achievements).
create or replace function public.handle_gamification_post_save_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select author_id into v_owner from public.posts where id = new.post_id;

  if v_owner is not null and v_owner <> new.user_id then
    perform public.award_xp(
      v_owner, 'save_received', 'post_save', new.post_id, 5,
      'post_save:' || new.post_id::text || ':' || new.user_id::text
    );
    perform public.evaluate_user_achievements(v_owner);
  end if;

  perform public.evaluate_user_achievements(new.user_id);
  return new;
end;
$$;

drop trigger if exists gamification_post_save_created on public.post_saves;
create trigger gamification_post_save_created
  after insert on public.post_saves
  for each row execute function public.handle_gamification_post_save_created();

-- ---- follows ------------------------------------------------
-- A follow only counts once it's 'accepted' — a private account's pending
-- request must not award XP until the target actually approves it. That
-- transition happens two different ways in this schema: a direct INSERT
-- with status='accepted' (public target — see enforce_follow_request_status
-- above) or a later UPDATE from 'pending' to 'accepted' via
-- respond_to_follow_request. This trigger covers both, guarded so a no-op
-- UPDATE (already-accepted row touched by something unrelated) can't
-- re-fire — though nothing in this schema currently issues one.
--
-- No XP is awarded to the follower for the act of following (spec: "do not
-- add large XP rewards" for the following/social category) — only the
-- followed user earns follower_gained XP. Both sides still get evaluated
-- for their respective achievement categories (followers / following).
create or replace function public.handle_gamification_follow_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'accepted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'accepted' then
    return new;
  end if;

  perform public.award_xp(
    new.following_id, 'follower_gained', 'follow', null, 10,
    'follow:' || new.follower_id::text || ':' || new.following_id::text
  );

  perform public.evaluate_user_achievements(new.following_id);
  perform public.evaluate_user_achievements(new.follower_id);
  return new;
end;
$$;

drop trigger if exists gamification_follow_accepted on public.follows;
create trigger gamification_follow_accepted
  after insert or update on public.follows
  for each row execute function public.handle_gamification_follow_accepted();

-- ============================================================
-- Client-facing RPCs. These four are the entire public surface of the
-- gamification system — every other function above is internal-only.
-- ============================================================

-- refresh_my_gamification: the client-facing "re-check my achievements now"
-- entry point (e.g. right after an action, before relying on the realtime
-- unlock subscription to catch up). Zero-arg and always operates on
-- auth.uid() — this is what fixes the trap of trying to reuse
-- evaluate_user_achievements itself as the public RPC: that function is
-- called by every trigger above to evaluate *other* users (Alice liking
-- Bob's post evaluates Bob, not Alice), so it can never carry an
-- auth.uid()-must-match-target check without breaking every one of those
-- calls.
create or replace function public.refresh_my_gamification()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  perform public.evaluate_user_achievements(auth.uid());
end;
$$;

revoke execute on function public.refresh_my_gamification() from public;
revoke execute on function public.refresh_my_gamification() from anon;
grant execute on function public.refresh_my_gamification() to authenticated;

-- get_my_gamification: full owner-only shape — xp, level, progress,
-- selected title, every unlocked achievement, and every NOT-yet-unlocked
-- achievement with live progress (hidden+locked ones redacted to a bare
-- {key, hidden:true} "???" placeholder, never their title/description/
-- requirement). This is the one place locked-achievement progress is ever
-- computed or returned — never for another user's profile.
create or replace function public.get_my_gamification()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stats jsonb;
  v_xp bigint;
  v_level integer;
  v_selected uuid;
  v_unlocked jsonb;
  v_locked jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into public.user_gamification (user_id) values (v_user)
  on conflict (user_id) do nothing;

  select xp, level, selected_title_achievement_id into v_xp, v_level, v_selected
  from public.user_gamification where user_id = v_user;

  v_stats := public.compute_user_stats(v_user);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ad.id,
    'key', ad.key,
    'title', ad.title,
    'description', ad.description,
    'category', ad.category,
    'tier', ad.tier,
    'iconKey', ad.icon_key,
    'xpReward', ad.xp_reward,
    'hidden', false,
    'sortOrder', ad.sort_order,
    'unlockedAt', ua.unlocked_at
  ) order by ua.unlocked_at desc), '[]'::jsonb)
  into v_unlocked
  from public.user_achievements ua
  join public.achievement_definitions ad on ad.id = ua.achievement_id
  where ua.user_id = v_user;

  select coalesce(jsonb_agg(
    case when ad.hidden then
      jsonb_build_object('id', ad.id, 'key', ad.key, 'hidden', true, 'tier', ad.tier, 'sortOrder', ad.sort_order)
    else
      jsonb_build_object(
        'id', ad.id,
        'key', ad.key,
        'title', ad.title,
        'description', ad.description,
        'category', ad.category,
        'tier', ad.tier,
        'iconKey', ad.icon_key,
        'xpReward', ad.xp_reward,
        'hidden', false,
        'sortOrder', ad.sort_order,
        'progress', public.gamification_progress_for(v_stats, ad.requirement)
      )
    end
    order by ad.sort_order
  ), '[]'::jsonb)
  into v_locked
  from public.achievement_definitions ad
  where not exists (
    select 1 from public.user_achievements ua where ua.user_id = v_user and ua.achievement_id = ad.id
  );

  return jsonb_build_object(
    'xp', v_xp,
    'level', v_level,
    'rankName', public.gamification_rank_name(v_level),
    'levelStartXp', public.gamification_level_threshold(v_level),
    'nextLevelXp', public.gamification_level_threshold(v_level + 1),
    'selectedTitleId', v_selected,
    'unlockedAchievements', v_unlocked,
    'lockedAchievements', v_locked,
    'achievementCount', jsonb_array_length(v_unlocked),
    'totalAchievementCount', (select count(*) from public.achievement_definitions)
  );
end;
$$;

revoke execute on function public.get_my_gamification() from public;
revoke execute on function public.get_my_gamification() from anon;
grant execute on function public.get_my_gamification() to authenticated;

-- get_public_gamification: the deliberately narrow shape for viewing
-- *anyone else's* profile — level/rank (derived, never raw xp), selected
-- title, and unlocked achievements only. No locked list, no progress, no
-- xp_events. Callable by anon too (profiles/posts/follows are all publicly
-- readable in this app without requiring login, so this matches).
create or replace function public.get_public_gamification(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level integer;
  v_selected uuid;
  v_unlocked jsonb;
begin
  if p_user_id is null then
    return null;
  end if;

  select level, selected_title_achievement_id into v_level, v_selected
  from public.user_gamification where user_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ad.id,
    'key', ad.key,
    'title', ad.title,
    'description', ad.description,
    'category', ad.category,
    'tier', ad.tier,
    'iconKey', ad.icon_key,
    'unlockedAt', ua.unlocked_at
  ) order by ua.unlocked_at desc), '[]'::jsonb)
  into v_unlocked
  from public.user_achievements ua
  join public.achievement_definitions ad on ad.id = ua.achievement_id
  where ua.user_id = p_user_id;

  return jsonb_build_object(
    'level', coalesce(v_level, 1),
    'rankName', public.gamification_rank_name(coalesce(v_level, 1)),
    'selectedTitleId', v_selected,
    'unlockedAchievements', v_unlocked,
    'achievementCount', jsonb_array_length(v_unlocked)
  );
end;
$$;

revoke execute on function public.get_public_gamification(uuid) from public;
grant execute on function public.get_public_gamification(uuid) to authenticated, anon;

-- select_profile_title: the only write path to selected_title_achievement_id.
-- A SECURITY DEFINER function rather than an RLS UPDATE policy for the same
-- reason respond_to_follow_request/set_comment_pinned above are functions —
-- the write needs a cross-row check (does user_achievements actually
-- contain this (user, achievement) pair?) that a plain
-- using(auth.uid()=user_id) policy can't express. Passing null clears the
-- selection, which is always allowed.
create or replace function public.select_profile_title(p_achievement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if p_achievement_id is not null and not exists (
    select 1 from public.user_achievements
    where user_id = v_user and achievement_id = p_achievement_id
  ) then
    raise exception 'achievement not unlocked';
  end if;

  insert into public.user_gamification (user_id, selected_title_achievement_id, updated_at)
  values (v_user, p_achievement_id, now())
  on conflict (user_id) do update set
    selected_title_achievement_id = excluded.selected_title_achievement_id,
    updated_at = now();
end;
$$;

revoke execute on function public.select_profile_title(uuid) from public;
revoke execute on function public.select_profile_title(uuid) from anon;
grant execute on function public.select_profile_title(uuid) to authenticated;

-- ============================================================
-- Realtime: lets the client observe its own new unlocks the instant a
-- trigger above inserts one, without polling — same guarded
-- add-to-publication idiom as direct_messages above. user_achievements'
-- own SELECT policy (public `using (true)`) already governs what Realtime
-- is allowed to deliver, same as any other subscription.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_achievements'
  ) then
    alter publication supabase_realtime add table public.user_achievements;
  end if;
end $$;

-- ============================================================
-- backfill_gamification(): one-time retroactive grant for every user who
-- already had posts/likes/comments/saves/follows before this migration
-- existed. Reuses the EXACT SAME idempotency keys the live triggers above
-- build (post_create:<id>, post_like:<post>:<liker>, etc.) rather than a
-- parallel formula — so this is provably the same rule applied to history
-- instead of a second implementation that could drift from the live path.
-- Safe to run more than once: every insert is `on conflict (idempotency_key)
-- do nothing`, and the final xp/level rollup recomputes from the ledger's
-- current total rather than incrementing, so re-running (or running this
-- while live traffic is also granting XP) can never double-count.
--
-- Restricted to the app's admin account (profiles.is_owner) or a direct SQL
-- Editor connection (auth.uid() is null there — same trusted-context
-- precedent as protect_privileged_profile_fields above) — this is an
-- operational/launch tool, not a feature a regular user should ever be able
-- to invoke on demand.
-- ============================================================
create or replace function public.backfill_gamification()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_owner boolean;
  v_profile record;
begin
  if v_caller is not null then
    select is_owner into v_is_owner from public.profiles where id = v_caller;
    if not coalesce(v_is_owner, false) then
      raise exception 'not authorized';
    end if;
  end if;

  insert into public.xp_events (user_id, event_type, source_type, source_id, xp_amount, idempotency_key)
  select p.author_id, 'post_create', 'post', p.id, 20, 'post_create:' || p.id::text
  from public.posts p
  where p.author_id is not null
  on conflict (idempotency_key) do nothing;

  insert into public.xp_events (user_id, event_type, source_type, source_id, xp_amount, idempotency_key)
  select p.author_id, 'like_received', 'post_like', pl.post_id, 2,
         'post_like:' || pl.post_id::text || ':' || pl.user_id::text
  from public.post_likes pl
  join public.posts p on p.id = pl.post_id
  where p.author_id is not null and p.author_id <> pl.user_id
  on conflict (idempotency_key) do nothing;

  insert into public.xp_events (user_id, event_type, source_type, source_id, xp_amount, idempotency_key)
  select p.author_id, 'save_received', 'post_save', ps.post_id, 5,
         'post_save:' || ps.post_id::text || ':' || ps.user_id::text
  from public.post_saves ps
  join public.posts p on p.id = ps.post_id
  where p.author_id is not null and p.author_id <> ps.user_id
  on conflict (idempotency_key) do nothing;

  insert into public.xp_events (user_id, event_type, source_type, source_id, xp_amount, idempotency_key)
  select f.following_id, 'follower_gained', 'follow', null, 10,
         'follow:' || f.follower_id::text || ':' || f.following_id::text
  from public.follows f
  where f.status = 'accepted'
  on conflict (idempotency_key) do nothing;

  insert into public.xp_events (user_id, event_type, source_type, source_id, xp_amount, idempotency_key)
  select c.author_id, 'comment_write', 'comment', c.id, 2, 'comment_write:' || c.id::text
  from public.post_comments c
  join public.posts p on p.id = c.post_id
  where p.author_id is not null and p.author_id <> c.author_id and char_length(trim(c.body)) >= 2
  on conflict (idempotency_key) do nothing;

  insert into public.xp_events (user_id, event_type, source_type, source_id, xp_amount, idempotency_key)
  select p.author_id, 'comment_received', 'comment', c.id, 4, 'comment_received:' || c.id::text
  from public.post_comments c
  join public.posts p on p.id = c.post_id
  where p.author_id is not null and p.author_id <> c.author_id and char_length(trim(c.body)) >= 2
  on conflict (idempotency_key) do nothing;

  -- Recompute xp/level from the ledger's current total per user (not an
  -- increment) — correct whether this is the very first run or a re-run
  -- interleaved with live activity, since xp_events is always the single
  -- source of truth for "how much XP has this user ever earned".
  insert into public.user_gamification (user_id, xp, level, updated_at)
  select user_id, sum(xp_amount), public.gamification_level_for_xp(sum(xp_amount)), now()
  from public.xp_events
  group by user_id
  on conflict (user_id) do update set
    xp = excluded.xp,
    level = excluded.level,
    updated_at = now();

  for v_profile in select id from public.profiles loop
    perform public.evaluate_user_achievements(v_profile.id);
  end loop;
end;
$$;

revoke execute on function public.backfill_gamification() from public;
revoke execute on function public.backfill_gamification() from anon;
grant execute on function public.backfill_gamification() to authenticated;

-- ============================================================
-- Achievement catalog seed. Idempotent via ON CONFLICT (key) DO UPDATE — the
-- whole INSERT is safe to re-run any number of times (retuning an XP value
-- or fixing a typo is just re-running this block), matching "seed
-- achievement_definitions... safe to seed repeatedly without duplicates".
--
-- Requirement `type`s used below (see gamification_requirement_met /
-- gamification_progress_for above for the generic dispatcher):
--   post_count, category_post_count {category}, total_likes_received,
--   single_post_likes, dessert_likes, comments_received, comments_written,
--   followers, following, saves_received, saved_count, distinct_categories,
--   active_days, active_months, xp_total, achievement_count,
--   legendary_count, distinct_achievement_categories, level,
--   night_post_count, early_breakfast_post_count, combined {requirements[]}
--
-- Categories intentionally NOT implemented, and why (see compute_user_stats
-- / posts schema — no fabricated data): "Healthy/Balanced" (no nutrition
-- classification exists), "Quick Recipes ≤15min" (no cook-time field on
-- user posts, only on the separate official recipe catalog), the cuisine
-- half of "Variety" (no cuisine field anywhere), and the two Category 21
-- combos needing calories/cook-time ("Fit Favori", "Hızlı ve Popüler").
--
-- Two titles from the original spec collided with another achievement's
-- exact title elsewhere in the same catalog (a UX problem, not a `key`
-- collision — `key` is what's actually unique) — renamed once, noted inline
-- at each spot below, to keep every badge's name unambiguous.
-- ============================================================

insert into public.achievement_definitions (key, title, description, category, tier, icon_key, xp_reward, hidden, sort_order, requirement)
values

-- ---- Category 1: Recipe / Post creation (post_count) ----
('recipe_001', 'İlk Tabak', 'İlk tarifini paylaştın.', 'recipes', 'bronze', 'recipe', 30, false, 100, '{"type":"post_count","threshold":1}'::jsonb),
('recipe_003', 'Mutfak Isınıyor', '3 tarif paylaştın.', 'recipes', 'bronze', 'recipe', 25, false, 101, '{"type":"post_count","threshold":3}'::jsonb),
('recipe_005', 'Tarif Çırağı', '5 tarif paylaştın.', 'recipes', 'bronze', 'recipe', 40, false, 102, '{"type":"post_count","threshold":5}'::jsonb),
('recipe_010', 'Tarif Avcısı', '10 tarif paylaştın.', 'recipes', 'silver', 'recipe', 75, false, 103, '{"type":"post_count","threshold":10}'::jsonb),
('recipe_025', 'Tarif Ustası', '25 tarif paylaştın.', 'recipes', 'silver', 'recipe', 120, false, 104, '{"type":"post_count","threshold":25}'::jsonb),
('recipe_050', 'Üretken Şef', '50 tarif paylaştın.', 'recipes', 'gold', 'recipe', 200, false, 105, '{"type":"post_count","threshold":50}'::jsonb),
('recipe_100', 'Yüzlük Menü', '100 tarif paylaştın.', 'recipes', 'gold', 'recipe', 350, false, 106, '{"type":"post_count","threshold":100}'::jsonb),
('recipe_250', 'Tarif Fabrikası', '250 tarif paylaştın.', 'recipes', 'platinum', 'recipe', 700, false, 107, '{"type":"post_count","threshold":250}'::jsonb),
('recipe_500', 'Tarif Ansiklopedisi', '500 tarif paylaştın.', 'recipes', 'platinum', 'recipe', 1200, false, 108, '{"type":"post_count","threshold":500}'::jsonb),
('recipe_1000', 'Mutfak Efsanesi', '1000 tarif paylaştın.', 'recipes', 'legendary', 'recipe', 4000, false, 109, '{"type":"post_count","threshold":1000}'::jsonb),

-- ---- Category 2: High protein (category_post_count "high-protein") ----
('protein_001', 'Protein Başlangıcı', 'İlk yüksek proteinli tarifini paylaştın.', 'protein', 'bronze', 'protein', 25, false, 200, '{"type":"category_post_count","category":"high-protein","threshold":1}'::jsonb),
('protein_003', 'Protein Avcısı', '3 yüksek proteinli tarif paylaştın.', 'protein', 'bronze', 'protein', 40, false, 201, '{"type":"category_post_count","category":"high-protein","threshold":3}'::jsonb),
('protein_005', 'Protein Çırağı', '5 yüksek proteinli tarif paylaştın.', 'protein', 'silver', 'protein', 75, false, 202, '{"type":"category_post_count","category":"high-protein","threshold":5}'::jsonb),
('protein_010', 'Protein Ustası', '10 yüksek proteinli tarif paylaştın.', 'protein', 'silver', 'protein', 120, false, 203, '{"type":"category_post_count","category":"high-protein","threshold":10}'::jsonb),
('protein_025', 'Protein Şefi', '25 yüksek proteinli tarif paylaştın.', 'protein', 'gold', 'protein', 250, false, 204, '{"type":"category_post_count","category":"high-protein","threshold":25}'::jsonb),
('protein_050', 'Protein Makinesi', '50 yüksek proteinli tarif paylaştın.', 'protein', 'gold', 'protein', 450, false, 205, '{"type":"category_post_count","category":"high-protein","threshold":50}'::jsonb),
('protein_100', 'Protein Profesörü', '100 yüksek proteinli tarif paylaştın.', 'protein', 'platinum', 'protein', 900, false, 206, '{"type":"category_post_count","category":"high-protein","threshold":100}'::jsonb),
('protein_250', 'Protein İmparatoru', '250 yüksek proteinli tarif paylaştın.', 'protein', 'legendary', 'protein', 2500, false, 207, '{"type":"category_post_count","category":"high-protein","threshold":250}'::jsonb),

-- ---- Category 4: Vegetarian (category_post_count "vegetarian") ----
('vegetarian_001', 'Yeşil Dokunuş', 'İlk vejetaryen tarifini paylaştın.', 'vegetarian', 'bronze', 'vegetarian', 25, false, 300, '{"type":"category_post_count","category":"vegetarian","threshold":1}'::jsonb),
('vegetarian_003', 'Yeşil Başlangıç', '3 vejetaryen tarif paylaştın.', 'vegetarian', 'bronze', 'vegetarian', 40, false, 301, '{"type":"category_post_count","category":"vegetarian","threshold":3}'::jsonb),
('vegetarian_010', 'Sebze Ustası', '10 vejetaryen tarif paylaştın.', 'vegetarian', 'silver', 'vegetarian', 100, false, 302, '{"type":"category_post_count","category":"vegetarian","threshold":10}'::jsonb),
('vegetarian_025', 'Yeşil Şef', '25 vejetaryen tarif paylaştın.', 'vegetarian', 'gold', 'vegetarian', 250, false, 303, '{"type":"category_post_count","category":"vegetarian","threshold":25}'::jsonb),
('vegetarian_050', 'Bitki Gücü', '50 vejetaryen tarif paylaştın.', 'vegetarian', 'platinum', 'vegetarian', 550, false, 304, '{"type":"category_post_count","category":"vegetarian","threshold":50}'::jsonb),
('vegetarian_100', 'Yeşil Mutfak Efsanesi', '100 vejetaryen tarif paylaştın.', 'vegetarian', 'legendary', 'vegetarian', 1500, false, 305, '{"type":"category_post_count","category":"vegetarian","threshold":100}'::jsonb),

-- ---- Category 5: Vegan (category_post_count "vegan") ----
('vegan_001', 'Bitkisel İlk Adım', 'İlk vegan tarifini paylaştın.', 'vegan', 'bronze', 'vegan', 25, false, 400, '{"type":"category_post_count","category":"vegan","threshold":1}'::jsonb),
('vegan_003', 'Bitkisel Başlangıç', '3 vegan tarif paylaştın.', 'vegan', 'bronze', 'vegan', 40, false, 401, '{"type":"category_post_count","category":"vegan","threshold":3}'::jsonb),
('vegan_010', 'Vegan Ustası', '10 vegan tarif paylaştın.', 'vegan', 'silver', 'vegan', 100, false, 402, '{"type":"category_post_count","category":"vegan","threshold":10}'::jsonb),
('vegan_025', 'Bitkisel Şef', '25 vegan tarif paylaştın.', 'vegan', 'gold', 'vegan', 250, false, 403, '{"type":"category_post_count","category":"vegan","threshold":25}'::jsonb),
('vegan_050', 'Yeşil Efsane', '50 vegan tarif paylaştın.', 'vegan', 'platinum', 'vegan', 550, false, 404, '{"type":"category_post_count","category":"vegan","threshold":50}'::jsonb),
('vegan_100', 'Bitkisel Üstat', '100 vegan tarif paylaştın.', 'vegan', 'legendary', 'vegan', 1500, false, 405, '{"type":"category_post_count","category":"vegan","threshold":100}'::jsonb),

-- ---- Category 6: Breakfast (category_post_count "breakfast") ----
('breakfast_001', 'Güne İlk Tarif', 'İlk kahvaltı tarifini paylaştın.', 'breakfast', 'bronze', 'breakfast', 25, false, 500, '{"type":"category_post_count","category":"breakfast","threshold":1}'::jsonb),
('breakfast_003', 'Günaydın Şef', '3 kahvaltı tarifi paylaştın.', 'breakfast', 'bronze', 'breakfast', 40, false, 501, '{"type":"category_post_count","category":"breakfast","threshold":3}'::jsonb),
('breakfast_010', 'Kahvaltı Ustası', '10 kahvaltı tarifi paylaştın.', 'breakfast', 'silver', 'breakfast', 100, false, 502, '{"type":"category_post_count","category":"breakfast","threshold":10}'::jsonb),
('breakfast_025', 'Kahvaltı Şefi', '25 kahvaltı tarifi paylaştın.', 'breakfast', 'gold', 'breakfast', 250, false, 503, '{"type":"category_post_count","category":"breakfast","threshold":25}'::jsonb),
('breakfast_050', 'Sabah Efsanesi', '50 kahvaltı tarifi paylaştın.', 'breakfast', 'platinum', 'breakfast', 550, false, 504, '{"type":"category_post_count","category":"breakfast","threshold":50}'::jsonb),
('breakfast_100', 'Kahvaltı Kralı', '100 kahvaltı tarifi paylaştın.', 'breakfast', 'legendary', 'breakfast', 1500, false, 505, '{"type":"category_post_count","category":"breakfast","threshold":100}'::jsonb),

-- ---- Category 7: Dessert (category_post_count "dessert") ----
-- 250-count tier renamed from the spec's "Tatlıların Efendisi" to "Tatlı
-- Imparatorluğu" — that exact title is reused in Category 21 below for a
-- more specific combo (25 dessert recipes AND 500 likes on them), which
-- keeps its original name since it's the more interesting achievement.
('dessert_001', 'Tatlı Bir Başlangıç', 'İlk tatlı tarifini paylaştın.', 'dessert', 'bronze', 'dessert', 25, false, 600, '{"type":"category_post_count","category":"dessert","threshold":1}'::jsonb),
('dessert_003', 'Tatlı Başlangıç', '3 tatlı tarifi paylaştın.', 'dessert', 'bronze', 'dessert', 40, false, 601, '{"type":"category_post_count","category":"dessert","threshold":3}'::jsonb),
('dessert_010', 'Tatlı Ustası', '10 tatlı tarifi paylaştın.', 'dessert', 'silver', 'dessert', 100, false, 602, '{"type":"category_post_count","category":"dessert","threshold":10}'::jsonb),
('dessert_025', 'Pastane Şefi', '25 tatlı tarifi paylaştın.', 'dessert', 'gold', 'dessert', 250, false, 603, '{"type":"category_post_count","category":"dessert","threshold":25}'::jsonb),
('dessert_050', 'Şeker Sanatçısı', '50 tatlı tarifi paylaştın.', 'dessert', 'platinum', 'dessert', 550, false, 604, '{"type":"category_post_count","category":"dessert","threshold":50}'::jsonb),
('dessert_100', 'Tatlı Efsanesi', '100 tatlı tarifi paylaştın.', 'dessert', 'legendary', 'dessert', 1500, false, 605, '{"type":"category_post_count","category":"dessert","threshold":100}'::jsonb),
('dessert_250', 'Tatlı Imparatorluğu', '250 tatlı tarifi paylaştın.', 'dessert', 'legendary', 'dessert', 3000, false, 606, '{"type":"category_post_count","category":"dessert","threshold":250}'::jsonb),

-- ---- Category 9: Total likes received (total_likes_received) ----
('likes_total_00001', 'İlk Beğeni', 'İlk beğenini aldın.', 'likes_total', 'bronze', 'likes', 15, false, 700, '{"type":"total_likes_received","threshold":1}'::jsonb),
('likes_total_00010', 'İlgi Çekici', '10 beğeni aldın.', 'likes_total', 'bronze', 'likes', 30, false, 701, '{"type":"total_likes_received","threshold":10}'::jsonb),
('likes_total_00025', 'Sevilmeye Başladı', '25 beğeni aldın.', 'likes_total', 'bronze', 'likes', 50, false, 702, '{"type":"total_likes_received","threshold":25}'::jsonb),
('likes_total_00050', 'Sevilen Aşçı', '50 beğeni aldın.', 'likes_total', 'silver', 'likes', 90, false, 703, '{"type":"total_likes_received","threshold":50}'::jsonb),
('likes_total_00100', 'Topluluk Favorisi', '100 beğeni aldın.', 'likes_total', 'silver', 'likes', 150, false, 704, '{"type":"total_likes_received","threshold":100}'::jsonb),
('likes_total_00250', 'Lezzet Fenomeni', '250 beğeni aldın.', 'likes_total', 'silver', 'likes', 300, false, 705, '{"type":"total_likes_received","threshold":250}'::jsonb),
('likes_total_00500', 'Kalabalığın Favorisi', '500 beğeni aldın.', 'likes_total', 'gold', 'likes', 500, false, 706, '{"type":"total_likes_received","threshold":500}'::jsonb),
('likes_total_01000', 'Beğeni Mıknatısı', '1000 beğeni aldın.', 'likes_total', 'gold', 'likes', 800, false, 707, '{"type":"total_likes_received","threshold":1000}'::jsonb),
('likes_total_02500', 'Topluluk Fenomeni', '2500 beğeni aldın.', 'likes_total', 'gold', 'likes', 1500, false, 708, '{"type":"total_likes_received","threshold":2500}'::jsonb),
('likes_total_05000', 'Topluluk Yıldızı', '5000 beğeni aldın.', 'likes_total', 'platinum', 'likes', 2500, false, 709, '{"type":"total_likes_received","threshold":5000}'::jsonb),
('likes_total_10000', 'Tarifim Fenomeni', '10.000 beğeni aldın.', 'likes_total', 'platinum', 'likes', 4000, false, 710, '{"type":"total_likes_received","threshold":10000}'::jsonb),
('likes_total_25000', 'Tarifim İkonu', '25.000 beğeni aldın.', 'likes_total', 'legendary', 'likes', 7000, false, 711, '{"type":"total_likes_received","threshold":25000}'::jsonb),
('likes_total_50000', 'Lezzet Süperstarı', '50.000 beğeni aldın.', 'likes_total', 'legendary', 'likes', 10000, false, 712, '{"type":"total_likes_received","threshold":50000}'::jsonb),
('likes_total_100000', 'Halkın Şefi', '100.000 beğeni aldın.', 'likes_total', 'legendary', 'likes', 15000, false, 713, '{"type":"total_likes_received","threshold":100000}'::jsonb),

-- ---- Category 10: Single post like milestones (single_post_likes) ----
('likes_single_00005', 'İlk Alkış', 'Bir tarifin 5 beğeniye ulaştı.', 'likes_single', 'bronze', 'viral', 20, false, 800, '{"type":"single_post_likes","threshold":5}'::jsonb),
('likes_single_00010', 'Dikkat Çeken Tarif', 'Bir tarifin 10 beğeniye ulaştı.', 'likes_single', 'bronze', 'viral', 35, false, 801, '{"type":"single_post_likes","threshold":10}'::jsonb),
('likes_single_00025', 'Popüler Tarif', 'Bir tarifin 25 beğeniye ulaştı.', 'likes_single', 'bronze', 'viral', 60, false, 802, '{"type":"single_post_likes","threshold":25}'::jsonb),
('likes_single_00050', 'Günün Lezzeti', 'Bir tarifin 50 beğeniye ulaştı.', 'likes_single', 'silver', 'viral', 100, false, 803, '{"type":"single_post_likes","threshold":50}'::jsonb),
('likes_single_00100', 'Viral Tarif', 'Bir tarifin 100 beğeniyi geçti.', 'likes_single', 'silver', 'viral', 200, false, 804, '{"type":"single_post_likes","threshold":100}'::jsonb),
('likes_single_00250', 'Topluluğun Seçimi', 'Bir tarifin 250 beğeniye ulaştı.', 'likes_single', 'gold', 'viral', 400, false, 805, '{"type":"single_post_likes","threshold":250}'::jsonb),
('likes_single_00500', 'Lezzet Patlaması', 'Bir tarifin 500 beğeniye ulaştı.', 'likes_single', 'gold', 'viral', 700, false, 806, '{"type":"single_post_likes","threshold":500}'::jsonb),
('likes_single_01000', 'Tarifim Klasiği', 'Bir tarifin 1000 beğeniye ulaştı.', 'likes_single', 'platinum', 'viral', 1200, false, 807, '{"type":"single_post_likes","threshold":1000}'::jsonb),
('likes_single_02500', 'Mega Tarif', 'Bir tarifin 2500 beğeniye ulaştı.', 'likes_single', 'platinum', 'viral', 2200, false, 808, '{"type":"single_post_likes","threshold":2500}'::jsonb),
('likes_single_05000', 'Efsane Tarif', 'Bir tarifin 5000 beğeniye ulaştı.', 'likes_single', 'legendary', 'viral', 4000, false, 809, '{"type":"single_post_likes","threshold":5000}'::jsonb),
('likes_single_10000', 'İnterneti Doyuran Tarif', 'Bir tarifin 10.000 beğeniye ulaştı.', 'likes_single', 'legendary', 'viral', 7000, false, 810, '{"type":"single_post_likes","threshold":10000}'::jsonb),

-- ---- Category 11: Comments received (comments_received) ----
('comments_received_00010', 'Sohbet Başladı', '10 yorum aldın.', 'comments_received', 'bronze', 'comments', 30, false, 900, '{"type":"comments_received","threshold":10}'::jsonb),
('comments_received_00025', 'Merak Uyandıran', '25 yorum aldın.', 'comments_received', 'bronze', 'comments', 50, false, 901, '{"type":"comments_received","threshold":25}'::jsonb),
('comments_received_00050', 'Konuşulan Tarifçi', '50 yorum aldın.', 'comments_received', 'silver', 'comments', 90, false, 902, '{"type":"comments_received","threshold":50}'::jsonb),
('comments_received_00100', 'Topluluk Sohbeti', '100 yorum aldın.', 'comments_received', 'silver', 'comments', 150, false, 903, '{"type":"comments_received","threshold":100}'::jsonb),
('comments_received_00250', 'Mutfak Gündemi', '250 yorum aldın.', 'comments_received', 'gold', 'comments', 300, false, 904, '{"type":"comments_received","threshold":250}'::jsonb),
('comments_received_00500', 'Herkes Burada', '500 yorum aldın.', 'comments_received', 'gold', 'comments', 500, false, 905, '{"type":"comments_received","threshold":500}'::jsonb),
('comments_received_01000', 'Herkes Bunu Konuşuyor', '1000 yorum aldın.', 'comments_received', 'platinum', 'comments', 900, false, 906, '{"type":"comments_received","threshold":1000}'::jsonb),
('comments_received_05000', 'Yorum Fırtınası', '5000 yorum aldın.', 'comments_received', 'legendary', 'comments', 3000, false, 907, '{"type":"comments_received","threshold":5000}'::jsonb),

-- ---- Category 12: Comments written (comments_written) ----
('comments_written_00001', 'İlk Söz', 'İlk yorumunu yazdın.', 'comments_written', 'bronze', 'comments', 15, false, 1000, '{"type":"comments_written","threshold":1}'::jsonb),
('comments_written_00010', 'Sohbete Katılan', '10 yorum yazdın.', 'comments_written', 'bronze', 'comments', 30, false, 1001, '{"type":"comments_written","threshold":10}'::jsonb),
('comments_written_00025', 'Aktif Yorumcu', '25 yorum yazdın.', 'comments_written', 'bronze', 'comments', 50, false, 1002, '{"type":"comments_written","threshold":25}'::jsonb),
('comments_written_00050', 'Yorumcu', '50 yorum yazdın.', 'comments_written', 'silver', 'comments', 90, false, 1003, '{"type":"comments_written","threshold":50}'::jsonb),
('comments_written_00100', 'Topluluk Müdavimi', '100 yorum yazdın.', 'comments_written', 'silver', 'comments', 150, false, 1004, '{"type":"comments_written","threshold":100}'::jsonb),
('comments_written_00250', 'Mutfak Sohbetçisi', '250 yorum yazdın.', 'comments_written', 'gold', 'comments', 300, false, 1005, '{"type":"comments_written","threshold":250}'::jsonb),
('comments_written_00500', 'Topluluk Elçisi', '500 yorum yazdın.', 'comments_written', 'gold', 'comments', 500, false, 1006, '{"type":"comments_written","threshold":500}'::jsonb),
('comments_written_01000', 'Sohbet Ustası', '1000 yorum yazdın.', 'comments_written', 'platinum', 'comments', 900, false, 1007, '{"type":"comments_written","threshold":1000}'::jsonb),

-- ---- Category 13: Followers (followers) ----
-- 10000-follower tier renamed from the spec's "Tarifim İkonu" to "Takipçi
-- İkonu" — that exact title is used above at 25.000 total likes received,
-- which keeps the original name.
('followers_00001', 'İlk Misafir', 'İlk takipçini kazandın.', 'followers', 'bronze', 'followers', 15, false, 1100, '{"type":"followers","threshold":1}'::jsonb),
('followers_00005', 'İlk Masa', '5 takipçiye ulaştın.', 'followers', 'bronze', 'followers', 25, false, 1101, '{"type":"followers","threshold":5}'::jsonb),
('followers_00010', 'Küçük Bir Kitle', '10 takipçiye ulaştın.', 'followers', 'bronze', 'followers', 40, false, 1102, '{"type":"followers","threshold":10}'::jsonb),
('followers_00025', 'Yükselen Şef', '25 takipçiye ulaştın.', 'followers', 'silver', 'followers', 75, false, 1103, '{"type":"followers","threshold":25}'::jsonb),
('followers_00050', 'Takip Edilen', '50 takipçiye ulaştın.', 'followers', 'silver', 'followers', 120, false, 1104, '{"type":"followers","threshold":50}'::jsonb),
('followers_00100', 'Mutfak Influencerı', '100 takipçiye ulaştın.', 'followers', 'gold', 'followers', 220, false, 1105, '{"type":"followers","threshold":100}'::jsonb),
('followers_00250', 'Topluluk Lideri', '250 takipçiye ulaştın.', 'followers', 'gold', 'followers', 400, false, 1106, '{"type":"followers","threshold":250}'::jsonb),
('followers_00500', 'Şef Fenomen', '500 takipçiye ulaştın.', 'followers', 'platinum', 'followers', 700, false, 1107, '{"type":"followers","threshold":500}'::jsonb),
('followers_01000', 'Bin Kişilik Masa', '1000 takipçiye ulaştın.', 'followers', 'platinum', 'followers', 1200, false, 1108, '{"type":"followers","threshold":1000}'::jsonb),
('followers_02500', 'Büyük Masa', '2500 takipçiye ulaştın.', 'followers', 'platinum', 'followers', 2200, false, 1109, '{"type":"followers","threshold":2500}'::jsonb),
('followers_05000', 'Tarifim Yıldızı', '5000 takipçiye ulaştın.', 'followers', 'legendary', 'followers', 4000, false, 1110, '{"type":"followers","threshold":5000}'::jsonb),
('followers_10000', 'Takipçi İkonu', '10.000 takipçiye ulaştın.', 'followers', 'legendary', 'followers', 7000, false, 1111, '{"type":"followers","threshold":10000}'::jsonb),
('followers_25000', 'Mutfak Süperstarı', '25.000 takipçiye ulaştın.', 'followers', 'legendary', 'followers', 8000, false, 1112, '{"type":"followers","threshold":25000}'::jsonb),

-- ---- Category 14: Following / social (following) — intentionally low XP ----
('following_00005', 'Komşu Masası', '5 kişiyi takip ettin.', 'following', 'bronze', 'social', 10, false, 1200, '{"type":"following","threshold":5}'::jsonb),
('following_00015', 'Yeni İnsanlar', '15 kişiyi takip ettin.', 'following', 'bronze', 'social', 15, false, 1201, '{"type":"following","threshold":15}'::jsonb),
('following_00025', 'Sosyal Şef', '25 kişiyi takip ettin.', 'following', 'silver', 'social', 20, false, 1202, '{"type":"following","threshold":25}'::jsonb),
('following_00050', 'Topluluk Gezgini', '50 kişiyi takip ettin.', 'following', 'silver', 'social', 25, false, 1203, '{"type":"following","threshold":50}'::jsonb),
('following_00100', 'Sosyal Kelebek', '100 kişiyi takip ettin.', 'following', 'gold', 'social', 30, false, 1204, '{"type":"following","threshold":100}'::jsonb),

-- ---- Category 15: Saves received (saves_received) ----
('saves_received_00001', 'İlk Kaydedilen', 'Bir tarifin ilk kez kaydedildi.', 'saves_received', 'bronze', 'saves', 20, false, 1300, '{"type":"saves_received","threshold":1}'::jsonb),
('saves_received_00010', 'Kaydetmeye Değer', '10 kayıt aldın.', 'saves_received', 'bronze', 'saves', 40, false, 1301, '{"type":"saves_received","threshold":10}'::jsonb),
('saves_received_00025', 'Tarif Defterinde', '25 kayıt aldın.', 'saves_received', 'silver', 'saves', 75, false, 1302, '{"type":"saves_received","threshold":25}'::jsonb),
('saves_received_00050', 'Kaydedilen Şef', '50 kayıt aldın.', 'saves_received', 'silver', 'saves', 120, false, 1303, '{"type":"saves_received","threshold":50}'::jsonb),
('saves_received_00100', 'Favori Tarifçi', '100 kayıt aldın.', 'saves_received', 'gold', 'saves', 220, false, 1304, '{"type":"saves_received","threshold":100}'::jsonb),
('saves_received_00250', 'Defterlerin Favorisi', '250 kayıt aldın.', 'saves_received', 'gold', 'saves', 400, false, 1305, '{"type":"saves_received","threshold":250}'::jsonb),
('saves_received_00500', 'Vazgeçilmez', '500 kayıt aldın.', 'saves_received', 'platinum', 'saves', 700, false, 1306, '{"type":"saves_received","threshold":500}'::jsonb),
('saves_received_01000', 'Tarif Defteri Efsanesi', '1000 kayıt aldın.', 'saves_received', 'platinum', 'saves', 1200, false, 1307, '{"type":"saves_received","threshold":1000}'::jsonb),
('saves_received_05000', 'Herkesin Defterinde', '5000 kayıt aldın.', 'saves_received', 'legendary', 'saves', 4000, false, 1308, '{"type":"saves_received","threshold":5000}'::jsonb),

-- ---- Category 16: Own saved recipes (saved_count) ----
('saved_count_00001', 'İlk Favori', 'İlk tarifini kaydettin.', 'saved_count', 'bronze', 'collection', 15, false, 1400, '{"type":"saved_count","threshold":1}'::jsonb),
('saved_count_00005', 'Tarif Koleksiyoncusu', '5 tarif kaydettin.', 'saved_count', 'bronze', 'collection', 25, false, 1401, '{"type":"saved_count","threshold":5}'::jsonb),
('saved_count_00025', 'Tarif Arşivcisi', '25 tarif kaydettin.', 'saved_count', 'silver', 'collection', 60, false, 1402, '{"type":"saved_count","threshold":25}'::jsonb),
('saved_count_00050', 'Lezzet Koleksiyonu', '50 tarif kaydettin.', 'saved_count', 'silver', 'collection', 100, false, 1403, '{"type":"saved_count","threshold":50}'::jsonb),
('saved_count_00100', 'Lezzet Kütüphanesi', '100 tarif kaydettin.', 'saved_count', 'gold', 'collection', 180, false, 1404, '{"type":"saved_count","threshold":100}'::jsonb),
('saved_count_00250', 'Tarif Hazinesi', '250 tarif kaydettin.', 'saved_count', 'gold', 'collection', 350, false, 1405, '{"type":"saved_count","threshold":250}'::jsonb),
('saved_count_00500', 'Mutfak Arşivcisi', '500 tarif kaydettin.', 'saved_count', 'platinum', 'collection', 600, false, 1406, '{"type":"saved_count","threshold":500}'::jsonb),

-- ---- Category 17: Variety (distinct_categories — distinct post tags, max 10) ----
('variety_003', 'Meraklı Aşçı', '3 farklı tarif kategorisinde paylaşım yaptın.', 'variety', 'bronze', 'variety', 40, false, 1500, '{"type":"distinct_categories","threshold":3}'::jsonb),
('variety_005', 'Çok Yönlü Şef', '5 farklı tarif kategorisinde paylaşım yaptın.', 'variety', 'silver', 'variety', 90, false, 1501, '{"type":"distinct_categories","threshold":5}'::jsonb),
('variety_008', 'Mutfak Kaşifi', '8 farklı tarif kategorisinde paylaşım yaptın.', 'variety', 'gold', 'variety', 200, false, 1502, '{"type":"distinct_categories","threshold":8}'::jsonb),
('variety_010', 'Her Şeyden Biraz', '10 farklı tarif kategorisinin hepsinde paylaşım yaptın.', 'variety', 'platinum', 'variety', 400, false, 1503, '{"type":"distinct_categories","threshold":10}'::jsonb),

-- ---- Category 18: Consistency (active_days / active_months) ----
('consistency_days_003', 'Mutfakta Devamlılık', '3 farklı günde paylaşım yaptın.', 'consistency', 'bronze', 'consistency', 30, false, 1600, '{"type":"active_days","threshold":3}'::jsonb),
('consistency_days_007', 'Bir Haftalık Şef', '7 farklı günde paylaşım yaptın.', 'consistency', 'bronze', 'consistency', 60, false, 1601, '{"type":"active_days","threshold":7}'::jsonb),
('consistency_days_015', 'Düzenli Aşçı', '15 farklı günde paylaşım yaptın.', 'consistency', 'silver', 'consistency', 120, false, 1602, '{"type":"active_days","threshold":15}'::jsonb),
('consistency_days_030', 'Mutfak Müdavimi', '30 farklı günde paylaşım yaptın.', 'consistency', 'silver', 'consistency', 220, false, 1603, '{"type":"active_days","threshold":30}'::jsonb),
('consistency_days_060', 'Disiplinli Şef', '60 farklı günde paylaşım yaptın.', 'consistency', 'gold', 'consistency', 400, false, 1604, '{"type":"active_days","threshold":60}'::jsonb),
('consistency_days_100', 'Mutfakta Yüz Gün', '100 farklı günde paylaşım yaptın.', 'consistency', 'gold', 'consistency', 700, false, 1605, '{"type":"active_days","threshold":100}'::jsonb),
('consistency_months_003', 'Uzun Soluklu Şef', '3 farklı ayda paylaşım yaptın.', 'consistency', 'bronze', 'consistency', 60, false, 1606, '{"type":"active_months","threshold":3}'::jsonb),
('consistency_months_006', 'Tarifim Veteranı', '6 farklı ayda paylaşım yaptın.', 'consistency', 'silver', 'consistency', 150, false, 1607, '{"type":"active_months","threshold":6}'::jsonb),
('consistency_months_012', 'Bir Yıllık Şef', '12 farklı ayda paylaşım yaptın.', 'consistency', 'gold', 'consistency', 350, false, 1608, '{"type":"active_months","threshold":12}'::jsonb),
('consistency_months_024', 'Mutfak Demirbaşı', '24 farklı ayda paylaşım yaptın.', 'consistency', 'platinum', 'consistency', 700, false, 1609, '{"type":"active_months","threshold":24}'::jsonb),

-- ---- Category 19: XP milestones (xp_total) ----
('xp_000100', 'Yola Çıktı', '100 XP kazandın.', 'xp', 'bronze', 'xp', 20, false, 1700, '{"type":"xp_total","threshold":100}'::jsonb),
('xp_000500', 'Isınmaya Başladı', '500 XP kazandın.', 'xp', 'bronze', 'xp', 60, false, 1701, '{"type":"xp_total","threshold":500}'::jsonb),
('xp_001000', 'Deneyimli Aşçı', '1000 XP kazandın.', 'xp', 'silver', 'xp', 120, false, 1702, '{"type":"xp_total","threshold":1000}'::jsonb),
('xp_002500', 'Mutfakta İlerliyor', '2500 XP kazandın.', 'xp', 'silver', 'xp', 250, false, 1703, '{"type":"xp_total","threshold":2500}'::jsonb),
('xp_005000', 'Tecrübeli Şef', '5000 XP kazandın.', 'xp', 'gold', 'xp', 450, false, 1704, '{"type":"xp_total","threshold":5000}'::jsonb),
('xp_010000', 'Usta Oyuncu', '10.000 XP kazandın.', 'xp', 'gold', 'xp', 800, false, 1705, '{"type":"xp_total","threshold":10000}'::jsonb),
('xp_025000', 'Mutfak Veterani', '25.000 XP kazandın.', 'xp', 'platinum', 'xp', 1500, false, 1706, '{"type":"xp_total","threshold":25000}'::jsonb),
('xp_050000', 'Tarifim Eliti', '50.000 XP kazandın.', 'xp', 'platinum', 'xp', 2500, false, 1707, '{"type":"xp_total","threshold":50000}'::jsonb),
('xp_100000', 'Tarifim Efsanesi', '100.000 XP kazandın.', 'xp', 'legendary', 'xp', 4000, false, 1708, '{"type":"xp_total","threshold":100000}'::jsonb),
('xp_250000', 'Lezzet Ölümsüzü', '250.000 XP kazandın.', 'xp', 'legendary', 'xp', 6000, false, 1709, '{"type":"xp_total","threshold":250000}'::jsonb),

-- ---- Category 20: Combination achievements (combined) ----
-- The largest combo tier renamed from the spec's "Tarifim Efsanesi" to
-- "Tarifim Kahramanı" — that exact title is already used just above for
-- the 100.000 XP milestone.
('combo_001', 'Yükselen Yetenek', '10 tarif paylaştın ve 100 beğeni topladın.', 'combo', 'silver', 'special', 150, false, 1800, '{"type":"combined","requirements":[{"type":"post_count","threshold":10},{"type":"total_likes_received","threshold":100}]}'::jsonb),
('combo_002', 'Gerçek Şef', '25 tarif paylaştın ve 500 beğeni topladın.', 'combo', 'gold', 'special', 350, false, 1801, '{"type":"combined","requirements":[{"type":"post_count","threshold":25},{"type":"total_likes_received","threshold":500}]}'::jsonb),
('combo_003', 'Topluluk Şefi', '50 tarif, 1000 beğeni ve 100 takipçiye ulaştın.', 'combo', 'gold', 'special', 600, false, 1802, '{"type":"combined","requirements":[{"type":"post_count","threshold":50},{"type":"total_likes_received","threshold":1000},{"type":"followers","threshold":100}]}'::jsonb),
('combo_004', 'Tarifim Ustası', '100 tarif, 5000 beğeni ve 500 takipçiye ulaştın.', 'combo', 'platinum', 'special', 1200, false, 1803, '{"type":"combined","requirements":[{"type":"post_count","threshold":100},{"type":"total_likes_received","threshold":5000},{"type":"followers","threshold":500}]}'::jsonb),
('combo_005', 'Tarifim Kahramanı', '250 tarif, 10.000 beğeni ve 1000 takipçiye ulaştın.', 'combo', 'platinum', 'special', 2500, false, 1804, '{"type":"combined","requirements":[{"type":"post_count","threshold":250},{"type":"total_likes_received","threshold":10000},{"type":"followers","threshold":1000}]}'::jsonb),
('combo_006', 'Mutfak İkonu', '500 tarif, 50.000 beğeni ve 5000 takipçiye ulaştın.', 'combo', 'legendary', 'special', 5000, false, 1805, '{"type":"combined","requirements":[{"type":"post_count","threshold":500},{"type":"total_likes_received","threshold":50000},{"type":"followers","threshold":5000}]}'::jsonb),
('combo_007', 'Tarifim Ölümsüzü', '1000 tarif, 100.000 beğeni ve 10.000 takipçiye ulaştın.', 'combo', 'legendary', 'special', 10000, false, 1806, '{"type":"combined","requirements":[{"type":"post_count","threshold":1000},{"type":"total_likes_received","threshold":100000},{"type":"followers","threshold":10000}]}'::jsonb),

-- ---- Category 21: Special nutrition combos (partial — see header note) ----
('nutrition_combo_001', 'Protein Fenomeni', '10 yüksek proteinli tarif paylaştın ve 100 beğeni topladın.', 'nutrition_combo', 'gold', 'protein', 300, false, 1900, '{"type":"combined","requirements":[{"type":"category_post_count","category":"high-protein","threshold":10},{"type":"total_likes_received","threshold":100}]}'::jsonb),
('nutrition_combo_002', 'Protein Topluluk Şefi', '25 yüksek proteinli tarif paylaştın ve 500 beğeni topladın.', 'nutrition_combo', 'platinum', 'protein', 600, false, 1901, '{"type":"combined","requirements":[{"type":"category_post_count","category":"high-protein","threshold":25},{"type":"total_likes_received","threshold":500}]}'::jsonb),
('nutrition_combo_003', 'Protein Efsanesi', '50 yüksek proteinli tarif paylaştın ve 1000 beğeni topladın.', 'nutrition_combo', 'legendary', 'protein', 1500, false, 1902, '{"type":"combined","requirements":[{"type":"category_post_count","category":"high-protein","threshold":50},{"type":"total_likes_received","threshold":1000}]}'::jsonb),
('nutrition_combo_004', 'Tatlıların Efendisi', '25 tatlı tarifi paylaştın ve bu tariflerin 500 beğeni topladı.', 'nutrition_combo', 'platinum', 'dessert', 600, false, 1903, '{"type":"combined","requirements":[{"type":"category_post_count","category":"dessert","threshold":25},{"type":"dessert_likes","threshold":500}]}'::jsonb),

-- ---- Category 22: Prestige ----
('prestige_versatile', 'Çok Yönlü Usta', '100 tarif paylaştın ve en az 5 farklı başarım kategorisinden ödül kazandın.', 'prestige', 'platinum', 'special', 800, false, 2000, '{"type":"combined","requirements":[{"type":"post_count","threshold":100},{"type":"distinct_achievement_categories","threshold":5}]}'::jsonb),
('prestige_badges_025', 'Rozet Avcısı', '25 başarım kazandın.', 'prestige', 'silver', 'special', 150, false, 2001, '{"type":"achievement_count","threshold":25}'::jsonb),
('prestige_badges_050', 'Başarım Ustası', '50 başarım kazandın.', 'prestige', 'gold', 'special', 400, false, 2002, '{"type":"achievement_count","threshold":50}'::jsonb),
('prestige_badges_075', 'Başarım Koleksiyoncusu', '75 başarım kazandın.', 'prestige', 'platinum', 'special', 800, false, 2003, '{"type":"achievement_count","threshold":75}'::jsonb),
('prestige_badges_100', 'Başarım Efsanesi', '100 başarım kazandın.', 'prestige', 'legendary', 'special', 2000, false, 2004, '{"type":"achievement_count","threshold":100}'::jsonb),
('prestige_legendary_001', 'Efsane Başladı', 'İlk legendary başarımını kazandın.', 'prestige', 'gold', 'special', 300, false, 2005, '{"type":"legendary_count","threshold":1}'::jsonb),
('prestige_legendary_005', 'Efsaneler Kulübü', '5 legendary başarım kazandın.', 'prestige', 'legendary', 'special', 2000, false, 2006, '{"type":"legendary_count","threshold":5}'::jsonb),
('prestige_level_050', '50. Seviye', 'Seviye 50''ye ulaştın.', 'prestige', 'gold', 'special', 500, false, 2007, '{"type":"level","threshold":50}'::jsonb),
('prestige_level_075', 'Ustalığın Ötesi', 'Seviye 75''e ulaştın.', 'prestige', 'platinum', 'special', 1200, false, 2008, '{"type":"level","threshold":75}'::jsonb),
('prestige_level_100', 'Seviye 100', 'Seviye 100''e ulaştın.', 'prestige', 'legendary', 'special', 3000, false, 2009, '{"type":"level","threshold":100}'::jsonb),

-- ---- Hidden / secret achievements (a handful, not dozens) ----
('hidden_night_chef', 'Gece Şefi', 'Gece yarısı ile sabah 04:00 arasında bir tarif paylaştın.', 'hidden', 'bronze', 'special', 40, true, 2100, '{"type":"night_post_count","threshold":1}'::jsonb),
('hidden_night_owl', 'Gece Kuşu', 'Gece yarısı ile sabah 04:00 arasında 3 tarif paylaştın.', 'hidden', 'silver', 'special', 90, true, 2101, '{"type":"night_post_count","threshold":3}'::jsonb),
('hidden_before_sunrise', 'Güneşten Önce', 'Sabah 06:00''dan önce bir kahvaltı tarifi paylaştın.', 'hidden', 'silver', 'special', 90, true, 2102, '{"type":"early_breakfast_post_count","threshold":1}'::jsonb),
('hidden_full_circle', 'Tam Tur', 'Başarımların en az 8 farklı kategoriden geliyor.', 'hidden', 'platinum', 'special', 700, true, 2103, '{"type":"distinct_achievement_categories","threshold":8}'::jsonb),
('hidden_among_legends', 'Efsaneler Arasında', '3 legendary başarım kazandın.', 'hidden', 'gold', 'special', 500, true, 2104, '{"type":"legendary_count","threshold":3}'::jsonb)

on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  tier = excluded.tier,
  icon_key = excluded.icon_key,
  xp_reward = excluded.xp_reward,
  hidden = excluded.hidden,
  sort_order = excluded.sort_order,
  requirement = excluded.requirement;

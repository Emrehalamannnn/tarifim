-- Tarifim real accounts + social schema.
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New
-- query) against a fresh project. Safe to re-run: every statement is
-- idempotent (create-if-not-exists / drop-if-exists-then-create).

-- ============================================================
-- profiles: one row per auth.users row, holds display info that used to
-- live in useAppStore's mocked `user` field.
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  avatar_url text,
  provider text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Admin/moderation flags. is_owner grants the ability to delete any post
-- (see the posts delete policy below); both badges render in the UI via
-- PostCard/ProfilePage. Protected from self-escalation by the trigger
-- below — without it, the "users can update their own profile" policy
-- above would let any logged-in user set these to true on themselves via
-- a normal client update call.
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists is_owner boolean not null default false;

-- Private accounts. Gates the posts SELECT policy and the follows
-- pending/accepted flow below (see the follows section). Defaults false so
-- every existing profile — the real account and all ~200 seeded fake ones —
-- stays public until a user opts in from /settings.
alter table public.profiles add column if not exists is_private boolean not null default false;

-- ============================================================
-- username: mandatory, unique @handle — powers the DM "search a username
-- and message them" flow (useUserSearch). Enforced NOT NULL below; existing
-- rows (the real account + ~200 seeded fake users, all created before this
-- column existed) get a throwaway placeholder here so that constraint can
-- land on a re-run without failing — replace the fake users' placeholders
-- with human-looking ones via seed_usernames.sql, and update the real
-- account's from Settings.
-- ============================================================
alter table public.profiles add column if not exists username text;

update public.profiles
set username = 'user_' || substr(id::text, 1, 8)
where username is null;

alter table public.profiles alter column username set not null;

alter table public.profiles drop constraint if exists profiles_username_format_check;
alter table public.profiles add constraint profiles_username_format_check
  check (username ~ '^[a-z0-9_.]{3,20}$');

-- Case-insensitive uniqueness ("Ayse" and "ayse" collide) via an index
-- rather than a plain unique column constraint.
create unique index if not exists profiles_username_key on public.profiles (lower(username));

create or replace function public.protect_privileged_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.role() is 'authenticated' for normal logged-in API/client
  -- requests (PostgREST) — exactly the case to block. It's null (or
  -- 'postgres') for direct/SQL-Editor connections, which is how these
  -- flags are meant to be granted, so those pass through untouched.
  if auth.role() = 'authenticated' then
    new.is_verified := old.is_verified;
    new.is_owner := old.is_owner;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_privileged_profile_fields_trigger on public.profiles;
create trigger protect_privileged_profile_fields_trigger
  before update on public.profiles
  for each row execute function public.protect_privileged_profile_fields();

-- Auto-create a profile row whenever a new auth.users row appears (Google
-- OAuth, Apple OAuth, or email+password signup). Pulls name/avatar out of
-- whatever the provider put in raw_user_meta_data, falling back to the
-- email's local part so a profile always has a usable display name.
--
-- username is mandatory, but only email signups can realistically collect
-- one before this trigger fires (LoginPanel passes it via signUp's
-- `options.data.username`) — a missing/blank one on that path raises an
-- exception, which aborts the whole signup transaction (including the
-- auth.users insert), so a client can't create an account by skipping the
-- username field or calling the auth API directly without one. OAuth
-- redirects give the app no chance to ask first, so those get a generated
-- placeholder instead of a hard failure; the user can change it later from
-- Settings.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  provider_val text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  username_val text := lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''));
begin
  if username_val is null then
    if provider_val = 'email' then
      raise exception 'username is required';
    end if;
    username_val := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_.]', '', 'g');
    if username_val is null or username_val = '' then
      username_val := 'user';
    end if;
    username_val := left(username_val, 14) || '_' || substr(new.id::text, 1, 4);
  end if;

  insert into public.profiles (id, name, email, avatar_url, provider, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url',
    provider_val,
    username_val
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- follows: brand new — the mocked follower/following counts
-- (src/lib/mockSocial.js) had no real graph behind them at all.
--
-- Created ahead of `posts` (below) because the posts SELECT policy's
-- private-account gating references follows.status — CREATE POLICY
-- validates that column exists at creation time, unlike a plpgsql function
-- body, so follows must be fully set up first on a from-scratch run.
-- ============================================================
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

-- Private-account follow requests: following a public account is instant
-- ('accepted'); following a private one inserts a 'pending' row the target
-- must approve. Status is never trusted from the client directly — see
-- enforce_follow_request_status below.
alter table public.follows add column if not exists status text not null default 'accepted';
alter table public.follows drop constraint if exists follows_status_check;
alter table public.follows add constraint follows_status_check check (status in ('pending', 'accepted'));

alter table public.follows enable row level security;

-- Pending rows are only visible to the two parties involved — otherwise
-- anyone could query this table directly and see who has an outstanding
-- request into a private account, which undercuts the point of requiring
-- approval even though it's just metadata, not content. Accepted follows
-- stay fully public, same as before.
drop policy if exists "follows are publicly readable" on public.follows;
create policy "follows are publicly readable"
  on public.follows for select
  using (status = 'accepted' or auth.uid() = follower_id or auth.uid() = following_id);

drop policy if exists "users can follow as themselves" on public.follows;
create policy "users can follow as themselves"
  on public.follows for insert
  with check (auth.uid() = follower_id);

-- The client must never be able to insert status = 'accepted' directly
-- against a private target — that would skip the approval step entirely.
-- Same "recompute server-side, ignore whatever a normal client sent"
-- pattern as protect_privileged_profile_fields above: status is always
-- derived from the *current* target profile's is_private, not client input.
create or replace function public.enforce_follow_request_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_is_private boolean;
begin
  if auth.role() = 'authenticated' then
    select is_private into target_is_private from public.profiles where id = new.following_id;
    new.status := case when coalesce(target_is_private, false) then 'pending' else 'accepted' end;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_follow_request_status_trigger on public.follows;
create trigger enforce_follow_request_status_trigger
  before insert on public.follows
  for each row execute function public.enforce_follow_request_status();

drop policy if exists "users can unfollow as themselves" on public.follows;
create policy "users can unfollow as themselves"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- Rejecting an incoming request is a delete of someone else's row, safe as
-- a plain scoped policy (no "new row" content to spoof, unlike accept).
drop policy if exists "users can reject incoming follow requests" on public.follows;
create policy "users can reject incoming follow requests"
  on public.follows for delete
  using (auth.uid() = following_id and status = 'pending');

-- Accepting a request updates a row that isn't the requester's own. A plain
-- scoped UPDATE policy isn't safe here the way the delete policy above is:
-- accept is a pending -> accepted transition, which forces a WITH CHECK
-- that differs from USING. The moment those diverge, Postgres no longer
-- falls back to reusing USING as the check on every other column (the
-- fallback that makes e.g. profiles' own auth.uid() = id policy safe with
-- no explicit WITH CHECK) — a client could satisfy
-- using(auth.uid()=following_id and status='pending') /
-- with check(auth.uid()=following_id and status='accepted') while also
-- rewriting follower_id in the same PATCH body, fabricating an accepted
-- follow from a third party who never asked for it. Same underlying shape
-- as why set_comment_pinned below needs a function instead of a policy.
create or replace function public.respond_to_follow_request(follower_id uuid, accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  requester uuid := auth.uid();
begin
  if requester is null then
    raise exception 'not authenticated';
  end if;

  if accept then
    update public.follows
    set status = 'accepted'
    where follows.follower_id = respond_to_follow_request.follower_id
      and follows.following_id = requester
      and follows.status = 'pending';
  else
    delete from public.follows
    where follows.follower_id = respond_to_follow_request.follower_id
      and follows.following_id = requester
      and follows.status = 'pending';
  end if;
end;
$$;

grant execute on function public.respond_to_follow_request(uuid, boolean) to authenticated;

-- Bulk companion: when an account switches from private to public
-- (SettingsPage's toggle handler), every still-pending incoming request
-- auto-accepts, since a public account has no concept of "pending".
create or replace function public.accept_all_pending_follow_requests()
returns void
language sql
security definer set search_path = public
as $$
  update public.follows set status = 'accepted' where following_id = auth.uid() and status = 'pending';
$$;

grant execute on function public.accept_all_pending_follow_requests() to authenticated;

-- ============================================================
-- posts: replaces the local-only `communityPosts` array.
--
-- author_id is nullable and recipe_id exists to support "official" posts
-- seeded from the app's own recipe catalog (see seed_recipe_posts.sql) —
-- those have author_id = null (displayed as "Tarifim Mutfağı" in the UI,
-- never followable/deletable) and recipe_id set so the post can deep-link
-- to /recipe/:id. User-submitted posts have author_id set and recipe_id
-- null. RLS's insert check (auth.uid() = author_id) already means a client
-- can never insert a null-author_id row themselves — NULL = NULL is NULL,
-- not true, in Postgres — so official posts can only come from a
-- privileged context (the SQL Editor, which runs as postgres and bypasses
-- RLS), not through the app.
-- ============================================================
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete cascade,
  photo_url text not null,
  title text not null,
  description text not null default '',
  ingredient_ids text[] not null default '{}',
  recipe_id text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Migrates an already-created posts table (from before author_id/recipe_id
-- were adjusted) in place. No-ops on a fresh table that matches already.
alter table public.posts alter column author_id drop not null;
alter table public.posts add column if not exists recipe_id text;
-- tags uses the same vocabulary as recipes.json (src/lib/tags.js's
-- TAG_LABELS_TR) — powers SocialPage's filter chips. Optional on
-- user-submitted posts (CreatePostModal), populated from the linked
-- recipe's own tags on official posts (seed_recipe_posts.sql).
alter table public.posts add column if not exists tags text[] not null default '{}';
create index if not exists posts_tags_idx on public.posts using gin (tags);

-- Video posts (TikTok-style UGC recipe clips) — a post carries either a
-- photo or a video, never neither. photo_url was NOT NULL from the original
-- photo-only design; relaxed here so a video-only post can omit it.
alter table public.posts alter column photo_url drop not null;
alter table public.posts add column if not exists video_url text;
alter table public.posts drop constraint if exists posts_media_check;
alter table public.posts add constraint posts_media_check
  check (photo_url is not null or video_url is not null);

-- Denormalized share counter — shares happen through the Web Share API /
-- clipboard fallback (PostCard's handleShare), which has no per-user
-- identity to key a table on the way likes/saves do, so this is a plain
-- counter incremented client-side rather than a post_shares join table.
alter table public.posts add column if not exists share_count integer not null default 0;

-- Freeform recipe write-up, separate from the short `description`. Optional
-- on CreatePostModal — if the author leaves it blank, the client calls the
-- generate-recipe Edge Function (same ANTHROPIC_API_KEY secret as ai-coach)
-- before inserting and sets recipe_is_ai_generated so PostCard can show a
-- small, non-alarmist "AI generated" note. Official recipe-catalog posts
-- (author_id is null) get their recipe_text from recipes.json's own steps —
-- real app content, never AI-generated, so that flag stays false for them.
alter table public.posts add column if not exists recipe_text text;
alter table public.posts add column if not exists recipe_is_ai_generated boolean not null default false;

-- Dedupe ledger behind increment_post_share below. Not client-facing at all
-- (RLS on, zero policies), same pattern as auth_rate_limits: only the
-- security-definer function — which bypasses RLS — reads or writes it, so a
-- client can't delete its own rows to re-share the same post for another
-- increment.
create table if not exists public.post_shares (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_shares enable row level security;

-- No blanket UPDATE policy exists on posts (a client could otherwise rewrite
-- someone else's title/photo). This function is the one narrow write a
-- client can make: bump share_count by 1, nothing else, on any post.
--
-- Anonymous callers are rejected and every increment is recorded per
-- (post, user): the counter only moves the first time a given user shares a
-- given post, so hammering the RPC directly — the trivial abuse this
-- endpoint invites, since the count is public UI — is a no-op after the
-- first call. Inflating the number now costs one real account per
-- increment instead of one HTTP request.
create or replace function public.increment_post_share(post_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  requester uuid := auth.uid();
begin
  if requester is null then
    raise exception 'not authenticated';
  end if;

  insert into public.post_shares (post_id, user_id)
  values (increment_post_share.post_id, requester)
  on conflict do nothing;

  -- FOUND is false when the ON CONFLICT arm swallowed the insert, i.e. this
  -- user already shared this post before.
  if found then
    update public.posts
    set share_count = share_count + 1
    where id = increment_post_share.post_id;
  end if;
end;
$$;

-- EXECUTE on a new function is granted to PUBLIC by default, which covers
-- the anon role — revoking from both is what actually takes the RPC away
-- from logged-out callers.
revoke execute on function public.increment_post_share(uuid) from public;
revoke execute on function public.increment_post_share(uuid) from anon;
grant execute on function public.increment_post_share(uuid) to authenticated;

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx on public.posts (author_id);
-- Partial unique index (not a table constraint) so multiple user posts can
-- all have recipe_id = null while still preventing the seed script from
-- ever double-inserting the same recipe as an official post.
create unique index if not exists posts_recipe_id_key on public.posts (recipe_id) where recipe_id is not null;

alter table public.posts enable row level security;

-- Private accounts: hide a private author's posts from everyone except the
-- author, anyone when the post is official (author_id is null), and users
-- with an accepted follow into that author.
drop policy if exists "posts are publicly readable" on public.posts;
create policy "posts are publicly readable"
  on public.posts for select
  using (
    author_id is null
    or auth.uid() = author_id
    or not exists (select 1 from public.profiles where id = posts.author_id and is_private = true)
    or exists (
      select 1 from public.follows
      where follows.follower_id = auth.uid()
        and follows.following_id = posts.author_id
        and follows.status = 'accepted'
    )
  );

drop policy if exists "users can insert their own posts" on public.posts;
create policy "users can insert their own posts"
  on public.posts for insert
  with check (auth.uid() = author_id);

-- Owners (profiles.is_owner) can delete any post, not just their own —
-- moderation capability for the app's admin/founder account.
drop policy if exists "users can delete their own posts" on public.posts;
create policy "users can delete their own posts"
  on public.posts for delete
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_owner = true)
  );

-- Shared visibility predicate for everything hanging off a post
-- (post_likes / post_comments / comment_likes below). Deliberately NOT
-- security definer: a plain (invoker) function inlines into the calling
-- query, so `posts` is read with the *caller's* RLS applied and this
-- returns true only when the "posts are publicly readable" policy above
-- would have handed the caller that row. One definition, automatically in
-- step with the post policy — no second copy of the private-account rules
-- to drift.
create or replace function public.post_is_visible(post_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (select 1 from public.posts where id = post_is_visible.post_id);
$$;

grant execute on function public.post_is_visible(uuid) to authenticated, anon;

-- ============================================================
-- post_likes: replaces the local `likes`/`likedByMe` fields on a post.
-- ============================================================
create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

-- Privacy: interaction rows inherit the parent post's visibility rather
-- than being world-readable. The previous `using (true)` leaked a private
-- account's engagement — who liked what, and (via post_comments) comment
-- text itself — to anyone who knew or guessed a post id, including ids
-- captured while the account was still public. Relying on "the app never
-- surfaces those ids" only holds for the app's own queries; PostgREST is a
-- public API and the id is the only thing gating it.
drop policy if exists "post likes are publicly readable" on public.post_likes;
create policy "post likes are visible with the post"
  on public.post_likes for select
  using (public.post_is_visible(post_id));

drop policy if exists "users can like as themselves" on public.post_likes;
create policy "users can like as themselves"
  on public.post_likes for insert
  with check (auth.uid() = user_id and public.post_is_visible(post_id));

drop policy if exists "users can unlike their own like" on public.post_likes;
create policy "users can unlike their own like"
  on public.post_likes for delete
  using (auth.uid() = user_id);

-- ============================================================
-- post_comments
-- ============================================================
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_id_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

-- Same inheritance as post_likes above — a private account's comment
-- threads are content, not just metadata.
drop policy if exists "comments are publicly readable" on public.post_comments;
create policy "comments are visible with the post"
  on public.post_comments for select
  using (public.post_is_visible(post_id));

drop policy if exists "users can comment as themselves" on public.post_comments;
create policy "users can comment as themselves"
  on public.post_comments for insert
  with check (auth.uid() = author_id and public.post_is_visible(post_id));

drop policy if exists "users can delete their own comments" on public.post_comments;
create policy "users can delete their own comments"
  on public.post_comments for delete
  using (auth.uid() = author_id);

-- Instagram-style threading (one level — a reply's parent is always a
-- top-level comment, CommentsModal flattens reply-to-a-reply onto the same
-- parent) and pinning (post owner only, see set_comment_pinned below).
alter table public.post_comments add column if not exists parent_comment_id uuid references public.post_comments (id) on delete cascade;
alter table public.post_comments add column if not exists pinned_at timestamptz;
create index if not exists post_comments_parent_id_idx on public.post_comments (parent_comment_id);

-- ============================================================
-- comment_likes
-- ============================================================
create table if not exists public.comment_likes (
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

-- Reached through post_comments rather than posts directly: that table's
-- own SELECT policy (above) already resolves to the parent post's
-- visibility, and RLS applies to this subquery too, so an invisible
-- comment yields no row here either.
drop policy if exists "comment likes are publicly readable" on public.comment_likes;
create policy "comment likes are visible with the comment"
  on public.comment_likes for select
  using (exists (select 1 from public.post_comments c where c.id = comment_likes.comment_id));

drop policy if exists "users can like comments as themselves" on public.comment_likes;
create policy "users can like comments as themselves"
  on public.comment_likes for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.post_comments c where c.id = comment_likes.comment_id)
  );

drop policy if exists "users can unlike their own comment like" on public.comment_likes;
create policy "users can unlike their own comment like"
  on public.comment_likes for delete
  using (auth.uid() = user_id);

-- No UPDATE policy exists on post_comments (only insert/select/delete), so
-- pinning — which touches someone else's row (a commenter's, from the post
-- owner's side) — has to go through a narrow security-definer function
-- rather than a blanket policy, same reasoning as increment_post_share.
create or replace function public.set_comment_pinned(comment_id uuid, pinned boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  post_owner uuid;
  requester uuid := auth.uid();
  requester_is_owner boolean;
begin
  select p.author_id into post_owner
  from public.post_comments c
  join public.posts p on p.id = c.post_id
  where c.id = comment_id;

  select is_owner into requester_is_owner from public.profiles where id = requester;

  if requester is null or (requester is distinct from post_owner and not coalesce(requester_is_owner, false)) then
    raise exception 'not authorized to pin this comment';
  end if;

  update public.post_comments
  set pinned_at = case when pinned then now() else null end
  where id = comment_id;
end;
$$;

grant execute on function public.set_comment_pinned(uuid, boolean) to authenticated;

-- ============================================================
-- post_saves ("bookmarks"). Unlike likes/follows, saves are private —
-- select is restricted to the owner, not public, matching how Instagram
-- treats saved posts.
-- ============================================================
create table if not exists public.post_saves (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_saves enable row level security;

drop policy if exists "users can read their own saves" on public.post_saves;
create policy "users can read their own saves"
  on public.post_saves for select
  using (auth.uid() = user_id);

drop policy if exists "users can save as themselves" on public.post_saves;
create policy "users can save as themselves"
  on public.post_saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can unsave their own save" on public.post_saves;
create policy "users can unsave their own save"
  on public.post_saves for delete
  using (auth.uid() = user_id);

-- ============================================================
-- user_blocks: user-to-user blocking, required for a UGC app by App Store
-- Guideline 1.2. The client filters blocked authors out of the feed and
-- comments, and the direct_messages insert policy above/below refuses
-- messages in either direction between a blocked pair. Rows are private to
-- the blocker — the blocked user is never told.
-- ============================================================
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists "users can read their own blocks" on public.user_blocks;
create policy "users can read their own blocks"
  on public.user_blocks for select
  using (auth.uid() = blocker_id);

drop policy if exists "users can block as themselves" on public.user_blocks;
create policy "users can block as themselves"
  on public.user_blocks for insert
  with check (auth.uid() = blocker_id);

drop policy if exists "users can unblock their own block" on public.user_blocks;
create policy "users can unblock their own block"
  on public.user_blocks for delete
  using (auth.uid() = blocker_id);

-- The "users can read their own blocks" policy above (auth.uid() =
-- blocker_id) means a plain subquery against user_blocks — run as the
-- inserting client under RLS — can only ever see blocks that client placed
-- itself. It can never see a block placed *against* it, which is exactly
-- the direction the direct_messages insert policy needs to check. This
-- function is security definer so it reads user_blocks as its owner
-- (bypassing RLS) instead of as the caller, while still only ever
-- evaluating the relationship between auth.uid() and one caller-supplied
-- recipient — it doesn't expose any row data, just a boolean. search_path
-- is empty and every reference is schema-qualified so it can't be
-- redirected by a caller-controlled search_path.
create or replace function public.can_send_direct_message(recipient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and not exists (
      select 1
      from public.user_blocks
      where (user_blocks.blocker_id = auth.uid() and user_blocks.blocked_id = can_send_direct_message.recipient_id)
         or (user_blocks.blocker_id = can_send_direct_message.recipient_id and user_blocks.blocked_id = auth.uid())
    );
$$;

-- EXECUTE on a new function is granted to PUBLIC by default; revoke from
-- both public and anon so only a logged-in client can call it at all.
revoke execute on function public.can_send_direct_message(uuid) from public;
revoke execute on function public.can_send_direct_message(uuid) from anon;
grant execute on function public.can_send_direct_message(uuid) to authenticated;

-- ============================================================
-- post_reports: user reports of objectionable posts (App Store Guideline
-- 1.2 — reporting must create something actionable). Any logged-in user
-- can file one report per post; only the admin (is_owner) account can read
-- them to act on the content. No update/delete policies — reports are an
-- append-only moderation log.
-- ============================================================
create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

alter table public.post_reports enable row level security;

drop policy if exists "only the admin can read reports" on public.post_reports;
create policy "only the admin can read reports"
  on public.post_reports for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_owner = true));

drop policy if exists "users can report as themselves" on public.post_reports;
create policy "users can report as themselves"
  on public.post_reports for insert
  with check (auth.uid() = reporter_id);

-- ============================================================
-- subscriptions: processor-agnostic premium entitlement, one row per user.
-- Deliberately has NO client-facing insert/update policy — a user must
-- never be able to grant themselves premium by calling the API directly.
-- Real writes will come from a trusted server context once a payment
-- processor is wired up: for iOS, Apple's App Store Server Notifications
-- (or RevenueCat's webhook) hitting a Supabase Edge Function that uses the
-- service_role key, which bypasses RLS entirely. Until then, the only way
-- to flip a user to premium is manually in the SQL Editor (also runs as
-- postgres, bypasses RLS) — see the INSERT template at the bottom of this
-- file's comments and CLAUDE.md's "Subscriptions" section.
-- ============================================================
create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  status text not null default 'active' check (status in ('active', 'expired', 'canceled', 'in_grace_period')),
  store text check (store in ('app_store', 'play_store', 'stripe', 'manual')),
  store_transaction_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "users can read their own subscription" on public.subscriptions;
create policy "users can read their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Example manual grant for local testing (run in the SQL Editor, replace
-- the uuid with a real auth.users id from the profiles table):
-- insert into public.subscriptions (user_id, plan, status, store, current_period_end)
-- values ('00000000-0000-0000-0000-000000000000', 'premium', 'active', 'manual', now() + interval '30 days')
-- on conflict (user_id) do update set
--   plan = excluded.plan, status = excluded.status,
--   store = excluded.store, current_period_end = excluded.current_period_end,
--   updated_at = now();

-- ============================================================
-- direct_messages: private 1:1 messaging between two users (not per-post
-- comments, not a public/group room). Realtime is enabled via the
-- publication line below so useConversation can subscribe to inserts
-- instead of polling. A "conversation" isn't its own table — it's just the
-- distinct (sender_id, recipient_id) pairs in this table, queried via
-- useConversations.
-- ============================================================
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  constraint direct_messages_no_self_message check (sender_id <> recipient_id)
);

create index if not exists direct_messages_sender_recipient_idx
  on public.direct_messages (sender_id, recipient_id, created_at);
create index if not exists direct_messages_recipient_sender_idx
  on public.direct_messages (recipient_id, sender_id, created_at);

alter table public.direct_messages enable row level security;

-- Only the two participants can read a message — unlike posts/comments/chat,
-- DMs are never publicly readable.
drop policy if exists "participants can read their direct messages" on public.direct_messages;
create policy "participants can read their direct messages"
  on public.direct_messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Sending also requires that neither side has blocked the other (see
-- user_blocks below) — blocking must actually stop contact, not just hide
-- posts in the feed. Delegates to can_send_direct_message() rather than a
-- plain user_blocks subquery here: under this caller's own RLS, a block
-- placed against them (not by them) would be invisible and the check would
-- silently no-op — see that function's comment above.
drop policy if exists "users can send direct messages as themselves" on public.direct_messages;
create policy "users can send direct messages as themselves"
  on public.direct_messages for insert
  with check (
    auth.uid() = sender_id
    and public.can_send_direct_message(recipient_id)
  );

-- Adds direct_messages to the publication Supabase's client-side Realtime
-- subscribes through. Safe to re-run — errors only if already a member,
-- guarded by the catalog check.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- ============================================================
-- feedback: one-way feature-request/feedback box from Settings. Every
-- logged-in user can submit; only the admin (is_owner) account can read
-- them, surfaced on their own Profile page — regular users get no read-back
-- UI for what they (or anyone else) submitted, per the "people shouldn't
-- see it, only I can" requirement.
-- ============================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(trim(message)) > 0 and char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback (created_at);

alter table public.feedback enable row level security;

drop policy if exists "only the admin can read feedback" on public.feedback;
create policy "only the admin can read feedback"
  on public.feedback for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_owner = true));

drop policy if exists "users can submit feedback as themselves" on public.feedback;
create policy "users can submit feedback as themselves"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- auth_rate_limits: backs the auth-login/auth-password-reset Edge
-- Functions' per-identifier throttling (see supabase/functions/). Not a
-- client-facing table at all — RLS is on with zero policies added, so the
-- anon/authenticated PostgREST roles get no access whatsoever; only the
-- Edge Functions' service-role client (which bypasses RLS entirely) can
-- read or write it. This is what makes the rate limit real: a client can't
-- see or reset its own attempt count by calling the table directly.
-- ============================================================
create table if not exists public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  action text not null check (action in ('login', 'password_reset')),
  created_at timestamptz not null default now()
);

create index if not exists auth_rate_limits_lookup_idx
  on public.auth_rate_limits (identifier, action, created_at);

alter table public.auth_rate_limits enable row level security;

-- ============================================================
-- ai_rate_limits: same pattern as auth_rate_limits above, but backs the
-- generate-recipe/ai-coach Edge Functions' per-user throttling instead of
-- login attempts. identifier is the caller's auth.uid() (both functions
-- require a valid session already), not an email/IP, since the abuse this
-- guards against is a signed-in account hammering the Anthropic-backed
-- endpoints, not credential stuffing. RLS on with zero policies — only the
-- Edge Functions' service-role client can read or write it.
-- ============================================================
create table if not exists public.ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  action text not null check (action in ('generate-recipe', 'ai-coach')),
  created_at timestamptz not null default now()
);

create index if not exists ai_rate_limits_lookup_idx
  on public.ai_rate_limits (identifier, action, created_at);

alter table public.ai_rate_limits enable row level security;

-- ============================================================
-- Storage bucket for post photos (replaces base64 data-URL-in-localStorage).
--
-- Not public: objects are uploaded to "<author_id>/<file>", and the bucket
-- being `public: true` used to make every file fetchable from its bare URL
-- regardless of RLS, which defeated private accounts entirely (their post
-- photos were still readable by anyone with the link). Private now, so
-- reads must go through the SELECT policy below and the frontend fetches
-- via a signed URL (see src/lib/mediaUrls.js) instead of getPublicUrl.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', false)
on conflict (id) do update set public = false;

-- Mirrors the "posts are publicly readable" policy above, keyed off the
-- uploader's id folder prefix instead of posts.author_id (there's no direct
-- FK from storage.objects to posts, but every post-photos upload path
-- starts with the author's own id, so the same private/owner/follower rule
-- applies one level down).
drop policy if exists "post photos are publicly readable" on storage.objects;
drop policy if exists "post photos are visible to owner/followers" on storage.objects;
create policy "post photos are visible to owner/followers"
  on storage.objects for select
  using (
    bucket_id = 'post-photos'
    and (
      auth.uid() = ((storage.foldername(name))[1])::uuid
      or not exists (
        select 1 from public.profiles
        where id = ((storage.foldername(name))[1])::uuid and is_private = true
      )
      or exists (
        select 1 from public.follows
        where follows.follower_id = auth.uid()
          and follows.following_id = ((storage.foldername(name))[1])::uuid
          and follows.status = 'accepted'
      )
    )
  );

drop policy if exists "authenticated users can upload post photos" on storage.objects;
create policy "authenticated users can upload post photos"
  on storage.objects for insert
  with check (bucket_id = 'post-photos' and auth.role() = 'authenticated');

drop policy if exists "users can delete their own post photos" on storage.objects;
create policy "users can delete their own post photos"
  on storage.objects for delete
  using (bucket_id = 'post-photos' and owner = auth.uid());

-- ============================================================
-- Storage bucket for post videos (TikTok-style UGC recipe clips).
-- Same private-bucket treatment as post-photos above.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('post-videos', 'post-videos', false)
on conflict (id) do update set public = false;

drop policy if exists "post videos are publicly readable" on storage.objects;
drop policy if exists "post videos are visible to owner/followers" on storage.objects;
create policy "post videos are visible to owner/followers"
  on storage.objects for select
  using (
    bucket_id = 'post-videos'
    and (
      auth.uid() = ((storage.foldername(name))[1])::uuid
      or not exists (
        select 1 from public.profiles
        where id = ((storage.foldername(name))[1])::uuid and is_private = true
      )
      or exists (
        select 1 from public.follows
        where follows.follower_id = auth.uid()
          and follows.following_id = ((storage.foldername(name))[1])::uuid
          and follows.status = 'accepted'
      )
    )
  );

drop policy if exists "authenticated users can upload post videos" on storage.objects;
create policy "authenticated users can upload post videos"
  on storage.objects for insert
  with check (bucket_id = 'post-videos' and auth.role() = 'authenticated');

drop policy if exists "users can delete their own post videos" on storage.objects;
create policy "users can delete their own post videos"
  on storage.objects for delete
  using (bucket_id = 'post-videos' and owner = auth.uid());

-- ============================================================
-- Storage bucket for profile pictures.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "authenticated users can upload avatars" on storage.objects;
create policy "authenticated users can upload avatars"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "users can delete their own avatars" on storage.objects;
create policy "users can delete their own avatars"
  on storage.objects for delete
  using (bucket_id = 'avatars' and owner = auth.uid());

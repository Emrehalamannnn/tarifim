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
-- OAuth, Apple OAuth, or email OTP signup). Pulls name/avatar out of
-- whatever the provider put in raw_user_meta_data, falling back to the
-- email's local part so a profile always has a usable display name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url, provider)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
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
  created_at timestamptz not null default now()
);

-- Migrates an already-created posts table (from before author_id/recipe_id
-- were adjusted) in place. No-ops on a fresh table that matches already.
alter table public.posts alter column author_id drop not null;
alter table public.posts add column if not exists recipe_id text;

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx on public.posts (author_id);
-- Partial unique index (not a table constraint) so multiple user posts can
-- all have recipe_id = null while still preventing the seed script from
-- ever double-inserting the same recipe as an official post.
create unique index if not exists posts_recipe_id_key on public.posts (recipe_id) where recipe_id is not null;

alter table public.posts enable row level security;

drop policy if exists "posts are publicly readable" on public.posts;
create policy "posts are publicly readable"
  on public.posts for select
  using (true);

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

drop policy if exists "post likes are publicly readable" on public.post_likes;
create policy "post likes are publicly readable"
  on public.post_likes for select
  using (true);

drop policy if exists "users can like as themselves" on public.post_likes;
create policy "users can like as themselves"
  on public.post_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can unlike their own like" on public.post_likes;
create policy "users can unlike their own like"
  on public.post_likes for delete
  using (auth.uid() = user_id);

-- ============================================================
-- follows: brand new — the mocked follower/following counts
-- (src/lib/mockSocial.js) had no real graph behind them at all.
-- ============================================================
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;

drop policy if exists "follows are publicly readable" on public.follows;
create policy "follows are publicly readable"
  on public.follows for select
  using (true);

drop policy if exists "users can follow as themselves" on public.follows;
create policy "users can follow as themselves"
  on public.follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "users can unfollow as themselves" on public.follows;
create policy "users can unfollow as themselves"
  on public.follows for delete
  using (auth.uid() = follower_id);

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

drop policy if exists "comments are publicly readable" on public.post_comments;
create policy "comments are publicly readable"
  on public.post_comments for select
  using (true);

drop policy if exists "users can comment as themselves" on public.post_comments;
create policy "users can comment as themselves"
  on public.post_comments for insert
  with check (auth.uid() = author_id);

drop policy if exists "users can delete their own comments" on public.post_comments;
create policy "users can delete their own comments"
  on public.post_comments for delete
  using (auth.uid() = author_id);

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
-- Storage bucket for post photos (replaces base64 data-URL-in-localStorage).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', true)
on conflict (id) do nothing;

drop policy if exists "post photos are publicly readable" on storage.objects;
create policy "post photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'post-photos');

drop policy if exists "authenticated users can upload post photos" on storage.objects;
create policy "authenticated users can upload post photos"
  on storage.objects for insert
  with check (bucket_id = 'post-photos' and auth.role() = 'authenticated');

drop policy if exists "users can delete their own post photos" on storage.objects;
create policy "users can delete their own post photos"
  on storage.objects for delete
  using (bucket_id = 'post-photos' and owner = auth.uid());

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

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
-- ============================================================
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  photo_url text not null,
  title text not null,
  description text not null default '',
  ingredient_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx on public.posts (author_id);

alter table public.posts enable row level security;

drop policy if exists "posts are publicly readable" on public.posts;
create policy "posts are publicly readable"
  on public.posts for select
  using (true);

drop policy if exists "users can insert their own posts" on public.posts;
create policy "users can insert their own posts"
  on public.posts for insert
  with check (auth.uid() = author_id);

drop policy if exists "users can delete their own posts" on public.posts;
create policy "users can delete their own posts"
  on public.posts for delete
  using (auth.uid() = author_id);

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

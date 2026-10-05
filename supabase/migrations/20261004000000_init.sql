-- Goal Reader: one family = one Supabase auth user (the parent signs in with an email code).
-- Children never have accounts. Row Level Security keeps every family's rows private.
-- Safe to run more than once (pasted in the SQL editor and/or applied by the GitHub integration).

create table if not exists public.profiles (
  id          text primary key,
  family_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb not null,
  updated_at  bigint not null
);

create table if not exists public.events (
  seq         bigserial primary key,          -- sync cursor: "give me everything after seq N"
  id          text not null unique,           -- event id from the device (union merge by id)
  family_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  profile_id  text not null,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists events_family_seq on public.events (family_id, seq);

alter table public.profiles enable row level security;
alter table public.events enable row level security;

drop policy if exists "family reads own profiles" on public.profiles;
create policy "family reads own profiles" on public.profiles for select using (family_id = auth.uid());
drop policy if exists "family writes own profiles" on public.profiles;
create policy "family writes own profiles" on public.profiles for insert with check (family_id = auth.uid());
drop policy if exists "family updates own profiles" on public.profiles;
create policy "family updates own profiles" on public.profiles for update using (family_id = auth.uid()) with check (family_id = auth.uid());

-- Events are append-only: no update or delete policy exists, so nobody can rewrite history.
drop policy if exists "family reads own events" on public.events;
create policy "family reads own events" on public.events for select using (family_id = auth.uid());
drop policy if exists "family appends own events" on public.events;
create policy "family appends own events" on public.events for insert with check (family_id = auth.uid());

-- Last-write-wins upsert for profiles: an older copy from an offline device never overwrites a newer one.
create or replace function public.upsert_profile(p_id text, p_data jsonb, p_updated_at bigint)
returns void
language sql
security invoker
as $$
  insert into public.profiles (id, data, updated_at)
  values (p_id, p_data, p_updated_at)
  on conflict (id) do update
    set data = excluded.data, updated_at = excluded.updated_at
    where public.profiles.updated_at < excluded.updated_at
      and public.profiles.family_id = auth.uid();
$$;

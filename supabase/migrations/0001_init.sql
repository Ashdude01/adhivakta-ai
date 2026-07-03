-- ============================================================
--  Adhivakta AI — initial schema
--  Idempotent: safe to run multiple times.
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";      -- case-insensitive email

-- updated_at helper -----------------------------------------------------------
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- USERS (auth + profile) ------------------------------------------------------
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  email          citext unique not null,
  name           text not null default 'Advocate',
  password_hash  text not null,
  role           text not null default 'advocate',
  firm_name      text,
  phone          text,
  bar_council_id text,
  avatar_url     text,
  plan           text not null default 'free',
  theme          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists trg_users_updated on public.users;
create trigger trg_users_updated before update on public.users
  for each row execute function public.set_updated_at();

-- MATTERS ---------------------------------------------------------------------
create table if not exists public.matters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  code       text not null default '',
  title      text not null,
  subtitle   text,
  court      text,
  status     text not null default 'active',
  tag        text,
  tag_class  text,
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_matters_user on public.matters(user_id);
drop trigger if exists trg_matters_updated on public.matters;
create trigger trg_matters_updated before update on public.matters
  for each row execute function public.set_updated_at();

-- DRAFTS ----------------------------------------------------------------------
create table if not exists public.drafts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  matter_id  uuid references public.matters(id) on delete set null,
  doc_type   text,
  title      text,
  body       text,
  language   text default 'English',
  provider   text,
  meta       jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_drafts_user on public.drafts(user_id);
drop trigger if exists trg_drafts_updated on public.drafts;
create trigger trg_drafts_updated before update on public.drafts
  for each row execute function public.set_updated_at();

-- LIBRARY ITEMS ---------------------------------------------------------------
create table if not exists public.library_items (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique,
  kind           text not null,                       -- 'judgment' | 'draft'
  title          text not null,
  court          text,
  citation       text,
  tags           text[] not null default '{}',
  author         text,
  outcome        text,
  excerpt        text,
  uses           int  not null default 0,
  cited          int  not null default 0,
  verified       boolean not null default false,
  contributed_by uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_library_kind on public.library_items(kind);

-- ESIGN REQUESTS --------------------------------------------------------------
create table if not exists public.esign_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  matter_id     uuid references public.matters(id) on delete set null,
  document_name text not null,
  method        text not null,                        -- manual | aadhaar | dsc | docusign
  status        text not null,                        -- signed | sent | pending | not_configured
  envelope_id   text,
  signers       jsonb,
  signature_url text,
  signed_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_esign_user on public.esign_requests(user_id);

-- REVIEW SESSIONS + CHAT MESSAGES --------------------------------------------
create table if not exists public.review_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  filename   text,
  context    text,
  created_at timestamptz not null default now()
);
create index if not exists idx_review_user on public.review_sessions(user_id);

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.review_sessions(id) on delete cascade,
  role       text not null,                           -- 'user' | 'ai'
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_session on public.chat_messages(session_id);

-- RLS: deny-by-default on every table. The app reaches Supabase ONLY with the
-- service-role key (server-side), which bypasses RLS. The publishable/anon key
-- therefore cannot read or write any of these tables.
alter table public.users          enable row level security;
alter table public.matters        enable row level security;
alter table public.drafts         enable row level security;
alter table public.library_items  enable row level security;
alter table public.esign_requests enable row level security;
alter table public.review_sessions enable row level security;
alter table public.chat_messages  enable row level security;

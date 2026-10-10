-- ============================================================
--  Adhivakta AI — highlights / notes / hyperlinks on library items
--  Idempotent: safe to run multiple times.
--
--  Feature: a logged-in user opens a judgment in the Case Library,
--  selects text, and that selection becomes a "highlight" anchored
--  to one paragraph block (library_item_blocks, added in 0007).
--  Clicking the highlight opens the sidebar, where the user can add
--  or edit one or more notes and one or more links on it.
--
--  Design decisions (confirmed with the user earlier in this project):
--   - Highlights are PRIVATE to the user who created them (not shared).
--   - A highlight may optionally be scoped to one of the user's
--     matters (matter_id nullable — "general reading" has no matter).
--   - Links are polymorphic but modelled with real FK columns + a
--     CHECK constraint (not a generic text-based polymorphic ref),
--     so referential integrity is enforced by Postgres itself.
--   - Anchoring = block_id + character offsets within that block's
--     plain text, plus the quoted text stored redundantly (quote_text)
--     so the UI can still find/display the highlight even if a future
--     re-ingest/re-chunk shifts offsets slightly.
-- ============================================================

-- HIGHLIGHTS -------------------------------------------------------------
create table if not exists public.highlights (
  id              uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references public.library_items(id) on delete cascade,
  block_id        uuid not null references public.library_item_blocks(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  matter_id       uuid references public.matters(id) on delete set null,
  start_offset    int  not null,
  end_offset      int  not null,
  quote_text      text not null,
  color           text not null default 'yellow',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_offset > start_offset)
);
create index if not exists idx_highlights_item   on public.highlights(library_item_id);
create index if not exists idx_highlights_block  on public.highlights(block_id);
create index if not exists idx_highlights_user   on public.highlights(user_id);
create index if not exists idx_highlights_matter on public.highlights(matter_id);
-- A user's highlights for one judgment, in reading order — the exact
-- access pattern the detail page needs ("give me this user's highlights
-- for this item, ordered so they line up with the blocks on screen").
create index if not exists idx_highlights_item_user on public.highlights(library_item_id, user_id);

drop trigger if exists trg_highlights_updated on public.highlights;
create trigger trg_highlights_updated before update on public.highlights
  for each row execute function public.set_updated_at();

-- HIGHLIGHT NOTES ----------------------------------------------------------
-- A highlight can carry more than one note (running commentary), each
-- independently editable.
create table if not exists public.highlight_notes (
  id           uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references public.highlights(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_hnotes_highlight on public.highlight_notes(highlight_id);

drop trigger if exists trg_hnotes_updated on public.highlight_notes;
create trigger trg_hnotes_updated before update on public.highlight_notes
  for each row execute function public.set_updated_at();

-- HIGHLIGHT LINKS ------------------------------------------------------------
-- Three kinds of hyperlink, per the earlier product decision:
--  'external'     — any outside URL (a bare law, a news article, etc.)
--  'library_item' — another judgment/draft already in this library
--  'matter'       — a matter/draft in the user's own workspace
-- Exactly one target column is filled, matching link_type; enforced below.
create table if not exists public.highlight_links (
  id                      uuid primary key default gen_random_uuid(),
  highlight_id            uuid not null references public.highlights(id) on delete cascade,
  user_id                 uuid not null references public.users(id) on delete cascade,
  link_type               text not null check (link_type in ('external', 'library_item', 'matter')),
  label                   text,
  external_url            text,
  target_library_item_id  uuid references public.library_items(id) on delete cascade,
  target_matter_id        uuid references public.matters(id) on delete cascade,
  created_at              timestamptz not null default now(),
  check (
    (link_type = 'external'     and external_url is not null and target_library_item_id is null and target_matter_id is null) or
    (link_type = 'library_item' and target_library_item_id is not null and external_url is null and target_matter_id is null) or
    (link_type = 'matter'       and target_matter_id is not null and external_url is null and target_library_item_id is null)
  )
);
create index if not exists idx_hlinks_highlight on public.highlight_links(highlight_id);
create index if not exists idx_hlinks_target_item on public.highlight_links(target_library_item_id);
create index if not exists idx_hlinks_target_matter on public.highlight_links(target_matter_id);

-- RLS: deny-by-default, same pattern as every other table in this project.
-- The app reaches Supabase only with the service-role key (server-side),
-- which bypasses RLS; ownership (user_id = current user) is enforced in
-- the API route layer instead.
alter table public.highlights      enable row level security;
alter table public.highlight_notes enable row level security;
alter table public.highlight_links enable row level security;

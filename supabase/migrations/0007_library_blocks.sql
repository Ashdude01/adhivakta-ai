-- ============================================================
--  Adhivakta AI — library full-text blocks + judgment provenance
--  Supports: paragraph-level rendering/anchoring for the upcoming
--  highlight/notes feature, and idempotent bulk ingestion from the
--  AWS Open Data (Dattam Labs) Supreme Court / High Court datasets.
--  Idempotent.
-- ============================================================

-- Provenance / cross-reference columns on library_items ----------------------
alter table public.library_items add column if not exists cnr            text;
alter table public.library_items add column if not exists source_dataset text; -- e.g. 'sc-aws-dattam', 'hc-aws-dattam'

create index if not exists idx_library_cnr on public.library_items(cnr);

-- Paragraph-level breakdown of full_text --------------------------------------
-- One row per paragraph/block, in stable order. Used to (a) render long
-- judgments without shipping the whole blob at once, and (b) give the
-- highlight/notes feature a stable anchor (block_id + char offsets) instead
-- of offsets into the whole document.
create table if not exists public.library_item_blocks (
  id              uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references public.library_items(id) on delete cascade,
  seq             int  not null,
  page_no         int,
  text            text not null,
  fts             tsvector generated always as (to_tsvector('english', text)) stored,
  created_at      timestamptz not null default now(),
  unique (library_item_id, seq)
);
create index if not exists idx_blocks_item on public.library_item_blocks(library_item_id, seq);
create index if not exists idx_blocks_fts  on public.library_item_blocks using gin(fts);

alter table public.library_item_blocks enable row level security;

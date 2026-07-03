-- ============================================================
--  Adhivakta AI — platform extensions (implementation plan v1.0)
--  Matters intake · draft versions · citations · audit/DPDP ·
--  contributions (PII pipeline) · review grounding · e-sign trail ·
--  library full-text search. Idempotent.
-- ============================================================

-- MATTERS: guided intake fields -----------------------------------------------
alter table public.matters add column if not exists matter_type text;
alter table public.matters add column if not exists parties     jsonb;
alter table public.matters add column if not exists key_dates   jsonb;
alter table public.matters add column if not exists description text;

-- DRAFTS: workspace state ------------------------------------------------------
alter table public.drafts add column if not exists status      text not null default 'draft'; -- draft | approved | exported | sent_to_sign
alter table public.drafts add column if not exists template_id text;
alter table public.drafts add column if not exists intake      jsonb;

-- DRAFT VERSIONS: full history + verifier verdict per version ------------------
create table if not exists public.draft_versions (
  id              uuid primary key default gen_random_uuid(),
  draft_id        uuid not null references public.drafts(id) on delete cascade,
  version_no      int  not null,
  content         text not null,
  source          text not null default 'ai',            -- 'ai' | 'human' | 'ai-command'
  provider        text,
  verifier_report jsonb,                                  -- { checked, passed, failed, claims: [...] }
  created_at      timestamptz not null default now(),
  unique (draft_id, version_no)
);
create index if not exists idx_draft_versions_draft on public.draft_versions(draft_id);

-- CITATIONS: every claim→source link -------------------------------------------
create table if not exists public.citations (
  id               uuid primary key default gen_random_uuid(),
  draft_version_id uuid references public.draft_versions(id) on delete cascade,
  chat_message_id  uuid references public.chat_messages(id) on delete cascade,
  library_item_id  uuid references public.library_items(id) on delete set null,
  claim_text       text not null,
  source_kind      text not null default 'unknown',       -- 'statute' | 'judgment' | 'draft' | 'unknown'
  verified         boolean not null default false,
  verify_url       text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_citations_version on public.citations(draft_version_id);

-- AUDIT LOGS: append-only ------------------------------------------------------
create table if not exists public.audit_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references public.users(id) on delete set null,
  action    text not null,                                -- login | draft.create | draft.export | draft.override | esign.send | ...
  entity    text,
  entity_id text,
  ip        text,
  meta      jsonb,
  at        timestamptz not null default now()
);
create index if not exists idx_audit_user on public.audit_logs(user_id, at desc);

-- enforce append-only even for the service role (trigger, not grants,
-- because the service role bypasses grants/RLS)
create or replace function public.reject_mutation() returns trigger as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$ language plpgsql;
drop trigger if exists trg_audit_append_only on public.audit_logs;
create trigger trg_audit_append_only
  before update or delete on public.audit_logs
  for each row execute function public.reject_mutation();

-- CONSENTS: DPDP consent ledger (append-only rows; revocation = new row) --------
create table if not exists public.consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  purpose    text not null,                               -- 'account' | 'contribution' | ...
  granted    boolean not null default true,
  version    text not null default 'v1',
  created_at timestamptz not null default now()
);
create index if not exists idx_consents_user on public.consents(user_id);

-- CONTRIBUTIONS: community-draft pipeline (the moat) ----------------------------
create table if not exists public.contributions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  draft_id         uuid references public.drafts(id) on delete set null,
  title            text not null,
  raw_text         text not null,
  anonymised_text  text not null,
  pii_report       jsonb,                                 -- [{ kind, original, replacement }]
  status           text not null default 'pending',       -- pending | approved | rejected
  moderator_note   text,
  library_item_id  uuid references public.library_items(id) on delete set null,
  court            text,
  tags             text[] not null default '{}',
  outcome          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_contributions_user on public.contributions(user_id);
create index if not exists idx_contributions_status on public.contributions(status);
drop trigger if exists trg_contributions_updated on public.contributions;
create trigger trg_contributions_updated before update on public.contributions
  for each row execute function public.set_updated_at();

-- CREDIT LEDGER: contributor credits & usage debits (append-only) ---------------
create table if not exists public.credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  delta      int  not null,
  reason     text not null,
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_credit_user on public.credit_ledger(user_id);

-- REVIEW: matter linkage + document chunks for grounded chat --------------------
alter table public.review_sessions add column if not exists matter_id uuid references public.matters(id) on delete set null;
alter table public.review_sessions add column if not exists summary   text;
alter table public.review_sessions add column if not exists meta      jsonb;

create table if not exists public.review_chunks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.review_sessions(id) on delete cascade,
  seq        int  not null,                               -- chunk order ≈ "page"
  text       text not null,
  fts        tsvector generated always as (to_tsvector('english', text)) stored,
  created_at timestamptz not null default now()
);
create index if not exists idx_review_chunks_session on public.review_chunks(session_id, seq);
create index if not exists idx_review_chunks_fts on public.review_chunks using gin(fts);

alter table public.chat_messages add column if not exists citations jsonb;   -- [{ seq, quote }]

-- E-SIGN: eligibility artefact + raw event trail --------------------------------
alter table public.esign_requests add column if not exists eligibility_report jsonb;

create table if not exists public.esign_events (
  id               uuid primary key default gen_random_uuid(),
  esign_request_id uuid not null references public.esign_requests(id) on delete cascade,
  event            text not null,
  payload          jsonb,
  at               timestamptz not null default now()
);
create index if not exists idx_esign_events_req on public.esign_events(esign_request_id, at);

-- LIBRARY: verify links + full text + FTS ---------------------------------------
alter table public.library_items add column if not exists source_url text;
alter table public.library_items add column if not exists sections   text[] not null default '{}';
alter table public.library_items add column if not exists year       int;
alter table public.library_items add column if not exists full_text  text;

-- generated tsvector over title + citation + excerpt + full_text
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'library_items' and column_name = 'fts'
  ) then
    alter table public.library_items add column fts tsvector generated always as (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(citation, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(full_text, '')), 'C')
    ) stored;
  end if;
end $$;
create index if not exists idx_library_fts on public.library_items using gin(fts);

-- RLS on new tables (deny-by-default; app uses service role server-side) --------
alter table public.draft_versions enable row level security;
alter table public.citations      enable row level security;
alter table public.audit_logs     enable row level security;
alter table public.consents       enable row level security;
alter table public.contributions  enable row level security;
alter table public.credit_ledger  enable row level security;
alter table public.review_chunks  enable row level security;
alter table public.esign_events   enable row level security;

-- SEED: verify links + years on the existing s.138 corpus (idempotent) ----------
-- search-form deep links (always resolvable; swapped for canonical doc URLs
-- once the Indian Kanoon API token is configured)
update public.library_items set
  source_url = 'https://indiankanoon.org/search/?formInput=Dashrath+Rupsingh+Rathod+v.+State+of+Maharashtra', year = 2014
  where slug = 'j1' and source_url is null;
update public.library_items set
  source_url = 'https://indiankanoon.org/search/?formInput=MSR+Leathers+v.+S.+Palaniappan', year = 2012
  where slug = 'j2' and source_url is null;
update public.library_items set
  source_url = 'https://indiankanoon.org/search/?formInput=Yogendra+Pratap+Singh+v.+Savitri+Pandey', year = 2014
  where slug = 'j3' and source_url is null;
update public.library_items set
  source_url = 'https://indiankanoon.org/search/?formInput=Kusum+Ingots+%26+Alloys+Ltd+v.+Pennar+Peterson', year = 2000
  where slug = 'j4' and source_url is null;
update public.library_items set sections = array['138','142']
  where slug in ('j1','j2','j3','j4') and cardinality(sections) = 0;

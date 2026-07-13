-- ============================================================
--  Adhivakta AI — Module 1: Matter as the base entity
--
--  Why: every downstream module (drafting, review, e-sign) needs the same
--  party + case facts. Before this migration those lived in a `parties` jsonb
--  blob ({client, opposite} — two bare strings) and an untyped `key_dates`
--  map, so nothing could be reused, searched, or conflict-checked.
--
--  Party detail here mirrors what an Indian cause title / memo of parties
--  actually requires (Order VII r.1 CPC: name, description, place of
--  residence; minor / unsound-mind declared) and what the eCourts e-filing
--  litigant form collects.
--
--  Idempotent: safe to run multiple times.
-- ============================================================

create extension if not exists "pg_trgm";   -- fuzzy name match for conflict check

-- CONTACTS --------------------------------------------------------------------
-- A person or organisation the advocate deals with. Lives independently of any
-- matter so the same client can be reused across matters and so an opposite
-- party's name can be matched during a conflict check.
create table if not exists public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,

  entity_type        text not null default 'individual',
    -- individual | company | partnership | proprietorship | huf | trust | society | government
  salutation         text,
  full_name          text not null,
  aka_names          text[] not null default '{}',   -- maiden / former / trading names

  -- cause-title "description" (Order VII r.1(b)/(c) CPC)
  age                int,
  gender             text,                            -- male | female | other
  relation_type      text,                            -- s/o | d/o | w/o | h/o | c/o
  relation_name      text,                            -- father / husband / guardian name
  occupation         text,

  -- place of residence
  address_line       text,
  village_town       text,
  taluka             text,
  district           text,
  state              text,
  pincode            text,
  country            text not null default 'India',

  mobile             text,
  email              text,

  -- identifiers. Aadhaar is NEVER stored in full (DPDP data minimisation);
  -- only the last four digits, for matching an already-known document.
  pan                text,
  aadhaar_last4      text,

  -- Order VII r.1(d) CPC — a minor / person of unsound mind must be declared
  -- and sues or is sued through a next friend or guardian.
  is_minor           boolean not null default false,
  is_unsound_mind    boolean not null default false,
  guardian_contact_id uuid references public.contacts(id) on delete set null,

  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint contacts_age_sane check (age is null or (age > 0 and age < 130)),
  constraint contacts_pincode_fmt check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  constraint contacts_aadhaar_last4_fmt check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$')
);
create index if not exists idx_contacts_user on public.contacts(user_id);
-- conflict check: fuzzy match on the primary name…
create index if not exists idx_contacts_name_trgm
  on public.contacts using gin (lower(full_name) gin_trgm_ops);
-- …and exact match on any alias
create index if not exists idx_contacts_aka on public.contacts using gin (aka_names);
drop trigger if exists trg_contacts_updated on public.contacts;
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();

-- MATTER PARTIES --------------------------------------------------------------
-- Join between a matter and the contacts appearing in it. A matter can have any
-- number of parties on each side; `party_no` fixes their order in the cause
-- title ("Petitioner No. 2").
create table if not exists public.matter_parties (
  id                 uuid primary key default gen_random_uuid(),
  matter_id          uuid not null references public.matters(id) on delete cascade,
  contact_id         uuid not null references public.contacts(id) on delete cascade,

  role               text not null,
    -- petitioner | respondent | plaintiff | defendant | complainant | accused
    -- | appellant | applicant | opposite_party | claimant | third_party
  side               text not null default 'other',   -- client | opposite | other
  party_no           int  not null default 1,

  advocate_name      text,
  address_for_service text,                            -- Order VI r.14A CPC

  created_at         timestamptz not null default now(),

  unique (matter_id, contact_id, role),
  constraint matter_parties_side check (side in ('client', 'opposite', 'other'))
);
create index if not exists idx_matter_parties_matter on public.matter_parties(matter_id, side, party_no);
create index if not exists idx_matter_parties_contact on public.matter_parties(contact_id);

-- MATTERS: the fields a matter actually needs -----------------------------------
alter table public.matters add column if not exists matter_type_code text;   -- stable key into the type registry
alter table public.matters add column if not exists practice_area    text;
alter table public.matters add column if not exists client_ref       text;   -- firm's internal reference

-- case substance
alter table public.matters add column if not exists facts         jsonb not null default '{}'::jsonb;
alter table public.matters add column if not exists relief_sought text;
alter table public.matters add column if not exists suit_value    numeric(14,2);

-- where it is / will be filed
alter table public.matters add column if not exists court_complex text;
alter table public.matters add column if not exists district      text;
alter table public.matters add column if not exists state         text;

-- filing & tracking (usually filled after the matter is opened)
alter table public.matters add column if not exists cnr           text;      -- 16-char Case Number Record
alter table public.matters add column if not exists case_type     text;
alter table public.matters add column if not exists case_number   text;
alter table public.matters add column if not exists case_year     int;
alter table public.matters add column if not exists filing_number text;
alter table public.matters add column if not exists act           text;
alter table public.matters add column if not exists section       text;
alter table public.matters add column if not exists filed_on          date;
alter table public.matters add column if not exists next_hearing_date date;
alter table public.matters add column if not exists opened_on         date not null default current_date;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'matters_cnr_fmt') then
    alter table public.matters add constraint matters_cnr_fmt
      check (cnr is null or cnr ~ '^[A-Za-z]{4}[0-9]{12}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matters_case_year_sane') then
    alter table public.matters add constraint matters_case_year_sane
      check (case_year is null or (case_year between 1900 and 2200));
  end if;
end $$;

create index if not exists idx_matters_cnr on public.matters(cnr) where cnr is not null;
create index if not exists idx_matters_next_hearing on public.matters(user_id, next_hearing_date)
  where next_hearing_date is not null;

-- DEPRECATED, kept only so old rows still read. Nothing writes these any more:
--   matters.parties    -> public.matter_parties + public.contacts
--   matters.key_dates  -> public.matters.facts (typed per matter_type_code)
comment on column public.matters.parties   is 'DEPRECATED — superseded by matter_parties. Read-only for legacy rows.';
comment on column public.matters.key_dates is 'DEPRECATED — superseded by matters.facts. Read-only for legacy rows.';

-- DPDP: client PII now lives in `contacts`, which is a distinct processing
-- purpose from the existing 'account' / 'contribution' consents.
comment on table public.contacts is
  'Personal data of clients and opposite parties. DPDP purpose: ''client_data''. Aadhaar stored as last-4 only.';

-- RLS: deny-by-default, same as every other table. The app reaches Supabase
-- only with the service-role key (server-side), which bypasses RLS.
alter table public.contacts       enable row level security;
alter table public.matter_parties enable row level security;

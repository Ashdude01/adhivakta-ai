-- ============================================================
--  Adhivakta AI — advocate letterhead / profile
--
--  A legal notice is only valid over an advocate's own letterhead: name,
--  office address, contact, and — critically — the Bar Council enrolment
--  number, without which the notice carries no professional authority. These
--  columns hold that letterhead so every notice and pleading is signed off with
--  the same, correct particulars instead of being retyped (or guessed by the AI).
--
--  Idempotent: safe to run multiple times.
-- ============================================================

alter table public.users add column if not exists designation   text not null default 'Advocate';
alter table public.users add column if not exists enrolment_no   text;   -- Bar Council enrolment number, e.g. D/1234/2015
alter table public.users add column if not exists bar_council    text;   -- e.g. Bar Council of Delhi
alter table public.users add column if not exists office_address text;   -- chamber address (may be multi-line)
alter table public.users add column if not exists city           text;
alter table public.users add column if not exists state          text;
alter table public.users add column if not exists pincode        text;
alter table public.users add column if not exists alt_phone      text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_pincode_fmt') then
    alter table public.users add constraint users_pincode_fmt
      check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');
  end if;
end $$;

-- The old bar_council_id column is kept for back-compat; enrolment_no supersedes
-- it. Carry any existing value across so no one loses data on upgrade.
update public.users
  set enrolment_no = bar_council_id
  where enrolment_no is null and bar_council_id is not null and bar_council_id <> '';

comment on column public.users.bar_council_id is 'DEPRECATED — superseded by enrolment_no.';

-- ============================================================
--  Adhivakta AI — supporting documents on a matter
--
--  Files live in private Supabase Storage; this table is the index. Nothing is
--  served from a public URL: reads go through a short-lived signed URL minted
--  server-side after the row's owner has been checked. These are cheque copies,
--  vakalatnamas and ID proofs — a public bucket would publish a client's
--  Aadhaar to anyone who guessed the path.
--
--  Idempotent: safe to run multiple times.
-- ============================================================

create table if not exists public.matter_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  matter_id    uuid not null references public.matters(id) on delete cascade,

  -- Object key inside the private bucket. Unique so a delete can never orphan
  -- a file, nor two rows point at one object.
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,

  kind         text not null default 'other',
    -- evidence | vakalatnama | court_order | correspondence | id_proof
    -- | agreement | invoice | other
  description  text,

  uploaded_at  timestamptz not null default now(),

  constraint matter_documents_size_sane check (size_bytes is null or size_bytes >= 0)
);
create index if not exists idx_matter_documents_matter on public.matter_documents(matter_id, uploaded_at desc);
create index if not exists idx_matter_documents_user on public.matter_documents(user_id);

comment on table public.matter_documents is
  'Index of files in the private storage bucket. DPDP purpose: ''client_data''.';

alter table public.matter_documents enable row level security;

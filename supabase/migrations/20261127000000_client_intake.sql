-- Client Intake (src/lib/server/clientProjectStore.ts, src/lib/server/clientProjects/intake.ts): every client item on
-- a Client Projects board can carry a REQUEST (a form schema and a lifecycle), and every form the client submits is
-- kept as an immutable, versioned SUBMISSION (the dispute record: what was sent, by whom, and when).
--
-- ADDITIVE ONLY and safe to run more than once ("if not exists" everywhere; the one constraint swap drops and
-- re-adds the same rule). Nothing existing is dropped, renamed or retyped, so the current code keeps working while
-- this is applied. Run it BEFORE deploying the Client Intake code (it writes these tables).
--
-- Same access model as the Client Projects tables: RLS on with no policies and no grants to anon/authenticated,
-- so only the app server (service-role key) can read or write.

-- ---------------------------------------------------------------- requests (one per card)
-- kind:        form | dns | keys | signature | payment | uat
-- schema:      the form (JSON, see src/lib/clientProjects/intake.ts IntakeSchema) or null for a card with no form part
-- form_status: open | draft | submitted | changes_requested | accepted   (null when there is no form part)
-- sys_status:  the kind's own part (DNS check, key test, envelope, payment), null for a pure form
-- draft:       the client's saved draft answers (explicit "Save draft" only; never autosaved)
-- files:       the working set of uploaded files (refs to cp_files rows: id, name, size, mime, sha256, field)
-- config:      owner settings (envelope link, sending domain and records, required providers)
-- state:       check results, envelope state, payment state, the owner's "changes requested" note
-- rev:         optimistic concurrency (every write must name the rev it read)
create table if not exists public.cp_requests (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.cp_projects(id) on delete cascade,
  task_id      uuid not null references public.cp_tasks(id) on delete cascade,
  kind         text not null check (kind in ('form','dns','keys','signature','payment','uat')),
  template_key text not null default '' check (char_length(template_key) <= 40),
  schema       jsonb,
  form_status  text check (form_status is null or form_status in ('open','draft','submitted','changes_requested','accepted')),
  sys_status   text check (sys_status is null or sys_status in ('open','partial','verified','sent','signed','concern','completed','deemed','awaiting','client_says_paid','received','running')),
  draft        jsonb not null default '{}'::jsonb,
  draft_at     timestamptz,
  draft_by     text not null default '' check (char_length(draft_by) <= 200),
  files        jsonb not null default '[]'::jsonb,
  config       jsonb not null default '{}'::jsonb,
  state        jsonb not null default '{}'::jsonb,
  version      integer not null default 0 check (version >= 0),
  rev          integer not null default 0 check (rev >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists cp_requests_task_uidx on public.cp_requests (task_id);
create index if not exists cp_requests_project_idx on public.cp_requests (project_id);
alter table public.cp_requests enable row level security;

-- ---------------------------------------------------------------- submissions (versioned, immutable answers)
-- actor: 'client:<name>' (self-identified via the shared link). files: the refs as they were at submit time, each
-- with its sha256. Only the review fields (status, review_note, reviewed_by, reviewed_at, applied) ever change:
-- the trigger below refuses any change to what was submitted.
create table if not exists public.cp_submissions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.cp_projects(id) on delete cascade,
  request_id   uuid not null references public.cp_requests(id) on delete cascade,
  task_id      uuid not null,
  version      integer not null check (version >= 1),
  answers      jsonb not null default '{}'::jsonb,
  files        jsonb not null default '[]'::jsonb,
  actor        text not null check (char_length(actor) <= 200),
  submitted_at timestamptz not null default now(),
  status       text not null default 'submitted' check (status in ('submitted','accepted','changes_requested','superseded')),
  review_note  text not null default '' check (char_length(review_note) <= 2000),
  reviewed_by  text check (reviewed_by is null or char_length(reviewed_by) <= 200),
  reviewed_at  timestamptz,
  applied      jsonb not null default '[]'::jsonb
);
create unique index if not exists cp_submissions_version_uidx on public.cp_submissions (request_id, version);
create index if not exists cp_submissions_project_idx on public.cp_submissions (project_id, submitted_at desc);
alter table public.cp_submissions enable row level security;

create or replace function public.cp_submissions_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.answers is distinct from old.answers
     or new.files is distinct from old.files
     or new.version is distinct from old.version
     or new.actor is distinct from old.actor
     or new.submitted_at is distinct from old.submitted_at
     or new.request_id is distinct from old.request_id
     or new.project_id is distinct from old.project_id
     or new.task_id is distinct from old.task_id then
    raise exception 'cp_submissions: what was submitted (answers, files, version, actor, time) cannot be changed';
  end if;
  return new;
end;
$$;
drop trigger if exists cp_submissions_immutable on public.cp_submissions;
create trigger cp_submissions_immutable before update on public.cp_submissions
  for each row execute function public.cp_submissions_immutable();

-- ---------------------------------------------------------------- files: the intake upload types
-- Client uploads are cp_files rows with source = 'intake' and task_id = the card (bytes stay in this table, never a
-- public bucket). The allowed types widen from PDF/PNG/JPEG to the intake allow-list. Every type is decided from the
-- file's own bytes and structure on upload; SVG (logos only) is stored sanitised.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.cp_files'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%mime%'
  loop
    execute format('alter table public.cp_files drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.cp_files add constraint cp_files_mime_check check (mime in (
  'application/pdf','image/png','image/jpeg','image/svg+xml','text/csv','text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
create index if not exists cp_files_intake_idx on public.cp_files (project_id, source) where source = 'intake';

-- ---------------------------------------------------------------- workspace key tests (status only, never a key)
-- Written by POST /api/byok/validate when a workspace admin runs "Test connection" in their own workspace. Holds the
-- pass/fail and when, nothing else: no key, no key hash, no provider message. Client Projects reads it to show
-- "test passed" on the provider-keys card.
create table if not exists public.tenant_key_checks (
  tenant_code  text not null check (tenant_code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  provider     text not null check (provider in ('claude','openai','gemini','elevenlabs','resend')),
  ok           boolean not null,
  checked_at   timestamptz not null default now(),
  checked_by   text not null default '' check (char_length(checked_by) <= 254),
  primary key (tenant_code, provider)
);
alter table public.tenant_key_checks enable row level security;

-- Defence in depth (harmless if already revoked).
revoke all on public.cp_requests, public.cp_submissions, public.tenant_key_checks from anon, authenticated;
revoke all on function public.cp_submissions_immutable() from public, anon, authenticated;

-- Client Projects: the platform owner's client-onboarding board (src/lib/server/clientProjectStore.ts).
-- Projects, their cards (tasks, milestones, client items, UAT defects), an append-only event log,
-- comments, the uploaded signed PDFs and the AI planner's draft runs.
-- Read and written only by the app server with the service-role key: RLS on, no policies, so the
-- anon/public keys can never read them. PDFs live in a bytea table (never a public bucket) and no
-- route serves them to the shared client board. Safe to run more than once.

create table if not exists public.cp_projects (
  id                    uuid primary key default gen_random_uuid(),
  -- issue-key prefix (cards are KEY-1, KEY-2 ...) and the last number handed out
  key                   text not null check (key ~ '^[A-Z]{2,5}$'),
  task_seq              integer not null default 0 check (task_seq >= 0),
  client_name           text not null check (char_length(client_name) between 1 and 120),
  title                 text not null check (char_length(title) between 1 and 200),
  status                text not null default 'draft' check (status in ('draft','active','done','archived')),
  kickoff_date          date not null,
  target_go_live        date,
  summary_client        text not null default '' check (char_length(summary_client) <= 2000),
  briefing_internal     text not null default '' check (char_length(briefing_internal) <= 6000),
  -- { keyDates[], fees[], risks[] } from the approved AI plan (owner only)
  plan_meta             jsonb,
  -- the owner-approved progress note shown on the client board
  client_update         text not null default '' check (char_length(client_update) <= 2000),
  client_update_at      timestamptz,
  -- latest drafted status texts (owner only): { clientUpdate, deliveryReport, readinessNotice, ai, at }
  status_draft          jsonb,
  -- UAT defect form on the client board: null = automatic from the schedule, true/false = owner override
  uat_override          boolean,
  -- automations: where client reminders go, and per-rule on/off ({ rule: boolean }; missing = default)
  client_contact_email  text not null default '' check (char_length(client_contact_email) <= 254),
  automations           jsonb not null default '{}'::jsonb,
  -- sha256(token) for lookups; the token itself is only kept sealed (AES-GCM) for the owner's "Copy link"
  token_hash            text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  token_sealed          text,
  share_enabled         boolean not null default false,
  created_by            text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists cp_projects_created_idx on public.cp_projects (created_at desc);
alter table public.cp_projects enable row level security;

create table if not exists public.cp_tasks (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.cp_projects(id) on delete cascade,
  num                   integer not null check (num >= 1),
  type                  text not null default 'task' check (type in ('task','milestone','client_item','defect')),
  phase                 text not null check (phase in ('before_kickoff','week_1','week_2','week_3','after_go_live')),
  title                 text not null check (char_length(title) between 1 and 200),
  description_client    text not null default '' check (char_length(description_client) <= 2000),
  notes_internal        text not null default '' check (char_length(notes_internal) <= 4000),
  owner_side            text not null default 'us' check (owner_side in ('us','client')),
  status                text not null default 'todo' check (status in ('todo','in_progress','blocked','done')),
  due_date              date,
  due_offset_bd         integer check (due_offset_bd is null or due_offset_bd between -30 and 260),
  -- contract deliverable 01-11 (the "epic"), or ''
  deliverable_ref       text not null default '' check (deliverable_ref = '' or deliverable_ref ~ '^(0[1-9]|1[01])$'),
  client_visible        boolean not null default true,
  evidence              jsonb not null default '[]'::jsonb,
  sort                  integer not null default 0,
  source                text not null default 'manual' check (source in ('sop','ai','manual','client')),
  source_ref            text not null default '' check (char_length(source_ref) <= 400),
  sop_key               text check (sop_key is null or char_length(sop_key) <= 60),
  blocked_by            uuid references public.cp_tasks(id) on delete set null,
  -- milestones: may the "Phase finished" automation mark it Done? false for external or legal acts (default)
  auto_complete         boolean not null default false,
  -- client-owned cards: may the client tick it Done themselves on the shared board? Only ordinary dependency
  -- items. For signatures, payments and acceptances it stays false: the client can only say "I've done this"
  -- (client_claimed_*), and the owner confirms.
  client_may_tick       boolean not null default false,
  client_claimed_at     timestamptz,
  client_claimed_by     text not null default '' check (char_length(client_claimed_by) <= 120),
  -- defects (UAT, Annex A)
  severity              text check (severity is null or severity in ('S1','S2','S3','S4')),
  reported_by           text not null default '' check (char_length(reported_by) <= 120),
  reported_by_client    boolean not null default false,
  reported_at           timestamptz,
  steps                 text not null default '' check (char_length(steps) <= 3000),
  retest_confirmed      boolean not null default false,
  done_at               timestamptz,
  done_by               text check (done_by is null or char_length(done_by) <= 200),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (project_id, num)
);
alter table public.cp_tasks add column if not exists auto_complete boolean not null default false;
alter table public.cp_tasks add column if not exists client_may_tick boolean not null default false;
alter table public.cp_tasks add column if not exists client_claimed_at timestamptz;
alter table public.cp_tasks add column if not exists client_claimed_by text not null default '';
create index if not exists cp_tasks_project_idx on public.cp_tasks (project_id, sort);
alter table public.cp_tasks enable row level security;

-- Append-only history. dedupe_key makes "do this once" records idempotent: the row is inserted FIRST as a
-- claim (the unique index decides the winner), the email is sent only by the winner, and the outcome is then
-- written onto that same row. That outcome update is the only update the app makes to this table.
create table if not exists public.cp_events (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.cp_projects(id) on delete cascade,
  task_id      uuid,
  actor        text not null check (char_length(actor) <= 200),
  type         text not null check (char_length(type) between 1 and 40),
  detail       jsonb not null default '{}'::jsonb,
  dedupe_key   text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  at           timestamptz not null default now()
);
create index if not exists cp_events_project_idx on public.cp_events (project_id, at);
create index if not exists cp_events_task_idx on public.cp_events (project_id, task_id, at) where task_id is not null;
create index if not exists cp_events_type_idx on public.cp_events (project_id, type, at);
create unique index if not exists cp_events_dedupe_idx on public.cp_events (project_id, dedupe_key) where dedupe_key is not null;
alter table public.cp_events enable row level security;

create table if not exists public.cp_comments (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.cp_projects(id) on delete cascade,
  task_id        uuid not null references public.cp_tasks(id) on delete cascade,
  author         text not null check (char_length(author) <= 200),
  body           text not null check (char_length(body) between 1 and 2000),
  client_visible boolean not null default false,
  at             timestamptz not null default now()
);
create index if not exists cp_comments_project_idx on public.cp_comments (project_id, at);
create index if not exists cp_comments_task_idx on public.cp_comments (project_id, task_id, at);
alter table public.cp_comments enable row level security;

create table if not exists public.cp_files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.cp_projects(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 200),
  bytes        bytea not null,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size         integer not null check (size between 1 and 15728640),
  pages        integer not null default 0,
  -- 'upload' or 'agreement:<envelopeId>'
  source       text not null default 'upload' check (char_length(source) <= 80),
  created_at   timestamptz not null default now()
);
create index if not exists cp_files_project_idx on public.cp_files (project_id, created_at);
alter table public.cp_files enable row level security;

create table if not exists public.cp_ai_runs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.cp_projects(id) on delete cascade,
  status       text not null check (status in ('running','draft','approved','discarded','failed')),
  model        text not null default '',
  proposal     jsonb,
  error        text,
  file_ids     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists cp_ai_runs_project_idx on public.cp_ai_runs (project_id, created_at desc);
alter table public.cp_ai_runs enable row level security;

-- Reserve issue numbers atomically; returns the last number reserved.
create or replace function public.cp_next_task_num(p_project uuid, p_count integer)
returns integer
language sql
security invoker
set search_path = public
as $$
  update public.cp_projects
     set task_seq = task_seq + greatest(p_count, 1)
   where id = p_project
  returning task_seq;
$$;

-- Defence in depth: the browser keys get no privileges at all (RLS already denies every row).
revoke all on public.cp_projects, public.cp_tasks, public.cp_events, public.cp_comments,
              public.cp_files, public.cp_ai_runs from anon, authenticated;
revoke all on function public.cp_next_task_num(uuid, integer) from public, anon, authenticated;
grant execute on function public.cp_next_task_num(uuid, integer) to service_role;

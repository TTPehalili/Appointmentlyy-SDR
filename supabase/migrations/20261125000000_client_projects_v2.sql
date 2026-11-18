-- Client Projects v2 (src/lib/server/clientProjectStore.ts): people and assignment, priority, labels,
-- start date, checklist, many dependencies, estimate, card attachments, the owner's inbox marker and
-- the AI planner's staged progress.
--
-- ADDITIVE ONLY: new columns with defaults and two indexes. Nothing is dropped, renamed or retyped, so
-- the v1 code keeps working while this is applied. Safe to run more than once ("if not exists"
-- everywhere; the one UPDATE only touches rows it has not touched yet).
-- Run it BEFORE deploying the v2 code: v2 writes these columns. (If it is late, v2 still lists documents
-- with the v1 columns and reports "run the v2 migration" on any write that needs a v2 column.)
--
-- Same access model as v1: RLS on with no policies and no grants to anon/authenticated, so only the
-- app server (service-role key) can read or write. New columns inherit that from their tables.

-- ---------------------------------------------------------------- projects
-- people:  [{ id, name, email, side: 'us'|'client', role, createdAt }]   (owner only; the client board gets client-side NAMES only)
-- labels:  [{ id, name, color: red|amber|green|teal|blue|violet|slate }] (at most 12, enforced by the app)
-- settings: { wip: { todo?, in_progress?, blocked?, done? }, peopleSeeded? }
alter table public.cp_projects add column if not exists people        jsonb not null default '[]'::jsonb;
alter table public.cp_projects add column if not exists labels        jsonb not null default '[]'::jsonb;
alter table public.cp_projects add column if not exists settings      jsonb not null default '{}'::jsonb;
-- the owner's notifications inbox was last marked read at this time
alter table public.cp_projects add column if not exists notif_seen_at timestamptz;

-- ---------------------------------------------------------------- cards
-- assignee_id / watchers / label_ids hold ids from cp_projects.people / .labels (JSON, so no foreign key:
-- the app validates every id against the project on write and ignores unknown ids on read).
alter table public.cp_tasks add column if not exists assignee_id    uuid;
alter table public.cp_tasks add column if not exists watchers       jsonb not null default '[]'::jsonb;
alter table public.cp_tasks add column if not exists priority       text check (priority is null or priority in ('low','medium','high','urgent'));
alter table public.cp_tasks add column if not exists label_ids      jsonb not null default '[]'::jsonb;
alter table public.cp_tasks add column if not exists start_date     date;
-- checklist: [{ id, text, done }]
alter table public.cp_tasks add column if not exists checklist      jsonb not null default '[]'::jsonb;
-- blockers: every card this one waits on (ids of cards in the same project). v1's blocked_by stays and
-- always holds the first of them, so v1 readers and the foreign key keep working.
alter table public.cp_tasks add column if not exists blockers       jsonb not null default '[]'::jsonb;
alter table public.cp_tasks add column if not exists estimate_hours numeric(7,2) check (estimate_hours is null or estimate_hours between 0 and 2000);
create index if not exists cp_tasks_assignee_idx on public.cp_tasks (project_id, assignee_id) where assignee_id is not null;

-- Carry v1's single dependency into the new list (only rows not converted yet).
update public.cp_tasks
   set blockers = jsonb_build_array(blocked_by::text)
 where blocked_by is not null
   and blockers = '[]'::jsonb;

-- ---------------------------------------------------------------- files
-- A row with task_id set is a CARD ATTACHMENT (PDF, PNG or JPG); task_id null is a planner document (v1).
-- client_visible is false unless the owner turns it on per file; only then can the shared board's token
-- route serve it. Bytes stay in this table (never a public bucket).
alter table public.cp_files add column if not exists task_id        uuid references public.cp_tasks(id) on delete cascade;
alter table public.cp_files add column if not exists client_visible boolean not null default false;
alter table public.cp_files add column if not exists mime           text not null default 'application/pdf' check (mime in ('application/pdf','image/png','image/jpeg'));
create index if not exists cp_files_task_idx on public.cp_files (task_id) where task_id is not null;

-- ---------------------------------------------------------------- AI runs
-- progress: { stage, filesTotal, filesRead, pagesTotal, pagesRead, milestonesFound, sopMatched,
--             cardsDrafted, peopleFound, attempt, log: [{ stage, at }] }
alter table public.cp_ai_runs add column if not exists progress     jsonb;

-- ---------------------------------------------------------------- deletions (audit tombstones)
-- One row per permanently deleted project, written BEFORE the delete. No content: the key, the client
-- name, who deleted it, when, and how many cards it had. Not linked to cp_projects (the row is gone).
create table if not exists public.cp_deletions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  key          text not null check (char_length(key) <= 5),
  client_name  text not null check (char_length(client_name) <= 120),
  deleted_at   timestamptz not null default now(),
  deleted_by   text not null check (char_length(deleted_by) <= 200),
  card_count   integer not null default 0 check (card_count >= 0)
);
create index if not exists cp_deletions_at_idx on public.cp_deletions (deleted_at desc);
alter table public.cp_deletions enable row level security;

-- ---------------------------------------------------------------- performance
-- Automation firings per rule in ONE grouped query (v1 asked once per rule).
create or replace function public.cp_automation_counts(p_project uuid)
returns table (rule text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select detail->>'rule' as rule, count(*) as n
    from public.cp_events
   where project_id = p_project and type = 'automation'
   group by detail->>'rule';
$$;
-- The newest event per project ("changed since" polling) and the comment counts per card use these.
create index if not exists cp_events_project_at_id_idx on public.cp_events (project_id, at desc, id desc);
create index if not exists cp_comments_task_count_idx on public.cp_comments (project_id, task_id);

-- Defence in depth, repeated from v1 (harmless if already revoked).
revoke all on public.cp_projects, public.cp_tasks, public.cp_events, public.cp_comments,
              public.cp_files, public.cp_ai_runs, public.cp_deletions from anon, authenticated;
revoke all on function public.cp_automation_counts(uuid) from public, anon, authenticated;
grant execute on function public.cp_automation_counts(uuid) to service_role;

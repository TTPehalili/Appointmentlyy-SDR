-- Support step 2: AI triage, how-to auto answers, SLA updates and release-linked resolution replies
-- (src/lib/server/supportAutomation.ts, src/lib/server/supportAi.ts, src/lib/server/supportTickets.ts).
--
-- ADDITIVE ONLY and safe to run more than once ("if not exists" everywhere; the revokes are harmless if already done).
-- Nothing existing is dropped, renamed or retyped. Run it AFTER 20261130000000_support_tickets.sql.
-- Until it runs, "Report a problem" keeps working exactly as before (step 1): tickets are filed, emailed and alerted;
-- only the automation is idle (it logs that its columns are missing and does nothing).
--
-- Tickets that already exist get triage_state 'none' (never triaged, never auto-emailed); tickets filed after this
-- runs get 'pending' (the column default is switched after the column is added).
--
-- Read and written only by the app server with the service-role key, like the step-1 tables: RLS on, no policies,
-- no grants to anon/authenticated. The AI triage (triage jsonb: engineering brief, drafts, duplicate link) is shown to
-- Appointmentlyy staff only; a workspace sees only type, severity and the SLA target (src/lib/server/ticketScope.ts).
--
-- support_tickets, new columns
--   triage_state / triage_claimed_at / triage_attempts: the AI step (none, pending, running, done, failed, skipped),
--                    claimed with one conditional UPDATE so two servers never triage the same ticket twice
--   triage:          the checked AI result (type, severity, area, confidence, summary, reply draft, how-to answer with
--                    help-article citations, engineering brief) plus a duplicate link found by text similarity
--   severity / sla_due_at: Critical 1 hour, High 4 hours, Normal 1 business day
--   sla_breach_at:   set once when the "needs more time" update went out (the claim: "where sla_breach_at is null")
--   working_email_at / auto_answer_at: set once when that email went out (same once-only claim)
--   fix_*:           "Fix ready" with the release commit, the resolution reply, and the send state
--                    (fix_ready -> sending -> sent; "sending" is claimed with one conditional UPDATE)
-- support_settings: one row (id = 1): AI triage on/off, auto emails on/off, daily AI cap (null = server default)
-- support_ai_calls: one row per support AI call, for the durable daily cap (kept small; old rows may be deleted)

alter table public.support_tickets add column if not exists triage_state text not null default 'none';
alter table public.support_tickets alter column triage_state set default 'pending';
alter table public.support_tickets add column if not exists triage jsonb not null default '{}'::jsonb;
alter table public.support_tickets add column if not exists triage_claimed_at timestamptz;
alter table public.support_tickets add column if not exists triage_attempts integer not null default 0;
alter table public.support_tickets add column if not exists severity text;
alter table public.support_tickets add column if not exists sla_due_at timestamptz;
alter table public.support_tickets add column if not exists sla_breach_at timestamptz;
alter table public.support_tickets add column if not exists working_email_at timestamptz;
alter table public.support_tickets add column if not exists auto_answer_at timestamptz;
alter table public.support_tickets add column if not exists fix_state text not null default 'none';
alter table public.support_tickets add column if not exists fix_release_sha text;
alter table public.support_tickets add column if not exists fix_reply text not null default '';
alter table public.support_tickets add column if not exists fix_marked_by text not null default '';
alter table public.support_tickets add column if not exists fix_marked_at timestamptz;
alter table public.support_tickets add column if not exists fix_claimed_at timestamptz;
alter table public.support_tickets add column if not exists fix_sent_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_triage_state_chk') then
    alter table public.support_tickets add constraint support_tickets_triage_state_chk
      check (triage_state in ('none', 'pending', 'running', 'done', 'failed', 'skipped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_triage_chk') then
    alter table public.support_tickets add constraint support_tickets_triage_chk
      check (jsonb_typeof(triage) = 'object' and octet_length(triage::text) <= 32768);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_severity_chk') then
    alter table public.support_tickets add constraint support_tickets_severity_chk
      check (severity is null or severity in ('critical', 'high', 'normal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_fix_state_chk') then
    alter table public.support_tickets add constraint support_tickets_fix_state_chk
      check (fix_state in ('none', 'fix_ready', 'sending', 'sent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_fix_sha_chk') then
    alter table public.support_tickets add constraint support_tickets_fix_sha_chk
      check (fix_release_sha is null or fix_release_sha ~ '^[0-9a-f]{7,40}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_fix_reply_chk') then
    alter table public.support_tickets add constraint support_tickets_fix_reply_chk
      check (char_length(fix_reply) <= 4000 and char_length(fix_marked_by) <= 254);
  end if;
end $$;

-- The sweeps: tickets linked to a release, tickets past their SLA, tickets whose AI step never finished.
create index if not exists support_tickets_fix_state_idx on public.support_tickets (fix_state) where fix_state <> 'none';
create index if not exists support_tickets_sla_due_idx on public.support_tickets (sla_due_at) where sla_breach_at is null;
create index if not exists support_tickets_triage_state_idx on public.support_tickets (triage_state) where triage_state in ('pending', 'running');

create table if not exists public.support_settings (
  id           smallint primary key check (id = 1),
  ai_triage    boolean not null default true,
  auto_emails  boolean not null default true,
  ai_daily_cap integer check (ai_daily_cap is null or ai_daily_cap between 0 and 100000),
  updated_by   text not null default '' check (char_length(updated_by) <= 254),
  updated_at   timestamptz not null default now()
);

create table if not exists public.support_ai_calls (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (char_length(kind) between 1 and 40),
  ticket_id  text references public.support_tickets(id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists support_ai_calls_created_idx on public.support_ai_calls (created_at);

alter table public.support_settings enable row level security;
alter table public.support_ai_calls enable row level security;

-- Defence in depth (harmless if already revoked).
revoke all on public.support_settings from anon, authenticated;
revoke all on public.support_ai_calls from anon, authenticated;

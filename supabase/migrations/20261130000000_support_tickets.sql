-- Support tickets: "Report a problem" (every user, every workspace), Admin > Support and Platform > Support
-- (src/lib/server/supportTickets.ts). Replaces the old .tickets.json file in the app folder, which Railway wiped on
-- every deploy. A platform feature for every workspace.
--
-- ADDITIVE ONLY and safe to run more than once ("if not exists"; the revokes are harmless if already done). Nothing
-- existing is dropped, renamed or retyped. Tickets that were in the old file are not moved (they were already lost on
-- each deploy). Until this runs, "Report a problem" says reports cannot be saved right now; nothing else changes.
--
-- Read and written only by the app server with the service-role key: RLS on, no policies, no grants to anon/authenticated.
-- Who sees what is enforced by the app (src/lib/server/ticketScope.ts):
--   a Rep / Account Executive sees only the tickets they filed; Supervisor and above see their workspace's tickets;
--   Appointmentlyy staff see every workspace. Internal notes go to staff only. Screenshots and the captured context go
--   to the person who filed and to staff only.
--
-- support_tickets
--   id:              readable and unique, made by the app, e.g. TKT-2611-4F7Q (year, month, 4 random characters)
--   tenant_code:     the workspace, always from the reporter's session; deleting a workspace deletes its tickets
--   requester_*:     who the ticket is for (from the session; staff may file for a client, then filed_by_email is the staff member)
--   description:     "What happened?"   tried: "What were you trying to do?"
--   urgency:         blocking / annoying / question (the person's choice; decides the priority)
--   area:            the part of the app (guessed from the page, editable)
--   context:         what the browser captured: page path (query values removed), app version, time zone, browser and
--                    screen, the last 20 browser errors and the last 20 failed API requests (method, path, status, time).
--                    Never form values, emails or lead content, cookies, tokens or request/response bodies; the app
--                    checks and caps every field before saving.
-- support_ticket_messages: the conversation (is_internal_note = staff-only notes)
-- support_ticket_attachments: up to 3 screenshots per ticket, PNG/JPEG/WebP, at most 5 MB each, stored as base64 after
--                    the app has checked them and removed their metadata (no EXIF / GPS)
create table if not exists public.support_tickets (
  id              text primary key check (id ~ '^TKT-[0-9]{4}-[0-9A-Z]{4,8}$'),
  tenant_code     text not null references public.tenants(code) on update cascade on delete cascade,
  tenant_name     text not null default '' check (char_length(tenant_name) <= 200),
  requester_email text not null check (char_length(requester_email) between 3 and 254),
  requester_name  text not null default '' check (char_length(requester_name) <= 200),
  requester_role  text not null default '' check (char_length(requester_role) <= 40),
  filed_by_email  text check (filed_by_email is null or char_length(filed_by_email) between 3 and 254),
  subject         text not null check (char_length(subject) between 1 and 200),
  description     text not null check (char_length(description) between 1 and 4000),
  tried           text not null default '' check (char_length(tried) <= 2000),
  area            text not null default '' check (char_length(area) <= 40),
  urgency         text check (urgency is null or urgency in ('blocking', 'annoying', 'question')),
  category        text not null default 'bug_general' check (char_length(category) <= 40),
  priority        text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status          text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  source          text not null default 'report' check (source in ('report', 'desk', 'billing')),
  assigned_to     text not null default '' check (char_length(assigned_to) <= 200),
  context         jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 65536),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create table if not exists public.support_ticket_messages (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        text not null references public.support_tickets(id) on update cascade on delete cascade,
  sender_name      text not null default '' check (char_length(sender_name) <= 200),
  sender_email     text not null default '' check (char_length(sender_email) <= 254),
  sender_role      text not null check (sender_role in ('customer', 'admin', 'system')),
  is_internal_note boolean not null default false,
  content          text not null check (char_length(content) between 1 and 4000),
  created_at       timestamptz not null default now()
);

create table if not exists public.support_ticket_attachments (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   text not null references public.support_tickets(id) on update cascade on delete cascade,
  mime        text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  size        integer not null check (size between 1 and 5242880),
  width       integer not null check (width between 1 and 16384),
  height      integer not null check (height between 1 and 16384),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  data        text not null check (char_length(data) between 4 and 7000000),
  uploaded_by text not null default '' check (char_length(uploaded_by) <= 254),
  created_at  timestamptz not null default now()
);

-- Workspace lists (newest first), "my reports", the status filter, and loading a ticket's conversation and screenshots.
create index if not exists support_tickets_tenant_created_idx on public.support_tickets (tenant_code, created_at desc);
create index if not exists support_tickets_requester_idx on public.support_tickets (requester_email);
create index if not exists support_tickets_status_idx on public.support_tickets (status);
create index if not exists support_tickets_created_idx on public.support_tickets (created_at desc);
create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);
create index if not exists support_ticket_attachments_ticket_idx on public.support_ticket_attachments (ticket_id);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;

-- Defence in depth (harmless if already revoked).
revoke all on public.support_tickets from anon, authenticated;
revoke all on public.support_ticket_messages from anon, authenticated;
revoke all on public.support_ticket_attachments from anon, authenticated;

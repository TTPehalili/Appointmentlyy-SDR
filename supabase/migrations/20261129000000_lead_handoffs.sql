-- Lead hand-offs: "Assign leads to a teammate" (src/lib/server/leadHandoffStore.ts). A platform feature for every
-- workspace: an Admin sends up to 500 leads to a member of the SAME workspace; that member's browser collects the batch
-- the next time they open the app, adds the leads to their own Contacts as a folder, and confirms. Replaces "export a CSV
-- and ask the teammate to import it".
--
-- ADDITIVE ONLY and safe to run more than once ("if not exists"; the revoke is harmless if already done). Nothing existing
-- is dropped, renamed or retyped. Until this runs, the sender sees "not available right now, nothing was sent" and
-- nothing else in the app changes.
--
-- Read and written only by the app server with the service-role key: RLS on, no policies, no grants to anon/authenticated.
--
-- tenant_code:  the workspace, always taken from the sender's session; a batch never leaves its workspace
-- to_email:     the recipient (lower case); only this person, signed in to this workspace, can read or confirm the batch
-- leads:        the contact records (same shape as the browser's Contacts), cleaned and capped by the app before saving;
--               emptied when the recipient confirms, so the table is a mailbox, not a second copy of anyone's contacts
-- lead_count:   how many leads were sent (kept after "leads" is emptied, for the sender's "sent" list)
-- delivered_at: null until the recipient's browser confirms the leads are in their Contacts
create table if not exists public.lead_handoffs (
  id            uuid primary key default gen_random_uuid(),
  tenant_code   text not null references public.tenants(code) on update cascade on delete cascade,
  from_email    text not null check (char_length(from_email) between 3 and 254),
  from_name     text not null default '' check (char_length(from_name) <= 200),
  to_email      text not null check (char_length(to_email) between 3 and 254),
  folder_name   text not null default '' check (char_length(folder_name) <= 80),
  leads         jsonb not null default '[]'::jsonb check (jsonb_typeof(leads) = 'array'),
  lead_count    integer not null default 0 check (lead_count between 0 and 500),
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);

-- The recipient's "anything waiting for me?" check, and the sender's "sent" list.
create index if not exists lead_handoffs_pending_idx on public.lead_handoffs (tenant_code, to_email) where delivered_at is null;
create index if not exists lead_handoffs_sender_idx on public.lead_handoffs (tenant_code, from_email, created_at desc);

alter table public.lead_handoffs enable row level security;

-- Defence in depth (harmless if already revoked).
revoke all on public.lead_handoffs from anon, authenticated;

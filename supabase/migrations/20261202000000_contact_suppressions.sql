-- Do Not Contact list: one per workspace (src/lib/server/suppressionStore.ts, rules in src/lib/suppression.ts). A platform
-- feature for every workspace. A rep marking a lead "Do not call" (or an opt-out outcome) in the Dialer adds the lead's
-- phone and email here; the Dialer, the VICIdial dial relay (/api/telephony/vicidial/dial) and the email send routes
-- (/api/email/send, /api/cadence/send-email) check this list on the server before they call or send.
--
-- ADDITIVE ONLY and safe to run more than once ("if not exists"; the revoke is harmless if already done). Nothing existing
-- is dropped, renamed or retyped. Until this runs, adding says "the Do Not Contact list is not set up on this server yet,
-- nothing was saved", and calls and emails go out exactly as before (nothing can be on the list yet).
--
-- Read and written only by the app server with the service-role key: RLS on, no policies, no grants to anon/authenticated.
--
-- tenant_code:      the workspace, always taken from the signed-in person's session; an entry never leaves its workspace
-- kind:             'phone' or 'email'
-- value:            the phone in E.164 (+14155550142) when it was given with its country code, else the digits as typed;
--                   the email address in lower case
-- match_key:        what lookups compare: a phone's last 9 digits (all of them when shorter), or the email address
-- reason:           do_not_call / opt_out / wrong_number / other;  note: optional, at most 300 characters
-- source:           dialer (a call outcome) / manual / api; unsubscribe and inbox are reserved for an email unsubscribe
--                   link and an Inbox "opted out" action (not built yet), so adding them later needs no constraint change
-- created_by_*:     who added it (from the session) and when (created_at)
-- removed_*:        an Admin took it off the list: when, who, and the note they gave. The row is kept as the audit trail;
--                   only rows with removed_at null are active. Adding the same contact again creates a new active row.
create table if not exists public.contact_suppressions (
  id                uuid primary key default gen_random_uuid(),
  tenant_code       text not null references public.tenants(code) on update cascade on delete cascade,
  kind              text not null check (kind in ('phone', 'email')),
  value             text not null check (char_length(value) between 3 and 254),
  match_key         text not null check (char_length(match_key) between 3 and 254),
  reason            text not null default 'do_not_call' check (reason in ('do_not_call', 'opt_out', 'wrong_number', 'other')),
  note              text not null default '' check (char_length(note) <= 300),
  source            text not null default 'manual' check (source in ('dialer', 'manual', 'api', 'unsubscribe', 'inbox')),
  created_by_email  text not null check (char_length(created_by_email) between 3 and 254),
  created_by_name   text not null default '' check (char_length(created_by_name) <= 200),
  created_at        timestamptz not null default now(),
  removed_at        timestamptz,
  removed_by_email  text check (removed_by_email is null or char_length(removed_by_email) between 3 and 254),
  removed_by_name   text check (removed_by_name is null or char_length(removed_by_name) <= 200),
  removal_note      text check (removal_note is null or char_length(removal_note) <= 300)
);

-- One active entry per contact per workspace (a second "Do not call" on the same number is the same entry).
create unique index if not exists contact_suppressions_active_uidx
  on public.contact_suppressions (tenant_code, kind, match_key) where removed_at is null;
-- The workspace's list, newest first.
create index if not exists contact_suppressions_list_idx
  on public.contact_suppressions (tenant_code, created_at desc) where removed_at is null;
-- Who added what, when: the Reps' daily add cap (a person's entries in the last 24 hours) and an Admin's
-- "undo the entries <person> added between <from> and <to>".
create index if not exists contact_suppressions_author_idx
  on public.contact_suppressions (tenant_code, created_by_email, created_at desc);

alter table public.contact_suppressions enable row level security;

-- Defence in depth (harmless if already revoked).
revoke all on public.contact_suppressions from anon, authenticated;

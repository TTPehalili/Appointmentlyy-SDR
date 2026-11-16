-- Agreements: the platform owner's private e-signature tool (src/lib/server/agreementStore.ts).
-- Envelopes (one document sent to one client signer, then countersigned by the owner), their audit
-- events, hashed one-time codes, the stored PDFs and signature images, and the owner's settings.
-- Read and written only by the app server with the service-role key: RLS on, no policies, so the
-- anon/public keys can never read them. PDFs live in a bytea table (never a public bucket) and are
-- streamed only through owner- or token-checked routes. Safe to run more than once.

create table if not exists public.agreement_envelopes (
  id                    uuid primary key default gen_random_uuid(),
  template_id           text not null check (char_length(template_id) between 1 and 80),
  template_meta         jsonb,
  title                 text not null check (char_length(title) between 1 and 200),
  field_values          jsonb not null default '{}'::jsonb,
  recipient_name        text not null default '' check (char_length(recipient_name) <= 120),
  recipient_title       text not null default '' check (char_length(recipient_title) <= 120),
  recipient_email       text not null default '' check (char_length(recipient_email) <= 254),
  -- access rules
  expires_at            timestamptz,
  open_from             timestamptz,
  open_until            timestamptz,
  max_opens             integer check (max_opens is null or max_opens between 1 and 1000),
  require_otp_to_view   boolean not null default false,
  download_days         integer not null default 30 check (download_days between 1 and 365),
  status                text not null default 'draft'
                        check (status in ('draft','sent','opened','signed','completed','declined','expired','revoked')),
  original_sha256       text check (original_sha256 is null or original_sha256 ~ '^[0-9a-f]{64}$'),
  final_sha256          text check (final_sha256 is null or final_sha256 ~ '^[0-9a-f]{64}$'),
  page_count            integer not null default 0,
  -- sha256(token) for lookups; the token itself is only kept sealed (AES-GCM) for the owner's "Copy link"
  token_hash            text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  token_sealed          text,
  -- tracking
  opens                 integer not null default 0,
  view_seconds          integer not null default 0,
  max_page              integer not null default 0,
  pages_seen            integer[] not null default '{}',
  -- signing
  signer_form_values    jsonb,
  signer                jsonb,
  owner_signature       jsonb,
  decline_reason        text check (decline_reason is null or char_length(decline_reason) <= 2000),
  notified              jsonb not null default '{}'::jsonb,
  -- billing statements ('view' templates): { number, currency, total, dueDate, payments[], sourceEnvelopeId }
  billing               jsonb,
  -- per-view breakdown: { <visitId>: { seconds, pages[] } }
  visit_stats           jsonb not null default '{}'::jsonb,
  -- timestamps (UTC)
  created_by            text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  sent_at               timestamptz,
  first_opened_at       timestamptz,
  last_activity_at      timestamptz,
  signed_at             timestamptz,
  completed_at          timestamptz,
  declined_at           timestamptz,
  revoked_at            timestamptz
);

alter table public.agreement_envelopes add column if not exists visit_stats jsonb not null default '{}'::jsonb;

create index if not exists agreement_envelopes_status_idx on public.agreement_envelopes (status, updated_at desc);
-- Statement numbers (APY-SOA-2026-0001) are never reused.
create unique index if not exists agreement_envelopes_billing_number_idx
  on public.agreement_envelopes ((billing->>'number')) where billing is not null and coalesce(billing->>'number', '') <> '';
alter table public.agreement_envelopes enable row level security;

create table if not exists public.agreement_events (
  id           uuid primary key default gen_random_uuid(),
  envelope_id  uuid not null references public.agreement_envelopes(id) on delete cascade,
  type         text not null check (char_length(type) between 1 and 40),
  at           timestamptz not null default now(),
  ip           text check (ip is null or char_length(ip) <= 100),
  user_agent   text check (user_agent is null or char_length(user_agent) <= 400),
  data         jsonb not null default '{}'::jsonb
);

create index if not exists agreement_events_envelope_idx on public.agreement_events (envelope_id, at);
alter table public.agreement_events enable row level security;

create table if not exists public.agreement_otps (
  id           uuid primary key default gen_random_uuid(),
  envelope_id  uuid not null references public.agreement_envelopes(id) on delete cascade,
  purpose      text not null check (purpose in ('view','sign')),
  code_hash    text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  created_at   timestamptz not null default now(),
  consumed_at  timestamptz
);

create index if not exists agreement_otps_envelope_idx on public.agreement_otps (envelope_id, purpose, created_at desc);
alter table public.agreement_otps enable row level security;

-- kind: original | final | certificate (PDF), signer-signature | owner-signature (PNG)
create table if not exists public.agreement_files (
  envelope_id  uuid not null references public.agreement_envelopes(id) on delete cascade,
  kind         text not null check (kind in ('original','final','certificate','signer-signature','owner-signature')),
  mime         text not null check (mime in ('application/pdf','image/png')),
  bytes        bytea not null,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size         integer not null check (size between 1 and 20971520),
  created_at   timestamptz not null default now(),
  primary key (envelope_id, kind)
);

alter table public.agreement_files enable row level security;

-- One row: the owner's Agreements settings (notification address, sender identity, saved signature).
create table if not exists public.agreement_settings (
  id           text primary key default 'default' check (id = 'default'),
  value        jsonb not null default '{}'::jsonb,
  updated_by   text not null default '',
  updated_at   timestamptz not null default now()
);

alter table public.agreement_settings enable row level security;

-- Defence in depth: the browser keys get no table privileges at all (RLS already denies every row).
revoke all on public.agreement_envelopes, public.agreement_events, public.agreement_otps,
              public.agreement_files, public.agreement_settings from anon, authenticated;

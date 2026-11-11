-- Integrations v2: customer webhook endpoints, delivery claim/lease + fan-out key, OAuth-ready
-- connection fields, inbound receipts and (schema-only) field/value mappings.
--
-- Builds on 20261111000000_integrations.sql. Idempotent: safe to run more than once and safe on
-- tables that already hold rows. Read and written only by the app server (service-role key):
-- RLS on, no policies. Run by hand in the Supabase SQL editor.
--
-- Destination model: a delivery goes to exactly ONE destination, either a CRM/tool connection
-- (tenant_connections) or a customer webhook endpoint (webhook_endpoints):
--   destination_kind = 'connection'  -> connection_id set, endpoint_id null
--   destination_kind = 'webhook'     -> endpoint_id set,   connection_id null
-- `destination` is the text fan-out key ('connection:<uuid>' | 'webhook:<uuid>'); unique
-- (event_id, destination) means one delivery per destination per event, so fan-out can be retried
-- without creating duplicates. Both FKs cascade: deleting a destination removes its delivery log.

-- ------------------------------------------------------------------ connections: OAuth-ready fields
alter table public.tenant_connections add column if not exists auth_type            text not null default 'api_key';
alter table public.tenant_connections add column if not exists token_expires_at     timestamptz;
alter table public.tenant_connections add column if not exists scopes               text[] not null default '{}';
alter table public.tenant_connections add column if not exists external_account_id  text;
alter table public.tenant_connections add column if not exists api_base_url         text;
alter table public.tenant_connections add column if not exists refresh_locked_until timestamptz;
create index if not exists tenant_connections_account_idx on public.tenant_connections (provider, external_account_id);

-- ------------------------------------------------------------------ events: versioning + subject
alter table public.integration_events add column if not exists schema_version integer not null default 1;
alter table public.integration_events add column if not exists source         text not null default 'browser';
alter table public.integration_events add column if not exists subject_key    text;
create index if not exists integration_events_subject_idx on public.integration_events (tenant_code, subject_key);

-- ------------------------------------------------------------------ external ids: reverse lookup
create index if not exists integration_external_ids_reverse_idx
  on public.integration_external_ids (tenant_code, provider, object_type, external_id);

-- ------------------------------------------------------------------ customer webhook endpoints
create table if not exists public.webhook_endpoints (
  id                    uuid primary key default gen_random_uuid(),
  tenant_code           text not null references public.tenants(code) on update cascade on delete cascade,
  url                   text not null check (char_length(url) <= 500),
  events                text[] not null default '{}',
  description           text not null default '' check (char_length(description) <= 200),
  -- Signing secret sealed with secretBox, bound to this row's id. Never sent to the browser.
  secret_sealed         text not null,
  secret_hint           text not null default '',
  active                boolean not null default true,
  consecutive_failures  integer not null default 0,
  disabled_reason       text,
  last_delivery_at      timestamptz,
  created_by            text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists webhook_endpoints_tenant_idx on public.webhook_endpoints (tenant_code, created_at);

-- ------------------------------------------------------------------ deliveries: destinations, lease, results
alter table public.integration_deliveries alter column connection_id drop not null;
alter table public.integration_deliveries add column if not exists destination_kind text not null default 'connection';
alter table public.integration_deliveries add column if not exists endpoint_id      uuid references public.webhook_endpoints(id) on delete cascade;
alter table public.integration_deliveries add column if not exists destination      text;
alter table public.integration_deliveries add column if not exists event_type       text not null default '';
alter table public.integration_deliveries add column if not exists max_attempts     integer not null default 6;
alter table public.integration_deliveries add column if not exists locked_until     timestamptz;
alter table public.integration_deliveries add column if not exists locked_by        text;
alter table public.integration_deliveries add column if not exists duration_ms      integer;
alter table public.integration_deliveries add column if not exists response_excerpt text;
alter table public.integration_deliveries add column if not exists last_message     text;

-- Backfill rows written before v2 (all of them were connection deliveries).
update public.integration_deliveries
   set destination = 'connection:' || connection_id::text
 where destination is null and connection_id is not null;
update public.integration_deliveries d
   set event_type = e.type
  from public.integration_events e
 where d.event_type = '' and e.id = d.event_id;
-- A row with neither destination can't be delivered; drop it rather than block the NOT NULL.
delete from public.integration_deliveries where destination is null;
alter table public.integration_deliveries alter column destination set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'integration_deliveries_destination_kind_chk') then
    alter table public.integration_deliveries add constraint integration_deliveries_destination_kind_chk
      check (
        (destination_kind = 'connection' and connection_id is not null and endpoint_id is null)
        or (destination_kind = 'webhook' and endpoint_id is not null and connection_id is null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'integration_deliveries_excerpt_len_chk') then
    alter table public.integration_deliveries add constraint integration_deliveries_excerpt_len_chk
      check (response_excerpt is null or char_length(response_excerpt) <= 4096);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'integration_deliveries_event_destination_key') then
    alter table public.integration_deliveries add constraint integration_deliveries_event_destination_key
      unique (event_id, destination);
  end if;
end $$;

create index if not exists integration_deliveries_claim_idx
  on public.integration_deliveries (next_attempt_at)
  where status in ('pending', 'failed');
create index if not exists integration_deliveries_endpoint_idx
  on public.integration_deliveries (endpoint_id, created_at desc);

-- ------------------------------------------------------------------ inbound webhook receipts (replay guard)
create table if not exists public.inbound_receipts (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  receipt_id   text not null,
  tenant_code  text references public.tenants(code) on update cascade on delete cascade,
  body_sha256  text not null default '',
  received_at  timestamptz not null default now(),
  unique (provider, receipt_id)
);
create index if not exists inbound_receipts_received_idx on public.inbound_receipts (received_at);

-- ------------------------------------------------------------------ CRM field + value mappings (schema only for now)
create table if not exists public.integration_field_mappings (
  id             uuid primary key default gen_random_uuid(),
  tenant_code    text not null references public.tenants(code) on update cascade on delete cascade,
  connection_id  uuid not null references public.tenant_connections(id) on delete cascade,
  object_type    text not null,
  local_field    text not null,
  remote_field   text not null,
  direction      text not null default 'push' check (direction in ('push', 'pull', 'both')),
  transform      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (connection_id, object_type, local_field)
);

create table if not exists public.integration_value_maps (
  id             uuid primary key default gen_random_uuid(),
  tenant_code    text not null references public.tenants(code) on update cascade on delete cascade,
  connection_id  uuid not null references public.tenant_connections(id) on delete cascade,
  object_type    text not null,
  field          text not null,
  local_value    text not null,
  remote_value   text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (connection_id, object_type, field, local_value)
);

-- ------------------------------------------------------------------ worker functions
-- Claim up to p_limit due deliveries for one worker. Concurrent workers never claim the same row
-- (FOR UPDATE SKIP LOCKED) and a crashed worker's claims expire after p_lease_seconds.
create or replace function public.claim_due_deliveries(p_limit integer, p_worker text, p_lease_seconds integer)
returns setof public.integration_deliveries
language sql
set search_path = public
as $$
  with due as materialized (
    select x.id
      from public.integration_deliveries x
     where x.status in ('pending', 'failed')
       and x.next_attempt_at is not null
       and x.next_attempt_at <= now()
       and (x.locked_until is null or x.locked_until < now())
     order by x.next_attempt_at
     limit greatest(1, least(coalesce(p_limit, 10), 100))
     for update skip locked
  )
  update public.integration_deliveries d
     set locked_until = now() + make_interval(secs => greatest(5, least(coalesce(p_lease_seconds, 60), 3600))),
         locked_by    = p_worker
    from due
   where d.id = due.id
  returning d.*;
$$;

-- Count one attempt against an endpoint: success resets the failure streak, a failure extends it and
-- turns the endpoint off once the streak reaches p_disable_after. Atomic (one UPDATE).
create or replace function public.record_webhook_endpoint_result(p_endpoint_id uuid, p_ok boolean, p_disable_after integer, p_reason text)
returns setof public.webhook_endpoints
language sql
set search_path = public
as $$
  update public.webhook_endpoints
     set consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
         disabled_reason      = case when not p_ok and active and consecutive_failures + 1 >= p_disable_after then p_reason else disabled_reason end,
         active               = case when not p_ok and consecutive_failures + 1 >= p_disable_after then false else active end,
         last_delivery_at     = now(),
         updated_at           = now()
   where id = p_endpoint_id
  returning *;
$$;

revoke all on function public.claim_due_deliveries(integer, text, integer) from public, anon, authenticated;
revoke all on function public.record_webhook_endpoint_result(uuid, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.claim_due_deliveries(integer, text, integer) to service_role;
grant execute on function public.record_webhook_endpoint_result(uuid, boolean, integer, text) to service_role;

alter table public.webhook_endpoints enable row level security;
alter table public.inbound_receipts enable row level security;
alter table public.integration_field_mappings enable row level security;
alter table public.integration_value_maps enable row level security;

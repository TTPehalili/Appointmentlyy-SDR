-- Client integrations: connected accounts (encrypted secrets), event outbox, deliveries and
-- external-id links. Read and written only by the app server (service-role key):
-- RLS on, no policies.

create table if not exists public.tenant_connections (
  id               uuid primary key default gen_random_uuid(),
  tenant_code      text not null references public.tenants(code) on update cascade on delete cascade,
  provider         text not null,
  member_email     text not null default '',
  label            text not null default '',
  status           text not null default 'pending' check (status in ('connected', 'needs_attention', 'disconnected', 'pending')),
  config           jsonb not null default '{}'::jsonb,
  secret_sealed    text,
  last_checked_at  timestamptz,
  last_error       text,
  created_by       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_code, provider, member_email)
);

create table if not exists public.integration_events (
  id               uuid primary key default gen_random_uuid(),
  tenant_code      text not null references public.tenants(code) on update cascade on delete cascade,
  type             text not null,
  idempotency_key  text not null,
  payload          jsonb not null default '{}'::jsonb,
  actor_email      text not null default '',
  created_at       timestamptz not null default now(),
  unique (tenant_code, idempotency_key)
);
create index if not exists integration_events_tenant_idx on public.integration_events (tenant_code, created_at desc);

create table if not exists public.integration_deliveries (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.integration_events(id) on delete cascade,
  tenant_code      text not null references public.tenants(code) on update cascade on delete cascade,
  connection_id    uuid not null references public.tenant_connections(id) on delete cascade,
  provider         text not null,
  status           text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'dead', 'skipped')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz,
  last_error       text,
  response_code    integer,
  summary          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists integration_deliveries_due_idx on public.integration_deliveries (status, next_attempt_at);
create index if not exists integration_deliveries_tenant_idx on public.integration_deliveries (tenant_code, created_at desc);

create table if not exists public.integration_external_ids (
  tenant_code   text not null references public.tenants(code) on update cascade on delete cascade,
  provider      text not null,
  object_type   text not null,
  local_id      text not null,
  external_id   text not null,
  updated_at    timestamptz not null default now(),
  primary key (tenant_code, provider, object_type, local_id)
);

alter table public.tenant_connections enable row level security;
alter table public.integration_events enable row level security;
alter table public.integration_deliveries enable row level security;
alter table public.integration_external_ids enable row level security;

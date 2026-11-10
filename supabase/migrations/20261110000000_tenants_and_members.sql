-- Client organizations (tenants), their members and the access audit log.
-- Read and written only by the app server with the service-role key (src/lib/server/tenantStore.ts).
-- RLS is on with no policies, so the anon/public key can't read or change any of it.

create table if not exists public.tenants (
  code        text primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  name        text not null,
  plan        text not null default 'Standard',
  seat_limit  integer not null default 10 check (seat_limit >= 0),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  modules     jsonb not null default '{}'::jsonb,
  branding    jsonb not null default '{}'::jsonb,
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id             uuid primary key default gen_random_uuid(),
  tenant_code    text not null references public.tenants(code) on update cascade on delete cascade,
  email          text not null check (email = lower(email)),
  name           text not null default '',
  role           text not null check (role in ('Super Admin', 'Admin', 'Manager', 'Supervisor', 'Rep')),
  status         text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  invited_by     text not null default '',
  invited_at     timestamptz not null default now(),
  joined_at      timestamptz,
  last_login_at  timestamptz,
  invite_nonce   text,
  unique (tenant_code, email)
);

create index if not exists tenant_members_email_idx on public.tenant_members (email);

create table if not exists public.auth_audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_email  text not null,
  tenant_code  text not null,
  action       text not null,
  target       text not null default '',
  detail       jsonb not null default '{}'::jsonb
);

create index if not exists auth_audit_log_tenant_idx on public.auth_audit_log (tenant_code, at desc);

-- Passwords (optional; people can also sign in with an emailed link). scrypt hashes only.
create table if not exists public.user_credentials (
  email          text primary key check (email = lower(email)),
  password_hash  text not null,
  updated_at     timestamptz not null default now()
);

alter table public.tenants enable row level security;
alter table public.user_credentials enable row level security;
alter table public.tenant_members enable row level security;
alter table public.auth_audit_log enable row level security;

-- Append-only audit log, even for the service role.
create or replace function public.auth_audit_log_no_change() returns trigger language plpgsql as $$
begin
  raise exception 'auth_audit_log is append-only';
end $$;

drop trigger if exists auth_audit_log_append_only on public.auth_audit_log;
create trigger auth_audit_log_append_only
  before update or delete on public.auth_audit_log
  for each row execute function public.auth_audit_log_no_change();

-- The platform workspace (Appointmentlyy staff). Staff emails come from AUTH_ADMIN_EMAILS.
insert into public.tenants (code, name, plan, seat_limit, created_by)
values ('APPOINTMENTLYY', 'Appointmentlyy', 'Platform', 0, 'migration')
on conflict (code) do nothing;

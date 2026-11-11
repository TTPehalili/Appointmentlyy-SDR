-- Meeting Action Plans: when a rep books a meeting, the server researches the prospect and writes a
-- discovery plan for the Account Executive plus an editable one-page recap for the customer
-- (src/lib/meetingPlan.ts). Also the workspace's own Company profile (what every plan sells) and the
-- new 'Account Executive' member role.
-- Read and written only by the app server (service-role key): RLS on, no policies. Safe to run more
-- than once.

create table if not exists public.meeting_plans (
  id                uuid primary key default gen_random_uuid(),
  tenant_code       text not null references public.tenants(code) on update cascade on delete cascade,
  -- Lowercased prospect email, or the browser contact id when there is no email.
  contact_key       text not null default '',
  lead_snapshot     jsonb not null default '{}'::jsonb,
  call_context      jsonb not null default '{}'::jsonb,
  booked_by         text not null default '',
  booked_by_name    text not null default '',
  assigned_ae       text not null default '',
  assigned_ae_name  text not null default '',
  status            text not null default 'preparing' check (status in ('preparing', 'ready', 'failed', 'sent')),
  research          jsonb,
  plan              jsonb,
  one_pager         jsonb,
  error             text,
  sent_at           timestamptz,
  -- Demo workspace sample plans only (null for real plans).
  seed_key          text,
  -- AI generation bookkeeping for the per-workspace daily cap (creates and regenerations both count).
  generated_at      timestamptz,
  generation_times  timestamptz[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Columns added after the first version of this file (no-ops on a fresh install).
alter table public.meeting_plans add column if not exists generated_at timestamptz;
alter table public.meeting_plans add column if not exists generation_times timestamptz[] not null default '{}';

create index if not exists meeting_plans_tenant_ae_idx on public.meeting_plans (tenant_code, assigned_ae);
create index if not exists meeting_plans_tenant_booked_by_idx on public.meeting_plans (tenant_code, booked_by);
create index if not exists meeting_plans_tenant_contact_idx on public.meeting_plans (tenant_code, contact_key);
create index if not exists meeting_plans_tenant_generated_idx on public.meeting_plans (tenant_code, generated_at);
create unique index if not exists meeting_plans_tenant_seed_key_uniq on public.meeting_plans (tenant_code, seed_key) where seed_key is not null;

alter table public.meeting_plans enable row level security;

-- One Company profile per workspace.
create table if not exists public.company_profiles (
  tenant_code  text primary key references public.tenants(code) on update cascade on delete cascade,
  profile      jsonb not null,
  updated_by   text not null default '',
  updated_at   timestamptz not null default now()
);

alter table public.company_profiles enable row level security;

-- Members may now be Account Executives (same access as a Rep; offered as meeting assignees).
-- The original role check was declared inline, so its name is whatever Postgres generated: find
-- every check constraint on tenant_members.role (other than ours) and replace it with a named one.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'tenant_members'
      and con.contype = 'c'
      and con.conname <> 'tenant_members_role_valid'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.tenant_members drop constraint %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'tenant_members' and con.conname = 'tenant_members_role_valid'
  ) then
    alter table public.tenant_members
      add constraint tenant_members_role_valid
      check (role in ('Super Admin', 'Admin', 'Manager', 'Supervisor', 'Account Executive', 'Rep'));
  end if;
end $$;

-- VICIdial agent links: which workspace member may drive which VICIdial agent session through the
-- Dialer relay (/api/telephony/vicidial/*). Set by workspace Admins in Admin > Phone system.
-- VICIdial is one shared account, so an agent username is linked to at most one person across all
-- workspaces. Read and written only by the app server (service-role key,
-- src/lib/server/telephonyAgentStore.ts): RLS on, no policies.

create table if not exists public.telephony_agents (
  tenant_code   text not null references public.tenants(code) on update cascade on delete cascade,
  member_email  text not null check (member_email = lower(member_email)),
  agent_user    text not null check (agent_user ~ '^[A-Za-z0-9._-]{1,20}$'),
  updated_by    text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (tenant_code, member_email)
);

create unique index if not exists telephony_agents_agent_user_key on public.telephony_agents (lower(agent_user));

alter table public.telephony_agents enable row level security;

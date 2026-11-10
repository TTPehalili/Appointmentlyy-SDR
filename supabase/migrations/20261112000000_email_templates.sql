-- Email template library: templates and campaigns (named groups of templates) that admins and
-- managers create and assign to reps, plus reps' own private templates. Read and written only by
-- the app server (service-role key): RLS on, no policies. Safe to run more than once.
--
-- Workflow steps (e.g. "send template 1, wait 2 days") reference a template by id; archive a
-- template instead of deleting it so those references keep working.

create table if not exists public.email_templates (
  id             uuid primary key default gen_random_uuid(),
  tenant_code    text not null references public.tenants(code) on update cascade on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  subject        text not null check (char_length(subject) between 1 and 150),
  body           text not null check (char_length(body) between 1 and 5000),
  framework_id   text not null default '',
  campaign       text check (campaign is null or char_length(campaign) <= 60),
  purpose        text not null default 'cold' check (purpose in ('cold', 'followup', 'sequence', 'breakup', 'reply')),
  outcome_tags   text[] not null default '{}',
  visibility     text not null default 'team' check (visibility in ('team', 'private')),
  -- Member emails. Empty with visibility 'team' = everyone in the workspace.
  assigned_to    text[] not null default '{}',
  -- Order inside its campaign (1 = first email); null when not part of a sequence.
  sequence_step  smallint check (sequence_step is null or sequence_step between 1 and 20),
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived       boolean not null default false
);

create index if not exists email_templates_tenant_idx on public.email_templates (tenant_code);
create index if not exists email_templates_tenant_campaign_idx on public.email_templates (tenant_code, campaign);

alter table public.email_templates enable row level security;

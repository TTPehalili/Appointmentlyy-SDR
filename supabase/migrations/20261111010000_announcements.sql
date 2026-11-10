-- Platform announcements: system upgrades, updates and feature releases that Appointmentlyy staff
-- publish to client workspaces (shown as a ribbon at the top of the app). Read and written only
-- by the app server (service-role key): RLS on, no policies.

create table if not exists public.platform_announcements (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 80),
  message          text not null check (char_length(message) between 1 and 280),
  link_url         text,
  link_label       text,
  kind             text not null default 'update' check (kind in ('feature', 'update', 'maintenance')),
  audience         text not null default 'admins' check (audience in ('admins', 'everyone', 'workspaces')),
  workspace_codes  text[] not null default '{}',
  publish_at       timestamptz not null default now(),
  unpublish_at     timestamptz not null,
  created_by       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint platform_announcements_window check (unpublish_at > publish_at)
);

create index if not exists platform_announcements_window_idx
  on public.platform_announcements (publish_at desc, unpublish_at);

alter table public.platform_announcements enable row level security;

-- Team chat: #floor and #managers per workspace, 1:1 direct messages, read markers and presence.
-- Read and written only by the app server (service-role key): RLS on, no policies. Safe to run
-- more than once. Chat content is never sent to an AI model.
--
-- Live delivery is an SSE stream from the app server with an in-process bus; these tables are the
-- source of truth (the browser catches up with updated_at > cursor after any gap).

create table if not exists public.chat_channels (
  id                 uuid primary key default gen_random_uuid(),
  tenant_code        text not null references public.tenants(code) on update cascade on delete cascade,
  kind               text not null check (kind in ('floor', 'managers', 'dm')),
  name               text not null default '',
  -- DM only: the two members' emails (lowercase). Empty for floor / managers.
  member_emails      text[] not null default '{}',
  -- #floor announcement (no foreign key: messages reference channels; a deleted message unpins in the app).
  pinned_message_id  uuid,
  created_at         timestamptz not null default now()
);

-- One #floor and one #managers per workspace (the app also uses deterministic ids for these and for DMs).
create unique index if not exists chat_channels_shared_uidx on public.chat_channels (tenant_code, kind) where kind in ('floor', 'managers');
create index if not exists chat_channels_tenant_idx on public.chat_channels (tenant_code, kind);
create index if not exists chat_channels_members_idx on public.chat_channels using gin (member_emails);

create table if not exists public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  tenant_code   text not null references public.tenants(code) on update cascade on delete cascade,
  channel_id    uuid not null references public.chat_channels(id) on delete cascade,
  sender_email  text not null,
  sender_name   text not null default '',
  sender_role   text not null default '',
  kind          text not null default 'text' check (kind in ('text', 'help', 'win', 'system')),
  -- Plain text. Empty once deleted.
  body          text not null default '' check (char_length(body) <= 2000),
  -- { mentions: [email], help: { requestedBy, leadName, company, claimedBy }, win: { leadName, company }, replyTo }
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  -- Bumped on delete / claim so polling with ?since= sees changes too.
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists chat_messages_channel_created_idx on public.chat_messages (tenant_code, channel_id, created_at);
create index if not exists chat_messages_channel_updated_idx on public.chat_messages (tenant_code, channel_id, updated_at);

create table if not exists public.chat_reads (
  tenant_code   text not null references public.tenants(code) on update cascade on delete cascade,
  channel_id    uuid not null references public.chat_channels(id) on delete cascade,
  user_email    text not null,
  last_read_at  timestamptz not null default now(),
  primary key (tenant_code, channel_id, user_email)
);

create index if not exists chat_reads_user_idx on public.chat_reads (tenant_code, user_email);

create table if not exists public.chat_presence (
  tenant_code  text not null references public.tenants(code) on update cascade on delete cascade,
  user_email   text not null,
  status       text not null default 'available' check (status in ('available', 'on_call', 'away')),
  updated_at   timestamptz not null default now(),
  primary key (tenant_code, user_email)
);

alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;
alter table public.chat_presence enable row level security;

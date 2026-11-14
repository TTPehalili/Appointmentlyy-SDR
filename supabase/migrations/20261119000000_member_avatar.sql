-- Profile photos: one per person per workspace (src/lib/server/avatars.ts).
-- Read and written only by the app server with the service-role key: RLS on, no policies.
-- Safe to run more than once.
--
-- avatar: 'preset:avatar-01' (illustrated avatar), '/images/profile/x.webp' (built-in photo),
--         'upload' (bytes in image) or 'none' (explicitly no photo, turns off a default).
-- image:  uploads only, a small data URL (WebP/JPEG/PNG, resized to 256 px in the browser,
--         at most 200 KB decoded; the app checks type and size before saving).
-- Kept apart from tenant_members so the per-request session lookup never reads image bytes,
-- and so platform staff without a member row can have a photo too.

create table if not exists public.member_avatars (
  tenant_code  text not null references public.tenants(code) on update cascade on delete cascade,
  email        text not null check (email = lower(email)),
  avatar       text not null check (char_length(avatar) <= 200),
  image        text check (image is null or char_length(image) <= 280000),
  version      text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   text not null default '',
  primary key (tenant_code, email)
);

alter table public.member_avatars enable row level security;

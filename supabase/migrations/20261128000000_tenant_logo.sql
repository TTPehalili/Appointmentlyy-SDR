-- Workspace logos: one per workspace (src/lib/server/tenantLogos.ts). A platform feature for every client workspace:
-- set from Admin > Appearance (workspace Admins) or copied from the accepted Client Intake logo by "Provision workspace"
-- (Client Projects, owner only). Shown where the workspace's initials tile appears in the app shell, always through <img>.
--
-- ADDITIVE ONLY and safe to run more than once ("if not exists"; the revoke is harmless if already done). Nothing existing
-- is dropped, renamed or retyped. Until this runs, the app treats every workspace as having no logo (initials show).
--
-- Read and written only by the app server with the service-role key: RLS on, no policies, no grants to anon/authenticated.
--
-- mime:    image/png | image/jpeg | image/webp | image/svg+xml (the app checks the bytes: PNG chunks and CRCs, JPEG frame
--          markers, the WebP RIFF header; SVG is stored only as the output of the intake SVG sanitiser)
-- image:   base64 of the bytes, at most 512 KB decoded (the app checks the size before saving)
-- version: short content hash; part of the image URL so browsers can cache a logo for good
create table if not exists public.tenant_logos (
  tenant_code  text primary key references public.tenants(code) on update cascade on delete cascade,
  mime         text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  image        text not null check (char_length(image) between 1 and 700000),
  size         integer not null check (size between 1 and 524288),
  version      text not null check (char_length(version) between 1 and 40),
  updated_at   timestamptz not null default now(),
  updated_by   text not null default '' check (char_length(updated_by) <= 254)
);

alter table public.tenant_logos enable row level security;

-- Defence in depth (harmless if already revoked).
revoke all on public.tenant_logos from anon, authenticated;

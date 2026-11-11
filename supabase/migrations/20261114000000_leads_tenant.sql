-- ==============================================================================
-- Leads belong to a workspace.
--
-- 1. public.leads gets a tenant_code column (the workspace code, e.g. 'APPOINTMENTLYY'), written
--    by the server from the signed-in session on every CSV import
--    (src/app/api/leads/import-csv/route.ts). Rows that already exist keep tenant_code NULL: they
--    were written before workspaces were tracked and belong to no workspace. No foreign key, so
--    those rows don't block this migration.
-- 2. The "Public read leads" / "Public manage leads" policies (USING (true)) let anyone holding the
--    public anon key, which ships to every browser, read and change every workspace's leads.
--    The app only touches this table from the server with the service role key, which bypasses
--    RLS, so the policies are dropped. RLS stays on with no policies: anon and authenticated
--    clients get nothing.
--
-- Idempotent: safe to run more than once. Does nothing if public.leads does not exist.
-- ==============================================================================

DO $$
BEGIN
  IF to_regclass('public.leads') IS NULL THEN
    RAISE NOTICE 'public.leads does not exist; nothing to do.';
    RETURN;
  END IF;

  ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tenant_code TEXT;
  CREATE INDEX IF NOT EXISTS leads_tenant_code_idx ON public.leads (tenant_code);

  ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Public read leads" ON public.leads;
  DROP POLICY IF EXISTS "Public manage leads" ON public.leads;

  COMMENT ON COLUMN public.leads.tenant_code IS
    'Workspace (tenants.code) that imported the lead. Set by the server from the session; NULL for rows written before 2026-11-14.';
END
$$;

-- 3. The same open policies on other tables written by the server only (service role key):
--    certification attempts (public read + public insert), campaigns (public read) and playbook
--    rebuttal entries (public read: a client's uploaded playbook content). No browser code reads these
--    tables with the public key, so the policies are dropped; RLS stays on, server access unchanged.
DO $$
BEGIN
  IF to_regclass('public.certification_attempts') IS NOT NULL THEN
    ALTER TABLE public.certification_attempts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read cert attempts" ON public.certification_attempts;
    DROP POLICY IF EXISTS "Public write cert attempts" ON public.certification_attempts;
  END IF;
  IF to_regclass('public.campaigns') IS NOT NULL THEN
    ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read campaigns" ON public.campaigns;
  END IF;
  IF to_regclass('public.rebuttal_entries') IS NOT NULL THEN
    ALTER TABLE public.rebuttal_entries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read rebuttal_entries" ON public.rebuttal_entries;
  END IF;
END
$$;

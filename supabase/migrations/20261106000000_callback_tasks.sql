-- ==============================================================================
-- Callback Tasks Migration: dialer "Callback" outcome -> scheduled, assignable task
-- Target Project: uxxswbukdhdxmylrjoej
-- NOT APPLIED automatically. Review, then run with `supabase db push` (or the SQL editor).
--
-- Mirrors src/lib/callbackStore.ts (the local dev data layer).
-- Org scoping: the app scopes everything by tenant code (session.tenantCode), so this
-- migration adds profiles.tenant_code and scopes callback rows to it through RLS.
--
-- Who can do what:
--   * Anyone in the org can read the org's callbacks (team queue, manager views).
--   * Any rep can create a callback for their org; created_by is always the caller.
--   * The assignee, the creator and managers can update (mark done, edit note/time).
--   * Only the creator or a manager (super_admin / manager) can change assigned_to,
--     and only to someone in the same org (enforced by trigger).
--   * The creator or a manager can delete.
-- ==============================================================================

-- 1. Org membership on profiles (matches the app's tenant code, e.g. 'APEX-GLOBAL')
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tenant_code TEXT;

CREATE INDEX IF NOT EXISTS profiles_tenant_code_idx ON public.profiles(tenant_code);

-- 2. Helper functions (SECURITY DEFINER so RLS on profiles cannot recurse)
CREATE OR REPLACE FUNCTION public.current_tenant_code()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_code FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('super_admin', 'manager') FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- 3. Callback tasks
CREATE TABLE IF NOT EXISTS public.callback_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_ref TEXT,                         -- local contact id or email for leads not yet in public.leads
  contact_name TEXT,
  company_name TEXT,
  phone TEXT,
  email TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  time_zone TEXT NOT NULL DEFAULT 'UTC',    -- IANA zone of the rep who scheduled it
  note TEXT,
  disposition TEXT NOT NULL DEFAULT 'Call Back Later',
  created_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT callback_tasks_has_lead CHECK (lead_id IS NOT NULL OR contact_ref IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS callback_tasks_queue_idx
  ON public.callback_tasks(tenant_code, assigned_to, status, due_at);
CREATE INDEX IF NOT EXISTS callback_tasks_lead_idx ON public.callback_tasks(lead_id);
CREATE INDEX IF NOT EXISTS callback_tasks_contact_ref_idx ON public.callback_tasks(tenant_code, contact_ref);

-- 4. Audit trail (created / reassigned / completed / reopened), written by trigger only
CREATE TABLE IF NOT EXISTS public.callback_task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.callback_tasks(id) ON DELETE CASCADE,
  tenant_code TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'reassigned', 'completed', 'reopened')),
  from_assignee UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_assignee UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS callback_task_events_task_idx ON public.callback_task_events(task_id);

-- 5. Guard trigger: immutable ownership, same-org assignees, reassignment rights
CREATE OR REPLACE FUNCTION public.callback_tasks_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignee_tenant TEXT;
BEGIN
  -- Service role / server jobs (no auth.uid()) bypass the guard.
  IF auth.uid() IS NULL THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.tenant_code := COALESCE(NEW.tenant_code, public.current_tenant_code());
    NEW.created_by := auth.uid();
    NEW.assigned_to := COALESCE(NEW.assigned_to, auth.uid());
  ELSE
    IF NEW.tenant_code IS DISTINCT FROM OLD.tenant_code
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'callback_tasks: tenant_code, created_by and created_at cannot change';
    END IF;

    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       AND NOT (OLD.created_by = auth.uid() OR public.current_user_is_manager()) THEN
      RAISE EXCEPTION 'callback_tasks: only the rep who scheduled the callback or a manager can reassign it';
    END IF;

    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := NOW();
    ELSIF NEW.status <> 'done' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    SELECT tenant_code INTO assignee_tenant FROM public.profiles WHERE id = NEW.assigned_to;
    IF assignee_tenant IS DISTINCT FROM NEW.tenant_code THEN
      RAISE EXCEPTION 'callback_tasks: assignee must belong to the same org';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS callback_tasks_guard_trg ON public.callback_tasks;
CREATE TRIGGER callback_tasks_guard_trg
  BEFORE INSERT OR UPDATE ON public.callback_tasks
  FOR EACH ROW EXECUTE FUNCTION public.callback_tasks_guard();

CREATE OR REPLACE FUNCTION public.callback_tasks_log_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.callback_task_events (task_id, tenant_code, actor_id, event_type, to_assignee)
    VALUES (NEW.id, NEW.tenant_code, auth.uid(), 'created', NEW.assigned_to);
  ELSE
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.callback_task_events (task_id, tenant_code, actor_id, event_type, from_assignee, to_assignee)
      VALUES (NEW.id, NEW.tenant_code, auth.uid(), 'reassigned', OLD.assigned_to, NEW.assigned_to);
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('done', 'open') THEN
      INSERT INTO public.callback_task_events (task_id, tenant_code, actor_id, event_type)
      VALUES (NEW.id, NEW.tenant_code, auth.uid(), CASE WHEN NEW.status = 'done' THEN 'completed' ELSE 'reopened' END);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS callback_tasks_event_trg ON public.callback_tasks;
CREATE TRIGGER callback_tasks_event_trg
  AFTER INSERT OR UPDATE ON public.callback_tasks
  FOR EACH ROW EXECUTE FUNCTION public.callback_tasks_log_event();

-- 6. RLS Policies (org-scoped)
ALTER TABLE public.callback_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callback_task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org read callback tasks" ON public.callback_tasks;
CREATE POLICY "Org read callback tasks" ON public.callback_tasks
  FOR SELECT TO authenticated
  USING (tenant_code = public.current_tenant_code());

DROP POLICY IF EXISTS "Org create callback tasks" ON public.callback_tasks;
CREATE POLICY "Org create callback tasks" ON public.callback_tasks
  FOR INSERT TO authenticated
  WITH CHECK (tenant_code = public.current_tenant_code() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Owner, assignee or manager update callback tasks" ON public.callback_tasks;
CREATE POLICY "Owner, assignee or manager update callback tasks" ON public.callback_tasks
  FOR UPDATE TO authenticated
  USING (
    tenant_code = public.current_tenant_code()
    AND (created_by = auth.uid() OR assigned_to = auth.uid() OR public.current_user_is_manager())
  )
  WITH CHECK (tenant_code = public.current_tenant_code());

DROP POLICY IF EXISTS "Owner or manager delete callback tasks" ON public.callback_tasks;
CREATE POLICY "Owner or manager delete callback tasks" ON public.callback_tasks
  FOR DELETE TO authenticated
  USING (
    tenant_code = public.current_tenant_code()
    AND (created_by = auth.uid() OR public.current_user_is_manager())
  );

DROP POLICY IF EXISTS "Org read callback task events" ON public.callback_task_events;
CREATE POLICY "Org read callback task events" ON public.callback_task_events
  FOR SELECT TO authenticated
  USING (tenant_code = public.current_tenant_code());

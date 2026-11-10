import { NextRequest, NextResponse } from 'next/server';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getTenantStore, type Tenant } from '@/lib/server/tenantStore';
import { DEFAULT_MODULES, TenancyError, cleanBranding, seatsUsed } from '@/lib/server/tenancy';
import { getServerSession } from '@/lib/server/session';

/**
 * PATCH /api/platform/tenants/:code  { name?, plan?, seatLimit?, status?, modules?, branding? }
 * Platform staff only. Suspending a workspace signs its members out on their next request.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!session.isPlatformAdmin) return NextResponse.json({ success: false, error: 'Platform staff only.' }, { status: 403 });

  const code = (await ctx.params).code.toUpperCase();
  const store = getTenantStore();
  const tenant = await store.getTenant(code);
  if (!tenant) return NextResponse.json({ success: false, error: 'Workspace not found.' }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const patch: Partial<Tenant> = {};
    if (typeof body.name === 'string') {
      const name = body.name.trim().slice(0, 80);
      if (name.length < 2) throw new TenancyError('Enter the company name.');
      patch.name = name;
    }
    if (typeof body.plan === 'string') patch.plan = body.plan.trim().slice(0, 60);
    if (body.seatLimit !== undefined) {
      const n = Math.floor(Number(body.seatLimit));
      if (!Number.isFinite(n) || n < 1 || n > 5000) throw new TenancyError('Seats must be between 1 and 5000.');
      const used = seatsUsed(await store.listMembers({ tenantCode: code }));
      if (n < used) throw new TenancyError(`${used} seats are in use. Remove people before lowering the limit below that.`);
      patch.seatLimit = n;
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'suspended') throw new TenancyError('Unknown status.');
      if (code === PLATFORM_TENANT_CODE) throw new TenancyError('The platform workspace can’t be suspended.');
      patch.status = body.status;
    }
    if (body.modules && typeof body.modules === 'object') {
      const modules = { ...tenant.modules };
      for (const k of Object.keys(DEFAULT_MODULES)) if (k in body.modules) modules[k] = Boolean(body.modules[k]);
      patch.modules = modules;
    }
    if (body.branding !== undefined) patch.branding = cleanBranding(body.branding, tenant.branding);

    const updated = await store.updateTenant(code, patch);
    await store.addAudit({
      actorEmail: session.email,
      tenantCode: code,
      action: patch.status ? `tenant.${patch.status === 'suspended' ? 'suspend' : 'activate'}` : 'tenant.update',
      target: code,
      detail: patch as Record<string, unknown>,
    });
    return NextResponse.json({ success: true, tenant: updated });
  } catch (err) {
    if (err instanceof TenancyError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error('[platform/tenants PATCH]', err);
    return NextResponse.json({ success: false, error: 'Could not update the workspace.' }, { status: 500 });
  }
}

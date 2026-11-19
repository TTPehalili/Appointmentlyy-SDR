/** Server only. The owner's Client Intake payload: requests, submissions, files, client data, envelope options. */
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { getTenantStore } from '@/lib/server/tenantStore';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { taskKey } from '@/lib/server/clientProjects/core';
import { recordsFor } from '@/lib/server/clientProjects/dnsCheck';
import { ensureRequests, envelopeOptions, intakeOn, publicIntake, syncRequests, type EnvelopeOption } from '@/lib/server/clientProjects/intake';
import { agreementFieldsOf } from '@/lib/server/clientProjects/intakeApply';
import { listKeyChecks, type KeyCheck } from '@/lib/server/keyChecks';
import type { CompanyProfile, Project } from '@/lib/clientProjects/types';
import { unifiedOf, type CpRequest, type CpSubmission, type DnsRecord, type UnifiedStatus } from '@/lib/clientProjects/intake';
import type { CpFileMeta, TaskStatus } from '@/lib/clientProjects/types';

export interface OwnerRequestView extends CpRequest {
  key: string;
  title: string;
  taskStatus: TaskStatus;
  unified: UnifiedStatus;
  /** What the client sees as the status line. */
  clientLabel: string;
  records: DnsRecord[];
}

export interface OwnerIntake {
  enabled: boolean;
  tenantCode: string | null;
  tenants: { code: string; name: string }[];
  requests: OwnerRequestView[];
  submissions: CpSubmission[];
  files: CpFileMeta[];
  envelopes: EnvelopeOption[];
  keyChecks: Pick<KeyCheck, 'provider' | 'ok' | 'checkedAt'>[];
  company: CompanyProfile | null;
  agreementFields: Record<string, string> | null;
}

export async function ownerIntake(p0: Project, opts: { sync?: boolean } = {}): Promise<OwnerIntake> {
  const s = getClientProjectStore();
  const p = (await s.getProject(p0.id)) ?? p0;
  const tasks = await s.listTasks(p.id);
  let reqs = await ensureRequests(p, tasks);
  if (intakeOn(p)) reqs = await syncRequests(p, tasks, reqs, opts.sync ? { force: true } : { throttleMs: 15_000 });
  const after = intakeOn(p) ? await s.listTasks(p.id) : tasks;
  const [subs, files, envelopes, tenants] = await Promise.all([
    reqs.some((r) => r.version > 0) ? s.listSubmissions(p.id, { limit: 1000 }) : Promise.resolve([]),
    s.listFiles(p.id, 'intake'),
    reqs.some((r) => r.kind === 'signature' || r.kind === 'payment') ? envelopeOptions() : Promise.resolve([]),
    getTenantStore()
      .listTenants()
      .then((list) => list.filter((t) => t.code !== PLATFORM_TENANT_CODE).map((t) => ({ code: t.code, name: t.name })))
      .catch(() => []),
  ]);
  const tenantCode = p.settings?.intake?.tenantCode ?? null;
  const checks = tenantCode ? await listKeyChecks(tenantCode) : [];
  const company = p.settings?.intake?.company ?? null;
  const requests: OwnerRequestView[] = reqs
    .map((r) => {
      const t = after.find((x) => x.id === r.taskId);
      if (!t) return null;
      const latest = subs.filter((x) => x.requestId === r.id).sort((a, b) => b.version - a.version)[0] ?? null;
      const view: OwnerRequestView = {
        ...r,
        key: taskKey(p, t),
        title: t.title,
        taskStatus: t.status,
        unified: unifiedOf(r),
        clientLabel: publicIntake(p, r, latest).label,
        records: r.kind === 'dns' && r.config.domain ? recordsFor(p.id, r.config.domain, r.config.extraRecords ?? []) : [],
      };
      return view;
    })
    .filter((x): x is OwnerRequestView => Boolean(x))
    .sort((a, b) => (after.find((t) => t.id === a.taskId)?.dueDate ?? '9').localeCompare(after.find((t) => t.id === b.taskId)?.dueDate ?? '9'));
  return {
    enabled: intakeOn(p),
    tenantCode,
    tenants,
    requests,
    submissions: subs,
    files,
    envelopes,
    keyChecks: checks.map((c) => ({ provider: c.provider, ok: c.ok, checkedAt: c.checkedAt })),
    company,
    agreementFields: company ? agreementFieldsOf(company) : null,
  };
}

/**
 * Live workspace snapshot for the Operations Intel assistant.
 * Aggregates real contacts, ICP folders, pipeline stages, deal values and reps
 * from the browser store so the AI answers from actual data (not demo constants).
 * Only aggregates + a short sample are sent to the server (never the full lead list).
 */
import {
  getStoredContacts,
  getStoredFolders,
  getStoredPipelineStages,
  getContactDealValue,
} from '@/lib/leadStore';
import { getStoredSession } from '@/lib/session';

export interface OpsSnapshot {
  generatedAt: string;
  tenantName: string;
  role: string;
  totals: {
    contacts: number;
    folders: number;
    pipelineValueUsd: number;
    bookedCount: number;
    bookedValueUsd: number;
    withWebsite: number;
    withLinkedin: number;
  };
  folders: {
    name: string;
    totalLeads: number;
    createdAt: string;
    reps: { repName: string; leadCount: number }[];
  }[];
  stages: { label: string; statusValue: string; count: number; valueUsd: number }[];
  reps: { repName: string; leads: number; valueUsd: number }[];
  sampleLeads: {
    name: string;
    title: string;
    company: string;
    status: string;
    rep: string;
    dealValueUsd: number;
    folder: string;
  }[];
}

export function buildOpsSnapshot(): OpsSnapshot {
  const session = getStoredSession();
  let contacts = getStoredContacts();
  if (session.role === 'Rep') {
    contacts = contacts.filter(
      (c) => (c.assignedRep || '').toLowerCase() === session.repName.toLowerCase()
    );
  }
  const folders = getStoredFolders();
  const stages = getStoredPipelineStages();

  const statusCounts = new Map<string, { count: number; value: number }>();
  const repCounts = new Map<string, { leads: number; value: number }>();
  let pipelineValue = 0;
  let bookedCount = 0;
  let bookedValue = 0;

  contacts.forEach((c) => {
    const value = getContactDealValue(c);
    pipelineValue += value;
    const status = (c.status || 'New Lead').trim();
    const s = statusCounts.get(status) || { count: 0, value: 0 };
    s.count++;
    s.value += value;
    statusCounts.set(status, s);

    const rep = c.assignedRep || 'Unassigned';
    const r = repCounts.get(rep) || { leads: 0, value: 0 };
    r.leads++;
    r.value += value;
    repCounts.set(rep, r);

    if (/book|meeting/i.test(status)) {
      bookedCount++;
      bookedValue += value;
    }
  });

  const stageRows = stages.map((st) => {
    const hit = statusCounts.get(st.statusValue) ||
      statusCounts.get(st.label) || { count: 0, value: 0 };
    return {
      label: st.label,
      statusValue: st.statusValue,
      count: hit.count,
      valueUsd: hit.value,
    };
  });
  // Include statuses that exist on contacts but not in configured stages
  const known = new Set(stages.flatMap((s) => [s.statusValue, s.label]));
  statusCounts.forEach((v, k) => {
    if (!known.has(k)) {
      stageRows.push({ label: k, statusValue: k, count: v.count, valueUsd: v.value });
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    tenantName: session.tenantName,
    role: session.role,
    totals: {
      contacts: contacts.length,
      folders: folders.length,
      pipelineValueUsd: pipelineValue,
      bookedCount,
      bookedValueUsd: bookedValue,
      withWebsite: contacts.filter((c) => !!c.website).length,
      withLinkedin: contacts.filter((c) => !!c.linkedinUrl).length,
    },
    folders: folders.map((f) => ({
      name: f.name,
      totalLeads: f.totalLeads,
      createdAt: f.createdAt,
      reps: (f.distributedReps || []).map((r) => ({
        repName: r.repName,
        leadCount: r.leadCount,
      })),
    })),
    stages: stageRows,
    reps: Array.from(repCounts.entries()).map(([repName, v]) => ({
      repName,
      leads: v.leads,
      valueUsd: v.value,
    })),
    sampleLeads: contacts.slice(0, 12).map((c) => ({
      name: c.name,
      title: c.title,
      company: c.company,
      status: c.status,
      rep: c.assignedRep || 'Unassigned',
      dealValueUsd: getContactDealValue(c),
      folder: c.folderName || 'General Directory',
    })),
  };
}


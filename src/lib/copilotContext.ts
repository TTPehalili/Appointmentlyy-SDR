/**
 * What the Copilot panel sends with each question: a compact view of this workspace's data, with every
 * report metric already computed (see copilotReport). Browser only.
 * - Client workspaces: their real activity log and contacts, nothing else.
 * - The demo workspace: the same sample numbers the Reports page shows.
 * Reps only get their own numbers; team figures are computed only for Supervisor and above (the route
 * also ignores team data unless the signed-in user's real role allows it).
 */
import { getStoredActivities } from '@/lib/activityStore';
import { buildOpsSnapshot, type OpsSnapshot } from '@/lib/opsSnapshot';
import {
  computeActivityReport,
  demoReport,
  parseReportPeriod,
  type DemoRepMetric,
  type ReportData,
  type ReportPeriod,
} from '@/lib/copilotReport';

export interface CopilotTurn {
  from: 'user' | 'ai';
  text: string;
}

export interface CopilotRequestContext {
  page: string;
  role: string;
  repName: string;
  snapshot: OpsSnapshot | null;
  report: { team?: ReportData; personal?: ReportData };
  history: CopilotTurn[];
}

let demoRows: Promise<Record<'daily' | 'weekly', DemoRepMetric[]>> | null = null;

/** The Reports page's sample rows, loaded on demand (its chunk only loads in the demo workspace). */
function loadDemoRows() {
  if (!demoRows) {
    demoRows = import('@/components/RepPerformanceDashboard')
      .then((m) => ({ daily: m.MASTER_PERFORMANCE_DATA.daily, weekly: m.MASTER_PERFORMANCE_DATA.weekly }))
      .catch((err) => {
        demoRows = null;
        throw err;
      });
  }
  return demoRows;
}

/** Keep the request small: aggregates and a short sample, never the whole lead list. */
function compactSnapshot(): OpsSnapshot | null {
  try {
    const s = buildOpsSnapshot();
    return {
      ...s,
      folders: s.folders.slice(0, 15).map((f) => ({ ...f, reps: f.reps.slice(0, 8) })),
      stages: s.stages.slice(0, 15),
      reps: s.reps.slice(0, 20),
      sampleLeads: s.sampleLeads.slice(0, 8),
    };
  } catch {
    return null;
  }
}

export async function buildCopilotContext(opts: {
  question: string;
  page: string;
  role: string;
  repName: string;
  tenantName: string;
  isDemo: boolean;
  history: CopilotTurn[];
}): Promise<CopilotRequestContext> {
  const period: ReportPeriod = parseReportPeriod(opts.question);
  const canSeeTeam = opts.role !== 'Rep';
  const report: CopilotRequestContext['report'] = {};
  try {
    if (opts.isDemo) {
      const rows = await loadDemoRows();
      const forPeriod = period === 'today' || period === 'yesterday' ? rows.daily : rows.weekly;
      if (canSeeTeam) report.team = demoReport(forPeriod, period, { tenantName: opts.tenantName });
      report.personal = demoReport(forPeriod, period, { tenantName: opts.tenantName, repName: opts.repName || 'You' });
    } else {
      const activities = getStoredActivities();
      if (canSeeTeam) report.team = computeActivityReport(activities, period);
      report.personal = computeActivityReport(activities, period, { repName: opts.repName || 'You' });
    }
  } catch {
    // No report data: the route answers honestly without it.
  }
  return {
    page: opts.page,
    role: opts.role,
    repName: opts.repName,
    snapshot: compactSnapshot(),
    report,
    history: opts.history.slice(-6).map((t) => ({ from: t.from, text: t.text.slice(0, 700) })),
  };
}

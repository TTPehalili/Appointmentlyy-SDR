/**
 * Who may use the workflow builder, and which store they read and write (server-only).
 *
 * - Admin and above (platform staff count) may open, build and edit workflows.
 * - Each workspace has its own store (see workflowDbForTenant): client workspaces never see the
 *   platform's sample workflows, nor each other's.
 * - Only platform staff may switch a workflow on. Everyone else saves drafts: a draft never runs
 *   (webhooks, MCP and the runner only read the platform store, and only active workflows).
 * - The platform (APPOINTMENTLYY) store is the one that runs, with the server's secrets, so only
 *   platform staff may change anything in it. Its other members (demo Admin logins) can look only.
 * - Code steps and {{ $env }} expressions run with the server's environment, so only platform
 *   staff may add them, in any workspace.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';
import { workflowDbForTenant, type WorkflowDatabase } from '@/lib/db';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getNodeDefinition } from '@/registry';

export interface WorkflowAccess {
  session: ServerSession;
  store: WorkflowDatabase;
  /** Platform staff: may switch workflows on and run them. */
  isStaff: boolean;
}

export const PLATFORM_WORKFLOWS_STAFF_ONLY = 'Only Appointmentlyy staff can change the platform’s workflows. You can still open and view them.';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function requireWorkflowAdmin(req: NextRequest): Promise<WorkflowAccess | NextResponse> {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  }
  if (!hasRank(session, 'Admin')) {
    return NextResponse.json({ success: false, error: 'Only workspace admins can use workflows.' }, { status: 403 });
  }
  const isStaff = session.isPlatformAdmin;
  // Every write (create, save, activate, delete, duplicate, move, folders) to the store that runs.
  if (!isStaff && session.tenantCode === PLATFORM_TENANT_CODE && !READ_METHODS.has(req.method.toUpperCase())) {
    return NextResponse.json({ success: false, error: PLATFORM_WORKFLOWS_STAFF_ONLY }, { status: 403 });
  }
  return { session, store: workflowDbForTenant(session.tenantCode), isStaff };
}

/** The node type the runner will execute for this node (same resolution as engine/runner.ts). */
function runtimeNodeType(node: Record<string, unknown>): string {
  const data = (node.data && typeof node.data === 'object' ? node.data : {}) as Record<string, unknown>;
  const raw = data.nodeType || node.type || 'codeNode';
  const name = typeof raw === 'string' ? raw : 'codeNode';
  return getNodeDefinition(name)?.name ?? name;
}

/**
 * Why a non-staff author may not save these nodes, or null if they may. Code steps and $env
 * expressions would run with the server's environment (its secrets) if the workflow ever ran.
 */
export function serverAccessRejection(nodes: Record<string, unknown>[], isStaff: boolean): string | null {
  if (isStaff) return null;
  if (nodes.some((n) => runtimeNodeType(n) === 'codeNode')) {
    return 'Code steps can only be added by Appointmentlyy staff. Remove the Code step, or ask your platform team.';
  }
  if (JSON.stringify(nodes).includes('$env')) {
    return 'Server environment values ($env) can only be used by Appointmentlyy staff. Remove them from the step settings.';
  }
  return null;
}

const MAX_NODES = 200;
const MAX_EDGES = 400;

/** Bounded, plain copies of nodes and edges from a request body. */
export function cleanGraph(nodes: unknown, edges: unknown): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  const asObjects = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x)).slice(0, max);
  return { nodes: asObjects(nodes, MAX_NODES), edges: asObjects(edges, MAX_EDGES) };
}

export function cleanName(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : fallback;
}

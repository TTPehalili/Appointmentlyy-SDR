/**
 * Who may use the workflow builder, and which store they read and write (server-only).
 *
 * - Admin and above (platform staff count) may open, build and edit workflows.
 * - Each workspace has its own store (see workflowDbForTenant): client workspaces never see the
 *   platform's sample workflows, nor each other's.
 * - Only platform staff may switch a workflow on. Everyone else saves drafts: a draft never runs
 *   (webhooks, MCP and the runner only read the platform store, and only active workflows).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';
import { workflowDbForTenant, type WorkflowDatabase } from '@/lib/db';

export interface WorkflowAccess {
  session: ServerSession;
  store: WorkflowDatabase;
  /** Platform staff: may switch workflows on and run them. */
  isStaff: boolean;
}

export async function requireWorkflowAdmin(req: NextRequest): Promise<WorkflowAccess | NextResponse> {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  }
  if (!hasRank(session, 'Admin')) {
    return NextResponse.json({ success: false, error: 'Only workspace admins can use workflows.' }, { status: 403 });
  }
  return { session, store: workflowDbForTenant(session.tenantCode), isStaff: session.isPlatformAdmin };
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

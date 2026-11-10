import { NextRequest, NextResponse } from 'next/server';
import { cleanGraph, cleanName, requireWorkflowAdmin } from '@/lib/server/workflowAccess';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkflowAdmin(request);
  if (access instanceof NextResponse) return access;
  try {
    const { id } = await params;
    const workflow = await access.store.getWorkflow(id);

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow not found with id: ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: workflow
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to get workflow' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkflowAdmin(request);
  if (access instanceof NextResponse) return access;
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await access.store.getWorkflow(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Workflow not found with id: ${id}` },
        { status: 404 }
      );
    }

    // Partial updates (e.g. only `active`, or only name and description) keep everything else.
    const graph = cleanGraph(body.nodes, body.edges);
    const nodes = Array.isArray(body.nodes) ? graph.nodes : existing.nodes;
    const edges = Array.isArray(body.edges) ? graph.edges : existing.edges;
    // Only platform staff may switch a workflow on; anyone else's save keeps it a draft.
    const active = access.isStaff ? (typeof body.active === 'boolean' ? body.active : existing.active) : false;

    const updated = await access.store.saveWorkflow({
      id,
      name: cleanName(body.name, existing.name),
      description: typeof body.description === 'string' ? body.description.slice(0, 600) : existing.description,
      active,
      nodes,
      edges,
      webhookPath: typeof body.webhookPath === 'string' ? body.webhookPath.slice(0, 80) : existing.webhookPath
    });

    return NextResponse.json({
      success: true,
      data: updated
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update workflow' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkflowAdmin(request);
  if (access instanceof NextResponse) return access;
  try {
    const { id } = await params;
    const deleted = await access.store.deleteWorkflow(id);

    return NextResponse.json({
      success: deleted,
      message: deleted ? 'Workflow deleted successfully' : 'Workflow not found'
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete workflow' },
      { status: 500 }
    );
  }
}

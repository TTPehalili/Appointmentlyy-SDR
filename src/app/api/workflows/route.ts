import { NextRequest, NextResponse } from 'next/server';
import { cleanGraph, cleanName, requireWorkflowAdmin } from '@/lib/server/workflowAccess';

export async function GET(request: NextRequest) {
  const access = await requireWorkflowAdmin(request);
  if (access instanceof NextResponse) return access;
  try {
    const workflows = await access.store.listWorkflows();
    return NextResponse.json({
      success: true,
      data: workflows
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to list workflows' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await requireWorkflowAdmin(request);
  if (access instanceof NextResponse) return access;
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Workflow name is required' },
        { status: 400 }
      );
    }

    const { nodes, edges } = cleanGraph(body.nodes, body.edges);
    // Only platform staff may create a workflow that is already switched on.
    const active = access.isStaff ? body.active ?? true : false;
    const workflow = await access.store.saveWorkflow({
      name: cleanName(body.name, 'Untitled Workflow'),
      description: typeof body.description === 'string' ? body.description.slice(0, 600) : '',
      folderId: typeof body.folderId === 'string' && body.folderId ? body.folderId : undefined,
      active,
      nodes,
      edges,
      webhookPath: typeof body.webhookPath === 'string' ? body.webhookPath.slice(0, 80) : undefined
    });

    return NextResponse.json({
      success: true,
      data: workflow
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create workflow' },
      { status: 500 }
    );
  }
}

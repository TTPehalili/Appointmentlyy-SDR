import { NextRequest, NextResponse } from 'next/server';
import { requireWorkflowAdmin } from '@/lib/server/workflowAccess';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkflowAdmin(request);
  if (access instanceof NextResponse) return access;
  const db = access.store;
  try {
    const { id } = await params;
    const project = await db.getProject(id);

    if (!project) {
      return NextResponse.json(
        { success: false, error: `Project not found with id: ${id}` },
        { status: 404 }
      );
    }

    const workflows = await db.listWorkflows(id);

    return NextResponse.json({
      success: true,
      data: {
        ...project,
        workflows
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to get project' },
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
  const db = access.store;
  try {
    const { id } = await params;
    const body = await request.json();

    const updated = await db.saveProject({
      id,
      name: body.name,
      description: body.description,
      color: body.color
    });

    return NextResponse.json({
      success: true,
      data: updated
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update project' },
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
  const db = access.store;
  try {
    const { id } = await params;
    const deleted = await db.deleteProject(id);

    return NextResponse.json({
      success: deleted,
      message: deleted ? 'Project folder deleted successfully' : 'Project not found'
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete project' },
      { status: 500 }
    );
  }
}

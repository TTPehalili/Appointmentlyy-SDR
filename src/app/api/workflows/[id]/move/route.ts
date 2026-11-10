import { NextRequest, NextResponse } from 'next/server';
import { requireWorkflowAdmin } from '@/lib/server/workflowAccess';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkflowAdmin(request);
  if (access instanceof NextResponse) return access;
  const db = access.store;
  try {
    const { id } = await params;
    const body = await request.json();
    const targetFolderId = body.folderId !== undefined ? body.folderId : undefined;

    const moved = await db.moveWorkflow(id, targetFolderId);

    if (!moved) {
      return NextResponse.json(
        { success: false, error: `Workflow with id "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: moved
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to move workflow' },
      { status: 500 }
    );
  }
}

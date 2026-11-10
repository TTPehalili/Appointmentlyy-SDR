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
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const duplicated = await db.duplicateWorkflow(id, body.name, body.folderId);

    if (!duplicated) {
      return NextResponse.json(
        { success: false, error: `Original workflow with id "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: duplicated
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to duplicate workflow' },
      { status: 500 }
    );
  }
}

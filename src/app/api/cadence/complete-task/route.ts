import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const { lead_id, cadence_day, task_type, completion_status, redial_hours } = body;

    const nextDay = completion_status === 'completed' 
      ? (cadence_day === 2 ? 3 : cadence_day === 3 ? 5 : cadence_day + 1)
      : cadence_day;

    console.log(`[CADENCE TASK] Lead ${lead_id} completed task ${task_type} on Day ${cadence_day}. Next Cadence Day: ${nextDay}`);

    return NextResponse.json({
      status: 'success',
      lead_id: lead_id || 'lead_001',
      cadence_day: cadence_day || 2,
      task_type: task_type || 'phone_call',
      completion_status: completion_status || 'completed',
      next_cadence_day: nextDay,
      redial_scheduled: redial_hours ? `${redial_hours} hours from now` : null,
      updated_at: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[CADENCE TASK ERROR]', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Error updating cadence task' },
      { status: 500 }
    );
  }
}

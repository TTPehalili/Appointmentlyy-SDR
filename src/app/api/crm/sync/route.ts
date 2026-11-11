import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const { lead_id, disposition, cadence_day, crm_notes, telemetry } = body;

    // Simulate real CRM sync payload processing (HubSpot / Salesforce / GoHighLevel)
    const randomDealId = `hubspot_deal_${Math.floor(100000 + Math.random() * 900000)}`;
    const syncedAt = new Date().toISOString();

    console.log(`[CRM SYNC] Synced Lead ${lead_id || 'lead_001'} (Day ${cadence_day}) with disposition: ${disposition} -> ${randomDealId}`);

    return NextResponse.json({
      status: 'success',
      crm_record_id: randomDealId,
      synced_at: syncedAt,
      received: {
        lead_id: lead_id || 'lead_001',
        disposition: disposition || 'in_progress',
        cadence_day: cadence_day || 2,
        notes_length: (crm_notes || '').length,
        telemetry: telemetry || {}
      }
    });
  } catch (error: any) {
    console.error('[CRM SYNC ERROR]', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal CRM sync error' },
      { status: 500 }
    );
  }
}

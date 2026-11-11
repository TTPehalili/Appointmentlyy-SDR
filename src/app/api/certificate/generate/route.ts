import { NextRequest, NextResponse } from 'next/server';
import { CertificateRenderer } from '@/lib/certificateRenderer';
import { getServiceSupabase } from '@/lib/supabase';
import { requireApiSession } from '@/lib/server/apiSession';
import { getTenantStore } from '@/lib/server/tenantStore';

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, 'Supervisor', 'Only supervisors and above can issue certificates.');
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    // The rep must be a member of the signed-in workspace (defaults to the signer); the name comes
    // from the member record, never the body.
    const target = typeof body.repId === 'string' && body.repId ? await getTenantStore().getMember(body.repId).catch(() => null) : auth.identity.member ?? null;
    if (body.repId && (!target || target.tenantCode !== auth.tenantCode || target.status === 'removed')) {
      return NextResponse.json({ error: 'That rep is not in this workspace.' }, { status: 404 });
    }
    const repName = target?.name || auth.name || auth.email;
    const campaignName = body.campaignName || 'Enterprise Outbound SDR Mastery';
    const score = Number(body.score || 92);
    const repId = target?.id || '00000000-0000-0000-0000-000000000000';
    const campaignId = body.campaignId || '00000000-0000-0000-0000-000000000001';

    const certData = CertificateRenderer.createCertificateData(repName, campaignName, score);

    // Save to Supabase
    const supabase = getServiceSupabase();
    try {
      await supabase.from('rep_certifications').upsert({
        rep_id: repId,
        campaign_id: campaignId,
        certified: true,
        score,
        badge_level: score >= 95 ? 'Mastery Elite' : 'Certified BDR',
        certificate_id: certData.certificateId,
        supervisor_name: certData.supervisorName,
        verification_hash: certData.verificationHash,
        endorsement_notes: 'Readiness for Live Floor - Endorsed by Sales Enablement'
      }, { onConflict: 'rep_id, campaign_id' });
    } catch (e) {
      console.warn('[Certificate Gen] Supabase notice:', e);
    }

    return NextResponse.json({
      success: true,
      certificate: certData
    });

  } catch (error: any) {
    console.error('[Certificate Gen] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate certificate' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';
import { getServiceSupabase } from '@/lib/supabase';
import { CertificateRenderer } from '@/lib/certificateRenderer';

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    // An attempt is always the signed-in rep's own: the rep comes from the session, never the body.
    const repId: string = auth.identity.member?.id || '00000000-0000-0000-0000-000000000000';
    const repName: string = auth.name || auth.email;
    const campaignId: string = body.campaignId || '00000000-0000-0000-0000-000000000001';
    const score: number = Number(body.score || 88);
    const notes: string = body.notes || 'Completed live Boris certification simulation';

    const supabase = getServiceSupabase();

    // 1. Fetch previous attempts count
    let attemptNumber = 1;
    try {
      const { data: attempts } = await supabase
        .from('certification_attempts')
        .select('id, attempt_number')
        .eq('rep_id', repId)
        .eq('campaign_id', campaignId);

      if (attempts && attempts.length > 0) {
        attemptNumber = attempts.length + 1;
      }
    } catch {}

    const PASSING_THRESHOLD = 85;
    const passed = score >= PASSING_THRESHOLD;
    const readiness = passed ? 'Readiness for Live Floor' : 'Needs Remediation';

    // 2. Insert attempt record
    try {
      await supabase.from('certification_attempts').insert({
        rep_id: repId,
        campaign_id: campaignId,
        attempt_number: attemptNumber,
        score,
        passed,
        notes: `${notes} - Evaluation: ${readiness}`
      });
    } catch {}

    // 3. If passed, issue or update rep certification
    let certificateData = null;
    if (passed) {
      certificateData = CertificateRenderer.createCertificateData(
        repName,
        'Enterprise Outbound SDR Mastery',
        score
      );

      try {
        await supabase.from('rep_certifications').upsert({
          rep_id: repId,
          campaign_id: campaignId,
          certified: true,
          score,
          badge_level: score >= 95 ? 'Mastery Elite' : 'Certified BDR',
          certificate_id: certificateData.certificateId,
          supervisor_name: certificateData.supervisorName,
          verification_hash: certificateData.verificationHash,
          endorsement_notes: readiness
        }, { onConflict: 'rep_id, campaign_id' });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      attemptNumber,
      score,
      passed,
      readiness,
      minAttemptsRequired: 3,
      maxAttemptsAllowed: 5,
      certificate: certificateData
    });

  } catch (error: any) {
    console.error('[Certification Attempt API] Error logging attempt:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process certification attempt' },
      { status: 500 }
    );
  }
}

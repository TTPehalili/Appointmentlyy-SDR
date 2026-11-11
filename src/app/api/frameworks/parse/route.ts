import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';
import { DocumentParser } from '@/lib/parsers/pdfParser';
import { ArmExtractor } from '@/lib/parsers/armExtractor';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  // Admin › Playbooks is a Manager+ section (adminNav permission 'admin').
  const auth = await requireApiSession(req, 'Supervisor', 'Only managers and admins can upload playbooks.');
  if (auth instanceof NextResponse) return auth;
  try {
    const contentType = req.headers.get('content-type') || '';
    let text = '';
    let fileName = 'manual-input.txt';
    let fileType: 'pdf' | 'docx' | 'md' | 'txt' = 'txt';
    let campaignId: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      campaignId = formData.get('campaignId') as string | null;
      const rawText = formData.get('text') as string | null;

      if (file) {
        fileName = file.name;
        const buffer = await file.arrayBuffer();
        const parsedDoc = await DocumentParser.parseBuffer(buffer, file.name);
        text = parsedDoc.text;
        fileType = parsedDoc.metadata.fileType;
      } else if (rawText) {
        text = rawText;
      }
    } else {
      const body = await req.json();
      text = body.text || '';
      campaignId = body.campaignId || null;
      fileName = body.fileName || 'manual-input.txt';
    }

    if (!text || text.trim().length < 10) {
      return NextResponse.json(
        { error: 'Document or text content is empty or too short (min 10 characters).' },
        { status: 400 }
      );
    }

    // 1. Synthesize complete playbook across Phone Scripts, ARM entries, and Cadence
    const synthesized = await ArmExtractor.synthesizeGlobalPlaybookFromText(text);
    const armEntries = synthesized.armEntries;

    // 2. Persist to Supabase if connected
    const supabase = getServiceSupabase();
    let docId: string | null = null;

    try {
      // Save framework document record
      const { data: docRecord, error: docError } = await supabase
        .from('framework_documents')
        .insert({
          campaign_id: campaignId || null,
          title: fileName,
          file_path: `uploads/${fileName}`,
          file_type: fileType === 'txt' ? 'md' : fileType,
          raw_content: text.slice(0, 50000)
        })
        .select('id')
        .single();

      if (!docError && docRecord) {
        docId = docRecord.id;
      }

      // Save rebuttal entries with 1536-dim vector embeddings
      if (armEntries.length > 0) {
        const rowsToInsert = armEntries.map(e => ({
          campaign_id: campaignId || null,
          objection_type: e.objection_category,
          prospect_objection_patterns: [e.objection_trigger],
          acknowledge: e.arm_acknowledge,
          respond: e.arm_respond,
          move: e.arm_move,
          embedding: e.embedding || null
        }));

        await supabase.from('rebuttal_entries').insert(rowsToInsert);
      }
    } catch (dbErr) {
      console.warn('[Framework Ingestion] Supabase write note:', dbErr);
    }

    return NextResponse.json({
      success: true,
      documentId: docId,
      fileName,
      fileType,
      extractedCount: armEntries.length,
      entries: armEntries,
      synthesized: synthesized
    });

  } catch (error: any) {
    console.error('[Framework Ingestion] Error processing document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse framework document' },
      { status: 500 }
    );
  }
}

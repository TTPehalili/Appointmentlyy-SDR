import { NextRequest, NextResponse } from 'next/server';
import { getAgreementStore, isEnvelopeId } from '@/lib/server/agreementStore';
import { fail, fileNameFor, pdfResponse, requireOwner } from '@/lib/server/agreements/core';

type Ctx = { params: Promise<{ id: string; kind: string }> };

const KINDS = { original: '', final: '-signed', certificate: '-certificate' } as const;

/** GET /api/agreements/:id/file/(original|final|certificate) -> the stored PDF, inline (owner only). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id, kind } = await ctx.params;
  if (!isEnvelopeId(id) || !(kind in KINDS)) return fail(404, 'File not found.');
  const store = getAgreementStore();
  const e = await store.getEnvelope(id);
  if (!e) return fail(404, 'File not found.');
  const file = await store.getFile(id, kind as keyof typeof KINDS);
  if (!file) return fail(404, 'File not found.');
  return pdfResponse(file.bytes, fileNameFor(e, KINDS[kind as keyof typeof KINDS]));
}

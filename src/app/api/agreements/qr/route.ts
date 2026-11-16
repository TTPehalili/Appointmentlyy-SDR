import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson, requireOwner } from '@/lib/server/agreements/core';
import { safeQrDataUrl } from '@/lib/server/agreements/payment';

/**
 * POST /api/agreements/qr { image: "data:image/png;base64,..." } -> { image } (platform owner only)
 * The payment QR for billing statements. The browser re-encodes the PNG/JPEG upload to PNG; the
 * server rebuilds it from its image chunks (metadata and appended data dropped). Max 1 MB.
 */
export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  if (!rateLimit(`agr-qr:${owner.email}`, 30, 10 * 60_000)) return fail(429, 'Too many uploads. Wait a few minutes.');
  const body = await readJson(req, 2 * 1024 * 1024);
  if (!body) return fail(400, 'The image is too large (max 1 MB).');
  const image = safeQrDataUrl(body.image);
  if (!image) return fail(400, 'Use a PNG or JPEG image under 1 MB.');
  return json({ success: true, image });
}

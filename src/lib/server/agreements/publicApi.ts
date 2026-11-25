/**
 * Server only. Shared guard for the public signer routes (/api/sign/[token]/**): rate limits per IP
 * and per token, token format check, constant-time lookup by sha256(token), lazy expiry.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { getAgreementStore } from '@/lib/server/agreementStore';
import { TOKEN_RE, clientIp, fail, tokenHashOf, userAgentOf } from '@/lib/server/agreements/core';
import { expireIfDue, type RequestMeta } from '@/lib/server/agreements/service';
import type { CcRecipient, Envelope } from '@/lib/agreements/envelope';

export interface PublicCtx {
  envelope: Envelope;
  tokenHash: string;
  meta: RequestMeta;
}

/** The envelope for a link token, or the response to send (429 / 404). Never logs the token. */
export async function loadByToken(req: NextRequest, token: string): Promise<PublicCtx | NextResponse> {
  const ip = clientIp(req);
  if (!rateLimit(`agr-pub-ip:${ip}`, 240, 60_000)) return fail(429, 'Too many requests. Wait a minute and try again.');
  if (!TOKEN_RE.test(token)) {
    if (!rateLimit(`agr-pub-bad:${ip}`, 30, 10 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
    return fail(404, 'This link is not valid.', { state: 'closed', reason: 'not_found' });
  }
  const tokenHash = tokenHashOf(token);
  if (!rateLimit(`agr-pub-tok:${tokenHash.slice(0, 24)}`, 180, 60_000)) return fail(429, 'Too many requests. Wait a minute and try again.');
  const found = await getAgreementStore().findByTokenHash(tokenHash);
  if (!found || found.status === 'draft') {
    // Guessing tokens: slow down repeated misses from one address.
    if (!rateLimit(`agr-pub-miss:${ip}`, 30, 10 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
    return fail(404, 'This link is not valid.', { state: 'closed', reason: 'not_found' });
  }
  const envelope = await expireIfDue(found);
  return { envelope, tokenHash, meta: { ip, userAgent: userAgentOf(req), origin: req.nextUrl.origin } };
}

export interface CopyCtx extends PublicCtx {
  cc: CcRecipient;
}

/**
 * The envelope and copy recipient for a VIEW-ONLY link token (/api/sign/view/:token), or the response
 * to send. Same rate limits as the signer's links. Only copy tokens match here (never the signer's),
 * and a removed copy's token no longer matches anything.
 */
export async function loadByCcToken(req: NextRequest, token: string): Promise<CopyCtx | NextResponse> {
  const ip = clientIp(req);
  if (!rateLimit(`agr-pub-ip:${ip}`, 240, 60_000)) return fail(429, 'Too many requests. Wait a minute and try again.');
  if (!TOKEN_RE.test(token)) {
    if (!rateLimit(`agr-pub-bad:${ip}`, 30, 10 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
    return fail(404, 'This link is not valid.', { state: 'closed', reason: 'not_found' });
  }
  const tokenHash = tokenHashOf(token);
  if (!rateLimit(`agr-pub-tok:${tokenHash.slice(0, 24)}`, 180, 60_000)) return fail(429, 'Too many requests. Wait a minute and try again.');
  const found = await getAgreementStore().findByCcTokenHash(tokenHash);
  if (!found || found.envelope.status === 'draft') {
    if (!rateLimit(`agr-pub-miss:${ip}`, 30, 10 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
    return fail(404, 'This link is not valid.', { state: 'closed', reason: 'not_found' });
  }
  const envelope = await expireIfDue(found.envelope);
  return { envelope, cc: found.cc, tokenHash, meta: { ip, userAgent: userAgentOf(req), origin: req.nextUrl.origin } };
}

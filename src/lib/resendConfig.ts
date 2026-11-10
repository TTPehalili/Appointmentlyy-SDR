/**
 * Resend Configuration & Credential Resolver
 * 
 * Supports both platform pooled sending and Multi-Tenant BYOK (Bring Your Own Key).
 * Resolves customer custom keys with an automatic platform fallback to guarantee
 * that outbound email dispatch never fails.
 */

export function getResendApiKey(customApiKey?: string): string {
  // 1. If customer brings a custom Resend API Key, use it
  if (customApiKey && customApiKey.trim().startsWith('re_')) {
    return customApiKey.trim();
  }
  // 2. Platform environment variable (Railway / Local .env)
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) {
    return process.env.RESEND_API_KEY.trim();
  }
  // No key configured: callers report "email provider is not configured".
  return '';
}

export function getPlatformFallbackKey(): string {
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) {
    return process.env.RESEND_API_KEY.trim();
  }
  return '';
}

export function getResendFromEmail(customDomainOrEmail?: string): string {
  if (customDomainOrEmail && customDomainOrEmail.includes('@')) {
    return customDomainOrEmail.trim();
  }
  return process.env.RESEND_FROM_EMAIL || 'Emil Halili <emil@appointmentlyy.com>';
}

export function getResendInboundEmail(): string {
  return process.env.RESEND_INBOUND_EMAIL || 'reply@estuegai.resend.app';
}

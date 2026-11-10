/**
 * Legacy entry point used by the internal workflow engine's credential store.
 * Delegates to the server secret box (AES-256-GCM, fail-closed). Older "iv:tag:data" and "b64:"
 * values from the previous implementation can't be trusted and are refused.
 */
import { open, seal } from '@/lib/server/secretBox';

export function encryptSecret(plainText: string): string {
  return seal(plainText, 'workflow-credential');
}

export function decryptSecret(encryptedData: string): string {
  return open(encryptedData, 'workflow-credential');
}

/**
 * Runs once in the browser before the app becomes interactive (Next.js instrumentation-client).
 * Installs the in-memory context capture for "Report a problem" (src/lib/supportCapture.ts). It must never break the
 * page, so any failure here is swallowed.
 */
import { installSupportCapture } from '@/lib/supportCapture';

try {
  installSupportCapture();
} catch {
  /* no capture, the app works as before */
}

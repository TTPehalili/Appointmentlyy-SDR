/**
 * Background delivery worker (one long-running Node process).
 *
 * Every 5 s it claims up to BATCH due deliveries with a lease (Supabase: claim_due_deliveries with
 * FOR UPDATE SKIP LOCKED; file backend: in-process lease), sends them a few at a time and records
 * each attempt. A crashed or slow worker's leases expire after LEASE_SECONDS, so another instance
 * (or the next start) picks them up. `nudgeDeliveryWorker()` runs a pass right away (after new
 * events or a retry) instead of waiting for the next poll.
 *
 * Off when RUN_DELIVERY_WORKER=0 (e.g. a second web instance that shouldn't send). Never throws.
 * State lives on globalThis, so it is shared even if this module is bundled more than once.
 */
import os from 'node:os';
import crypto from 'node:crypto';
import { getIntegrationStore } from '@/lib/server/integrationStore';
import { deliverOne } from '@/lib/server/integrations/deliver';
import { insecureTestReceiverOrigin, workerPollMs } from '@/lib/server/integrations/policy';

const BATCH = 10;
const CONCURRENCY = 4;
/** Longer than one send (10 s timeout) plus recording, with room to spare. */
const LEASE_SECONDS = 60;
/** Passes per tick while full batches keep coming (bounded so one tick can't run forever). */
const MAX_BATCHES_PER_TICK = 10;

interface WorkerState {
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  running: Promise<void> | null;
  again: boolean;
  workerId: string;
}

const g = globalThis as typeof globalThis & { __appyDeliveryWorker?: WorkerState };
function state(): WorkerState {
  g.__appyDeliveryWorker ??= {
    started: false,
    timer: null,
    running: null,
    again: false,
    workerId: `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`,
  };
  return g.__appyDeliveryWorker;
}

/** Off with RUN_DELIVERY_WORKER=0, and never inside `next build` (its workers may load instrumentation). */
export const deliveryWorkerEnabled = () => process.env.RUN_DELIVERY_WORKER !== '0' && process.env.NEXT_PHASE !== 'phase-production-build';

async function runBatch(workerId: string): Promise<number> {
  const store = getIntegrationStore();
  const claimed = await store.claimDueDeliveries(BATCH, workerId, LEASE_SECONDS);
  for (let i = 0; i < claimed.length; i += CONCURRENCY) {
    await Promise.allSettled(
      claimed.slice(i, i + CONCURRENCY).map(async (d) => {
        try {
          await deliverOne(d, { workerId });
        } catch (err) {
          // The lease expires on its own and the delivery is tried again later.
          console.error('[integrations worker] delivery failed to process', d.id, (err as Error).message);
        }
      }),
    );
  }
  return claimed.length;
}

async function tick(): Promise<void> {
  const s = state();
  if (s.running) {
    s.again = true;
    return s.running;
  }
  s.running = (async () => {
    try {
      do {
        s.again = false;
        for (let n = 0; n < MAX_BATCHES_PER_TICK; n++) {
          if ((await runBatch(s.workerId)) < BATCH) break;
        }
      } while (s.again);
    } catch (err) {
      console.error('[integrations worker] pass failed', (err as Error).message);
    } finally {
      s.running = null;
    }
  })();
  return s.running;
}

/** Start polling (idempotent). Called once from instrumentation at server start. */
export function startDeliveryWorker(): void {
  const s = state();
  if (s.started || !deliveryWorkerEnabled()) return;
  s.started = true;
  if (insecureTestReceiverOrigin()) {
    console.warn(`[integrations] TEST MODE: webhooks may be sent to ${insecureTestReceiverOrigin()} (INTEGRATIONS_ALLOW_INSECURE_TEST_RECEIVER). Never use this in production.`);
  }
  s.timer = setInterval(() => void tick(), workerPollMs());
  s.timer.unref?.();
  void tick(); // pick up anything left from before a restart
}

/** Process due deliveries now (e.g. from `after()` once new events are stored). Never throws. */
export async function nudgeDeliveryWorker(): Promise<void> {
  if (!deliveryWorkerEnabled()) return;
  try {
    await tick();
  } catch {
    /* tick logs its own errors */
  }
}

/** Tests / shutdown. */
export function stopDeliveryWorker(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  s.timer = null;
  s.started = false;
}

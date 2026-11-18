/** Runs once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Boot guard: say loudly when the demo-login flag is set (ignored in production unless allowed).
    const { demoLoginWarning } = await import('./lib/demoMode');
    const demoWarning = demoLoginWarning();
    if (demoWarning) console.warn(demoWarning);
    // One warn line for any API request over 2 s (route pattern and duration only). Never blocks start-up.
    try {
      const { installSlowRequestLog } = await import('./lib/server/slowRequestLog');
      installSlowRequestLog();
    } catch (err) {
      console.error('[instrumentation] slow-request log not installed', err);
    }
    const { installAnthropicBridge } = await import('./lib/server/anthropicBridge');
    installAnthropicBridge();
    // Webhook/CRM delivery worker (off with RUN_DELIVERY_WORKER=0). Never blocks or fails start-up.
    try {
      const { startDeliveryWorker } = await import('./lib/server/integrations/worker');
      startDeliveryWorker();
    } catch (err) {
      console.error('[instrumentation] delivery worker did not start', err);
    }
  }
}

import { WorkflowItem, ItemPipeline } from './item-pipeline';

/**
 * SECURITY: this is NOT a sandbox. `new Function` runs the code inside the server process with
 * its globals (process, process.env and its secrets, fetch to any host). It is only safe
 * because the only workflows that ever run are in the platform (APPOINTMENTLYY) store, which only
 * platform staff can switch on and run: client workspaces' workflows are drafts that the runner,
 * webhooks and MCP never read (see workflowDbForTenant in src/lib/db.ts and isStaffOnlyApi in
 * src/proxy.ts). Never let client-authored code reach WorkflowRunner without a real isolate.
 */
export class CodeSandbox {
  /**
   * Executes custom user JavaScript with standard n8n-style helpers (no isolation: see above).
   */
  static async run(
    code: string,
    inputItems: WorkflowItem[],
    extraContext: Record<string, any> = {}
  ): Promise<WorkflowItem[]> {
    // Provide n8n-compatible $input helper
    const $input = {
      all: () => inputItems.map((item) => ({ ...item })),
      first: () => (inputItems.length > 0 ? { ...inputItems[0] } : { json: {} }),
      item: (index: number) => (inputItems[index] ? { ...inputItems[index] } : { json: {} })
    };

    // Standard helper utilities
    const helpers = {
      DateTime: {
        now: () => new Date().toISOString(),
        format: (d: Date | string, locale = 'en-US') => new Date(d).toLocaleString(locale)
      },
      btoa: (str: string) => Buffer.from(str, 'utf-8').toString('base64'),
      atob: (b64: string) => Buffer.from(b64, 'base64').toString('utf-8')
    };

    // Construct isolated function execution
    const sandboxScope = {
      $input,
      $items: inputItems,
      ...helpers,
      ...extraContext,
      console: {
        log: (...args: any[]) => console.log('[CodeNode Log]:', ...args),
        warn: (...args: any[]) => console.warn('[CodeNode Warn]:', ...args),
        error: (...args: any[]) => console.error('[CodeNode Error]:', ...args)
      }
    };

    try {
      const scopeKeys = Object.keys(sandboxScope);
      const scopeValues = Object.values(sandboxScope);

      // Async wrapper function
      const wrappedBody = `
        return (async () => {
          ${code}
        })();
      `;

      const fn = new Function(...scopeKeys, wrappedBody);
      const result = await fn(...scopeValues);

      return ItemPipeline.standardize(result);
    } catch (err: any) {
      throw new Error(`Code Node execution error: ${err.message || String(err)}`);
    }
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { WorkflowRunner } from '@/engine/runner';

async function handleProductionWebhook(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const webhookPath = slug.join('/');

    // Ignore test endpoint routes that match this catch-all
    if (slug[0] === 'test') {
      return NextResponse.json({ success: false, error: 'Invalid test route' }, { status: 400 });
    }

    const workflow = await db.findWorkflowByWebhookPath(webhookPath);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `No active workflow registered for webhook path: /${webhookPath}` },
        { status: 404 }
      );
    }

    if (!workflow.active) {
      return NextResponse.json(
        { success: false, error: `Workflow "${workflow.name}" is currently paused / inactive` },
        { status: 403 }
      );
    }

    // Find webhook node config
    const webhookNode = workflow.nodes.find(
      (n) => n.data?.nodeType === 'webhookTrigger' || n.category === 'trigger' || n.type === 'webhookTrigger'
    );
    const config = webhookNode?.data?.config || webhookNode?.config || {};

    // A webhook runs a workflow on the server, so it must have a secret (anonymous calls are refused).
    if (!config.authSecret) {
      return NextResponse.json(
        { success: false, error: 'This webhook has no secret configured. Add one in the workflow before calling it.' },
        { status: 401 }
      );
    }
    {
      const authHeader = request.headers.get('authorization') || '';
      const secretHeader = request.headers.get('x-webhook-secret') || '';
      const querySecret = new URL(request.url).searchParams.get('secret') || '';

      const isAuthorized =
        authHeader.includes(config.authSecret) ||
        secretHeader === config.authSecret ||
        querySecret === config.authSecret;

      if (!isAuthorized) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Invalid webhook secret token' },
          { status: 401 }
        );
      }
    }

    // Parse payload
    let body: any = {};
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      try {
        body = await request.json();
      } catch {
        body = { raw: await request.text() };
      }
    }

    const payload = {
      headers: Object.fromEntries(request.headers.entries()),
      query: Object.fromEntries(new URL(request.url).searchParams.entries()),
      params: { path: webhookPath },
      body,
      method: request.method,
      receivedAt: new Date().toISOString()
    };

    const responseMode = config.responseMode || 'onReceived';

    if (responseMode === 'lastNode') {
      // Synchronous execution: wait for workflow to finish and return last node output
      const execution = await WorkflowRunner.execute(workflow, {
        triggerNodeId: webhookNode?.id,
        triggerPayload: payload,
        triggerSource: 'webhook'
      });

      const outputs = Object.values(execution.nodeOutputs);
      const lastOutput = outputs.length > 0 ? outputs[outputs.length - 1].output : null;

      return NextResponse.json({
        success: execution.status !== 'error',
        executionId: execution.id,
        status: execution.status,
        data: lastOutput || { status: 'completed' }
      });
    }

    // Asynchronous execution: respond immediately
    WorkflowRunner.execute(workflow, {
      triggerNodeId: webhookNode?.id,
      triggerPayload: payload,
      triggerSource: 'webhook'
    }).catch((err) => console.error('Background webhook workflow execution error:', err));

    return NextResponse.json({
      success: true,
      message: `Webhook accepted for workflow: ${workflow.name}`,
      path: webhookPath,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Webhook ingress error' },
      { status: 500 }
    );
  }
}

export const GET = handleProductionWebhook;
export const POST = handleProductionWebhook;
export const PUT = handleProductionWebhook;
export const DELETE = handleProductionWebhook;

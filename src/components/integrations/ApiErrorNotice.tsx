'use client';

import * as React from 'react';
import { CloudOff, Lock } from 'lucide-react';
import { Button, Card, EmptyState, InlineError } from '@/components/ui';
import type { ApiFailure } from './integrationsClient';

export type PanelError = Pick<ApiFailure, 'error' | 'kind'>;

/**
 * API failures, by kind: not an admin (friendly no-access), API not on this server yet (neutral,
 * not an alarm), anything else (the server's own error text, with Retry).
 */
export function ApiErrorNotice({ error, onRetry }: { error: PanelError; onRetry?: () => void }) {
  if (error.kind === 'forbidden') {
    return (
      <Card data-testid="integrations-no-access">
        <EmptyState
          icon={<Lock />}
          title="Only workspace admins can manage integrations"
          description="Ask an admin in your workspace if you need a webhook or CRM connection set up."
        />
      </Card>
    );
  }
  if (error.kind === 'unavailable') {
    return (
      <Card data-testid="integrations-unavailable">
        <EmptyState
          icon={<CloudOff />}
          title="Integrations aren’t available yet"
          description={error.error}
          action={
            onRetry ? (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }
  return <InlineError message={error.error} onRetry={onRetry} />;
}

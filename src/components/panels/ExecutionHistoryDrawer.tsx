'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Clock, RefreshCw, Terminal, ChevronRight } from 'lucide-react';
import { ExecutionRecord } from '@/lib/db';
import { Badge, Drawer, IconButton } from '@/components/ui';

interface ExecutionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
}

export default function ExecutionHistoryDrawer({ isOpen, onClose, workflowId }: ExecutionHistoryDrawerProps) {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [selectedExec, setSelectedExec] = useState<ExecutionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchExecutions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/executions?limit=30');
      const data = await res.json();
      if (data.success) {
        // Filter by current workflow or show all
        const list = data.data.filter((e: ExecutionRecord) => !workflowId || e.workflowId === workflowId);
        setExecutions(list);
        if (list.length > 0 && !selectedExec) {
          setSelectedExec(list[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch executions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchExecutions();
    }
  }, [isOpen, workflowId]);

  return (
    <Drawer open={isOpen} onClose={onClose} width={640} bare label="Executions">
      {/* Header */}
      <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h2 text-fg">Executions</h2>
          <p className="mt-0.5 text-small text-fg-secondary">Run history with the output of each step</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Refresh history" size="sm" onClick={fetchExecutions} disabled={isLoading} title="Refresh history">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </IconButton>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Main Content: Split Master-Detail */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Left List of Executions */}
        <div className="w-full md:w-5/12 border-b md:border-b-0 md:border-r border-line overflow-y-auto p-3 space-y-2 bg-app">
          {executions.length === 0 ? (
            <div className="py-12 px-4 text-center text-fg-secondary text-small">
              No runs yet. Click &ldquo;Run workflow&rdquo; or trigger a webhook.
            </div>
          ) : (
            executions.map((exec) => {
              const isSelected = selectedExec?.id === exec.id;
              return (
                <div
                  key={exec.id}
                  onClick={() => setSelectedExec(exec)}
                  className={`p-3 rounded-lg border text-small cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-selected-soft border-selected ring-1 ring-selected shadow-xs'
                      : 'bg-surface border-line hover:border-line-strong'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-caption text-fg-tertiary">{exec.id.substring(0, 14)}</span>
                    <Badge
                      tone={
                        exec.status === 'success'
                          ? 'success'
                          : exec.status === 'running'
                          ? 'warning'
                          : 'danger'
                      }
                      className="capitalize"
                    >
                      {exec.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-body-strong text-fg truncate">{exec.workflowName}</div>
                  <div className="mt-1 flex items-center justify-between text-caption text-fg-tertiary tabular-nums">
                    <span>Source: {exec.triggerSource}</span>
                    <span>{exec.executionTimeMs ? `${exec.executionTimeMs}ms` : '--'}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Detail Pane */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedExec ? (
            <>
              <div className="p-3 rounded-lg bg-surface border border-line shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-body-strong text-fg">{selectedExec.workflowName}</span>
                  <span className="text-caption tabular-nums text-fg-tertiary">
                    {new Date(selectedExec.startedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-small text-fg-secondary tabular-nums">
                  <span>Trigger: {selectedExec.triggerSource}</span>
                  <span>Duration: {selectedExec.executionTimeMs}ms</span>
                </div>
                {selectedExec.error && (
                  <div className="p-2 rounded-sm bg-danger-bg text-danger-fg text-small">
                    <strong>Error:</strong> {selectedExec.error}
                  </div>
                )}
              </div>

              {/* Node-by-node execution trace */}
              <div className="space-y-3">
                <h3 className="text-h3 text-fg">Step outputs</h3>
                {Object.entries(selectedExec.nodeOutputs || {}).map(([nodeId, trace]) => (
                  <div key={nodeId} className="rounded-lg border border-line bg-surface overflow-hidden shadow-xs">
                    <div className="px-3 py-2 bg-subtle border-b border-line flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {trace.status === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 text-success-fg" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-danger-fg" />
                        )}
                        <span className="font-mono text-small text-fg">{nodeId}</span>
                      </div>
                      <span className="text-caption tabular-nums text-fg-tertiary">
                        {trace.executionTimeMs ? `${trace.executionTimeMs}ms` : ''}
                      </span>
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="text-caption text-fg-tertiary">Output</div>
                      <pre className="p-2 rounded-sm bg-subtle border border-line text-fg font-mono text-caption overflow-x-auto max-h-48 whitespace-pre-wrap">
                        {JSON.stringify(trace.output, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-fg-secondary text-small">Select a run to see its step outputs</div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

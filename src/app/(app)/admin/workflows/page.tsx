'use client';

import React, { useState } from 'react';
import { useSession } from '@/lib/session';
import Link from 'next/link';
import WorkflowAutomationStudio from '@/components/admin/WorkflowAutomationStudio';
import WorkflowListHub from '@/components/admin/WorkflowListHub';
import { Lock, ArrowLeft, Layers, ChevronRight, Workflow } from 'lucide-react';
import { Badge, buttonClasses } from '@/components/ui';

export default function WorkflowsStandalonePage() {
  const { role: userRole } = useSession();
  const isLoading = false;
  const [view, setView] = useState<'list' | 'canvas'>('list');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | undefined>('wf-voice-chatbot');
  // Set when the assistant just built a workflow: the canvas opens its chat and checks every step.
  const [autoAssist, setAutoAssist] = useState(false);

  // Workspace admins (and platform staff) build workflows. Each workspace has its own workflows;
  // only platform staff can switch one on or run it (the API enforces the same rules).
  const isAdmin = userRole === 'Super Admin' || userRole === 'Admin';

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <span className="h-6 w-6 rounded-full border-2 border-ink-300 border-t-transparent animate-spin" />
            </div>
          ) : !isAdmin ? (
            /* ACCESS RESTRICTED GATE FOR NON-ADMIN USERS */
            <div className="max-w-md mx-auto my-16 text-center space-y-5 bg-surface border border-line rounded-lg p-8 shadow-xs">
              <div className="h-10 w-10 rounded-full bg-subtle text-fg-secondary flex items-center justify-center mx-auto">
                <Lock className="h-5 w-5" />
              </div>

              <div>
                <Badge tone="danger">Role restricted: {userRole}</Badge>
                <h2 className="text-h2 text-fg mt-3">Admin access required</h2>
                <p className="text-body text-fg-secondary mt-1.5">
                  Workflows run live webhook triggers, CRM sync and AI evaluations. Only workspace admins can open the workflow builder.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                <Link href="/dialer" className={buttonClasses('secondary', 'md', 'w-full sm:w-auto')}>
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to the Dialer</span>
                </Link>

              </div>
            </div>
          ) : (
            /* WORKFLOW LIST OR CANVAS STUDIO VIEW */
            <div className="space-y-6">
              {/* Header: breadcrumb, title and view switch */}
              <div className="space-y-2">
                <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-small text-fg-secondary">
                  <Link href="/admin" className="focus-ring rounded-sm hover:text-fg transition-colors">
                    Admin
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 text-fg-tertiary" />
                  <button
                    onClick={() => setView('list')}
                    className={`focus-ring rounded-sm transition-colors ${view === 'list' ? 'text-fg' : 'hover:text-fg'}`}
                  >
                    Workflows
                  </button>
                  {view === 'canvas' && (
                    <>
                      <ChevronRight className="h-3.5 w-3.5 text-fg-tertiary" />
                      <span className="text-fg">Canvas</span>
                    </>
                  )}
                </nav>

                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <h1 className="text-h1 text-fg">Workflows</h1>
                    <p className="mt-1 text-body text-fg-secondary">
                      Automate follow-ups, CRM updates and alerts with triggers and actions.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-small text-fg-secondary">
                      <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                      <span>{userRole}</span>
                    </span>

                    {/* View mode toggle */}
                    <div className="inline-flex items-center rounded-md border border-line bg-subtle p-0.5 text-small">
                      <button
                        onClick={() => setView('list')}
                        className={`focus-ring h-7 px-2.5 rounded-sm transition-colors flex items-center gap-1.5 cursor-pointer ${
                          view === 'list'
                            ? 'bg-surface text-fg shadow-xs'
                            : 'text-fg-secondary hover:text-fg'
                        }`}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        <span>List</span>
                      </button>
                      <button
                        onClick={() => setView('canvas')}
                        className={`focus-ring h-7 px-2.5 rounded-sm transition-colors flex items-center gap-1.5 cursor-pointer ${
                          view === 'canvas'
                            ? 'bg-surface text-fg shadow-xs'
                            : 'text-fg-secondary hover:text-fg'
                        }`}
                      >
                        <Workflow className="h-3.5 w-3.5" />
                        <span>Canvas</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic View Component */}
              {view === 'list' ? (
                <WorkflowListHub
                  onOpenCanvas={(wfId, opts) => {
                    if (wfId) setSelectedWorkflowId(wfId);
                    setAutoAssist(Boolean(opts?.fromAssistant));
                    setView('canvas');
                  }}
                />
              ) : (
                <WorkflowAutomationStudio
                  initialWorkflowId={selectedWorkflowId}
                  onBackToList={() => setView('list')}
                  autoAssist={autoAssist}
                  onAutoAssistDone={() => setAutoAssist(false)}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

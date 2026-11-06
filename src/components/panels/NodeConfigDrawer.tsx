'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, X, Play, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, RefreshCw, CheckCheck } from 'lucide-react';
import { getNodeDefinition, INodeDefinition } from '@/registry';
import { Button } from '@/components/ui';

const fieldCls =
  'focus-ring w-full h-9 px-3 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled';
const groupLabelCls = 'text-caption text-fg-tertiary';

function ElevenLabsBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className || 'h-5 w-5'}>
      <rect x="7" y="4" width="3.5" height="16" rx="1.75" />
      <rect x="13.5" y="4" width="3.5" height="16" rx="1.75" />
    </svg>
  );
}

interface NodeConfigDrawerProps {
  nodeId: string | null;
  workflowId: string;
  initialNodeData: any;
  onClose: () => void;
  onSaveConfig: (nodeId: string, updatedConfig: Record<string, any>, updatedLabel?: string) => void;
}

export default function NodeConfigDrawer({
  nodeId,
  workflowId,
  initialNodeData,
  onClose,
  onSaveConfig
}: NodeConfigDrawerProps) {
  const [nodeDef, setNodeDef] = useState<INodeDefinition | null>(null);
  const [label, setLabel] = useState('');
  const [config, setConfig] = useState<Record<string, any>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<any>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  useEffect(() => {
    if (initialNodeData) {
      setLabel(initialNodeData.label || '');
      setConfig(initialNodeData.config || {});
      const def = getNodeDefinition(initialNodeData.nodeType || '');
      setNodeDef(def || null);
    }
  }, [initialNodeData]);

  if (!nodeId || !initialNodeData) return null;

  const handleFieldChange = (key: string, val: any) => {
    const updated = { ...config, [key]: val };
    setConfig(updated);
    onSaveConfig(nodeId, updated, label);
  };

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    onSaveConfig(nodeId, config, newLabel);
  };

  const handleRunTestStep = async () => {
    setIsTesting(true);
    setTestOutput(null);
    try {
      if (nodeDef?.execute) {
        const result = await nodeDef.execute({
          nodeId,
          nodeName: label,
          workflowId,
          executionId: `test-step-${Date.now()}`,
          config,
          inputItems: [{ json: { sampleInput: true, timestamp: new Date().toISOString() } }],
          context: {
            resolve: (input: any) => input
          } as any
        });
        setTestOutput({ success: true, items: result[0] || [] });
      } else {
        setTestOutput({ success: true, items: [{ json: { status: 'passed', simulated: true } }] });
      }
    } catch (err: any) {
      setTestOutput({ success: false, error: err.message || String(err) });
    } finally {
      setIsTesting(false);
    }
  };

  const isElevenLabs = initialNodeData.nodeType === 'elevenLabsNode';

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-surface border-l border-line shadow-lg flex flex-col animate-in slide-in-from-right duration-200 rounded-l-xl overflow-hidden">
      {/* Node details top bar */}
      <div className="px-5 py-3 border-b border-line flex items-center justify-between bg-surface text-small">
        <button
          onClick={onClose}
          className="focus-ring rounded-sm flex items-center gap-1.5 font-medium text-fg-secondary hover:text-fg transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Node details</span>
        </button>

        <a
          href="https://elevenlabs.io/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring rounded-sm flex items-center gap-1 text-fg-secondary hover:text-fg transition-colors text-small"
        >
          <span>Docs</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Node Brand & Description Header (Exactly matching n8n screenshot) */}
      <div className="px-5 py-4 border-b border-line space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md border border-line bg-subtle text-fg-secondary flex items-center justify-center text-small font-medium">
              {isElevenLabs ? (
                <ElevenLabsBadgeIcon className="h-4 w-4" />
              ) : (
                nodeDef?.displayName?.[0] || 'N'
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-h2 text-fg">{nodeDef?.displayName}</h2>
              <Check className="h-4 w-4 text-fg-secondary" aria-label="Verified" />
            </div>
          </div>
          <span className="text-caption text-fg-tertiary">Installed</span>
        </div>

        <p className="text-body text-fg-secondary">
          {nodeDef?.description || 'Interact with ElevenLabs API for speech synthesis and voice cloning'}
        </p>

        <div className="flex items-center gap-2 text-small text-fg-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
            <span>Verified</span>
          </span>
          <span>·</span>
          <span>Published by appointmentlyy</span>
        </div>
      </div>

      {/* Body scroll area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Node Label Customization */}
        <div className="space-y-1">
          <label className="text-small font-medium text-fg">Step name on canvas</label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className={fieldCls}
          />
        </div>

        {/* ElevenLabs 7 Actions Selector (Exact replica of screenshot) */}
        {isElevenLabs && (
          <div className="space-y-3 border-y border-line py-3">
            <div className="flex items-center justify-between">
              <span className="text-h3 text-fg">Actions <span className="text-caption tabular-nums text-fg-tertiary">7</span></span>
            </div>

            {/* Voice Actions */}
            <div className="space-y-1.5">
              <span className={groupLabelCls}>Voice actions</span>
              <div className="space-y-1 pl-1">
                {[
                  { id: 'getVoice', label: 'Get a voice' },
                  { id: 'getManyVoices', label: 'Get many voices' },
                  { id: 'createVoiceClone', label: 'Create a voice clone' },
                  { id: 'deleteVoice', label: 'Delete a voice' }
                ].map((act) => {
                  const isChecked = config.operation === act.id;
                  return (
                    <label
                      key={act.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-body cursor-pointer transition-colors ${
                        isChecked ? 'bg-selected font-medium text-fg' : 'text-fg-secondary hover:bg-subtle'
                      }`}
                    >
                      <input
                        type="radio"
                        name="elevenlabs_op"
                        checked={isChecked}
                        onChange={() => {
                          handleFieldChange('actionCategory', 'voice');
                          handleFieldChange('operation', act.id);
                        }}
                        className="focus-ring h-4 w-4 accent-ink-900"
                      />
                      <span>{act.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Speech Actions */}
            <div className="space-y-1.5 pt-2">
              <span className={groupLabelCls}>Speech actions</span>
              <div className="space-y-1 pl-1">
                {[
                  { id: 'textToSpeech', label: 'Convert text to speech' },
                  { id: 'transcribeAudio', label: 'Transcribe audio or video' },
                  { id: 'changeVoiceSettings', label: 'Change a voice' }
                ].map((act) => {
                  const isChecked = config.operation === act.id;
                  return (
                    <label
                      key={act.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-body cursor-pointer transition-colors ${
                        isChecked ? 'bg-selected font-medium text-fg' : 'text-fg-secondary hover:bg-subtle'
                      }`}
                    >
                      <input
                        type="radio"
                        name="elevenlabs_op"
                        checked={isChecked}
                        onChange={() => {
                          handleFieldChange('actionCategory', 'speech');
                          handleFieldChange('operation', act.id);
                        }}
                        className="focus-ring h-4 w-4 accent-ink-900"
                      />
                      <span>{act.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Parameter Fields */}
        <div className="space-y-4">
          <h3 className="text-h3 text-fg">Parameters</h3>
          {nodeDef?.properties.map((prop) => {
            // Check displayOptions
            if (prop.displayOptions?.show) {
              for (const [key, allowedVals] of Object.entries(prop.displayOptions.show)) {
                if (!allowedVals.includes(config[key])) {
                  return null;
                }
              }
            }

            // Skip operation radio if already displayed above for ElevenLabs
            if (isElevenLabs && (prop.name === 'operation' || prop.name === 'actionCategory')) {
              return null;
            }

            const currentValue = config[prop.name] !== undefined ? config[prop.name] : prop.default;

            return (
              <div key={prop.name} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-small font-medium text-fg">{prop.displayName}</label>
                  {prop.required && <span className="text-caption text-fg-tertiary">Required</span>}
                </div>

                {prop.type === 'options' && (
                  <select
                    value={currentValue}
                    onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                    className={`${fieldCls} pr-8`}
                  >
                    {prop.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                )}

                {prop.type === 'string' && (
                  <input
                    type="text"
                    value={currentValue}
                    onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                    className={`${fieldCls} font-mono text-small`}
                  />
                )}

                {prop.type === 'number' && (
                  <input
                    type="number"
                    step="0.05"
                    value={currentValue}
                    onChange={(e) => handleFieldChange(prop.name, Number(e.target.value))}
                    className={`${fieldCls} tabular-nums`}
                  />
                )}

                {prop.type === 'boolean' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(currentValue)}
                      onChange={(e) => handleFieldChange(prop.name, e.target.checked)}
                      className="focus-ring h-4 w-4 rounded-sm accent-ink-900"
                    />
                    <span className="text-body text-fg-secondary">Enabled</span>
                  </label>
                )}

                {(prop.type === 'json' || prop.type === 'code') && (
                  <textarea
                    rows={prop.type === 'code' ? 6 : 4}
                    value={typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : currentValue}
                    onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                    className="focus-ring w-full px-3 py-2 rounded-sm bg-subtle text-fg font-mono text-small border border-line-strong"
                  />
                )}

                {prop.description && (
                  <p className="text-small text-fg-tertiary">{prop.description}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Test Step Inspector */}
        <div className="pt-4 border-t border-line space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-h3 text-fg">Test step</h3>
            <Button size="sm" variant="primary" onClick={handleRunTestStep} disabled={isTesting}>
              {isTesting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Test step</span>
                </>
              )}
            </Button>
          </div>

          {testOutput && (
            <div className="p-3 rounded-lg bg-subtle border border-line text-caption space-y-1.5 max-h-56 overflow-y-auto">
              <div className="flex items-center justify-between text-fg-tertiary border-b border-line pb-1.5">
                <span>Output</span>
                {testOutput.success ? (
                  <span className="text-success-fg flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                  </span>
                ) : (
                  <span className="text-danger-fg flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Error
                  </span>
                )}
              </div>
              <pre className="text-fg font-mono whitespace-pre-wrap">
                {JSON.stringify(testOutput.items || testOutput.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-line flex items-center justify-between text-fg-tertiary">
        <span className="font-mono text-caption">{nodeDef?.name}</span>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

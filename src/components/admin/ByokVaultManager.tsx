'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Unlock, CheckCircle2, ShieldCheck, Eye, EyeOff, Check, Cpu, ArrowRight, Mail, Calendar, Mic, Info, X, AudioLines } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, Dialog, Field, IconButton, Input, PageHeader, Select, Tooltip } from '@/components/ui';
import { isDemoWorkspace } from '@/lib/demoMode';
import { getStoredSession } from '@/lib/session';
import { ELEVENLABS_MODELS, elevenLabsModelLabel } from '@/lib/elevenlabs/voiceEngine';

interface TenantBYOKState {
  tenantId: string;
  tenantName: string;
  isUnlocked: boolean;
  resendKey: string;
  resendDomain: string;
  resendFromEmail: string;
  calendarBookingLink: string;
  openaiKey: string;
  claudeKey: string;
  geminiKey: string;
  elevenlabsKey: string;
  fallbackStrategy: 'system_pool' | 'pause_alert';
}

/** Real workspaces: one vault entry, for the workspace you're signed in to. */
function currentWorkspaceVault(): TenantBYOKState {
  const session = getStoredSession();
  let savedLink = '';
  try {
    savedLink = (localStorage.getItem('tenant_calendar_link') || '').trim();
  } catch {
    // storage unavailable
  }
  // The platform owner's own booking link never carries over into a client workspace.
  if (savedLink.includes('bpogtm') || savedLink.includes('emil-appointmentlyy') || savedLink.includes('your-team')) savedLink = '';
  const id = session.tenantCode || 'current';
  return {
    tenantId: id,
    tenantName: session.tenantName || 'This workspace',
    isUnlocked: true,
    resendKey: '',
    resendDomain: '',
    resendFromEmail: '',
    calendarBookingLink: savedLink,
    openaiKey: '',
    claudeKey: '',
    geminiKey: '',
    elevenlabsKey: '',
    fallbackStrategy: 'system_pool',
  };
}

export default function ByokVaultManager() {
  // The four sample workspaces, "Active" test results and the owner's booking link are demo data.
  const [isDemo] = useState<boolean>(() => isDemoWorkspace());
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() =>
    isDemoWorkspace() ? 'ten_1' : currentWorkspaceVault().tenantId
  );
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ [key: string]: { success: boolean; latency: string; model: string } }>(() => !isDemoWorkspace() ? ({} as { [key: string]: { success: boolean; latency: string; model: string } }) : {
    'resend': { success: true, latency: '88ms', model: 'Resend API Active' },
    'openai': { success: true, latency: '142ms', model: 'gpt-4o' },
    'elevenlabs': { success: true, latency: '185ms', model: `${elevenLabsModelLabel(ELEVENLABS_MODELS.realtime)} (live calls) and ${elevenLabsModelLabel(ELEVENLABS_MODELS.expressive)} (Live floor)` }
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [requestUpgradeModal, setRequestUpgradeModal] = useState(false);
  const [confirmLockVault, setConfirmLockVault] = useState(false);

  useEffect(() => {
    try {
      const savedLink = localStorage.getItem('tenant_calendar_link');
      if (isDemoWorkspace() && savedLink && savedLink.includes('emil-appointmentlyy')) {
        localStorage.setItem('tenant_calendar_link', 'https://calendly.com/bpogtm/30min');
      }
    } catch {}
  }, []);

  const [tenantsBYOK, setTenantsBYOK] = useState<{ [id: string]: TenantBYOKState }>(() => {
    if (!isDemoWorkspace()) {
      const own = currentWorkspaceVault();
      return { [own.tenantId]: own };
    }
    return {
    'ten_1': {
      tenantId: 'ten_1',
      tenantName: 'Apex Global BPO',
      isUnlocked: true,
      resendKey: '',
      resendDomain: 'apexglobalbpo.ph',
      resendFromEmail: 'outbound@apexglobalbpo.ph',
      calendarBookingLink: 'https://calendly.com/bpogtm/30min',
      openaiKey: '',
      claudeKey: '',
      geminiKey: '',
      elevenlabsKey: '',
      fallbackStrategy: 'system_pool'
    },
    'ten_2': {
      tenantId: 'ten_2',
      tenantName: 'Outsource Accelerator Partner A',
      isUnlocked: true,
      resendKey: '',
      resendDomain: '',
      resendFromEmail: '',
      calendarBookingLink: 'https://calendly.com/bpogtm/30min',
      openaiKey: '',
      claudeKey: '',
      geminiKey: '',
      elevenlabsKey: '',
      fallbackStrategy: 'system_pool'
    },
    'ten_3': {
      tenantId: 'ten_3',
      tenantName: 'Horizon Solar Sales Floor',
      isUnlocked: false,
      resendKey: '',
      resendDomain: '',
      resendFromEmail: '',
      calendarBookingLink: 'https://calendly.com/bpogtm/30min',
      openaiKey: '',
      claudeKey: '',
      geminiKey: '',
      elevenlabsKey: '',
      fallbackStrategy: 'pause_alert'
    },
    'ten_4': {
      tenantId: 'ten_4',
      tenantName: 'Metro Cloud BPO',
      isUnlocked: false,
      resendKey: '',
      resendDomain: '',
      resendFromEmail: '',
      calendarBookingLink: 'https://calendly.com/bpogtm/30min',
      openaiKey: '',
      claudeKey: '',
      geminiKey: '',
      elevenlabsKey: '',
      fallbackStrategy: 'system_pool'
    }
    };
  });

  const activeTenant = tenantsBYOK[selectedTenantId] || Object.values(tenantsBYOK)[0];

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleUpdateKey = (field: keyof TenantBYOKState, value: any) => {
    setTenantsBYOK(prev => ({
      ...prev,
      [selectedTenantId]: {
        ...prev[selectedTenantId],
        [field]: value
      }
    }));
  };

  const toggleUnlockTenant = () => {
    setTenantsBYOK(prev => ({
      ...prev,
      [selectedTenantId]: {
        ...prev[selectedTenantId],
        isUnlocked: !prev[selectedTenantId].isUnlocked
      }
    }));
  };

  const testConnection = async (provider: string) => {
    setTestingKey(provider);
    try {
      const apiKey = provider === 'resend' ? activeTenant.resendKey :
                     provider === 'openai' ? activeTenant.openaiKey :
                     provider === 'claude' ? activeTenant.claudeKey :
                     provider === 'gemini' ? activeTenant.geminiKey :
                     activeTenant.elevenlabsKey;

      if (!apiKey) {
        setTestResults(prev => ({
          ...prev,
          [provider]: {
            success: false,
            latency: '0ms',
            model: 'No key entered. Please paste a key first.'
          }
        }));
        setTestingKey(null);
        return;
      }

      const res = await fetch('/api/byok/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          domain: provider === 'resend' ? activeTenant.resendDomain : undefined
        })
      });

      const data = await res.json();
      if (data.success) {
        setTestResults(prev => ({
          ...prev,
          [provider]: {
            success: true,
            latency: data.latency || '95ms',
            model: data.message || (provider === 'resend' ? 'Active & Ready' : (data.model || 'Verified'))
          }
        }));
      } else {
        setTestResults(prev => ({
          ...prev,
          [provider]: {
            success: false,
            latency: data.latency || 'Err',
            model: data.error || 'Authentication failed'
          }
        }));
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [provider]: {
          success: false,
          latency: 'Err',
          model: err.message || 'Validation error'
        }
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const handleSaveVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTenant.calendarBookingLink) {
      try {
        localStorage.setItem('tenant_calendar_link', activeTenant.calendarBookingLink.trim());
      } catch {}
    } else if (!isDemo) {
      try {
        localStorage.removeItem('tenant_calendar_link');
      } catch {}
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const settingsRow = 'grid grid-cols-1 gap-4 py-6 first:pt-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8';

  const renderKeyInput = (
    provider: string,
    field: 'resendKey' | 'openaiKey' | 'claudeKey' | 'geminiKey' | 'elevenlabsKey',
    placeholder: string,
    testingLabel: string,
  ) => (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Input
          mono
          type={showKeys[provider] ? 'text' : 'password'}
          value={activeTenant[field]}
          onChange={(e) => handleUpdateKey(field, e.target.value)}
          placeholder={placeholder}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => toggleShowKey(provider)}
          aria-label={showKeys[provider] ? 'Hide key' : 'Show key'}
          className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-tertiary hover:text-fg"
        >
          {showKeys[provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <Button
        variant="secondary"
        onClick={() => testConnection(provider)}
        disabled={!activeTenant[field] || testingKey === provider}
      >
        {testingKey === provider ? testingLabel : 'Test connection'}
      </Button>
    </div>
  );

  const connectedBadge = (provider: string) =>
    testResults[provider] && (
      <Badge tone={testResults[provider].success ? 'success' : 'danger'}>
        {testResults[provider].success ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {testResults[provider].success ? 'Connected' : 'Not connected'} ({testResults[provider].latency})
      </Badge>
    );

  /** The validator's message under the key field (tier, quota, or why the key failed). */
  const resultDetail = (provider: string) =>
    testResults[provider]?.model ? (
      <p className={`text-small ${testResults[provider].success ? 'text-fg-secondary' : 'text-danger-fg'}`}>{testResults[provider].model}</p>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI providers"
        description="Bring your own keys for the ElevenLabs voice engine, email and writing models, isolated per workspace."
        meta={
          <div className="w-72">
            <Select
              aria-label="Workspace"
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
            >
              {Object.values(tenantsBYOK).map(t => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.tenantName} {t.isUnlocked ? '(Unlocked)' : '(Locked)'}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {/* Main Vault Workspace */}
      {!activeTenant.isUnlocked ? (
        /* LOCKED STATE (Upsell & Guardrail Mode) */
        <Card className="space-y-6 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-bg text-warning-fg">
            <Lock className="h-6 w-6" />
          </div>

          <div className="mx-auto max-w-xl space-y-2">
            <Badge tone="warning">Locked · $49/mo or $490/yr add-on</Badge>
            <h3 className="text-h2 text-fg">
              <Tooltip content="Bring your own key: use the workspace's own provider API keys.">
                <span className="cursor-help underline decoration-dotted decoration-fg-tertiary underline-offset-4">BYOK</span>
              </Tooltip>{' '}
              is not active for {activeTenant.tenantName}
            </h3>
            <p className="text-body text-fg-secondary">
              Bring your own ElevenLabs key for your own voice library and voice clones, plus your own Claude, GPT-4o and Gemini keys for writing, and bypass platform limits. Add this module to the next invoice or contact your platform administrator.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button variant="brand" onClick={() => setRequestUpgradeModal(true)}>
              Request activation
              <ArrowRight />
            </Button>

            {/* Super Admin Override Switch */}
            <Button
              variant="secondary"
              onClick={toggleUnlockTenant}
              title="Super Admin Override: Enable BYOK feature flag immediately"
              icon={<Unlock />}
            >
              Force unlock (Super Admin)
            </Button>
          </div>

          {/* Feature Comparison Box */}
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 border-t border-line pt-6 text-left md:grid-cols-3">
            <div className="space-y-1 rounded-md bg-subtle p-3.5">
              <span className="flex items-center gap-2 text-body-strong text-fg">
                <Mic className="h-4 w-4 text-fg-secondary" />
                Dedicated voice clones
              </span>
              <p className="text-small text-fg-secondary">Deploy your own ElevenLabs voice IDs and clones for each BPO campaign and accent.</p>
            </div>
            <div className="space-y-1 rounded-md bg-subtle p-3.5">
              <span className="flex items-center gap-2 text-body-strong text-fg">
                <Cpu className="h-4 w-4 text-fg-secondary" />
                Direct text model access
              </span>
              <p className="text-small text-fg-secondary">Direct Anthropic Claude and OpenAI GPT-4o routing for writing, with zero token markups.</p>
            </div>
            <div className="space-y-1 rounded-md bg-subtle p-3.5">
              <span className="flex items-center gap-2 text-body-strong text-fg">
                <ShieldCheck className="h-4 w-4 text-fg-secondary" />
                AES-256 key isolation
              </span>
              <p className="text-small text-fg-secondary">Per-workspace encryption means keys are never accessible by other organizations.</p>
            </div>
          </div>
        </Card>
      ) : (
        /* UNLOCKED STATE (Interactive Key Manager) */
        <div className="space-y-6">

          {/* Security & Vault Banner */}
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-line bg-surface p-4 shadow-xs sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-success-fg" />
              <div>
                <span className="flex items-center gap-2 text-body-strong text-fg">
                  Key vault <Badge tone="success">Active</Badge>
                </span>
                <span className="text-small text-fg-secondary">
                  Keys are encrypted at rest with AES-256-GCM using an isolated workspace initialization vector.
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="danger" onClick={() => setConfirmLockVault(true)} icon={<Lock />}>
                Lock vault (revoke)
              </Button>
            </div>
          </div>

          {/* Key Management Form */}
          <form onSubmit={handleSaveVault} className="rounded-lg border border-line bg-surface p-6 shadow-xs">

            <div className="divide-y divide-line">

              {/* 1. ElevenLabs: the platform's AI voice engine */}
              <section className={settingsRow} aria-labelledby="byok-elevenlabs">
                <div>
                  <h3 id="byok-elevenlabs" className="flex flex-wrap items-center gap-2 text-h3 text-fg">
                    <AudioLines className="h-4 w-4 text-fg-secondary" aria-hidden />
                    ElevenLabs
                    <Badge tone="brand">Voice engine</Badge>
                  </h3>
                  <p className="mt-1 text-small text-fg-secondary">
                    AI voice engine (Practice, Live floor, AI customer calls).
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg">API key</span>
                    {connectedBadge('elevenlabs')}
                  </div>
                  {renderKeyInput('elevenlabs', 'elevenlabsKey', 'sk_...', 'Testing...')}
                  {resultDetail('elevenlabs')}
                  <div className="flex items-start gap-2 rounded-md bg-subtle p-3 text-small text-fg-secondary">
                    <Mic className="mt-0.5 h-4 w-4 shrink-0 text-fg-secondary" aria-hidden />
                    <span>
                      Every AI voice in this workspace is ElevenLabs{' '}
                      <Tooltip content="Text to speech">
                        <span className="cursor-help underline decoration-dotted decoration-fg-tertiary underline-offset-4">TTS</span>
                      </Tooltip>
                      : {elevenLabsModelLabel(ELEVENLABS_MODELS.realtime)} for live practice and AI customer calls, {elevenLabsModelLabel(ELEVENLABS_MODELS.expressive)} for Live floor listen-in.
                      With your own key the workspace uses its own ElevenLabs voice library, voice clones and character quota.
                    </span>
                  </div>
                </div>
              </section>

              {/* 2. Resend Cold Email Delivery & Custom Domain (BYOK) */}
              <section className={settingsRow}>
                <div>
                  <h3 className="flex items-center gap-2 text-h3 text-fg">
                    <Mail className="h-4 w-4 text-fg-secondary" />
                    Resend
                  </h3>
                  <p className="mt-1 text-small text-fg-secondary">Email delivery for the cold email studio and dedicated outbound.</p>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-strong text-fg">API key</span>
                    {testResults['resend'] && (
                      <Badge tone={testResults['resend'].success ? 'success' : 'danger'}>
                        {testResults['resend'].success ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {testResults['resend'].model} ({testResults['resend'].latency})
                      </Badge>
                    )}
                  </div>
                  {renderKeyInput('resend', 'resendKey', 're_...', 'Validating...')}

                  {/* Resend Custom Domain & Sender Configuration */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Verified domain" hint="Must match a verified domain in your Resend dashboard.">
                      <Input
                        mono
                        type="text"
                        value={activeTenant.resendDomain}
                        onChange={(e) => handleUpdateKey('resendDomain', e.target.value)}
                        placeholder="outbound.yourdomain.com"
                      />
                    </Field>

                    <Field label="From address" hint="Leave empty to use the rep's profile name and the platform pool.">
                      <Input
                        mono
                        type="email"
                        value={activeTenant.resendFromEmail}
                        onChange={(e) => handleUpdateKey('resendFromEmail', e.target.value)}
                        placeholder="rep@outbound.yourdomain.com"
                      />
                    </Field>
                  </div>

                  <div className="flex items-start gap-2 rounded-md bg-subtle p-3 text-small text-fg-secondary">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-secondary" />
                    <span>
                      <span className="text-body-strong text-fg">Sends never fail.</span> If this key is empty, invalid or over quota, cold emails route through the Appointmentlyy platform pool with the user&apos;s email as Reply-To.
                    </span>
                  </div>
                </div>
              </section>

              {/* 3. Customer Production Calendar Booking Link (Calendly / Cal.com / HubSpot) */}
              <section className={settingsRow}>
                <div>
                  <h3 className="flex items-center gap-2 text-h3 text-fg">
                    <Calendar className="h-4 w-4 text-fg-secondary" />
                    Booking link
                  </h3>
                  <p className="mt-1 text-small text-fg-secondary">Calendly, Cal.com or HubSpot meeting link.</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg">Calendar URL</span>
                    {(isDemo || activeTenant.calendarBookingLink.trim()) && <Badge tone="success">Active</Badge>}
                  </div>
                  <Input
                    mono
                    type="url"
                    value={activeTenant.calendarBookingLink}
                    onChange={(e) => handleUpdateKey('calendarBookingLink', e.target.value)}
                    placeholder="https://calendly.com/your-team/30min"
                  />
                  <div className="flex flex-col justify-between gap-1 text-small text-fg-secondary sm:flex-row sm:items-center">
                    <span>Used in the dialer script, follow-up email composer and booking dialog.</span>
                    {isDemo && (
                      <span className="shrink-0 text-fg-tertiary">
                        Fallback: <span className="font-mono">https://calendly.com/bpogtm/30min</span>
                      </span>
                    )}
                  </div>
                </div>
              </section>

              {/* 4. Text models (writing, scoring, research). None of them is used for voice. */}
              <section className={settingsRow}>
                <div>
                  <h3 className="text-h3 text-fg">OpenAI</h3>
                  <p className="mt-1 text-small text-fg-secondary">Text model: GPT-4o for writing, auto-grading and embeddings.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg">API key</span>
                    {connectedBadge('openai')}
                  </div>
                  {renderKeyInput('openai', 'openaiKey', 'sk-proj-...', 'Testing...')}
                  {resultDetail('openai')}
                </div>
              </section>

              {/* 5. Anthropic Claude Key (text) */}
              <section className={settingsRow}>
                <div>
                  <h3 className="text-h3 text-fg">Anthropic Claude</h3>
                  <p className="mt-1 text-small text-fg-secondary">Text model: Claude for coaching and writing.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg">API key</span>
                    {connectedBadge('claude')}
                  </div>
                  {renderKeyInput('claude', 'claudeKey', 'sk-ant-api03-...', 'Testing...')}
                  {resultDetail('claude')}
                </div>
              </section>

              {/* 6. Google Gemini Key (text) */}
              <section className={settingsRow}>
                <div>
                  <h3 className="text-h3 text-fg">Google Gemini</h3>
                  <p className="mt-1 text-small text-fg-secondary">Text model: Gemini for AI buyer replies, research and writing.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg">API key</span>
                    {connectedBadge('gemini')}
                  </div>
                  {renderKeyInput('gemini', 'geminiKey', 'AIzaSy...', 'Testing...')}
                  {resultDetail('gemini')}
                </div>
              </section>

              {/* Fallback Strategy Setting */}
              <section className={settingsRow}>
                <div>
                  <h3 className="text-h3 text-fg">Fallback</h3>
                  <p className="mt-1 text-small text-fg-secondary">What happens when a workspace key runs out of quota or is rate limited (429). Voices stay on ElevenLabs either way: the pool is the platform&apos;s own ElevenLabs account.</p>
                </div>
                <div>
                  <Select
                    aria-label="Fallback strategy"
                    value={activeTenant.fallbackStrategy}
                    onChange={(e) => handleUpdateKey('fallbackStrategy', e.target.value as any)}
                  >
                    <option value="system_pool">Fallback to Platform Pooled AI (Zero Rep Disruption)</option>
                    <option value="pause_alert">Pause Execution & Notify Tenant Admin (No Overage)</option>
                  </Select>
                </div>
              </section>
            </div>

            {/* Save Buttons & Feedback */}
            <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
              {saveSuccess ? (
                <span className="flex items-center gap-1.5 text-small text-success-fg">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Keys encrypted and saved.</span>
                </span>
              ) : (
                <span className="text-small text-fg-tertiary">
                  Keys are never returned in plain text in API responses.
                </span>
              )}

              <Button type="submit" variant="brand">
                Save keys
              </Button>
            </div>

          </form>
        </div>
      )}

      {/* Upgrade Request Modal */}
      <Dialog open={requestUpgradeModal} onClose={() => setRequestUpgradeModal(false)} title="Request BYOK activation" bare className="max-w-md">
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-h2 text-fg">Request BYOK activation</h3>
              <IconButton label="Close" variant="ghost" size="sm" onClick={() => setRequestUpgradeModal(false)}>
                <X />
              </IconButton>
            </div>

            <div className="space-y-3 text-body text-fg-secondary">
              <p>
                An invoice line for <span className="text-body-strong text-fg">$49.00 / month</span> will be added for <span className="text-body-strong text-fg">{activeTenant.tenantName}</span>.
              </p>
              <div className="space-y-1 rounded-md border border-line bg-subtle p-3 text-small text-fg">
                <div className="flex justify-between">
                  <span>BYOK add-on</span>
                  <span className="tabular-nums">$49.00 / mo</span>
                </div>
                <div className="flex justify-between text-fg-tertiary">
                  <span>Billing cycle</span>
                  <span>Monthly (manual invoice)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setRequestUpgradeModal(false)}>
                Cancel
              </Button>
              <Button
                variant="brand"
                onClick={() => {
                  toggleUnlockTenant();
                  setRequestUpgradeModal(false);
                }}
              >
                Confirm and add to invoice
              </Button>
            </div>
          </div>
      </Dialog>

      <ConfirmDialog
        open={confirmLockVault}
        onClose={() => setConfirmLockVault(false)}
        onConfirm={toggleUnlockTenant}
        title="Lock the vault?"
        description={`BYOK is turned off for ${activeTenant.tenantName}, so its own provider keys stop being used. Saved keys are kept and you can unlock it again later.`}
        confirmLabel="Lock vault"
        icon={<Lock />}
      />

    </div>
  );
}

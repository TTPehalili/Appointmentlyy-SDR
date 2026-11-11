'use client';

import * as React from 'react';
import { Building2, Check, Globe, Lock, Sparkles, Undo2 } from 'lucide-react';
import { Badge, Button, EmptyState, Field, InlineError, Input, PageHeader, SettingsSection, Skeleton, StickySaveBar, Textarea, useToast } from '@/components/ui';
import { useSession } from '@/lib/session';
import { can } from '@/lib/permissions';
import { MEETING_PLAN_LIMITS, type CompanyProfile, type CompanyProfileInput } from '@/lib/meetingPlan';
import { formatUpdated, meetingPlansApi } from './meetingPlanClient';
import { StringListEditor } from './meetingUi';

const L = MEETING_PLAN_LIMITS;

const EMPTY: CompanyProfileInput = { website: '', summary: '', services: [], usp: '', proofPoints: [], idealCustomers: '', offer: '' };

function fromProfile(p: CompanyProfile | CompanyProfileInput | null): CompanyProfileInput {
  if (!p) return { ...EMPTY };
  return {
    website: p.website || '',
    summary: p.summary || '',
    services: [...(p.services || [])],
    usp: p.usp || '',
    proofPoints: [...(p.proofPoints || [])],
    idealCustomers: p.idealCustomers || '',
    offer: p.offer || '',
  };
}

function tidy(p: CompanyProfileInput): CompanyProfileInput {
  const s = (v: string) => v.trim();
  return {
    website: s(p.website),
    summary: s(p.summary),
    services: p.services.map(s).filter(Boolean),
    usp: s(p.usp),
    proofPoints: p.proofPoints.map(s).filter(Boolean),
    idealCustomers: s(p.idealCustomers),
    offer: s(p.offer),
  };
}

const hasContent = (p: CompanyProfileInput) =>
  !!(p.summary.trim() || p.usp.trim() || p.offer.trim() || p.idealCustomers.trim() || p.services.some((x) => x.trim()) || p.proofPoints.some((x) => x.trim()));

/**
 * Admin › Company profile: what this workspace sells. Every meeting plan and customer one-pager is
 * written from it. Admins can draft it from the website with AI, edit, and save; others see it read-only.
 */
export default function CompanyProfileForm() {
  const { role } = useSession();
  const toast = useToast();
  const canEdit = can(role, 'adminOrg');

  const [saved, setSaved] = React.useState<CompanyProfile | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [form, setForm] = React.useState<CompanyProfileInput>({ ...EMPTY });
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<{ message: string; field?: string } | null>(null);
  const [drafting, setDrafting] = React.useState(false);
  const [draftError, setDraftError] = React.useState('');
  const [beforeDraft, setBeforeDraft] = React.useState<CompanyProfileInput | null>(null);

  const apply = React.useCallback((r: Awaited<ReturnType<typeof meetingPlansApi.getProfile>>) => {
    if (r.ok) {
      setSaved(r.profile);
      setForm(fromProfile(r.profile));
      setLoadError('');
    } else {
      setLoadError(r.error);
    }
    setLoaded(true);
  }, []);
  const load = React.useCallback(() => meetingPlansApi.getProfile().then(apply), [apply]);

  React.useEffect(() => {
    let live = true;
    void meetingPlansApi.getProfile().then((r) => {
      if (live) apply(r);
    });
    return () => {
      live = false;
    };
  }, [apply]);

  const dirty = loaded && JSON.stringify(tidy(form)) !== JSON.stringify(tidy(fromProfile(saved)));
  const set = <K extends keyof CompanyProfileInput>(k: K, v: CompanyProfileInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const draft = async () => {
    const site = form.website.trim();
    if (!site || drafting) return;
    setDrafting(true);
    setDraftError('');
    const r = await meetingPlansApi.draftProfile(site);
    setDrafting(false);
    if (!r.ok) {
      setDraftError(r.error);
      return;
    }
    setBeforeDraft(form);
    setForm({ ...fromProfile(r.profile), website: r.profile.website || site });
    toast({ message: 'Draft ready. Review it, then click Save.' });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const r = await meetingPlansApi.saveProfile(tidy(form));
    setSaving(false);
    if (!r.ok) {
      setSaveError({ message: r.error, field: r.field });
      return;
    }
    setSaved(r.profile);
    setForm(fromProfile(r.profile));
    setBeforeDraft(null);
    toast({ message: 'Company profile saved. New meeting plans will use it.' });
  };

  const fieldError = (f: keyof CompanyProfileInput) => (saveError?.field && saveError.field.toLowerCase().includes(f.toLowerCase()) ? saveError.message : undefined);

  if (!loaded) {
    return (
      <div className="w-full max-w-[880px] px-4 py-6 md:px-8" aria-busy="true" aria-label="Loading company profile">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="mt-2 h-5 w-2/3" />
        <Skeleton className="mt-8 h-40 w-full" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full max-w-[880px] px-4 py-6 md:px-8">
        <PageHeader title="Company profile" description="What your company sells. Every meeting plan and customer one-pager uses this." />
        <InlineError message={loadError} onRetry={() => void load()} />
      </div>
    );
  }

  if (!canEdit && !saved) {
    return (
      <div className="w-full max-w-[880px] px-4 py-6 md:px-8">
        <PageHeader title="Company profile" description="What your company sells. Every meeting plan and customer one-pager uses this." />
        <EmptyState icon={<Lock />} title="Not set up yet" description="Your admin hasn't filled in the company profile yet. Meeting plans still work, but they're sharper once it's set." />
      </div>
    );
  }

  const ro = !canEdit;

  return (
    <div className="relative flex min-h-full flex-col">
      <div className="w-full max-w-[880px] flex-1 px-4 py-6 md:px-8" data-testid="company-profile-form">
        <PageHeader
          title="Company profile"
          description="What your company sells. Every meeting plan and customer one-pager is written from this."
          meta={
            saved ? (
              <span className="text-small text-fg-tertiary">
                Updated {formatUpdated(saved.updatedAt)}
                {saved.updatedBy ? ` by ${saved.updatedBy}` : ''}
              </span>
            ) : (
              <Badge tone="warning">Not saved yet</Badge>
            )
          }
        />
        {ro && (
          <p className="mb-4 flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-small text-fg-secondary">
            <Lock className="size-3.5" aria-hidden />
            View only. Ask an admin to change it.
          </p>
        )}

        <div className="flex flex-col divide-y divide-line border-t border-line">
          <SettingsSection title="Website" description={canEdit ? 'Start here: the AI reads your site and drafts the rest for you to review.' : undefined}>
            <Field label="Company website" htmlFor="cp-website" error={fieldError('website')}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="cp-website"
                  leadingIcon={<Globe />}
                  value={form.website}
                  readOnly={ro}
                  maxLength={L.shortText}
                  inputMode="url"
                  placeholder="yourcompany.com"
                  onChange={(e) => set('website', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void draft();
                    }
                  }}
                  data-testid="company-profile-website"
                />
                {canEdit && (
                  <Button
                    variant="secondary"
                    icon={<Sparkles />}
                    loading={drafting}
                    disabled={!form.website.trim()}
                    onClick={() => void draft()}
                    data-testid="company-profile-draft"
                  >
                    {drafting ? 'Reading your site…' : 'Draft with AI'}
                  </Button>
                )}
              </div>
            </Field>
            {drafting && <p className="text-small text-fg-tertiary">This takes up to a minute. Nothing is saved until you click Save.</p>}
            {draftError && <InlineError message={draftError} onRetry={() => void draft()} />}
            {beforeDraft && !drafting && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-selected px-3 py-2 text-small text-fg">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-brand-text" aria-hidden />
                  Drafted by AI. Check every field before saving.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Undo2 />}
                  onClick={() => {
                    setForm(beforeDraft);
                    setBeforeDraft(null);
                  }}
                >
                  Undo draft
                </Button>
              </div>
            )}
          </SettingsSection>

          <SettingsSection title="About you" description="One paragraph a stranger would understand.">
            <Field label="Summary" htmlFor="cp-summary" error={fieldError('summary')}>
              <Textarea id="cp-summary" rows={4} value={form.summary} readOnly={ro} maxLength={L.longText} onChange={(e) => set('summary', e.target.value)} data-testid="company-profile-summary" />
            </Field>
            <Field label="What makes you different (USP)" htmlFor="cp-usp" hint="One or two sentences." error={fieldError('usp')}>
              <Textarea id="cp-usp" rows={2} value={form.usp} readOnly={ro} maxLength={L.longText} className="min-h-0" onChange={(e) => set('usp', e.target.value)} />
            </Field>
          </SettingsSection>

          <SettingsSection title="Services" description="What you sell. Agenda items map to these.">
            <StringListEditor label="Services" items={form.services} onChange={(v) => set('services', v)} addLabel="Add service" readOnly={ro} testId="company-profile-services" />
          </SettingsSection>

          <SettingsSection title="Proof" description="Results, clients or numbers you can stand behind. The AI never invents these.">
            <StringListEditor label="Proof points" items={form.proofPoints} onChange={(v) => set('proofPoints', v)} addLabel="Add proof point" readOnly={ro} multiline />
          </SettingsSection>

          <SettingsSection title="Who and how" description="Who you sell to and how engagements usually start.">
            <Field label="Ideal customers" htmlFor="cp-icp" error={fieldError('idealCustomers')}>
              <Textarea id="cp-icp" rows={2} value={form.idealCustomers} readOnly={ro} maxLength={L.longText} className="min-h-0" onChange={(e) => set('idealCustomers', e.target.value)} />
            </Field>
            <Field label="Core offer" htmlFor="cp-offer" hint="e.g. “A 30-day pilot with 2 dedicated agents.”" error={fieldError('offer')}>
              <Textarea id="cp-offer" rows={2} value={form.offer} readOnly={ro} maxLength={L.longText} className="min-h-0" onChange={(e) => set('offer', e.target.value)} />
            </Field>
          </SettingsSection>
        </div>

        {canEdit && !saved && !hasContent(form) && !drafting && (
          <p className="mt-2 flex items-center gap-1.5 text-small text-fg-tertiary">
            <Building2 className="size-3.5" aria-hidden />
            Tip: add your website and click “Draft with AI” to fill this in seconds.
          </p>
        )}
        {saveError && !(['website', 'summary', 'usp', 'idealCustomers', 'offer'] as const).some((f) => fieldError(f)) && (
          <InlineError className="mt-4" message={saveError.message} onRetry={() => void save()} />
        )}
      </div>

      {canEdit && (
        <StickySaveBar dirty={dirty}>
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setForm(fromProfile(saved));
              setBeforeDraft(null);
              setSaveError(null);
            }}
          >
            Discard
          </Button>
          <Button variant="primary" icon={<Check />} loading={saving} onClick={() => void save()} data-testid="company-profile-save">
            Save profile
          </Button>
        </StickySaveBar>
      )}
    </div>
  );
}

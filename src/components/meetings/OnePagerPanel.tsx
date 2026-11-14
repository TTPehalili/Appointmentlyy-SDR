'use client';

import * as React from 'react';
import { Check, Download, Eye, Mail, Plus, Save, Sparkles, Trash2, Undo2, Wand2, X } from 'lucide-react';
import { Badge, Button, Field, IconButton, InlineError, Input, Textarea, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { MEETING_PLAN_LIMITS, MEETING_PLAN_LIST_CAPS, type MeetingPlan, type OnePagerCopy } from '@/lib/meetingPlan';
import { onePagerFileName, type OnePagerBrand } from '@/lib/onePagerRender';
import { OnePagerPreview } from './OnePagerPreview';
import SendOnePagerDialog from './SendOnePagerDialog';
import { emptyOnePager, meetingPlansApi } from './meetingPlanClient';
import { StringListEditor } from './meetingUi';

const L = MEETING_PLAN_LIMITS;
const CAPS = MEETING_PLAN_LIST_CAPS;
const QUICK_POLISH = ['Shorter', 'More consultative', 'Warmer', 'Add a clear timeline'];

function tidy(c: OnePagerCopy): OnePagerCopy {
  const s = (v: string | undefined) => (v || '').trim();
  return {
    headline: s(c.headline),
    subheadline: s(c.subheadline),
    whatWeHeard: c.whatWeHeard.map(s).filter(Boolean),
    whyItMatters: c.whyItMatters.map(s).filter(Boolean),
    nextSteps: c.nextSteps.filter((n) => s(n.step)).map((n) => (s(n.when) ? { step: s(n.step), when: s(n.when) } : { step: s(n.step) })),
    howWeHelp: c.howWeHelp.filter((h) => s(h.title) || s(h.detail)).map((h) => ({ title: s(h.title), detail: s(h.detail) })),
    cta: s(c.cta),
  };
}

/**
 * One-pager tab: editor (left) + live preview (right), "Polish with AI" (suggestion → Apply/Discard,
 * never saved on its own), Save, Download PDF and Email to customer.
 */
export default function OnePagerPanel({
  plan,
  brand,
  onSaved,
  onDirtyChange,
}: {
  plan: MeetingPlan;
  brand: OnePagerBrand;
  onSaved: (p: MeetingPlan) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const saved = plan.onePager ?? emptyOnePager();
  const [draft, setDraft] = React.useState<OnePagerCopy | null>(null);
  const copy = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(tidy(draft)) !== JSON.stringify(tidy(saved));
  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [downloading, setDownloading] = React.useState(false);
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [emailKey, setEmailKey] = React.useState(0);

  // Polish with AI
  const [instruction, setInstruction] = React.useState('');
  const [polishing, setPolishing] = React.useState(false);
  const [polishError, setPolishError] = React.useState('');
  const [proposal, setProposal] = React.useState<OnePagerCopy | null>(null);
  const [lastApplied, setLastApplied] = React.useState<OnePagerCopy | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const edit = (patch: Partial<OnePagerCopy>) => setDraft({ ...copy, ...patch });

  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    setSaving(true);
    setSaveError('');
    const r = await meetingPlansApi.update(plan.id, { onePager: tidy(copy) });
    setSaving(false);
    if (!r.ok) {
      setSaveError(r.error);
      return false;
    }
    onSaved(r.plan);
    setDraft(null);
    setLastApplied(null);
    return true;
  };

  const polish = async (text: string) => {
    const ask = text.trim();
    if (!ask || polishing) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPolishing(true);
    setPolishError('');
    setProposal(null);
    const r = await meetingPlansApi.polish(plan.id, { onePager: tidy(copy), instruction: ask.slice(0, L.instruction) }, ctrl.signal);
    if (ctrl.signal.aborted) return;
    setPolishing(false);
    if (!r.ok) {
      setPolishError(r.error);
      return;
    }
    setProposal(r.onePager);
  };

  const apply = () => {
    if (!proposal) return;
    setLastApplied(copy);
    setDraft(proposal);
    setProposal(null);
    setInstruction('');
    toast({ message: 'Suggestion applied. Click Save to keep it.' });
  };

  /** Downloads the SAVED one-pager (saves first when there are edits). */
  const downloadPdf = async () => {
    if (downloading) return;
    if (dirty && !(await save())) return;
    setDownloading(true);
    try {
      const res = await fetch(meetingPlansApi.pdfUrl(plan.id), { cache: 'no-store' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast({ message: data?.error || 'The PDF couldn’t be created. Please try again.' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = onePagerFileName(plan.lead.company);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast({ message: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setDownloading(false);
    }
  };

  const openEmail = async () => {
    if (dirty && !(await save())) return;
    setEmailKey((k) => k + 1);
    setEmailOpen(true);
  };

  const previewCopy = proposal ?? copy;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-fg-tertiary">
          The customer sees this page. Edit on the left; the preview updates as you type. Nothing is sent until you click Send.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          {dirty && (
            <Button variant="ghost" icon={<X />} onClick={() => setDraft(null)} disabled={saving}>
              Discard changes
            </Button>
          )}
          <Button variant="primary" icon={<Save />} onClick={() => void save().then((ok) => ok && toast({ message: 'One-pager saved' }))} loading={saving} disabled={!dirty} data-testid="onepager-save">
            Save
          </Button>
          <Button variant="secondary" icon={<Download />} onClick={() => void downloadPdf()} loading={downloading} data-testid="onepager-download-pdf">
            Download PDF
          </Button>
          <Button variant="brand" icon={<Mail />} onClick={() => void openEmail()} disabled={saving} data-testid="onepager-email-customer">
            Email to customer
          </Button>
        </div>
      </div>
      {saveError && <InlineError message={saveError} onRetry={() => void save()} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Left: polish + editor */}
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-line bg-surface p-4 shadow-xs" aria-labelledby="polish-title" data-testid="onepager-polish">
            <h2 id="polish-title" className="flex items-center gap-2 text-body-strong text-fg">
              <Sparkles className="size-4 text-brand-text" aria-hidden />
              Polish with AI
            </h2>
            <p className="mt-0.5 text-small text-fg-tertiary">Ask for a change. You&apos;ll see the suggestion first and choose whether to apply it.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_POLISH.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={polishing}
                  onClick={() => {
                    setInstruction(chip);
                    void polish(chip);
                  }}
                  className="focus-ring inline-flex h-7 items-center rounded-full border border-line-strong bg-surface px-3 text-small text-fg transition-colors hover:bg-subtle disabled:opacity-50"
                  data-testid="onepager-polish-chip"
                >
                  {chip}
                </button>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void polish(instruction);
              }}
            >
              <Input
                aria-label="How should the AI change the one-pager?"
                placeholder='e.g. "mention the 30-day pilot"'
                value={instruction}
                maxLength={L.instruction}
                onChange={(e) => setInstruction(e.target.value)}
                data-testid="onepager-polish-input"
              />
              <Button type="submit" variant="secondary" icon={<Wand2 />} loading={polishing} disabled={!instruction.trim()} data-testid="onepager-polish-submit">
                {polishing ? 'Polishing…' : 'Polish'}
              </Button>
            </form>
            {polishError && <InlineError className="mt-3" message={polishError} onRetry={() => void polish(instruction)} />}
            {proposal && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-500/30 bg-brand-tint px-3 py-2.5" role="status" data-testid="onepager-proposal">
                <span className="flex items-center gap-1.5 text-small text-fg">
                  <Eye className="size-4 text-brand-text" aria-hidden />
                  Suggestion ready: it&apos;s shown in the preview.
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" icon={<X />} onClick={() => setProposal(null)} data-testid="onepager-proposal-discard">
                    Discard
                  </Button>
                  <Button size="sm" variant="primary" icon={<Check />} onClick={apply} data-testid="onepager-proposal-apply">
                    Apply
                  </Button>
                </div>
              </div>
            )}
            {lastApplied && !proposal && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Undo2 />}
                className="mt-2"
                onClick={() => {
                  setDraft(lastApplied);
                  setLastApplied(null);
                }}
              >
                Undo AI change
              </Button>
            )}
          </section>

          <OnePagerEditor value={copy} onChange={edit} disabled={polishing} />
        </div>

        {/* Right: live preview */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-body-strong text-fg">{proposal ? 'Preview: AI suggestion' : 'Preview'}</h2>
              {proposal && <Badge tone="brand">Not applied yet</Badge>}
            </div>
            <div className={cn('overflow-hidden rounded-lg border bg-subtle p-3 md:p-5', proposal ? 'border-brand-500/40' : 'border-line')} data-testid="onepager-preview">
              <OnePagerPreview
                data={{
                  copy: previewCopy,
                  lead: { name: plan.lead.name, company: plan.lead.company, title: plan.lead.title },
                  meetingAt: plan.call.meetingAt,
                  brand,
                  ae: { name: plan.assignedAeName || plan.assignedAe, email: plan.assignedAe },
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {emailOpen && (
        <SendOnePagerDialog
          key={emailKey}
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          plan={plan}
          onSent={onSaved}
          onDownloadPdf={downloadPdf}
        />
      )}
    </div>
  );
}

function OnePagerEditor({ value: c, onChange, disabled }: { value: OnePagerCopy; onChange: (patch: Partial<OnePagerCopy>) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 shadow-xs" data-testid="onepager-editor">
      <legend className="sr-only">One-pager copy</legend>
      <Field label="Headline" htmlFor="op-headline" hint="Under 10 words.">
        <Input id="op-headline" value={c.headline} maxLength={L.shortText} onChange={(e) => onChange({ headline: e.target.value })} />
      </Field>
      <Field label="Subheadline" htmlFor="op-sub" hint="Under 20 words.">
        <Textarea id="op-sub" value={c.subheadline} rows={2} maxLength={L.shortText} className="min-h-0" onChange={(e) => onChange({ subheadline: e.target.value })} />
      </Field>
      <StringListEditor label="What we heard" items={c.whatWeHeard} onChange={(v) => onChange({ whatWeHeard: v })} addLabel="Add point" multiline max={CAPS.whatWeHeard} />
      <StringListEditor label="Why it matters" items={c.whyItMatters} onChange={(v) => onChange({ whyItMatters: v })} addLabel="Add point" multiline max={CAPS.whyItMatters} />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-body-strong text-fg">Agreed next steps</legend>
        {c.nextSteps.length === 0 && <p className="text-small text-fg-tertiary">Nothing here yet.</p>}
        {c.nextSteps.map((n, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[1fr_140px]">
              <Input
                aria-label={`Next step ${i + 1}`}
                placeholder="Step"
                value={n.step}
                maxLength={L.shortText}
                onChange={(e) => onChange({ nextSteps: c.nextSteps.map((x, j) => (j === i ? { ...x, step: e.target.value } : x)) })}
              />
              <Input
                aria-label={`When for step ${i + 1}`}
                placeholder="When (optional)"
                value={n.when || ''}
                maxLength={120}
                onChange={(e) => onChange({ nextSteps: c.nextSteps.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)) })}
              />
            </div>
            <IconButton label={`Remove next step ${i + 1}`} onClick={() => onChange({ nextSteps: c.nextSteps.filter((_, j) => j !== i) })}>
              <X className="size-4" />
            </IconButton>
          </div>
        ))}
        {c.nextSteps.length > CAPS.nextSteps && <p className="text-small text-warning-fg">Only the first {CAPS.nextSteps} steps are kept when you save.</p>}
        {c.nextSteps.length < CAPS.nextSteps && (
          <Button variant="ghost" size="sm" icon={<Plus />} className="self-start" onClick={() => onChange({ nextSteps: [...c.nextSteps, { step: '' }] })}>
            Add step
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-body-strong text-fg">How we can help</legend>
        <p className="-mt-1 mb-1 text-small text-fg-tertiary">Three works best (up to {CAPS.howWeHelp}).</p>
        {c.howWeHelp.map((h, i) => (
          <div key={i} className="flex items-start gap-1.5 rounded-md border border-line p-2.5">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Input
                aria-label={`Help item ${i + 1} title`}
                placeholder="Title"
                value={h.title}
                maxLength={L.shortText}
                onChange={(e) => onChange({ howWeHelp: c.howWeHelp.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
              />
              <Textarea
                aria-label={`Help item ${i + 1} detail`}
                placeholder="One or two lines"
                value={h.detail}
                rows={2}
                maxLength={L.shortText}
                className="min-h-0"
                onChange={(e) => onChange({ howWeHelp: c.howWeHelp.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)) })}
              />
            </div>
            <IconButton label={`Remove help item ${i + 1}`} onClick={() => onChange({ howWeHelp: c.howWeHelp.filter((_, j) => j !== i) })}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
        {c.howWeHelp.length > CAPS.howWeHelp && <p className="text-small text-warning-fg">Only the first {CAPS.howWeHelp} are kept when you save.</p>}
        {c.howWeHelp.length < CAPS.howWeHelp && (
          <Button variant="ghost" size="sm" icon={<Plus />} className="self-start" onClick={() => onChange({ howWeHelp: [...c.howWeHelp, { title: '', detail: '' }] })}>
            Add item
          </Button>
        )}
      </fieldset>

      <Field label="Closing line" htmlFor="op-cta" hint="Soft and low-pressure.">
        <Textarea id="op-cta" value={c.cta} rows={2} maxLength={L.shortText} className="min-h-0" onChange={(e) => onChange({ cta: e.target.value })} />
      </Field>
    </fieldset>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  Flag,
  HelpCircle,
  ListChecks,
  MessageSquareQuote,
  Pencil,
  Plus,
  Search,
  ShieldQuestion,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button, Field, IconButton, InlineError, Input, Textarea, useToast } from '@/components/ui';
import { MEETING_PLAN_LIMITS, MEETING_PLAN_LIST_CAPS, type ActionPlan, type AgendaItem, type MeetingPlan } from '@/lib/meetingPlan';
import { displayHost, emptyActionPlan, meetingPlansApi, planToText } from './meetingPlanClient';
import { BulletList, PlanSection, StringListEditor } from './meetingUi';

/** The plan writer uses this when the workspace has no Company profile yet. */
const isDiscoveryOnly = (mapsTo: string) => mapsTo.trim().toLowerCase() === 'discovery only';

const L = MEETING_PLAN_LIMITS;
const CAPS = MEETING_PLAN_LIST_CAPS;

/** Action Plan tab: read view for the AE, with an inline editor (Edit → Save / Cancel). */
export default function ActionPlanPanel({
  plan,
  onSaved,
  onDirtyChange,
}: {
  plan: MeetingPlan;
  onSaved: (p: MeetingPlan) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const saved = plan.plan;
  const [draft, setDraft] = React.useState<ActionPlan | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const startEdit = () => {
    setError('');
    setDraft(structuredClone(saved ?? emptyActionPlan()));
  };
  const cancel = () => {
    setDraft(null);
    setError('');
  };
  const save = async () => {
    if (!draft) return;
    if (!dirty) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setError('');
    const r = await meetingPlansApi.update(plan.id, { plan: tidyPlan(draft) });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onSaved(r.plan);
    setDraft(null);
    toast({ message: 'Plan saved' });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(planToText(plan));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ message: 'Couldn’t copy. Select the text and copy it instead.' });
    }
  };

  const editButtons = (where: 'top' | 'bottom') => (
    <>
      <Button variant="ghost" onClick={cancel} disabled={saving} icon={<X />} data-testid={where === 'top' ? 'plan-edit-cancel' : undefined}>
        Cancel
      </Button>
      <Button variant="primary" onClick={save} loading={saving} icon={<Check />} data-testid={where === 'top' ? 'plan-edit-save' : undefined}>
        Save
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-fg-tertiary">
          {draft ? 'Editing: changes are saved only when you click Save.' : 'Prepared by AI from the call and public research. Edit anything that’s off.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {draft ? (
            editButtons('top')
          ) : (
            <>
              <Button variant="secondary" onClick={copy} icon={copied ? <Check /> : <Copy />} data-testid="plan-copy">
                {copied ? 'Copied' : 'Copy plan'}
              </Button>
              <Button variant="secondary" onClick={startEdit} icon={<Pencil />} data-testid="plan-edit">
                Edit
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <InlineError message={error} onRetry={save} />}
      {draft ? <ActionPlanEditor value={draft} onChange={setDraft} /> : <ActionPlanRead plan={plan} />}
      {draft && <div className="flex justify-end gap-2 border-t border-line pt-4">{editButtons('bottom')}</div>}
    </div>
  );
}

/** Drop blank rows the editor left behind. */
function tidyPlan(p: ActionPlan): ActionPlan {
  const s = (v: string) => v.trim();
  const list = (a: string[]) => a.map(s).filter(Boolean);
  return {
    callSummary: {
      recap: s(p.callSummary.recap),
      keyPoints: list(p.callSummary.keyPoints),
      prospectQuotes: list(p.callSummary.prospectQuotes),
      agreedNextStep: s(p.callSummary.agreedNextStep),
    },
    researchSummary: s(p.researchSummary),
    meetingGoal: s(p.meetingGoal),
    agenda: p.agenda
      .filter((a) => s(a.topic))
      .map((a) => ({ ...a, topic: s(a.topic), whyItMatters: s(a.whyItMatters), mapsTo: s(a.mapsTo), questions: list(a.questions) })),
    discoveryQuestions: p.discoveryQuestions.filter((q) => s(q.question)).map((q) => ({ question: s(q.question), purpose: s(q.purpose) })),
    likelyObjections: p.likelyObjections.filter((o) => s(o.objection)).map((o) => ({ objection: s(o.objection), response: s(o.response) })),
    risks: list(p.risks),
    proposedNextSteps: list(p.proposedNextSteps),
  };
}

/* ------------------------------------------------------------------ read view */

function ActionPlanRead({ plan }: { plan: MeetingPlan }) {
  const a = plan.plan ?? emptyActionPlan();
  const r = plan.research;
  const totalMinutes = a.agenda.reduce((sum, it) => sum + (it.minutes || 0), 0);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-lg border border-line bg-brand-tint/60 p-5" data-testid="plan-goal">
          <p className="flex items-center gap-2 text-caption font-medium text-brand-text">
            <Target className="size-4" aria-hidden />
            Meeting goal
          </p>
          <p className="mt-1.5 text-h3 text-fg">{a.meetingGoal || 'No goal set yet. Click Edit to add one.'}</p>
        </section>

        <PlanSection title="Call summary" icon={<ClipboardList />} testId="plan-call-summary">
          {a.callSummary.recap ? <p className="whitespace-pre-line text-body text-fg">{a.callSummary.recap}</p> : <p className="text-small text-fg-tertiary">No recap.</p>}
          {a.callSummary.keyPoints.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-body-strong text-fg">Key points</h3>
              <BulletList items={a.callSummary.keyPoints} />
            </div>
          )}
          {a.callSummary.prospectQuotes.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-body-strong text-fg">
                <MessageSquareQuote className="size-4 text-fg-tertiary" aria-hidden />
                In their words
              </h3>
              <ul className="flex flex-col gap-2">
                {a.callSummary.prospectQuotes.map((q, i) => (
                  <li key={i}>
                    <blockquote className="border-l-2 border-line-strong pl-3 text-body italic text-fg-secondary">“{q}”</blockquote>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.callSummary.agreedNextStep && (
            <p className="mt-4 rounded-md bg-subtle px-3 py-2 text-body text-fg">
              <span className="text-fg-secondary">Agreed on the call: </span>
              {a.callSummary.agreedNextStep}
            </p>
          )}
        </PlanSection>

        <PlanSection
          title="Agenda"
          icon={<ListChecks />}
          testId="plan-agenda"
          actions={totalMinutes > 0 ? <span className="text-small tabular-nums text-fg-tertiary">{totalMinutes} min</span> : undefined}
        >
          {a.agenda.length > 0 && a.agenda.every((it) => !it.mapsTo || isDiscoveryOnly(it.mapsTo)) && (
            <p className="mb-3 rounded-md bg-subtle px-3 py-2 text-small text-fg-secondary" data-testid="plan-no-profile-hint">
              Topics aren&apos;t linked to your services yet. An admin can add your{' '}
              <Link href="/admin/company-profile" className="font-medium text-fg underline-offset-2 hover:underline">
                Company profile
              </Link>
              , then Regenerate this plan.
            </p>
          )}
          {a.agenda.length === 0 ? (
            <p className="text-small text-fg-tertiary">No agenda yet.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-line">
              {a.agenda.map((it, i) => (
                <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-caption tabular-nums text-fg-secondary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-strong text-fg">{it.topic}</p>
                      {it.minutes ? <span className="text-small tabular-nums text-fg-tertiary">{it.minutes} min</span> : null}
                      {it.mapsTo && !isDiscoveryOnly(it.mapsTo) && (
                        <Badge tone="brand" className="max-w-full">
                          <span className="truncate">Maps to: {it.mapsTo}</span>
                        </Badge>
                      )}
                    </div>
                    {it.whyItMatters && <p className="mt-1 text-small text-fg-secondary">{it.whyItMatters}</p>}
                    {it.questions.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {it.questions.map((q, j) => (
                          <li key={j} className="flex gap-1.5 text-small text-fg">
                            <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-fg-tertiary" aria-hidden />
                            {q}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </PlanSection>

        <PlanSection title="Discovery questions" icon={<HelpCircle />} testId="plan-discovery">
          {a.discoveryQuestions.length === 0 ? (
            <p className="text-small text-fg-tertiary">No questions yet.</p>
          ) : (
            <ol className="flex list-decimal flex-col gap-2.5 pl-5 marker:text-fg-tertiary">
              {a.discoveryQuestions.map((q, i) => (
                <li key={i} className="text-body text-fg">
                  {q.question}
                  {q.purpose && <span className="mt-0.5 block text-small text-fg-tertiary">Why ask: {q.purpose}</span>}
                </li>
              ))}
            </ol>
          )}
        </PlanSection>

        <PlanSection title="Likely objections" icon={<ShieldQuestion />} testId="plan-objections">
          {a.likelyObjections.length === 0 ? (
            <p className="text-small text-fg-tertiary">None expected.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {a.likelyObjections.map((o, i) => (
                <li key={i} className="rounded-md border border-line p-3">
                  <p className="text-body-strong text-fg">“{o.objection}”</p>
                  <p className="mt-1 text-small text-fg-secondary">
                    <span className="font-medium text-fg">Respond: </span>
                    {o.response}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PlanSection>

        <div className="grid gap-4 md:grid-cols-2">
          <PlanSection title="Risks & unknowns" icon={<AlertTriangle />} testId="plan-risks">
            <BulletList items={a.risks} empty="None noted." />
          </PlanSection>
          <PlanSection title="Next steps if it goes well" icon={<Flag />} testId="plan-next-steps">
            <BulletList items={a.proposedNextSteps} empty="None noted." />
          </PlanSection>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <PlanSection title="AI research" icon={<Search />} testId="plan-research">
          {r ? (
            <div className="flex flex-col gap-4">
              <p className="text-body text-fg">{r.overview}</p>
              <dl className="flex flex-col gap-3 text-small">
                {r.whatTheyDo && (
                  <div>
                    <dt className="text-caption text-fg-tertiary">What they do</dt>
                    <dd className="mt-0.5 text-fg">{r.whatTheyDo}</dd>
                  </div>
                )}
                {r.sizeAndSegment && (
                  <div>
                    <dt className="text-caption text-fg-tertiary">Size & segment</dt>
                    <dd className="mt-0.5 text-fg">{r.sizeAndSegment}</dd>
                  </div>
                )}
              </dl>
              <ResearchList title="Recent signals" items={r.recentSignals} />
              <ResearchList title="Likely priorities" items={r.likelyPriorities} />
              <ResearchList title="Pain hypotheses to test" items={r.painHypotheses} />
              {r.sources.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-caption text-fg-tertiary">Sources</h3>
                  <ul className="flex flex-col gap-1">
                    {r.sources.map((src, i) => (
                      <li key={i} className="min-w-0">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring inline-flex max-w-full items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg hover:underline"
                        >
                          <ExternalLink className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{src.title || displayHost(src.url)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={r.websiteRead ? 'success' : 'warning'}>{r.websiteRead ? 'Website read' : 'Website not read'}</Badge>
                <Badge tone={r.searched ? 'success' : 'warning'}>{r.searched ? 'Web search used' : 'No web search'}</Badge>
              </div>
              {r.limitations && (
                <p className="flex gap-1.5 rounded-md bg-warning-bg px-2.5 py-2 text-small text-warning-fg">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {r.limitations}
                </p>
              )}
              <p className="text-caption text-fg-tertiary">Facts carry sources; anything else is a hypothesis to check in the meeting.</p>
            </div>
          ) : a.researchSummary ? (
            <p className="text-body text-fg">{a.researchSummary}</p>
          ) : (
            <p className="text-small text-fg-tertiary">No research available.</p>
          )}
        </PlanSection>

        <PlanSection title="From the booking" icon={<ClipboardList />} testId="plan-booking">
          <dl className="flex flex-col gap-3 text-small">
            <div>
              <dt className="text-caption text-fg-tertiary">Outcome</dt>
              <dd className="mt-0.5 text-fg">{plan.call.outcome || 'Booked'}</dd>
            </div>
            <div>
              <dt className="text-caption text-fg-tertiary">Booked by</dt>
              <dd className="mt-0.5 text-fg">{plan.bookedByName || plan.bookedBy}</dd>
            </div>
            {plan.call.extraContext && (
              <div>
                <dt className="text-caption text-fg-tertiary">Note for the AE</dt>
                <dd className="mt-0.5 whitespace-pre-line text-fg">{plan.call.extraContext}</dd>
              </div>
            )}
            {plan.call.notes && (
              <div>
                <dt className="text-caption text-fg-tertiary">Rep&apos;s call notes</dt>
                <dd className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-subtle p-2.5 text-fg">{plan.call.notes}</dd>
              </div>
            )}
          </dl>
        </PlanSection>
      </aside>
    </div>
  );
}

function ResearchList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-caption text-fg-tertiary">{title}</h3>
      <BulletList items={items} />
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

function ActionPlanEditor({ value: p, onChange }: { value: ActionPlan; onChange: (p: ActionPlan) => void }) {
  const set = <K extends keyof ActionPlan>(k: K, v: ActionPlan[K]) => onChange({ ...p, [k]: v });
  const setSummary = <K extends keyof ActionPlan['callSummary']>(k: K, v: ActionPlan['callSummary'][K]) =>
    onChange({ ...p, callSummary: { ...p.callSummary, [k]: v } });
  const setAgenda = (i: number, patch: Partial<AgendaItem>) => set('agenda', p.agenda.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  return (
    <div className="flex flex-col gap-4" data-testid="plan-editor">
      <PlanSection title="Meeting goal" icon={<Target />}>
        <Textarea
          aria-label="Meeting goal"
          value={p.meetingGoal}
          rows={2}
          maxLength={L.shortText}
          onChange={(e) => set('meetingGoal', e.target.value)}
          className="min-h-0"
          placeholder="The one outcome the AE should leave with."
        />
      </PlanSection>

      <PlanSection title="Call summary" icon={<ClipboardList />}>
        <div className="flex flex-col gap-4">
          <Field label="Recap" htmlFor="edit-recap">
            <Textarea id="edit-recap" value={p.callSummary.recap} rows={4} maxLength={L.longText} onChange={(e) => setSummary('recap', e.target.value)} />
          </Field>
          <StringListEditor label="Key points" items={p.callSummary.keyPoints} onChange={(v) => setSummary('keyPoints', v)} addLabel="Add point" />
          <StringListEditor label="Prospect quotes" items={p.callSummary.prospectQuotes} onChange={(v) => setSummary('prospectQuotes', v)} addLabel="Add quote" />
          <Field label="Agreed next step" htmlFor="edit-agreed">
            <Input id="edit-agreed" value={p.callSummary.agreedNextStep} maxLength={L.shortText} onChange={(e) => setSummary('agreedNextStep', e.target.value)} />
          </Field>
        </div>
      </PlanSection>

      <PlanSection title="Research summary" icon={<Search />}>
        <Textarea
          aria-label="Research summary"
          value={p.researchSummary}
          rows={3}
          maxLength={L.longText}
          onChange={(e) => set('researchSummary', e.target.value)}
        />
        <p className="mt-1.5 text-small text-fg-tertiary">The detailed research and sources stay as the AI found them.</p>
      </PlanSection>

      <PlanSection title="Agenda" icon={<ListChecks />}>
        <ol className="flex flex-col gap-3">
          {p.agenda.map((it, i) => (
            <li key={i} className="rounded-md border border-line p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-caption tabular-nums text-fg-secondary">{i + 1}</span>
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_96px]">
                  <Field label="Topic" htmlFor={`ag-topic-${i}`}>
                    <Input id={`ag-topic-${i}`} value={it.topic} maxLength={L.shortText} onChange={(e) => setAgenda(i, { topic: e.target.value })} />
                  </Field>
                  <Field label="Minutes" htmlFor={`ag-min-${i}`}>
                    <Input
                      id={`ag-min-${i}`}
                      type="number"
                      min={0}
                      max={240}
                      value={it.minutes ?? ''}
                      onChange={(e) => setAgenda(i, { minutes: e.target.value === '' ? undefined : Math.max(0, Math.min(240, Number(e.target.value) || 0)) })}
                    />
                  </Field>
                  <Field label="Why it matters to them" htmlFor={`ag-why-${i}`} className="sm:col-span-2">
                    <Textarea
                      id={`ag-why-${i}`}
                      value={it.whyItMatters}
                      rows={2}
                      maxLength={L.longText}
                      className="min-h-0"
                      onChange={(e) => setAgenda(i, { whyItMatters: e.target.value })}
                    />
                  </Field>
                  <Field label="Maps to (our service)" htmlFor={`ag-maps-${i}`} className="sm:col-span-2">
                    <Input id={`ag-maps-${i}`} value={it.mapsTo} maxLength={L.shortText} onChange={(e) => setAgenda(i, { mapsTo: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <StringListEditor label="Questions" items={it.questions} onChange={(v) => setAgenda(i, { questions: v })} addLabel="Add question" max={CAPS.agendaQuestions} />
                  </div>
                </div>
                <IconButton label={`Remove agenda item ${i + 1}`} onClick={() => set('agenda', p.agenda.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
        {p.agenda.length > CAPS.agenda && <p className="mt-2 text-small text-warning-fg">Only the first {CAPS.agenda} agenda items are kept when you save.</p>}
        {p.agenda.length < CAPS.agenda && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus />}
            className="mt-2"
            onClick={() => set('agenda', [...p.agenda, { topic: '', whyItMatters: '', questions: [], mapsTo: '', minutes: 5 }])}
          >
            Add agenda item
          </Button>
        )}
      </PlanSection>

      <PlanSection title="Discovery questions" icon={<HelpCircle />}>
        <PairListEditor
          items={p.discoveryQuestions.map((q) => [q.question, q.purpose])}
          labels={['Question', 'What the answer tells you']}
          addLabel="Add question"
          onChange={(rows) => set('discoveryQuestions', rows.map(([question, purpose]) => ({ question, purpose })))}
        />
      </PlanSection>

      <PlanSection title="Likely objections" icon={<ShieldQuestion />}>
        <PairListEditor
          items={p.likelyObjections.map((o) => [o.objection, o.response])}
          labels={['Objection', 'Response']}
          addLabel="Add objection"
          multilineSecond
          onChange={(rows) => set('likelyObjections', rows.map(([objection, response]) => ({ objection, response })))}
        />
      </PlanSection>

      <div className="grid gap-4 md:grid-cols-2">
        <PlanSection title="Risks & unknowns" icon={<AlertTriangle />}>
          <StringListEditor label="Risks" items={p.risks} onChange={(v) => set('risks', v)} addLabel="Add risk" />
        </PlanSection>
        <PlanSection title="Next steps if it goes well" icon={<Flag />}>
          <StringListEditor label="Next steps" items={p.proposedNextSteps} onChange={(v) => set('proposedNextSteps', v)} addLabel="Add step" />
        </PlanSection>
      </div>
    </div>
  );
}

/** Rows of two fields (question + purpose, objection + response). */
function PairListEditor({
  items,
  labels,
  addLabel,
  onChange,
  multilineSecond = false,
}: {
  items: [string, string][];
  labels: [string, string];
  addLabel: string;
  onChange: (rows: [string, string][]) => void;
  multilineSecond?: boolean;
}) {
  const setCell = (i: number, c: 0 | 1, v: string) => onChange(items.map((row, j) => (j === i ? (c === 0 ? [v, row[1]] : [row[0], v]) : row)));
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <p className="text-small text-fg-tertiary">Nothing here yet.</p>}
      {items.map(([a, b], i) => (
        <div key={i} className="flex items-start gap-2 rounded-md border border-line p-3">
          <div className="grid min-w-0 flex-1 gap-2">
            <Input aria-label={`${labels[0]} ${i + 1}`} placeholder={labels[0]} value={a} maxLength={L.shortText} onChange={(e) => setCell(i, 0, e.target.value)} />
            {multilineSecond ? (
              <Textarea
                aria-label={`${labels[1]} ${i + 1}`}
                placeholder={labels[1]}
                value={b}
                rows={2}
                maxLength={L.longText}
                className="min-h-0"
                onChange={(e) => setCell(i, 1, e.target.value)}
              />
            ) : (
              <Input aria-label={`${labels[1]} ${i + 1}`} placeholder={labels[1]} value={b} maxLength={L.shortText} onChange={(e) => setCell(i, 1, e.target.value)} />
            )}
          </div>
          <IconButton label={`Remove ${labels[0].toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ))}
      {items.length < L.listItems && (
        <Button variant="ghost" size="sm" icon={<Plus />} className="self-start" onClick={() => onChange([...items, ['', '']])}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}

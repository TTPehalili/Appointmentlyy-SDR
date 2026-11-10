'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Eye, Lock, Plus, Users } from 'lucide-react';
import { Badge, Button, Dialog, Field, Input, InlineError, SegmentedControl, Select, Textarea } from '@/components/ui';
import ColdEmailAssistant from '@/components/email/ColdEmailAssistant';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { ASSISTANT_FRAMEWORKS, AUTO_FRAMEWORK_ID, type AssistantSequenceEmail, type AssistantTemplateMeta } from '@/lib/coldEmailAssistant';
import {
  CAMPAIGN_MAX,
  MERGE_FIELDS,
  NAME_MAX,
  OUTCOME_TAG_SUGGESTIONS,
  SAMPLE_MERGE_VALUES,
  SEQUENCE_STEP_MAX,
  SUBJECT_MAX,
  TAGS_MAX,
  TAG_MAX,
  TEMPLATE_PURPOSES,
  TEMPLATE_WORD_LIMIT,
  countTemplateWords,
  fillMergeFields,
  unknownMergeFields,
  type EmailTemplate,
  type TemplateInput,
  type TemplatePurpose,
  type TemplateVisibility,
} from '@/lib/emailTemplates';
import { createTemplate, updateTemplate } from '@/lib/emailTemplatesClient';

export interface TemplateEditorProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing template; null/undefined = new. */
  template?: EmailTemplate | null;
  /** Prefill for a new template (e.g. "New template in this campaign"). */
  initial?: Partial<TemplateInput>;
  canManage: boolean;
  campaigns: string[];
  /** Called after every save (also saves made from the assistant). */
  onSaved: (saved: EmailTemplate[], message: string, close: boolean) => void;
}

type FieldKey = 'subject' | 'body';

function initialForm(t: EmailTemplate | null | undefined, initial: Partial<TemplateInput> | undefined, canManage: boolean): TemplateInput {
  const src = t ?? initial ?? {};
  return {
    name: src.name ?? '',
    subject: src.subject ?? '',
    body: src.body ?? '',
    frameworkId: src.frameworkId ?? '',
    campaign: src.campaign ?? '',
    purpose: src.purpose ?? 'cold',
    outcomeTags: src.outcomeTags ?? [],
    visibility: src.visibility ?? (canManage ? 'team' : 'private'),
    assignedTo: src.assignedTo ?? [],
    sequenceStep: src.sequenceStep ?? null,
    archived: src.archived ?? false,
  };
}

/** Mounted fresh each time it opens (the host keys it), so the form and the assistant start clean. */
export default function TemplateEditorDialog({ open, onClose, template, initial, canManage, campaigns, onSaved }: TemplateEditorProps) {
  const { session } = useSession();
  const [form, setForm] = useState<TemplateInput>(() => initialForm(template, initial, canManage));
  const [frameworkId, setFrameworkId] = useState<string>(() => form.frameworkId || AUTO_FRAMEWORK_ID);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<FieldKey>('body');

  const isNew = !template;
  const editingTeam = !isNew && template?.visibility === 'team';
  const set = <K extends keyof TemplateInput>(k: K, v: TemplateInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const words = countTemplateWords(form.body);
  const unknown = useMemo(() => unknownMergeFields(`${form.subject} ${form.body}`), [form.subject, form.body]);
  const previewValues = useMemo(
    () => ({
      ...SAMPLE_MERGE_VALUES,
      sender_name: session?.repName?.split(/\s+/)[0] || SAMPLE_MERGE_VALUES.sender_name,
      sender_company: session?.tenantName || SAMPLE_MERGE_VALUES.sender_company,
    }),
    [session?.repName, session?.tenantName],
  );
  const showStep = form.purpose === 'sequence' || form.purpose === 'breakup';

  const insertToken = (token: string) => {
    const key = lastField.current;
    const el = key === 'subject' ? subjectRef.current : bodyRef.current;
    const value = form[key];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    set(key, next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const toggleTag = (tag: string) => {
    const has = form.outcomeTags.some((t) => t.toLowerCase() === tag.toLowerCase());
    if (has) set('outcomeTags', form.outcomeTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    else if (form.outcomeTags.length < TAGS_MAX) set('outcomeTags', [...form.outcomeTags, tag]);
  };

  const addCustomTag = () => {
    const v = customTag.trim().slice(0, TAG_MAX);
    if (v) toggleTag(v);
    setCustomTag('');
  };

  const payload = (f: TemplateInput): Partial<TemplateInput> => ({
    name: f.name,
    subject: f.subject,
    body: f.body,
    frameworkId: f.frameworkId,
    campaign: f.campaign,
    purpose: f.purpose,
    outcomeTags: f.outcomeTags,
    visibility: canManage ? f.visibility : 'private',
    sequenceStep: f.purpose === 'sequence' || f.purpose === 'breakup' ? f.sequenceStep : null,
    ...(isNew && canManage && f.visibility === 'team' ? { assignedTo: f.assignedTo } : {}),
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    const body = payload({ ...form, frameworkId: frameworkId === AUTO_FRAMEWORK_ID ? '' : frameworkId });
    const r = template ? await updateTemplate(template.id, body) : await createTemplate(body);
    setSaving(false);
    if (!r.ok) {
      setError({ message: r.error, field: r.field });
      return;
    }
    onSaved([r.template], template ? `Saved "${r.template.name}".` : `Created "${r.template.name}".`, true);
  };

  // ---------------------------------------------------------------- saves from the assistant

  const saveFromAssistant = async (t: { subject: string; body: string; meta?: AssistantTemplateMeta }) => {
    setNotice('');
    const name = (t.meta?.name || form.name || t.subject).slice(0, NAME_MAX);
    const purpose: TemplatePurpose = (t.meta?.purpose as TemplatePurpose) || form.purpose;
    const r = await createTemplate(
      payload({
        ...form,
        name,
        subject: t.subject,
        body: t.body,
        purpose,
        outcomeTags: t.meta?.outcomeTags?.length ? t.meta.outcomeTags : form.outcomeTags,
        frameworkId: t.meta?.frameworkId || (frameworkId === AUTO_FRAMEWORK_ID ? '' : frameworkId),
        sequenceStep: null,
      }),
    );
    if (!r.ok) {
      setError({ message: r.error, field: r.field });
      return false;
    }
    setNotice(`Saved "${r.template.name}" to the library.`);
    onSaved([r.template], `Saved "${r.template.name}".`, false);
    return true;
  };

  const saveSequence = async (emails: AssistantSequenceEmail[], campaignName: string) => {
    setNotice('');
    setError(null);
    const campaign = (form.campaign.trim() || campaignName || 'New sequence').slice(0, CAMPAIGN_MAX);
    const created: EmailTemplate[] = [];
    for (const e of emails) {
      const r = await createTemplate(
        payload({
          ...form,
          name: e.name.replace(/^[^:]+:/, `${campaign}:`).slice(0, NAME_MAX),
          subject: e.subject,
          body: e.body,
          purpose: e.purpose,
          sequenceStep: e.step,
          frameworkId: e.frameworkId,
          campaign,
          outcomeTags: [],
        }),
      );
      if (!r.ok) {
        setError({ message: `Saved ${created.length} of ${emails.length}. ${r.error}`, field: r.field });
        if (created.length) onSaved(created, `Saved ${created.length} templates to "${campaign}".`, false);
        return false;
      }
      created.push(r.template);
    }
    setNotice(`Saved ${created.length} templates to the campaign "${campaign}".`);
    onSaved(created, `Saved ${created.length} templates to "${campaign}".`, false);
    return true;
  };

  const fieldError = (f: string) => (error?.field === f ? error.message : undefined);
  const title = template ? `Edit "${template.name}"` : 'New email template';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={
        template && template.visibility === 'team'
          ? 'Changes reach everyone this template is assigned to.'
          : 'Write it once with merge fields; reps fill in the details when they send it.'
      }
      size="full"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            {template ? 'Save changes' : 'Save template'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* Form */}
        <div className="min-w-0 space-y-4">
          {error && !error.field && <InlineError message={error.message} />}
          {notice && (
            <p role="status" className="rounded-md bg-success-bg px-3 py-2 text-small text-success-fg">
              {notice}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="tpl-name" error={fieldError('name')}>
              <Input id="tpl-name" value={form.name} maxLength={NAME_MAX} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Logistics: first touch" />
            </Field>
            <Field label="Campaign" htmlFor="tpl-campaign" hint="Groups templates, e.g. one sequence." error={fieldError('campaign')}>
              <Input
                id="tpl-campaign"
                list="tpl-campaign-options"
                value={form.campaign}
                maxLength={CAMPAIGN_MAX}
                onChange={(e) => set('campaign', e.target.value)}
                placeholder="No campaign"
              />
              <datalist id="tpl-campaign-options">
                {campaigns.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Used for" htmlFor="tpl-purpose" error={fieldError('purpose')}>
              <Select id="tpl-purpose" value={form.purpose} onChange={(e) => set('purpose', e.target.value as TemplatePurpose)}>
                {TEMPLATE_PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            {showStep && (
              <Field label="Step in the sequence" htmlFor="tpl-step" error={fieldError('sequenceStep')}>
                <Input
                  id="tpl-step"
                  type="number"
                  min={1}
                  max={SEQUENCE_STEP_MAX}
                  value={form.sequenceStep ?? ''}
                  onChange={(e) => set('sequenceStep', e.target.value ? Math.max(1, Math.min(SEQUENCE_STEP_MAX, Number(e.target.value))) : null)}
                  placeholder="1"
                />
              </Field>
            )}
            <Field label="Framework" htmlFor="tpl-framework">
              <Select id="tpl-framework" value={frameworkId} onChange={(e) => setFrameworkId(e.target.value)}>
                <option value={AUTO_FRAMEWORK_ID}>None / auto</option>
                {ASSISTANT_FRAMEWORKS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="space-y-1.5">
            <span className="block text-body-strong text-fg">Suggest after these call outcomes</span>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Outcome tags">
              {[...new Set([...OUTCOME_TAG_SUGGESTIONS, ...form.outcomeTags])].map((tag) => {
                const on = form.outcomeTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'focus-ring rounded-full border px-2.5 py-1 text-small transition-colors',
                      on ? 'border-action bg-action text-action-fg' : 'border-line bg-surface text-fg-secondary hover:bg-subtle hover:text-fg',
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
              <span className="inline-flex items-center gap-1">
                <input
                  aria-label="Add an outcome tag"
                  value={customTag}
                  maxLength={TAG_MAX}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                  placeholder="Other outcome"
                  className="focus-ring h-7 w-32 rounded-full border border-line bg-surface px-2.5 text-small text-fg placeholder:text-fg-tertiary"
                />
                {customTag.trim() && (
                  <Button variant="ghost" size="sm" onClick={addCustomTag} icon={<Plus />}>
                    Add
                  </Button>
                )}
              </span>
            </div>
            {fieldError('outcomeTags') && <p className="text-small text-danger-fg">{fieldError('outcomeTags')}</p>}
          </div>

          {canManage ? (
            <div className="space-y-1.5">
              <span className="block text-body-strong text-fg">Who can use it</span>
              <SegmentedControl
                label="Who can use it"
                size="sm"
                value={form.visibility}
                onChange={(v) => set('visibility', v as TemplateVisibility)}
                items={[
                  { value: 'team', label: <><Users className="size-3.5" aria-hidden /> Team</> },
                  { value: 'private', label: <><Lock className="size-3.5" aria-hidden /> Only me</> },
                ]}
              />
              <p className="text-small text-fg-tertiary">
                {form.visibility === 'team'
                  ? isNew
                    ? 'Everyone in the workspace by default. Pick specific reps with Assign after saving.'
                    : 'Use Assign on the template to change who gets it.'
                  : 'A private template only you can see and use.'}
              </p>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-small text-fg-tertiary">
              <Lock className="size-3.5" aria-hidden />
              {editingTeam ? 'Team template.' : 'Saved to My templates. Only you can see it.'}
            </p>
          )}

          {/* Merge fields */}
          <div className="space-y-1.5">
            <span className="block text-caption text-fg-tertiary">Insert a merge field at the cursor</span>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertToken(m.token)}
                  title={`Insert ${m.token}`}
                  className="focus-ring rounded-sm border border-line bg-subtle px-2 py-0.5 font-mono text-caption text-fg-secondary hover:bg-surface hover:text-fg"
                >
                  {m.token}
                </button>
              ))}
            </div>
          </div>

          <Field label="Subject" htmlFor="tpl-subject" error={fieldError('subject')}>
            <Input
              id="tpl-subject"
              ref={subjectRef}
              value={form.subject}
              maxLength={SUBJECT_MAX}
              onFocus={() => (lastField.current = 'subject')}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="e.g. shared leads at {{company}}"
            />
          </Field>

          <Field label="Body" htmlFor="tpl-body" error={fieldError('body')}>
            <Textarea
              id="tpl-body"
              ref={bodyRef}
              rows={11}
              value={form.body}
              onFocus={() => (lastField.current = 'body')}
              onChange={(e) => set('body', e.target.value)}
              className="min-h-[240px] font-sans leading-relaxed"
              placeholder={'Hi {{first_name}},\n\n...\n\nBest,\n{{sender_name}}'}
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2 text-small">
            <span className={cn('tabular-nums', words >= TEMPLATE_WORD_LIMIT ? 'text-danger-fg' : 'text-fg-tertiary')} aria-live="polite">
              {words} words{words >= TEMPLATE_WORD_LIMIT ? `: keep it under ${TEMPLATE_WORD_LIMIT}` : ` (under ${TEMPLATE_WORD_LIMIT})`}
            </span>
            <Button variant="ghost" size="sm" icon={<Eye />} aria-pressed={showPreview} onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Hide preview' : 'Preview with sample values'}
            </Button>
          </div>
          {unknown.length > 0 && (
            <p className="flex items-start gap-1.5 text-small text-warning-fg" role="status">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Unknown merge field{unknown.length > 1 ? 's' : ''}: {unknown.map((k) => `{{${k}}}`).join(', ')}. Reps would see them unfilled.
              </span>
            </p>
          )}

          {showPreview && (
            <div className="space-y-2 rounded-lg border border-line bg-subtle p-4" aria-label="Preview with sample values">
              <div className="flex items-center justify-between gap-2">
                <p className="text-small text-fg">
                  <span className="text-fg-tertiary">Subject: </span>
                  <span className="font-medium">{fillMergeFields(form.subject, previewValues) || '(no subject)'}</span>
                </p>
                <Badge tone="neutral">Sample values</Badge>
              </div>
              <p className="whitespace-pre-wrap text-body leading-relaxed text-fg">{fillMergeFields(form.body, previewValues) || '(empty)'}</p>
            </div>
          )}
        </div>

        {/* AI drafting */}
        <div className="min-w-0 rounded-lg border border-line bg-surface shadow-xs lg:self-start">
          <ColdEmailAssistant
            purpose="template"
            templateKind={form.purpose}
            recipient={{ name: '', company: '', title: '' }}
            sender={{ name: '', company: '' }}
            draft={{ subject: form.subject, body: form.body }}
            onApply={(subject, body) => setForm((f) => ({ ...f, subject, body }))}
            frameworkId={frameworkId}
            onFrameworkChange={setFrameworkId}
            enableLinkedInMirror={false}
            onSaveTemplate={saveFromAssistant}
            onSaveSequence={saveSequence}
            logClassName="max-h-[52vh]"
          />
        </div>
      </div>
    </Dialog>
  );
}

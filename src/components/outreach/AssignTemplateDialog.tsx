'use client';

import React, { useMemo, useState } from 'react';
import { Button, Checkbox, Dialog, InlineError, SearchInput } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { EmailTemplate } from '@/lib/emailTemplates';
import { updateTemplate, type WorkspaceMember } from '@/lib/emailTemplatesClient';

export interface AssignTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  /** One template, or every template of a campaign. */
  templates: EmailTemplate[];
  /** Label for the dialog, e.g. the template or campaign name. */
  label: string;
  members: WorkspaceMember[];
  membersLoaded: boolean;
  onSaved: (updated: EmailTemplate[], message: string) => void;
}

/** Everyone, or pick people from the workspace member list. Mounted fresh each time it opens. */
export default function AssignTemplateDialog({ open, onClose, templates, label, members, membersLoaded, onSaved }: AssignTemplateDialogProps) {
  const first = templates[0];
  // A campaign shares one assignment when every template has the same list; otherwise start from the first.
  const [mode, setMode] = useState<'everyone' | 'people'>(() => (first && first.assignedTo.length > 0 ? 'people' : 'everyone'));
  const [picked, setPicked] = useState<Set<string>>(() => new Set((first?.assignedTo ?? []).map((e) => e.toLowerCase())));
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mixed = templates.some((t) => t.assignedTo.slice().sort().join(',') !== (first?.assignedTo ?? []).slice().sort().join(','));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q))
      .sort((a, b) => (a.role === 'Rep' ? 0 : 1) - (b.role === 'Rep' ? 0 : 1) || (a.name || a.email).localeCompare(b.name || b.email));
  }, [members, query]);

  const toggle = (email: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const e = email.toLowerCase();
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });

  const save = async () => {
    const assignedTo = mode === 'everyone' ? [] : [...picked];
    if (mode === 'people' && assignedTo.length === 0) {
      setError('Pick at least one person, or choose Everyone.');
      return;
    }
    setSaving(true);
    setError('');
    const updated: EmailTemplate[] = [];
    for (const t of templates) {
      const r = await updateTemplate(t.id, { assignedTo });
      if (!r.ok) {
        setSaving(false);
        setError(updated.length ? `Updated ${updated.length} of ${templates.length}. ${r.error}` : r.error);
        if (updated.length) onSaved(updated, `Updated ${updated.length} templates.`);
        return;
      }
      updated.push(r.template);
    }
    setSaving(false);
    const who = mode === 'everyone' ? 'everyone in the workspace' : `${assignedTo.length} ${assignedTo.length === 1 ? 'person' : 'people'}`;
    onSaved(updated, templates.length > 1 ? `Assigned ${templates.length} templates to ${who}.` : `Assigned to ${who}.`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Assign ${label}`}
      description={templates.length > 1 ? `Applies to all ${templates.length} templates in this campaign.` : 'Assigned templates show up for reps in Templates, Cold email and the Dialer.'}
      size="md"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save assignment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}
        {mixed && <p className="text-small text-fg-tertiary">These templates have different assignments today. Saving gives them all the same one.</p>}
        <fieldset className="space-y-2">
          <legend className="sr-only">Who gets it</legend>
          {(
            [
              ['everyone', 'Everyone in the workspace', 'New people get it too.'],
              ['people', 'Only the people I pick', 'Everyone else in the workspace will not see it.'],
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
                mode === value ? 'border-action bg-selected' : 'border-line bg-surface hover:bg-subtle',
              )}
            >
              <input type="radio" name="assign-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="focus-ring mt-1" />
              <span>
                <span className="block text-body-strong text-fg">{title}</span>
                <span className="block text-small text-fg-tertiary">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {mode === 'people' && (
          <div className="space-y-2">
            <SearchInput aria-label="Search people" placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="max-h-72 overflow-y-auto rounded-md border border-line">
              {!membersLoaded ? (
                <p className="p-3 text-small text-fg-tertiary">Loading people...</p>
              ) : shown.length === 0 ? (
                <p className="p-3 text-small text-fg-tertiary">{members.length === 0 ? 'No one else is in this workspace yet. Invite reps from Admin, People.' : 'No one matches.'}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {shown.map((m) => (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-subtle">
                        <Checkbox checked={picked.has(m.email.toLowerCase())} onChange={() => toggle(m.email)} aria-label={`Assign to ${m.name || m.email}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-fg">{m.name || m.email}</span>
                          <span className="block truncate text-small text-fg-tertiary">{m.email}</span>
                        </span>
                        <span className="shrink-0 text-caption text-fg-tertiary">
                          {m.role}
                          {m.status === 'invited' ? ', invited' : ''}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-small text-fg-tertiary tabular-nums">{picked.size} selected</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

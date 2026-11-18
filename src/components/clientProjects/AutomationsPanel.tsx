'use client';

/** Automations: a small, fixed set of built-in rules with an on/off switch each. Every firing is logged. */
import * as React from 'react';
import { Button, Card, Field, Input, Switch, useToast } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { AUTOMATION_INFO, AUTOMATION_RULES, fmtAt, ruleOn, type AutomationRule, type CpEvent, type OwnerProjectView } from '@/lib/clientProjects/types';
import { actorLabel, eventText } from '@/components/clientProjects/eventText';
import { Note, type MailStatus } from '@/components/clientProjects/shared';

export function AutomationsPanel({ project, events, counts, mail, onChanged }: { project: OwnerProjectView; events: CpEvent[]; counts: Record<string, number>; mail: MailStatus; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [email, setEmail] = React.useState(project.clientContactEmail);
  const [busy, setBusy] = React.useState('');
  React.useEffect(() => setEmail(project.clientContactEmail), [project.clientContactEmail]);

  const patch = async (body: Record<string, unknown>, key: string, done: string) => {
    setBusy(key);
    const r = await apiJson(`/api/client-projects/${project.id}`, { method: 'PATCH', body });
    setBusy('');
    toast({ message: r.success ? done : r.error || 'Could not save.' });
    await onChanged();
  };
  const fired = events.slice(0, 30);
  const count = (rule: AutomationRule) => counts[rule] ?? 0;

  return (
    <div className="flex flex-col gap-6" data-testid="cp-automations">
      {!mail.configured && <Note tone="warning">Email is not set up on this server, so rules that send email still run and are logged, marked “email not sent: mail not configured”.</Note>}
      {mail.outbox && <Note>Test server: emails are written to the local test outbox, not sent.</Note>}

      <Card className="divide-y divide-line">
        {AUTOMATION_RULES.map((rule) => {
          const info = AUTOMATION_INFO[rule];
          const on = ruleOn(project, rule);
          const needsEmail = rule === 'client_reminders' && !project.clientContactEmail;
          return (
            <div key={rule} className="flex items-start justify-between gap-4 p-4" data-testid={`cp-rule-${rule}`} data-on={on ? '1' : '0'}>
              <div className="min-w-0">
                <p className="text-body-strong text-fg">{info.title}</p>
                <p className="mt-0.5 max-w-[70ch] text-small text-fg-secondary">{info.description}</p>
                <p className="mt-1 text-caption text-fg-tertiary">
                  Fired {count(rule)} {count(rule) === 1 ? 'time' : 'times'}
                  {rule === 'client_reminders' && !project.hasLink ? ' · The board is not shared yet' : ''}
                </p>
              </div>
              <Switch checked={on} disabled={busy === rule || (needsEmail && !on)} label={`${info.title}: ${on ? 'on' : 'off'}`} onCheckedChange={(v) => void patch({ automations: { [rule]: v } }, rule, `${info.title}: ${v ? 'on' : 'off'}`)} />
            </div>
          );
        })}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Client contact email" htmlFor="cp-contact" hint="Used only for the fixed reminder emails, when that rule is on." className="min-w-64 flex-1">
            <Input id="cp-contact" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@client.com" maxLength={254} />
          </Field>
          <Button variant="secondary" loading={busy === 'email'} disabled={email === project.clientContactEmail} onClick={() => void patch({ clientContactEmail: email }, 'email', 'Client contact saved')}>
            Save
          </Button>
        </div>
      </Card>

      <section aria-label="Automation log">
        <h2 className="mb-2 text-h3 text-fg">Recent firings</h2>
        {fired.length === 0 ? (
          <p className="text-small text-fg-tertiary">Nothing has fired yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {fired.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-small" data-testid="cp-auto-row">
                <span className="w-28 shrink-0 tabular-nums text-fg-tertiary">{fmtAt(e.at)}</span>
                <span className="min-w-0 flex-1 text-fg">{eventText(e)}</span>
                <span className="text-fg-tertiary">{actorLabel(e.actor)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

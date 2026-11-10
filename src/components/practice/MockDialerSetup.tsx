'use client';

import React, { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Award, Check } from 'lucide-react';
import BorisCallingCockpit from '@/components/BorisCallingCockpit';
import { ElevenLabsAttribution } from '@/components/voice/ElevenLabsAttribution';
import { Badge, PageHeader, SegmentedControl, Select, buttonClasses } from '@/components/ui';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { getPresetRebuttals } from '@/lib/dialerRebuttals';
import {
  PRACTICE_DIFFICULTIES,
  type PracticeDifficulty,
  type PracticeSetup,
  difficultyLabel,
  getPracticePersonas,
  parsePracticeHistory,
  practiceCompanyName,
  readPracticeHistoryRaw,
  subscribeToPracticeHistory,
} from '@/lib/practice';

const NO_OBJECTION = 'none';

/**
 * Tab 2 of /practice: a compact setup bar (customer, objection, difficulty) and, right below it,
 * the real Dialer in practice mode. The setup lives in the URL (?tab=dialer&persona=&objection=&difficulty=).
 */
export default function MockDialerSetup({ tabs }: { tabs?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isDemo = useDemoWorkspace();
  const personas = useMemo(() => getPracticePersonas(isDemo), [isDemo]);
  const objections = getPresetRebuttals(isDemo);

  const persona = personas.find((p) => p.id === params.get('persona')) ?? personas[0];
  const rawObjection = params.get('objection');
  const objectionId =
    rawObjection === NO_OBJECTION
      ? NO_OBJECTION
      : objections.find((o) => o.id === rawObjection)?.id ?? objections[0]?.id ?? NO_OBJECTION;
  const d = params.get('difficulty');
  const difficulty: PracticeDifficulty = d === 'friendly' || d === 'tough' ? d : 'realistic';

  const setup: PracticeSetup | null = persona
    ? { personaId: persona.id, objectionId: objectionId === NO_OBJECTION ? null : objectionId, difficulty }
    : null;

  const update = (patch: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    q.set('tab', 'dialer');
    if (persona) q.set('persona', persona.id);
    q.set('objection', objectionId);
    q.set('difficulty', difficulty);
    for (const [k, v] of Object.entries(patch)) q.set(k, v);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const historyRaw = useSyncExternalStore(subscribeToPracticeHistory, readPracticeHistoryRaw, () => '[]');
  const history = useMemo(() => parsePracticeHistory(historyRaw).slice(0, 5), [historyRaw]);
  const objection = objections.find((o) => o.id === objectionId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-4">
          <PageHeader
            className="pb-0"
            title="Mock dialer"
            description="Practise inside the real Dialer: same screen, script and buttons, against an AI customer who raises the objection you choose."
            meta={<ElevenLabsAttribution variant="pill" />}
            secondaryActions={
              <Link href="/certification" className={buttonClasses('secondary', 'md')}>
                <Award aria-hidden />
                <span>Certification</span>
              </Link>
            }
            tabs={tabs}
          />

          {/* Compact setup bar */}
          <section aria-label="Practice setup" className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div className="w-full max-w-sm">
                <label htmlFor="mock-customer" className="mb-1 block text-caption text-fg-tertiary">
                  1. Customer
                </label>
                <Select id="mock-customer" value={persona?.id ?? ''} onChange={(e) => update({ persona: e.target.value })} className="h-9">
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}, {p.title} ({practiceCompanyName(p)})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <span id="mock-difficulty" className="mb-1 block text-caption text-fg-tertiary">
                  3. Difficulty
                </span>
                <SegmentedControl
                  size="sm"
                  label="Difficulty"
                  value={difficulty}
                  onChange={(v) => update({ difficulty: v })}
                  items={PRACTICE_DIFFICULTIES.map((x) => ({ value: x.value, label: x.label }))}
                />
              </div>
              <p className="pb-1 text-small text-fg-secondary">{PRACTICE_DIFFICULTIES.find((x) => x.value === difficulty)?.hint}</p>
            </div>
            <fieldset>
              <legend className="mb-1 text-caption text-fg-tertiary">2. Objection to drill</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                {[...objections.map((o) => ({ id: o.id, label: o.shortLabel })), { id: NO_OBJECTION, label: 'None, just the script' }].map((o) => {
                  const selected = objectionId === o.id;
                  return (
                    <label
                      key={o.id}
                      className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-small font-medium transition-colors duration-150 has-[:focus-visible]:shadow-[var(--focus-ring)] ${
                        selected ? 'border-transparent bg-action text-action-fg' : 'border-line-strong bg-surface text-fg hover:bg-subtle'
                      }`}
                    >
                      <input
                        type="radio"
                        name="practice-objection"
                        value={o.id}
                        checked={selected}
                        onChange={() => update({ objection: o.id })}
                        className="sr-only"
                      />
                      {selected && <Check className="size-3.5" aria-hidden />}
                      {o.label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-small text-fg-tertiary">
                {objection ? <>The customer will say something like &ldquo;{objection.trigger}&rdquo;. </> : null}
                Press <span className="font-medium text-fg-secondary">Call</span> below, then talk (Chrome microphone) or type your lines. Nothing is saved to contacts, activity or CRM.
              </p>
            </fieldset>
          </section>

          {/* The real Dialer in practice mode. A new setup starts a fresh practice Dialer. */}
          {setup && (
            <BorisCallingCockpit
              key={`${setup.personaId}|${setup.objectionId}|${setup.difficulty}`}
              practice={setup}
              embedded
            />
          )}

          <section aria-labelledby="practice-recent" className="rounded-lg border border-line bg-surface p-4 shadow-xs">
            <h2 id="practice-recent" className="mb-2 text-h3 text-fg">Recent practice calls</h2>
            {history.length === 0 ? (
              <p className="text-small text-fg-tertiary">No practice calls yet. Your scores will show up here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {history.map((h) => {
                  const row = (
                    <>
                      <span className="min-w-0 truncate text-small text-fg">
                        {h.personaName} · {h.objectionLabel} · {difficultyLabel(h.difficulty)}
                        <span className="text-fg-tertiary"> · {new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      </span>
                      {h.score !== null ? (
                        <Badge tone={h.score >= 80 ? 'success' : h.score >= 60 ? 'warning' : 'danger'}>
                          {h.score} · {h.grade}
                        </Badge>
                      ) : (
                        <Badge>Not scored</Badge>
                      )}
                    </>
                  );
                  return (
                    <li key={h.id}>
                      {h.scorecardId ? (
                        <Link
                          href={`/practice/scorecard/${encodeURIComponent(h.scorecardId)}`}
                          className="focus-ring -mx-2 flex items-center justify-between gap-3 rounded-sm px-2 py-2 hover:bg-subtle"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center justify-between gap-3 py-2">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

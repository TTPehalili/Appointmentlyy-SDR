'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  Building,
  Mic,
  PhoneCall
} from 'lucide-react';
import { SPARRING_PERSONAS, SparringCountry, getPersonaVoiceByCountry } from '@/lib/personas';
import { RepAccentKey } from '@/lib/repVoices';
import { Badge, PageHeader, SegmentedControl, Select, buttonClasses, type Tone } from '@/components/ui';

const DIFFICULTY_TONE: Record<string, Tone> = {
  Beginner: 'success',
  Intermediate: 'neutral',
  Advanced: 'warning',
  Nightmare: 'danger',
};

/** Tab 1 of /practice: the Sparring Arena (persona list, classic sparring call per persona). */
export default function SparringArena({ tabs }: { tabs?: React.ReactNode }) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<SparringCountry>('USA');
  const [selectedRepAccent, setSelectedRepAccent] = useState<RepAccentKey>('arabic');

  // Sync country and rep accent preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sparring_country');
    if (saved === 'USA' || saved === 'Australia' || saved === 'UK') {
      setSelectedCountry(saved);
    }
    const savedRep = localStorage.getItem('sparring_rep_accent') as RepAccentKey | null;
    if (savedRep === 'arabic' || savedRep === 'filipino') {
      setSelectedRepAccent(savedRep);
    }
  }, []);

  const handleCountryChange = (c: SparringCountry) => {
    setSelectedCountry(c);
    localStorage.setItem('sparring_country', c);
  };

  const handleRepAccentChange = (a: RepAccentKey) => {
    setSelectedRepAccent(a);
    localStorage.setItem('sparring_rep_accent', a);
  };

  const filteredPersonas = selectedDifficulty === 'all'
    ? SPARRING_PERSONAS
    : SPARRING_PERSONAS.filter(p => p.difficulty.toLowerCase() === selectedDifficulty.toLowerCase());

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">

          <PageHeader
            className="pb-0"
            title="Sparring Arena"
            count={SPARRING_PERSONAS.length}
            description="Practice cold calls with an AI buyer, then get a scorecard on how you handled the objection."
            secondaryActions={
              <>
                <Link href="/certification" className={buttonClasses('secondary', 'md')}>
                  <Award aria-hidden />
                  <span>Certification</span>
                </Link>
                <Link href="/dialer" className={buttonClasses('secondary', 'md')}>
                  <span>Calling floor</span>
                  <ArrowRight aria-hidden />
                </Link>
              </>
            }
            tabs={tabs}
          />

          {/* Filter controls and voice settings */}
          <div className="flex items-center justify-between gap-x-6 gap-y-3 flex-wrap border-b border-line pb-4">
            <div className="flex items-center gap-x-6 gap-y-3 flex-wrap">
              {/* Rep voice accent */}
              <div className="flex items-center gap-2">
                <span className="text-small text-fg-secondary">Your voice</span>
                <SegmentedControl
                  size="sm"
                  label="Your voice accent"
                  value={selectedRepAccent}
                  onChange={(v) => handleRepAccentChange(v as RepAccentKey)}
                  items={[
                    { value: 'arabic', label: 'Arabic accent' },
                    { value: 'filipino', label: 'Filipino accent' },
                  ]}
                />
              </div>

              {/* Buyer accent */}
              <div className="flex items-center gap-2">
                <label htmlFor="buyer-accent" className="text-small text-fg-secondary whitespace-nowrap">Buyer accent</label>
                <div className="w-56">
                  <Select
                    id="buyer-accent"
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value as SparringCountry)}
                    className="h-8 text-small"
                  >
                    <option value="USA">USA (American accent)</option>
                    <option value="Australia">Australia (Australian accent)</option>
                    <option value="UK">UK (British accent)</option>
                  </Select>
                </div>
              </div>
            </div>

            {/* Difficulty filter */}
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-small text-fg-secondary">Difficulty</span>
              <SegmentedControl
                size="sm"
                label="Difficulty"
                value={selectedDifficulty}
                onChange={setSelectedDifficulty}
                items={['all', 'beginner', 'intermediate', 'advanced', 'nightmare'].map((lvl) => ({
                  value: lvl,
                  label: <span className="capitalize">{lvl}</span>,
                }))}
              />
            </div>
          </div>

          {/* Personas grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPersonas.map((persona) => {
              return (
                <div
                  key={persona.id}
                  className="rounded-lg bg-surface border border-line hover:border-line-strong p-5 flex flex-col justify-between transition-colors duration-150 shadow-xs"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-h3 text-fg">
                          {persona.name}
                        </h2>
                        <p className="text-small text-fg-secondary">
                          {persona.title}
                        </p>
                      </div>

                      <Badge tone={DIFFICULTY_TONE[persona.difficulty] ?? 'neutral'}>
                        {persona.difficulty}
                      </Badge>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1 text-small text-fg-secondary">
                      <div className="flex items-center gap-2">
                        <Building className="size-4 text-fg-tertiary" aria-hidden />
                        <span>{persona.companyType}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mic className="size-4 text-fg-tertiary" aria-hidden />
                        <span>
                          {getPersonaVoiceByCountry(persona, selectedCountry).accentLabel}
                        </span>
                      </div>
                    </div>

                    {/* Core objection */}
                    <blockquote className="border-l-2 border-line-strong pl-3 text-body text-fg-secondary">
                      &ldquo;{persona.coreObjection}&rdquo;
                    </blockquote>
                  </div>

                  {/* Start sparring CTA */}
                  <div className="mt-5">
                    <Link
                      href={`/practice/${persona.id}?country=${selectedCountry}&repAccent=${selectedRepAccent}`}
                      className={buttonClasses('secondary', 'md', 'w-full')}
                    >
                      <PhoneCall aria-hidden />
                      <span>Start sparring call</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

        </main>
      </div>
    </div>
  );
}

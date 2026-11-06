'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, 
  ArrowRight, 
  Flame, 
  SlidersHorizontal,
  Building,
  Target,
  Globe,
  PhoneCall
} from 'lucide-react';
import { SPARRING_PERSONAS, SparringCountry, getPersonaVoiceByCountry } from '@/lib/personas';
import { RepAccentKey } from '@/lib/repVoices';

export default function SparringLobbyPage() {
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
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-zinc-50/70 font-sans antialiased text-zinc-900">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8 space-y-6">
          
          {/* Header Banner */}
          <div className="rounded-xl p-5 bg-white border border-zinc-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-zinc-400 block mb-1">
                VOICE SIMULATION ARENA
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
                AI Sparring Arena — 10 Buyer Personas
              </h1>
              <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
                Dial in to simulate realistic B2B cold calls. Practice unscripted objection handling against adversarial buyer personas and receive automated ARM rubric grading.
              </p>
            </div>

            <Link
              href="/dialer"
              className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <span>Calling Floor</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Filter Controls & Country Voice Switcher */}
          <div className="flex items-center justify-between gap-4 flex-wrap bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-xs">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Rep Voice Accent Switcher */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <Users className="h-3.5 w-3.5 text-[#ED1C24]" />
                  <span>Rep Voice:</span>
                </div>
                <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg text-xs font-medium border border-zinc-200">
                  <button
                    type="button"
                    onClick={() => handleRepAccentChange('arabic')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                      selectedRepAccent === 'arabic'
                        ? 'bg-zinc-950 text-white font-bold shadow-2xs'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    <span>🇦🇪</span>
                    <span>Arabic Accent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRepAccentChange('filipino')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                      selectedRepAccent === 'filipino'
                        ? 'bg-zinc-950 text-white font-bold shadow-2xs'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    <span>🇵🇭</span>
                    <span>Filipino Accent</span>
                  </button>
                </div>
              </div>

              {/* Country Voice Accent Dropdown Selector */}
              <div className="flex items-center gap-2 border-l border-zinc-200 pl-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <Globe className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Buyer Voice Accent:</span>
                </div>
                <div className="relative inline-block">
                  <select
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value as SparringCountry)}
                    className="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-900 text-xs font-medium py-1.5 pl-3 pr-7 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  >
                    <option value="USA">🇺🇸 USA (American Accent)</option>
                    <option value="Australia">🇦🇺 Australia (Australian Accent)</option>
                    <option value="UK">🇬🇧 UK (British Accent)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Difficulty Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
                <SlidersHorizontal className="h-3 w-3 text-zinc-400" />
                <span className="hidden sm:inline">Difficulty:</span>
              </div>
              <div className="flex items-center gap-1">
                {['all', 'beginner', 'intermediate', 'advanced', 'nightmare'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setSelectedDifficulty(lvl)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                      selectedDifficulty === lvl
                        ? 'bg-zinc-900 text-white font-semibold shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-950'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 10 Personas Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPersonas.map((persona) => {
              return (
                <div
                  key={persona.id}
                  className="rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 p-5 flex flex-col justify-between transition-all shadow-xs"
                >
                  <div className="space-y-3.5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-sm text-zinc-950">
                          {persona.name}
                        </h3>
                        <p className="text-xs text-zinc-500">
                          {persona.title}
                        </p>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium border bg-zinc-50 text-zinc-700 border-zinc-200">
                        {persona.difficulty}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1 pt-2 border-t border-zinc-100 text-xs">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Building className="h-3.5 w-3.5 text-zinc-400" />
                        <span>{persona.companyType}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Target className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="font-medium text-zinc-800">
                          {getPersonaVoiceByCountry(persona, selectedCountry).accentLabel}
                        </span>
                      </div>
                    </div>

                    {/* Scenario */}
                    <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/70 text-xs space-y-1">
                      <div className="font-semibold text-zinc-700 text-[11px] flex items-center gap-1">
                        <Flame className="h-3 w-3 text-zinc-500" />
                        <span>Core Objection</span>
                      </div>
                      <p className="text-zinc-600 text-xs leading-relaxed italic">
                        "{persona.coreObjection}"
                      </p>
                    </div>
                  </div>

                  {/* Start Sparring CTA */}
                  <div className="mt-4 pt-3 border-t border-zinc-100">
                    <Link
                      href={`/practice/${persona.id}?country=${selectedCountry}&repAccent=${selectedRepAccent}`}
                      className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      <span>Start Sparring Call</span>
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

'use client';

import React from 'react';
import { Search, Clock } from 'lucide-react';

export interface CockpitLead {
  id: string;
  name: string;
  company: string;
  title: string;
  headcount: string;
  cadenceStep: string;
  localTime: string;
  phone: string;
  email: string;
  currentBpo: string;
  techStack: string;
  painPoint: string;
  status: 'new' | 'contacted' | 'booked' | 'disqualified';
}

interface LeadQueueProps {
  leads: CockpitLead[];
  selectedLeadId: string;
  onSelectLead: (id: string) => void;
  searchFilter: string;
  onSearchChange: (query: string) => void;
}

export default function LeadQueue({
  leads,
  selectedLeadId,
  onSelectLead,
  searchFilter,
  onSearchChange
}: LeadQueueProps) {
  const filteredLeads = leads.filter(l =>
    `${l.name} ${l.company} ${l.title}`.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <aside className="flex w-72 shrink-0 select-none flex-col overflow-hidden border-r border-line bg-app">
      {/* Height 44px Compact Search & Filter Input */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, title or company"
            className="focus-ring h-8 w-full rounded-sm border border-line-strong bg-surface pl-8 pr-2 text-small text-fg placeholder:text-fg-disabled"
          />
        </div>
        <span className="shrink-0 rounded-sm bg-subtle px-1.5 text-caption tabular-nums leading-5 text-fg-secondary">
          {filteredLeads.length}
        </span>
      </div>

      {/* Pane Sub-header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-subtle px-3 py-1.5">
        <span className="text-group text-fg-tertiary">
          Priority queue
        </span>
        <span className="text-caption text-fg-tertiary">
          Auto-rotate on
        </span>
      </div>

      {/* Scrollable Lead Queue */}
      <div className="flex-1 overflow-y-auto">
        {filteredLeads.map((lead) => {
          const isSelected = lead.id === selectedLeadId;

          return (
            <div
              key={lead.id}
              onClick={() => onSelectLead(lead.id)}
              className={`relative flex h-16 cursor-pointer flex-col justify-between border-b border-l-2 border-b-line px-3 py-2 transition-colors duration-150 ${
                isSelected
                  ? 'border-l-brand-600 bg-selected'
                  : 'border-l-transparent hover:bg-subtle'
              }`}
            >
              {/* Top Row: Name + Timezone Clock */}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-body-strong text-fg">
                  {lead.name}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-caption tabular-nums text-fg-tertiary">
                  <Clock className="size-3 text-fg-tertiary" />
                  <span>{lead.localTime.split(' - ')[1] || lead.localTime}</span>
                </span>
              </div>

              {/* Bottom Row: Company / Title + Cadence Step */}
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-caption leading-none text-fg-secondary">
                  {lead.company} · <span className="text-fg-tertiary">{lead.title}</span>
                </p>
                <span
                  className={`inline-flex h-5 shrink-0 items-center rounded-sm px-1.5 text-caption ${
                    lead.status === 'booked'
                      ? 'bg-success-bg text-success-fg'
                      : lead.status === 'contacted'
                      ? 'bg-warning-bg text-warning-fg'
                      : 'bg-subtle text-fg-secondary'
                  }`}
                >
                  {lead.cadenceStep}
                </span>
              </div>
            </div>
          );
        })}

        {filteredLeads.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-small text-fg-secondary">No leads match this search.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

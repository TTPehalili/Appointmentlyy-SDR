'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Sparkles,
  Zap,
  Mail,
  Smartphone,
  PhoneCall,
  Clock,
  Layers,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Share2,
  Bot,
  Hash,
  Server,
  Hourglass,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Folder
} from 'lucide-react';
import { PRELOADED_WORKFLOW_TEMPLATES, WorkflowTemplate, OutboundCategory } from '@/lib/workflowTemplates';
import { ProjectFolderRecord } from '@/lib/db';
import { Badge, Button, Dialog, IconButton } from '@/components/ui';

interface TemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: WorkflowTemplate, targetFolderId?: string) => void;
  projects: ProjectFolderRecord[];
  currentFolderId: string | null;
}

const CATEGORIES: { id: OutboundCategory | 'All'; label: string; count: number }[] = [
  { id: 'All', label: 'All Outbound Templates', count: PRELOADED_WORKFLOW_TEMPLATES.length },
  {
    id: '21-Day Outbound Cadence',
    label: '21-Day Cadence Blueprint',
    count: PRELOADED_WORKFLOW_TEMPLATES.filter((t) => t.category === '21-Day Outbound Cadence').length
  },
  {
    id: 'After-Call Dispositions',
    label: 'After-Call Dispositions',
    count: PRELOADED_WORKFLOW_TEMPLATES.filter((t) => t.category === 'After-Call Dispositions').length
  },
  {
    id: 'Speed-to-Lead & Signals',
    label: 'Speed-to-Lead',
    count: PRELOADED_WORKFLOW_TEMPLATES.filter((t) => t.category === 'Speed-to-Lead & Signals').length
  },
  {
    id: 'AI Research & Personalization',
    label: 'AI & Research',
    count: PRELOADED_WORKFLOW_TEMPLATES.filter((t) => t.category === 'AI Research & Personalization').length
  }
];

export default function TemplateGalleryModal({
  isOpen,
  onClose,
  onSelectTemplate,
  projects,
  currentFolderId
}: TemplateGalleryModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<OutboundCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>(currentFolderId || 'proj-cadence');
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);

  const filteredTemplates = useMemo(() => {
    return PRELOADED_WORKFLOW_TEMPLATES.filter((tpl) => {
      if (selectedCategory !== 'All' && tpl.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = tpl.name.toLowerCase().includes(q);
        const matchesDesc = tpl.description.toLowerCase().includes(q);
        const matchesDisp = tpl.disposition?.toLowerCase().includes(q);
        const matchesDay = tpl.cadenceDay?.toLowerCase().includes(q);
        return matchesName || matchesDesc || matchesDisp || matchesDay;
      }
      return true;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <Dialog open={isOpen} onClose={onClose} title="Choose a template" size="2xl" bare className="overflow-hidden">
      <div className="h-[88vh] flex flex-col overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-h2 text-fg">Choose a template</h2>
            <p className="text-body text-fg-secondary mt-1">
              Pre-built multi-channel cadences, after-call dispositions and speed-to-lead flows.
            </p>
          </div>

          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-6 pb-3 border-b border-line bg-surface flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto scrollbar-none pb-1 sm:pb-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`focus-ring h-7 px-2.5 rounded-full border text-small transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-action text-action-fg border-transparent'
                    : 'bg-surface text-fg-secondary border-line hover:bg-subtle hover:text-fg'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`text-caption tabular-nums ${
                    selectedCategory === cat.id ? 'text-ink-400' : 'text-fg-tertiary'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-tertiary" />
            <input
              type="text"
              placeholder="Search by cadence day, SMS, email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="focus-ring w-full h-8 pl-8 pr-3 rounded-sm bg-surface border border-line-strong text-small text-fg placeholder:text-fg-disabled"
            />
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-app">
          {/* Destination Folder Selector */}
          <div className="mb-5 p-3 rounded-lg bg-surface border border-line flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 text-body">
              <Folder className="h-4 w-4 text-fg-secondary" />
              <span className="text-fg">Add to folder</span>
            </div>
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="focus-ring h-8 bg-surface border border-line-strong rounded-sm px-2.5 text-small text-fg cursor-pointer"
            >
              <option value="">No folder (root)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => {
              const isMaster = template.id === 'tpl-cadence-21day-master';
              const isVip = template.id === 'tpl-meeting-booked-vip';

              return (
                <div
                  key={template.id}
                  className={`rounded-lg bg-surface border transition-colors p-4 flex flex-col justify-between shadow-xs group relative ${
                    isMaster
                      ? 'border-line-strong'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Card meta */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-caption text-fg-tertiary truncate">
                        {template.cadenceDay || template.category}
                      </span>
                      <Badge tone={isMaster ? 'brand' : 'neutral'}>
                        {template.badge}
                      </Badge>
                    </div>

                    {/* Title */}
                    <h3 className="text-h3 text-fg">
                      {template.name}
                    </h3>

                    {/* Description */}
                    <p className="text-small text-fg-secondary line-clamp-3">
                      {template.description}
                    </p>

                    {/* Cadence Touches preview (if 21-day blueprint) */}
                    {template.cadenceTouches && template.cadenceTouches.length > 0 && (
                      <div className="mt-2 p-2.5 rounded-md bg-subtle text-small space-y-1">
                        <span className="text-caption text-fg-tertiary block">
                          Touchpoints
                        </span>
                        <ul className="list-disc list-inside text-fg-secondary space-y-0.5 line-clamp-3">
                          {template.cadenceTouches.slice(0, 3).map((touch, i) => (
                            <li key={i}>{touch}</li>
                          ))}
                        </ul>
                        {template.cadenceTouches.length > 3 && (
                          <span className="text-caption text-fg-tertiary block">
                            +{template.cadenceTouches.length - 3} more touches across 27 days
                          </span>
                        )}
                      </div>
                    )}

                    {/* Channels Pill Bar */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {template.channels.map((ch) => (
                        <span
                          key={ch}
                          className={`text-caption px-1.5 h-5 rounded-sm bg-subtle text-fg-secondary flex items-center gap-1 ${
                            ch === 'linkedin' ? '' : ch === 'email' || ch === 'phone' || ch === 'slack' ? 'capitalize' : 'uppercase'
                          }`}
                        >
                          {ch === 'sms' && <Smartphone className="h-3 w-3" />}
                          {ch === 'email' && <Mail className="h-3 w-3" />}
                          {ch === 'linkedin' && <Share2 className="h-3 w-3" />}
                          {ch === 'phone' && <PhoneCall className="h-3 w-3" />}
                          {ch === 'ai' && <Bot className="h-3 w-3" />}
                          {ch === 'slack' && <Hash className="h-3 w-3" />}
                          {ch === 'crm' && <Server className="h-3 w-3" />}
                          <span>{ch === 'linkedin' ? 'LinkedIn (manual task)' : ch}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="pt-3 mt-4 border-t border-line flex items-center justify-between gap-2">
                    <div className="text-caption text-fg-tertiary tabular-nums">
                      <span>{template.nodeCount} steps</span>
                      <span className="mx-1.5">·</span>
                      <span className="text-fg-secondary">{template.estimatedSavings}</span>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onSelectTemplate(template, selectedFolder || undefined)}
                    >
                      <span>Use template</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex items-center justify-between gap-4 text-small text-fg-secondary shrink-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-fg">Outbound tips:</span>
            <span>1. Front-load week 1 (4-5 touches)</span>
            <span className="text-fg-tertiary">·</span>
            <span>2. Pair cold dials with same-day email (+15% opens)</span>
            <span className="text-fg-tertiary">·</span>
            <span>3. Space out weeks 2 and 3</span>
          </div>

          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

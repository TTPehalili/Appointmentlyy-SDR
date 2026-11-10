'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { isDemoWorkspace } from '@/lib/demoMode';
import { Plus, Pencil, Trash2, CheckCircle2, Sparkles, HelpCircle, RefreshCw, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
  type Tone,
} from '@/components/ui';
import {
  CallDisposition,
  DispositionCategory,
  ActionTrigger,
  getStoredDispositions,
  saveStoredDispositions,
  addStoredDisposition,
  updateStoredDisposition,
  deleteStoredDisposition,
  resetStoredDispositions,
  subscribeToDispositions,
  INITIAL_DEFAULT_DISPOSITIONS
} from '@/lib/dispositionStore';

// Sample campaign names are for the demo workspace; real workspaces start with the global scope.
const DEMO_CAMPAIGNS = [
  'All Campaigns (Global)',
  'Apex Global BPO',
  'Enterprise Outbound Q4',
  'Fintech Scaleups',
  'SaaS SMB Pipeline'
];

export default function CallDispositionManager() {
  const [dispositions, setDispositions] = useState<CallDisposition[]>(INITIAL_DEFAULT_DISPOSITIONS);
  const [campaignList, setCampaignList] = useState<string[]>(() =>
    isDemoWorkspace() ? DEMO_CAMPAIGNS : ['All Campaigns (Global)']
  );

  // Sync with persistent store on mount and react to updates
  useEffect(() => {
    setDispositions(getStoredDispositions());
    const unsubscribe = subscribeToDispositions((updated) => {
      setDispositions(updated);
    });
    return unsubscribe;
  }, []);

  // Filters
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('All Campaigns (Global)');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for Add & Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formCampaign, setFormCampaign] = useState('All Campaigns (Global)');
  const [formCategory, setFormCategory] = useState<DispositionCategory>('Positive');
  const [formActionTrigger, setFormActionTrigger] = useState<ActionTrigger>('mark_booked');
  const [formRebuttalPrompt, setFormRebuttalPrompt] = useState('');
  const [formRequiresNote, setFormRequiresNote] = useState(true);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formColor, setFormColor] = useState('#10B981');
  const [customCampaignInput, setCustomCampaignInput] = useState('');
  const [showCustomCampaignField, setShowCustomCampaignField] = useState(false);

  // Delete Confirmation State
  const [deleteCandidate, setDeleteCandidate] = useState<CallDisposition | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Filtered Dispositions
  const filteredDispositions = useMemo(() => {
    return dispositions.filter((disp) => {
      // Campaign filter: if "All Campaigns (Global)" is selected, show everything.
      // Otherwise match exact campaign or items assigned to "All Campaigns (Global)"
      const matchesCampaign =
        selectedCampaignFilter === 'All Campaigns (Global)' ||
        disp.campaign === selectedCampaignFilter ||
        disp.campaign === 'All Campaigns (Global)';

      const matchesCategory =
        selectedCategoryFilter === 'all' || disp.category === selectedCategoryFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        disp.name.toLowerCase().includes(q) ||
        disp.code.toLowerCase().includes(q) ||
        disp.campaign.toLowerCase().includes(q) ||
        disp.rebuttalScriptPrompt.toLowerCase().includes(q);

      return matchesCampaign && matchesCategory && matchesSearch;
    });
  }, [dispositions, selectedCampaignFilter, selectedCategoryFilter, searchQuery]);

  // Open Modal to Add
  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingId(null);
    setFormName('');
    setFormCode('');
    setFormCampaign(
      selectedCampaignFilter === 'All Campaigns (Global)'
        ? isDemoWorkspace() ? 'Apex Global BPO' : 'All Campaigns (Global)'
        : selectedCampaignFilter
    );
    setFormCategory('Positive');
    setFormActionTrigger('mark_booked');
    setFormRebuttalPrompt('');
    setFormRequiresNote(true);
    setFormIsActive(true);
    setFormColor('#10B981');
    setShowCustomCampaignField(false);
    setCustomCampaignInput('');
    setIsModalOpen(true);
  };

  // Open Modal to Edit
  const handleOpenEditModal = (disp: CallDisposition) => {
    setModalMode('edit');
    setEditingId(disp.id);
    setFormName(disp.name);
    setFormCode(disp.code);
    setFormCampaign(disp.campaign);
    setFormCategory(disp.category);
    setFormActionTrigger(disp.actionTrigger);
    setFormRebuttalPrompt(disp.rebuttalScriptPrompt || '');
    setFormRequiresNote(disp.requiresNote);
    setFormIsActive(disp.isActive);
    setFormColor(disp.color || '#10B981');
    setShowCustomCampaignField(false);
    setCustomCampaignInput('');
    setIsModalOpen(true);
  };

  // Handle Save (Add / Edit)
  const handleSaveDisposition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    let finalCampaign = formCampaign;
    if (showCustomCampaignField && customCampaignInput.trim()) {
      finalCampaign = customCampaignInput.trim();
      if (!campaignList.includes(finalCampaign)) {
        setCampaignList((prev) => [...prev, finalCampaign]);
      }
    }

    const autoCode =
      formCode.trim() !== ''
        ? formCode.toUpperCase().replace(/\s+/g, '_')
        : formName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);

    if (modalMode === 'add') {
      const newDisp: CallDisposition = {
        id: `disp-${Date.now()}`,
        code: autoCode,
        name: formName.trim(),
        campaign: finalCampaign,
        category: formCategory,
        actionTrigger: formActionTrigger,
        rebuttalScriptPrompt: formRebuttalPrompt.trim(),
        requiresNote: formRequiresNote,
        isActive: formIsActive,
        color: formColor,
        updatedAt: 'Just now'
      };
      const updated = addStoredDisposition(newDisp);
      setDispositions(updated);
      fetch('/api/dispositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disposition: newDisp })
      }).catch(() => {});
      showFeedback(`Disposition "${newDisp.name}" added and assigned to ${newDisp.campaign}`);
    } else if (modalMode === 'edit' && editingId) {
      const existing = dispositions.find(d => d.id === editingId);
      const updatedDisp: CallDisposition = {
        id: editingId,
        code: autoCode,
        name: formName.trim(),
        campaign: finalCampaign,
        category: formCategory,
        actionTrigger: formActionTrigger,
        rebuttalScriptPrompt: formRebuttalPrompt.trim(),
        requiresNote: formRequiresNote,
        isActive: formIsActive,
        color: formColor,
        updatedAt: 'Just now'
      };
      const updated = updateStoredDisposition(updatedDisp);
      setDispositions(updated);
      fetch('/api/dispositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disposition: updatedDisp })
      }).catch(() => {});
      showFeedback(`Disposition "${formName.trim()}" updated successfully`);
    }

    setIsModalOpen(false);
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = () => {
    if (!deleteCandidate) return;
    const name = deleteCandidate.name;
    const updated = deleteStoredDisposition(deleteCandidate.id);
    setDispositions(updated);
    fetch(`/api/dispositions?id=${deleteCandidate.id}`, { method: 'DELETE' }).catch(() => {});
    setDeleteCandidate(null);
    showFeedback(`Disposition "${name}" permanently deleted`);
  };

  // Quick Inline Campaign Switch
  const handleQuickCampaignChange = (id: string, newCampaign: string) => {
    const target = dispositions.find(d => d.id === id);
    if (target) {
      const updatedTarget: CallDisposition = { ...target, campaign: newCampaign, updatedAt: 'Just now' };
      const updated = updateStoredDisposition(updatedTarget);
      setDispositions(updated);
      fetch('/api/dispositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disposition: updatedTarget })
      }).catch(() => {});
    }
    showFeedback(`Reassigned disposition to ${newCampaign}`);
  };

  // Clean Slate Preset Reset
  const handleResetToCleanSlate = () => {
    if (window.confirm('Reset call dispositions to a clean slate starting set for new tenant onboarding?')) {
      const reset = resetStoredDispositions();
      setDispositions(reset);
      fetch('/api/dispositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispositions: reset })
      }).catch(() => {});
      showFeedback('Reset call dispositions to default turnkey template');
    }
  };

  const showFeedback = (msg: string) => {
    setFeedbackNotice(msg);
    setTimeout(() => {
      setFeedbackNotice(null);
    }, 3500);
  };

  const getCategoryTone = (category: DispositionCategory): Tone => {
    switch (category) {
      case 'Positive':
        return 'success';
      case 'Follow-up':
        return 'warning';
      case 'Negative':
        return 'danger';
      case 'Compliance':
      case 'Unreached':
      default:
        return 'neutral';
    }
  };

  const getActionBadge = (action: ActionTrigger) => {
    switch (action) {
      case 'mark_booked':
        return { label: 'Mark Booked & Sync CRM', color: 'text-success-700 bg-success-50/60' };
      case 'schedule_callback':
        return { label: 'Prompt Calendar Callback', color: 'text-warning-700 bg-warning-50/60' };
      case 'dnc_quarantine':
        return { label: 'TCPA DNC Quarantine', color: 'text-fg bg-subtle/60' };
      case 'resend_email_120s':
        return { label: 'Dispatch Follow-Up Email in 120s', color: 'text-fg bg-subtle/60' };
      case 'recycle_cadence':
        return { label: 'Recycle to Cadence Day +3', color: 'text-fg bg-subtle/60' };
      case 'none':
      default:
        return { label: 'Note Logging Only', color: 'text-fg-secondary bg-subtle' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {feedbackNotice && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-inverse p-3 text-small text-ink-50 shadow-md animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success-500" />
            <span>{feedbackNotice}</span>
          </div>
          <button
            onClick={() => setFeedbackNotice(null)}
            aria-label="Dismiss"
            className="focus-ring rounded-sm p-1 text-ink-400 hover:text-ink-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <PageHeader
        title="Call outcomes"
        count={dispositions.length}
        description="The outcome buttons reps see after a call, and what each one triggers, per campaign."
        secondaryActions={
          <Button
            variant="secondary"
            onClick={handleResetToCleanSlate}
            title="Reset dispositions to standard clean default template"
            icon={<RefreshCw />}
          >
            Reset to defaults
          </Button>
        }
        primaryAction={
          <Button variant="brand" onClick={handleOpenAddModal} icon={<Plus />}>
            Add outcome
          </Button>
        }
      />

      {/* Filter & Controls Toolbar */}
      <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
        {/* Search Input */}
        <div className="flex-1">
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by label, code (e.g. BOOKED_QUALIFIED) or script cue"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Campaign Selector */}
          <div className="w-56">
            <Select
              aria-label="Campaign"
              value={selectedCampaignFilter}
              onChange={(e) => setSelectedCampaignFilter(e.target.value)}
            >
              <option value="All Campaigns (Global)">All Campaigns (Global)</option>
              {campaignList
                .filter((c) => c !== 'All Campaigns (Global)')
                .map((camp) => (
                  <option key={camp} value={camp}>
                    {camp}
                  </option>
                ))}
            </Select>
          </div>

          {/* Category Selector */}
          <div className="w-56">
            <Select
              aria-label="Outcome type"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            >
              <option value="all">All Outcomes</option>
              <option value="Positive">Positive (Conversions)</option>
              <option value="Follow-up">Follow-up (Callbacks)</option>
              <option value="Negative">Negative (Objections)</option>
              <option value="Compliance">Compliance (DNC/Opt-Out)</option>
              <option value="Unreached">Unreached (Gatekeeper/VM)</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Dispositions Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-small">
            <thead>
              <tr className="bg-subtle text-caption text-fg-tertiary">
                <th className="px-4 py-2.5 font-medium">Outcome</th>
                <th className="px-4 py-2.5 font-medium">Campaign</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Automation</th>
                <th className="px-4 py-2.5 font-medium">Script cue</th>
                <th className="px-4 py-2.5 text-center font-medium">Note</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDispositions.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<HelpCircle />}
                      title="No call outcomes match your filters"
                      action={
                        <Button size="sm" variant="secondary" onClick={handleOpenAddModal} icon={<Plus />}>
                          Add an outcome for this campaign
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredDispositions.map((disp) => {
                  const actionBadge = getActionBadge(disp.actionTrigger);
                  return (
                    <tr
                      key={disp.id}
                      className="group border-t border-line transition-colors hover:bg-subtle"
                    >
                      {/* Name & Code */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: disp.color || 'var(--brand-500)' }}
                          />
                          <div>
                            <div className="flex items-center gap-1.5 text-body-strong text-fg">
                              <span>{disp.name}</span>
                              {!disp.isActive && <Badge tone="neutral">Disabled</Badge>}
                            </div>
                            <div className="mt-0.5 font-mono text-caption text-fg-tertiary">
                              {disp.code}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Campaign Assignment */}
                      <td className="px-4 py-3">
                        <div className="w-48">
                          <Select
                            aria-label="Assigned campaign"
                            value={disp.campaign}
                            onChange={(e) => handleQuickCampaignChange(disp.id, e.target.value)}
                            className="h-8 text-small"
                          >
                            {campaignList.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <Badge tone={getCategoryTone(disp.category)}>{disp.category}</Badge>
                      </td>

                      {/* Action Trigger */}
                      <td className="px-4 py-3 text-fg-secondary">
                        {actionBadge.label}
                      </td>

                      {/* Boris Prompt Cue */}
                      <td className="min-w-64 max-w-sm px-4 py-3">
                        {disp.rebuttalScriptPrompt ? (
                          <div className="flex items-start gap-1.5 text-fg-secondary">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-tertiary" />
                            <span className="line-clamp-2">{disp.rebuttalScriptPrompt}</span>
                          </div>
                        ) : (
                          <span className="text-fg-tertiary">No script cue</span>
                        )}
                      </td>

                      {/* Requires Note */}
                      <td className="px-4 py-3 text-center">
                        {disp.requiresNote ? (
                          <Badge tone="warning">Required</Badge>
                        ) : (
                          <span className="text-fg-tertiary">Optional</span>
                        )}
                      </td>

                      {/* Actions: Edit, Delete */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label="Edit this disposition & rules"
                            onClick={() => handleOpenEditModal(disp)}
                          >
                            <Pencil />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label="Delete this disposition"
                            onClick={() => setDeleteCandidate(disp)}
                            className="hover:bg-danger-bg hover:text-danger-fg"
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL: ADD / EDIT CALL DISPOSITION */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalMode === 'add' ? 'Add call outcome' : 'Edit call outcome'} bare>
          <div>
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div>
                <h3 className="text-h2 text-fg">
                  {modalMode === 'add' ? 'Add call outcome' : 'Edit call outcome'}
                </h3>
                <p className="mt-0.5 text-small text-fg-secondary">
                  Label, campaign, automation and the script cue reps see.
                </p>
              </div>
              <IconButton label="Close" size="sm" variant="ghost" onClick={() => setIsModalOpen(false)}>
                <X />
              </IconButton>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveDisposition} className="space-y-4 p-5">
              {/* Disposition Label */}
              <Field label="Outcome name">
                <Input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Booked: Executive Pilot Discovery"
                />
              </Field>

              {/* Disposition Code & Color Picker */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="System code">
                  <Input
                    mono
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="e.g. BOOKED_PILOT"
                    className="uppercase"
                  />
                </Field>

                <Field label="Colour">
                  <div className="flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-surface px-3">
                    <input
                      type="color"
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      aria-label="Colour"
                      className="h-6 w-6 cursor-pointer rounded-sm border-0 bg-transparent"
                    />
                    <span className="font-mono text-small text-fg-secondary">{formColor}</span>
                  </div>
                </Field>
              </div>

              {/* Campaign Assignment */}
              <Field
                label="Campaign"
                hint='Choose "All Campaigns (Global)" to make this outcome available to every rep.'
              >
                {!showCustomCampaignField ? (
                  <Select
                    value={formCampaign}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setShowCustomCampaignField(true);
                      } else {
                        setFormCampaign(e.target.value);
                      }
                    }}
                  >
                    {campaignList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__custom__">+ Create New Campaign...</option>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder="New campaign name"
                      value={customCampaignInput}
                      onChange={(e) => setCustomCampaignInput(e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="ghost" onClick={() => setShowCustomCampaignField(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </Field>

              {/* Category & Action Trigger */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <Select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as DispositionCategory)}
                  >
                    <option value="Positive">Positive (Converts Quota)</option>
                    <option value="Follow-up">Follow-up (Requires Callback)</option>
                    <option value="Negative">Negative (Objection / Unqualified)</option>
                    <option value="Compliance">Compliance (DNC / Suppress)</option>
                    <option value="Unreached">Unreached (Gatekeeper / VM)</option>
                  </Select>
                </Field>

                <Field label="Automation">
                  <Select
                    value={formActionTrigger}
                    onChange={(e) => setFormActionTrigger(e.target.value as ActionTrigger)}
                  >
                    <option value="mark_booked">Mark Booked & Sync CRM</option>
                    <option value="schedule_callback">Schedule Calendar Callback</option>
                    <option value="dnc_quarantine">TCPA DNC Quarantine</option>
                    <option value="resend_email_120s">Dispatch Recap Email in 120s</option>
                    <option value="recycle_cadence">Recycle to Cadence Day +3</option>
                    <option value="none">Note Logging Only</option>
                  </Select>
                </Field>
              </div>

              {/* Boris AI Rebuttal Cue */}
              <Field label="Script cue for Boris (optional)">
                <Textarea
                  rows={2}
                  value={formRebuttalPrompt}
                  onChange={(e) => setFormRebuttalPrompt(e.target.value)}
                  placeholder="e.g. When prospect states competitor contract, guide rep to ask about renewal month..."
                  className="min-h-0 resize-none"
                />
              </Field>

              {/* Checkboxes */}
              <div className="flex items-center gap-6 pt-1">
                <Checkbox
                  checked={formRequiresNote}
                  onChange={(e) => setFormRequiresNote(e.target.checked)}
                  label="Call notes required"
                />
                <Checkbox
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  label="Active and available to reps"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="brand">
                  {modalMode === 'add' ? 'Add outcome' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
      </Dialog>

      {/* MODAL: DELETE CONFIRMATION */}
      <ConfirmDialog
        open={deleteCandidate !== null}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={handleConfirmDelete}
        title="Delete call outcome?"
        description={
          deleteCandidate && (
            <div className="space-y-3">
              <p>
                Reps dialing under{' '}
                <span className="text-body-strong text-fg">&quot;{deleteCandidate.campaign}&quot;</span> will
                no longer see the{' '}
                <span className="text-body-strong text-fg">&quot;{deleteCandidate.name}&quot;</span> button.
              </p>
              <div className="space-y-1 rounded-md border border-line bg-subtle p-3 text-small text-fg-secondary">
                <div>Code: <span className="font-mono text-fg">{deleteCandidate.code}</span></div>
                <div>Campaign: {deleteCandidate.campaign}</div>
                <div>Category: {deleteCandidate.category}</div>
              </div>
            </div>
          )
        }
        confirmLabel="Delete permanently"
        icon={<Trash2 />}
      />
    </div>
  );
}

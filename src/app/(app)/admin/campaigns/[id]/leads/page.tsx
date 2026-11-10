'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Users, 
  UploadCloud, 
  FileSpreadsheet, 
  Search, 
  ArrowLeft, 
  Sparkles, 
  Mail, 
  Phone, 
  CheckCircle2, 
  Clock, 
  Copy,
  Check,
  Send,
  X,
  Share2
} from 'lucide-react';
import { Badge, Button, buttonClasses, Dialog, EmptyState, IconButton, PageHeader, SearchInput, Select, Skeleton } from '@/components/ui';
import { isDemoWorkspace } from '@/lib/demoMode';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { apiJson } from '@/lib/authClient';
import { Lead, CadencePackage } from '@/types';
import { CadenceGenerator } from '@/lib/cadenceGenerator';

function CampaignLeadsContent() {
  const params = useParams();
  const campaignId = (params?.id as string) || 'enterprise-outbound';

  // Sample leads and reps are for the demo workspace only; real workspaces start empty.
  const isDemo = useDemoWorkspace();
  const [leads, setLeads] = useState<Lead[]>(() => !isDemoWorkspace() ? [] : [
    {
      id: 'lead-1',
      campaign_id: campaignId,
      first_name: 'Jonathan',
      last_name: 'Duarte',
      title: 'VP of Demand Generation',
      company: 'OmniCloud Technologies',
      email: 'jduarte@omnicloud.io',
      phone: '+1 (415) 890-1284',
      status: 'new',
      custom_variables: {
        'Tech Stack': 'HubSpot & Apollo',
        'Current Outsourcer': 'Titan BPO Solutions',
        'Pain Point': 'outbound hold rate and show-up drop-off'
      },
      created_at: new Date().toISOString()
    },
    {
      id: 'lead-2',
      campaign_id: campaignId,
      first_name: 'Elena',
      last_name: 'Rostova',
      title: 'Head of Sales Development',
      company: 'FinLeap Payments',
      email: 'elena.rostova@finleap.com',
      phone: '+1 (212) 440-9921',
      status: 'new',
      custom_variables: {
        'Tech Stack': 'Salesforce & Salesloft',
        'Current Outsourcer': 'Internal 6-person team',
        'Pain Point': 'rep ramp time and objection handling'
      },
      created_at: new Date().toISOString()
    },
    {
      id: 'lead-3',
      campaign_id: campaignId,
      first_name: 'Marcus',
      last_name: 'Brody',
      title: 'Director of Business Development',
      company: 'LogixWare Supply',
      email: 'mbrody@logixware.com',
      phone: '+1 (312) 555-0199',
      status: 'contacted',
      custom_variables: {
        'Tech Stack': 'Outreach & ZoomInfo',
        'Current Outsourcer': 'Agency Partner',
        'Pain Point': 'qualified discovery conversions'
      },
      created_at: new Date().toISOString()
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRep, setSelectedRep] = useState(() => (isDemoWorkspace() ? 'Alex Mercer' : ''));
  const [workspaceReps, setWorkspaceReps] = useState<string[]>([]);
  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    apiJson<{ members: { name: string; email: string; status: string }[] }>('/api/tenant/members').then((res) => {
      if (!alive || !res.success) return;
      const names = res.members.filter((m) => m.status === 'active').map((m) => m.name || m.email);
      setWorkspaceReps(names);
      setSelectedRep((cur) => cur || names[0] || '');
    });
    return () => {
      alive = false;
    };
  }, [isDemo]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCadence, setSelectedCadence] = useState<CadencePackage | null>(null);
  const [isGeneratingCadence, setIsGeneratingCadence] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filteredLeads = leads.filter(l => 
    `${l.first_name} ${l.last_name} ${l.company} ${l.title} ${l.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('campaignId', campaignId);
      formData.append('assignedRepId', selectedRep);

      const res = await fetch('/api/leads/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success && data.leads) {
        setLeads(prev => [...data.leads, ...prev]);
      }
    } catch (err) {
      console.error('Error importing CSV:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const openCadenceModal = async (lead: Lead) => {
    setIsGeneratingCadence(true);
    try {
      const cadence = await CadenceGenerator.generateCadenceForLead(lead);
      setSelectedCadence(cadence);
    } catch (e) {
      console.error('Failed to generate cadence:', e);
    } finally {
      setIsGeneratingCadence(false);
    }
  };

  const copyText = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <PageHeader
        title="Campaign leads"
        count={filteredLeads.length}
        description="Import a lead CSV, assign the batch to a rep and generate each lead's cadence."
        primaryAction={
          <label className={buttonClasses('brand', 'md', 'relative cursor-pointer focus-within:shadow-[var(--focus-ring)]')}>
            <UploadCloud className="h-4 w-4" aria-hidden />
            <span>{isUploading ? 'Importing CSV...' : 'Import leads CSV'}</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Filter bar: search + batch assignment */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="w-full sm:max-w-md">
            <SearchInput
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter leads by name or company"
              aria-label="Filter leads"
            />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <label htmlFor="batch-rep" className="text-small text-fg-secondary whitespace-nowrap">Assign batch to</label>
            <div className="w-56">
              <Select
                id="batch-rep"
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
              >
                {isDemo ? (
                  <>
                    <option value="Alex Mercer">Alex Mercer (Certified)</option>
                    <option value="Sarah Jenkins">Sarah Jenkins (In Training)</option>
                    <option value="Luca Hayes">Luca Hayes (Super Admin)</option>
                  </>
                ) : workspaceReps.length === 0 ? (
                  <option value="">No reps yet</option>
                ) : (
                  workspaceReps.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))
                )}
              </Select>
            </div>
          </div>
        </div>

        {/* Lead table */}
        <div className="rounded-lg border border-line bg-surface shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
            <span className="text-h3 text-fg">
              Prospect queue <span className="text-small tabular-nums text-fg-tertiary">{filteredLeads.length}</span>
            </span>
            <span className="text-small text-fg-tertiary">
              Fields auto-mapped and synced with your CRM
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-body">
              <thead>
                <tr className="h-9 bg-subtle">
                  <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary">Prospect</th>
                  <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary">Company and title</th>
                  <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary">Contact</th>
                  <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary">Tech and incumbent</th>
                  <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary">Status</th>
                  <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary text-right"><span className="sr-only">Cadence</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-t border-line transition-colors duration-150 hover:bg-subtle">
                    <td className="px-4 py-2.5 text-body-strong text-fg">
                      {lead.first_name} {lead.last_name}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-fg">{lead.company}</div>
                      <div className="text-small text-fg-tertiary">{lead.title}</div>
                    </td>
                    <td className="px-4 py-2.5 text-small text-fg-secondary">
                      <div>{lead.email}</div>
                      {lead.phone && <div className="font-mono text-fg-tertiary">{lead.phone}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-small text-fg">
                        {lead.custom_variables?.['Tech Stack'] || 'Salesforce'}
                      </div>
                      <div className="text-small text-fg-tertiary">
                        Incumbent: {lead.custom_variables?.['Current Outsourcer'] || 'Agency'}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={lead.status === 'booked' ? 'success' : lead.status === 'contacted' ? 'brand' : 'neutral'}
                        className="capitalize"
                      >
                        {lead.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openCadenceModal(lead)}
                        icon={<Sparkles className="h-3.5 w-3.5" />}
                      >
                        Generate cadence
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leads.length === 0 && (
              <EmptyState
                icon={<FileSpreadsheet />}
                title="No leads in this campaign yet"
                description="Import a lead CSV to add prospects, assign them to a rep and generate their cadences."
              />
            )}
          </div>
        </div>

        {/* Cadence Modal */}
        <Dialog
          open={selectedCadence !== null}
          onClose={() => setSelectedCadence(null)}
          title={selectedCadence ? `Cadence for ${selectedCadence.leadName} (${selectedCadence.company})` : 'Cadence'}
          size="lg"
          bare
        >
          {selectedCadence && (
            <div className="flex flex-col">
              <div className="flex items-start justify-between gap-4 px-6 pt-5">
                <div>
                  <h2 id="cadence-title" className="text-h2 text-fg">
                    Cadence for {selectedCadence.leadName} ({selectedCadence.company})
                  </h2>
                  <p className="text-small text-fg-secondary mt-0.5">Call, email and LinkedIn copy written from this lead&apos;s context.</p>
                </div>
                <IconButton label="Close" size="sm" onClick={() => setSelectedCadence(null)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </div>

              <div className="flex flex-col gap-3 px-6 py-5">
                {/* 1. Cold Call Opener */}
                <div className="p-4 rounded-lg bg-app border border-line space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg flex items-center gap-1.5">
                      <Phone className="h-4 w-4 text-fg-secondary" aria-hidden />
                      Call opener and discovery question
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyText(`${selectedCadence.coldCallOpener} ${selectedCadence.diagnosticQuestion}`, 'call')}
                      icon={copiedKey === 'call' ? <Check className="h-3.5 w-3.5 text-success-fg" /> : <Copy className="h-3.5 w-3.5" />}
                    >
                      {copiedKey === 'call' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p className="text-body text-fg">
                    "{selectedCadence.coldCallOpener}"
                  </p>
                  <p className="text-body text-fg-secondary pt-1">
                    "{selectedCadence.diagnosticQuestion}"
                  </p>
                </div>

                {/* 2. Cold Email */}
                <div className="p-4 rounded-lg bg-app border border-line space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-fg-secondary" aria-hidden />
                      Follow-up email
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyText(`Subject: ${selectedCadence.emailSubject}\n\n${selectedCadence.emailBody}`, 'email')}
                      icon={copiedKey === 'email' ? <Check className="h-3.5 w-3.5 text-success-fg" /> : <Copy className="h-3.5 w-3.5" />}
                    >
                      {copiedKey === 'email' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <div className="text-body-strong text-fg">
                    Subject: {selectedCadence.emailSubject}
                  </div>
                  <p className="text-body text-fg-secondary whitespace-pre-line">
                    {selectedCadence.emailBody}
                  </p>
                </div>

                {/* 3. LinkedIn Sequence */}
                <div className="p-4 rounded-lg bg-app border border-line space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg flex items-center gap-1.5">
                      <Share2 className="h-4 w-4 text-fg-secondary" aria-hidden />
                      LinkedIn connection invite
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyText(selectedCadence.linkedInConnection, 'linkedin')}
                      icon={copiedKey === 'linkedin' ? <Check className="h-3.5 w-3.5 text-success-fg" /> : <Copy className="h-3.5 w-3.5" />}
                    >
                      {copiedKey === 'linkedin' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p className="text-body text-fg">
                    "{selectedCadence.linkedInConnection}"
                  </p>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </div>
  );
}

export default function CampaignLeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 md:px-8 space-y-4" aria-busy="true">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      }
    >
      <CampaignLeadsContent />
    </Suspense>
  );
}

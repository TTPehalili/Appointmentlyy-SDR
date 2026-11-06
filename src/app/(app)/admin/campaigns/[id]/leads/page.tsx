'use client';

import React, { useState, Suspense } from 'react';
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
import { Lead, CadencePackage } from '@/types';
import { CadenceGenerator } from '@/lib/cadenceGenerator';
import AdminNavigationHeader from '@/components/AdminNavigationHeader';

function CampaignLeadsContent() {
  const params = useParams();
  const campaignId = (params?.id as string) || 'enterprise-outbound';

  const [leads, setLeads] = useState<Lead[]>([
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
  const [selectedRep, setSelectedRep] = useState('Alex Mercer');
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <AdminNavigationHeader activeSection="leads" />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-8 flex flex-col gap-6">
        
        {/* Controls Bar: Upload & Mass Assign */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            {/* CSV Upload */}
            <label className="relative px-5 py-3 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer">
              <UploadCloud className="h-4 w-4" />
              <span>{isUploading ? 'IMPORTING CSV...' : 'IMPORT LEADS CSV'}</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>

            {/* Rep Assignment Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Assign Batch To:</span>
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-[#ED1C24]"
              >
                <option value="Alex Mercer">Alex Mercer (Certified)</option>
                <option value="Sarah Jenkins">Sarah Jenkins (In Training)</option>
                <option value="Luca Hayes">Luca Hayes (Super Admin)</option>
              </select>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter leads by name, company..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ED1C24]"
            />
          </div>
        </div>

        {/* Lead Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Active Prospect Queue ({filteredLeads.length})
            </span>
            <span className="text-xs text-slate-500">
              Auto-mapped attributes synced with CRM
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-3.5">Prospect Name</th>
                  <th className="px-6 py-3.5">Company & Title</th>
                  <th className="px-6 py-3.5">Contact</th>
                  <th className="px-6 py-3.5">Tech & Outsourcer Context</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Outreach Cadence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {lead.first_name} {lead.last_name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{lead.company}</div>
                      <div className="text-[11px] text-slate-500">{lead.title}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-[11px]">
                      <div>{lead.email}</div>
                      {lead.phone && <div className="text-slate-400">{lead.phone}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[11px] text-[#ED1C24] font-semibold">
                        {lead.custom_variables?.['Tech Stack'] || 'Salesforce'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Incumbent: {lead.custom_variables?.['Current Outsourcer'] || 'Agency'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        lead.status === 'booked' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        lead.status === 'contacted' ? 'bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/20' :
                        'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openCadenceModal(lead)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#ED1C24]/10 hover:bg-[#ED1C24]/15 text-[#ED1C24] font-bold text-xs border border-[#ED1C24]/20 transition-colors inline-flex items-center gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#ED1C24]" />
                        <span>GENERATE CADENCE</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cadence Modal */}
        {selectedCadence && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-8 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#ED1C24]" />
                    Multi-Channel Cadence for {selectedCadence.leadName} ({selectedCadence.company})
                  </h3>
                  <p className="text-xs text-slate-500">Context-Injected Copy Engineered for Sub-Second Discovery Booking</p>
                </div>
                <button
                  onClick={() => setSelectedCadence(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 1. Cold Call Opener */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#222021] uppercase tracking-wider flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-[#ED1C24]" />
                    Channel 1: Cold Call Opener & Diagnostic
                  </span>
                  <button
                    onClick={() => copyText(`${selectedCadence.coldCallOpener} ${selectedCadence.diagnosticQuestion}`, 'call')}
                    className="text-slate-500 hover:text-[#ED1C24] text-xs font-semibold flex items-center gap-1"
                  >
                    {copiedKey === 'call' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedKey === 'call' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-800 leading-relaxed font-sans">
                  "{selectedCadence.coldCallOpener}"
                </p>
                <p className="text-xs text-[#222021] italic font-medium pt-1">
                  "{selectedCadence.diagnosticQuestion}"
                </p>
              </div>

              {/* 2. Cold Email */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#222021] uppercase tracking-wider flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-[#ED1C24]" />
                    Channel 2: 1-to-1 Cold Email Follow-Up
                  </span>
                  <button
                    onClick={() => copyText(`Subject: ${selectedCadence.emailSubject}\n\n${selectedCadence.emailBody}`, 'email')}
                    className="text-slate-500 hover:text-[#ED1C24] text-xs font-semibold flex items-center gap-1"
                  >
                    {copiedKey === 'email' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedKey === 'email' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="text-xs font-bold text-slate-800">
                  Subject: {selectedCadence.emailSubject}
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed font-sans">
                  {selectedCadence.emailBody}
                </p>
              </div>

              {/* 3. LinkedIn Sequence */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#222021] uppercase tracking-wider flex items-center gap-1.5">
                    <Share2 className="h-3.5 w-3.5 text-[#ED1C24]" />
                    Channel 3: LinkedIn Connection Invite
                  </span>
                  <button
                    onClick={() => copyText(selectedCadence.linkedInConnection, 'linkedin')}
                    className="text-slate-500 hover:text-[#ED1C24] text-xs font-semibold flex items-center gap-1"
                  >
                    {copiedKey === 'linkedin' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedKey === 'linkedin' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-800 leading-relaxed font-sans">
                  "{selectedCadence.linkedInConnection}"
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CampaignLeadsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs font-mono text-slate-500">LOADING CAMPAIGN LEADS...</div>}>
      <CampaignLeadsContent />
    </Suspense>
  );
}

'use client';

import React, { useState, useRef } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Globe, 
  Zap, 
  Sparkles,
  Info
} from 'lucide-react';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import { CadenceLeadRecord } from '@/lib/cadenceMaster';
import { Button, IconButton, Dialog } from '@/components/ui';
import { importLeadsIntoContacts } from '@/lib/leadStore';
import { getStoredSession } from '@/lib/session';
import { normalizeTenantKey } from '@/lib/icpQuotaStore';

interface UploadLeadsCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadsImported: (leads: CadenceLeadRecord[]) => void;
}

export default function UploadLeadsCsvModal({
  isOpen,
  onClose,
  onLeadsImported
}: UploadLeadsCsvModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parseCsvText = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) throw new Error('CSV must contain a header row and at least one lead row.');

    // Parse header
    const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

    const records: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvRow(lines[i]);
      if (values.length === 0 || values.every(v => !v.trim())) continue;
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim() || '';
      });
      records.push(row);
    }
    return records;
  };

  const parseCsvRow = (rowStr: string): string[] => {
    const result: string[] = [];
    let insideQuotes = false;
    let current = '';

    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char === '"' || char === "'") {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrorMsg('Please upload a valid .csv file.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const text = await file.text();
      const rows = parseCsvText(text);

      if (rows.length === 0) {
        throw new Error('No valid prospect rows found in the CSV file.');
      }

      // Convert rows to CadenceLeadRecord
      const mappedLeads: CadenceLeadRecord[] = rows.map((r, idx) => {
        const findField = (...keys: string[]) => {
          for (const k of keys) {
            const foundKey = Object.keys(r).find(col => col.includes(k));
            if (foundKey && r[foundKey]) return r[foundKey];
          }
          return '';
        };

        const firstName = findField('first_name', 'first', 'given_name') || 'Prospect';
        const lastName = findField('last_name', 'last', 'surname') || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const company = findField('company', 'account', 'organization', 'business') || 'Target Account';
        const title = findField('title', 'job_title', 'role', 'position') || 'Executive';
        const phone = findField('phone', 'direct_phone', 'mobile', 'cell', 'telephone') || '+1 (555) 000-0000';
        const email = findField('email', 'work_email', 'contact_email') || `${firstName.toLowerCase()}@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
        const headcount = findField('headcount', 'seats', 'size', 'team_size', 'employees') || '50-100 seats';
        const department = findField('department', 'division') || 'Outbound Sales & Operations';

        // Critical High-Value Signal Columns
        const website = findField('website', 'url', 'domain', 'web', 'company_url') || '';
        const linkedinUrl = findField('linkedin', 'linkedin_url', 'profile', 'li_url') || '';
        const techStack = findField('tech_stack', 'tech', 'stack', 'crm', 'dialer', 'software') || 'Apollo & HubSpot';
        const painPoint = findField('pain_point', 'pain', 'challenge', 'bottleneck', 'problem') || 'objection hesitation on shared lead lists';
        const outsourcer = findField('outsourcer', 'vendor', 'current_agency', 'incumbent', 'agency') || 'Titan BPO Solutions';
        
        const rawSignals = findField('buying_signals', 'signals', 'signal', 'notes', 'triggers') || '';
        const buyingSignals = rawSignals 
          ? rawSignals.split(';').map(s => s.trim()).filter(Boolean)
          : [
              `Target Domain: ${website || company}`,
              `Tech Stack: ${techStack}`,
              `Primary Bottleneck: ${painPoint}`
            ];

        return {
          id: `lead_csv_${Date.now()}_${idx}`,
          name: fullName,
          company,
          title,
          department,
          email,
          phone,
          headcount,
          website: website.startsWith('http') ? website : website ? `https://${website}` : undefined,
          linkedinUrl: linkedinUrl.startsWith('http') ? linkedinUrl : linkedinUrl ? `https://${linkedinUrl}` : undefined,
          techStack,
          painPoint,
          outsourcer,
          buyingSignals,
          customVariables: {
            ...r,
            Website: website,
            'LinkedIn Profile': linkedinUrl,
            'Tech Stack': techStack,
            'Pain Point': painPoint,
            'Incumbent Vendor': outsourcer
          },
          cadenceDay: 2,
          touchNumber: 3,
          isCarryOver: false,
          statusBadge: 'CSV Import • Day 2 Phone Push'
        };
      });

      // Also persist to Supabase backend in the background
      fetch('/api/leads/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: mappedLeads,
          campaignId: 'enterprise-outbound'
        })
      }).catch(err => console.warn('[CSV Modal] Supabase background sync notice:', err));

      // Save the leads to Contacts, owned by the rep who imported them, so they show in their
      // Pipeline (New Lead) and calls on them update it.
      const session = getStoredSession();
      importLeadsIntoContacts(
        mappedLeads.map((l) => ({
          id: l.id,
          name: l.name,
          company: l.company,
          title: l.title,
          department: l.department,
          email: l.email,
          phone: l.phone,
          headcount: l.headcount,
          website: l.website,
          linkedinUrl: l.linkedinUrl,
          cadenceDay: l.cadenceDay,
          leadNotes: l.buyingSignals?.length ? l.buyingSignals.join('\n') : '',
        })),
        {
          assignedRep: session.repName,
          tenantId: normalizeTenantKey(session.tenantCode || session.tenantName),
          actorName: session.repName,
          source: `Dialer CSV import (${file.name})`,
        }
      );

      setSuccessCount(mappedLeads.length);
      setTimeout(() => {
        onLeadsImported(mappedLeads);
        onClose();
      }, 1200);

    } catch (err: any) {
      console.error('[CSV PARSE ERROR]', err);
      setErrorMsg(err.message || 'Failed to parse CSV file. Please verify column formatting.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Upload leads from CSV"
      size="md"
      className="max-w-xl"
      dismissible={!isProcessing}
      bare
    >
      <div className="w-full text-fg">
        {/* HEADER */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-h2 text-fg">
              Upload leads from CSV
            </h2>
            <p className="mt-0.5 text-body text-fg-secondary">
              Adds each lead&apos;s website, LinkedIn and buying signals to your call scripts.
            </p>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        </div>

        {/* CONTENT */}
        <div className="space-y-4 p-6">

          {/* DRAG & DROP ZONE */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) processFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-150 ${
              isDragging
                ? 'border-brand-600 bg-selected'
                : 'border-line-strong bg-app hover:bg-subtle'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) processFile(file);
              }}
            />

            {isProcessing ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-4">
                <Loader2 className="size-8 animate-spin text-fg-secondary" />
                <span className="text-small font-medium text-fg">Reading your CSV and adding lead details...</span>
              </div>
            ) : successCount !== null ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-4">
                <CheckCircle2 className="size-8 text-success-fg" />
                <span className="text-body-strong text-success-fg">
                  Imported {successCount} leads into your queue
                </span>
                <span className="text-small text-fg-tertiary">Loading teleprompter...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="flex size-12 items-center justify-center rounded-lg border border-line bg-surface text-fg-secondary shadow-xs">
                  <FileSpreadsheet className="size-6" />
                </div>
                <div>
                  <span className="block text-body-strong text-fg">
                    Drop your .csv file here, or <span className="text-brand-text underline">browse files</span>
                  </span>
                  <span className="mt-1 block text-small text-fg-secondary">
                    Supported columns: Website, LinkedIn profile, buying signals, tech stack, pain points
                  </span>
                </div>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-md border border-danger-fg/30 bg-danger-bg p-3 text-small text-danger-fg">
              <AlertCircle className="size-4 shrink-0 text-danger-fg" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* SUPPORTED SIGNALS BREAKDOWN */}
          <div className="space-y-2 rounded-lg border border-line bg-app p-4">
            <div className="flex items-center gap-1.5 text-caption text-fg-tertiary">
              <Sparkles className="size-3.5 text-fg-tertiary" />
              <span>Lead details added automatically</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-small text-fg-secondary">
              <div className="flex items-center gap-1.5">
                <Globe className="size-3.5 shrink-0 text-fg-secondary" />
                <span><code className="font-mono text-caption text-fg">website</code>: used in the pitch and links</span>
              </div>
              <div className="flex items-center gap-1.5">
                <LinkedinIcon className="size-3.5 shrink-0 text-fg-secondary" />
                <span><code className="font-mono text-caption text-fg">linkedin_url</code>: one-click connect</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="size-3.5 shrink-0 text-fg-secondary" />
                <span><code className="font-mono text-caption text-fg">buying_signals</code>: shown on the call screen</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 shrink-0 text-fg-secondary" />
                <span><code className="font-mono text-caption text-fg">tech_stack / pain</code>: used in battlecards</span>
              </div>
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3 text-small text-fg-secondary">
          <span>Syncs with the Supabase table <code className="font-mono text-caption">leads</code></span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

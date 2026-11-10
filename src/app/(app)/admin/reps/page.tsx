'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Award, 
  ShieldCheck, 
  AlertTriangle, 
  ArrowLeft, 
  Search, 
  CheckCircle2, 
  ExternalLink,
  Plus,
  Radio,
  FileCheck
} from 'lucide-react';
import { buttonClasses, EmptyState, PageHeader, SearchInput, StatusDot } from '@/components/ui';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';

interface RepRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  campaign: string;
  trialsCompleted: number;
  averageScore: number;
  certified: boolean;
  certificateId?: string;
  status: 'Certified Floor Ready' | 'In Remediation' | 'In Training';
}

// Sample certification results for the demo workspace only.
const DEMO_REPS: RepRecord[] = [
    {
      id: 'rep-1',
      name: 'Alex Mercer',
      email: 'alex.mercer@appointmentlyy.ai',
      role: 'Outbound BDR',
      campaign: 'Enterprise Outbound Q4',
      trialsCompleted: 5,
      averageScore: 92,
      certified: true,
      certificateId: 'CERT-BORIS-2026-X981F',
      status: 'Certified Floor Ready'
    },
    {
      id: 'rep-2',
      name: 'Sarah Jenkins',
      email: 'sjenkins@appointmentlyy.ai',
      role: 'Sales Representative',
      campaign: 'Mid-Market SaaS Prospecting',
      trialsCompleted: 2,
      averageScore: 78,
      certified: false,
      status: 'In Training'
    },
    {
      id: 'rep-3',
      name: 'Marcus Vance',
      email: 'mvance@appointmentlyy.ai',
      role: 'Team Lead / Coach',
      campaign: 'Fintech High-Velocity Inbound',
      trialsCompleted: 8,
      averageScore: 96,
      certified: true,
      certificateId: 'CERT-BORIS-2026-M441K',
      status: 'Certified Floor Ready'
    },
    {
      id: 'rep-4',
      name: 'David Cole',
      email: 'dcole@appointmentlyy.ai',
      role: 'Outbound SDR',
      campaign: 'Enterprise Outbound Q4',
      trialsCompleted: 4,
      averageScore: 68,
      certified: false,
      status: 'In Remediation'
    }
];

export default function AdminRepsPage() {
  const isDemo = useDemoWorkspace();
  const reps: RepRecord[] = isDemo ? DEMO_REPS : [];

  const [searchTerm, setSearchTerm] = useState('');

  const filteredReps = reps.filter(r => 
    `${r.name} ${r.email} ${r.campaign} ${r.role}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <PageHeader
        title="Certification"
        count={reps.length}
        description={`${reps.filter(r => r.certified).length} floor ready, ${reps.filter(r => r.status === 'In Remediation').length} in remediation. Practice trials, audit scores and certificates per rep.`}
      />

      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <div className="w-full sm:max-w-md">
          <SearchInput
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reps by name or campaign"
            aria-label="Search reps"
          />
        </div>

        {/* Rep table */}
        {reps.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface shadow-xs">
            <EmptyState
              icon={<Award />}
              title="No certification results yet"
              description="When your reps complete practice trials and certification, their scores and certificates appear here."
              action={
                <Link href="/certification" className={buttonClasses('secondary', 'sm')}>
                  Open certification
                </Link>
              }
            />
          </div>
        ) : (
        <div className="rounded-lg border border-line bg-surface shadow-xs overflow-x-auto">
          <table className="w-full border-collapse text-left text-body tabular-nums">
            <thead>
              <tr className="h-9 bg-subtle">
                <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary">Rep</th>
                <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary">Campaign</th>
                <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary text-right">Practice trials</th>
                <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary text-right">Audit score</th>
                <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary">Certification</th>
                <th scope="col" className="px-4 text-caption font-medium text-fg-tertiary text-right"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredReps.map((rep) => (
                <tr key={rep.id} className="border-t border-line transition-colors duration-150 hover:bg-subtle">
                  <td className="px-4 py-2.5">
                    <div className="text-body-strong text-fg">{rep.name}</div>
                    <div className="text-small text-fg-secondary">{rep.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-fg">{rep.campaign}</div>
                    <div className="text-small text-fg-tertiary">{rep.role}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-fg">
                    {rep.trialsCompleted}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={rep.averageScore >= 85 ? 'text-success-fg' : 'text-warning-fg'}>
                      {rep.averageScore}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusDot
                      tone={rep.certified ? 'success' : rep.status === 'In Remediation' ? 'danger' : 'neutral'}
                      label={rep.status}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {rep.certificateId ? (
                      <Link
                        href={`/certificate/${rep.certificateId}`}
                        className={buttonClasses('secondary', 'sm')}
                      >
                        <Award className="h-3.5 w-3.5" aria-hidden />
                        <span>View certificate</span>
                      </Link>
                    ) : (
                      <Link
                        href="/certification"
                        className={buttonClasses('ghost', 'sm')}
                      >
                        <Radio className="h-3.5 w-3.5" aria-hidden />
                        <span>Start trial</span>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}

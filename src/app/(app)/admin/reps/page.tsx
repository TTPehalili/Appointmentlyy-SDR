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
import AdminNavigationHeader from '@/components/AdminNavigationHeader';

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

export default function AdminRepsPage() {
  const [reps, setReps] = useState<RepRecord[]>([
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
  ]);

  const [searchTerm, setSearchTerm] = useState('');

  const filteredReps = reps.filter(r => 
    `${r.name} ${r.email} ${r.campaign} ${r.role}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <AdminNavigationHeader activeSection="reps" />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-8 flex flex-col gap-6">
        
        {/* Roster Controls */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-[#ED1C24]/10 border border-[#ED1C24]/20 flex items-center justify-center text-[#ED1C24]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Active BPO Roster ({reps.length} Reps)
              </h2>
              <p className="text-xs text-slate-500">
                Floor Ready: {reps.filter(r => r.certified).length} | In Remediation: {reps.filter(r => r.status === 'In Remediation').length}
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reps by name or campaign..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ED1C24]"
            />
          </div>
        </div>

        {/* Rep Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-3.5">Representative</th>
                <th className="px-6 py-3.5">Assigned Campaign</th>
                <th className="px-6 py-3.5">Sparring Trials</th>
                <th className="px-6 py-3.5">Audit Score</th>
                <th className="px-6 py-3.5">Certification Status</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReps.map((rep) => (
                <tr key={rep.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{rep.name}</div>
                    <div className="text-[11px] text-slate-500">{rep.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-slate-800">{rep.campaign}</span>
                    <div className="text-[10px] text-slate-400">{rep.role}</div>
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold text-slate-700">
                    {rep.trialsCompleted} Trials Completed
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-mono font-bold text-xs ${
                      rep.averageScore >= 85 ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {rep.averageScore}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      rep.certified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      rep.status === 'In Remediation' ? 'bg-red-50 text-red-700 border border-red-200' :
                      'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {rep.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {rep.certificateId ? (
                      <Link
                        href={`/certificate/${rep.certificateId}`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition-colors inline-flex items-center gap-1.5"
                      >
                        <Award className="h-3.5 w-3.5" />
                        <span>VIEW CERTIFICATE</span>
                      </Link>
                    ) : (
                      <Link
                        href="/certification"
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors inline-flex items-center gap-1.5"
                      >
                        <Radio className="h-3.5 w-3.5 text-[#ED1C24]" />
                        <span>START TRIAL</span>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  PhoneCall, 
  Mail, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  FileText,
  User,
  Building2,
  Sparkles
} from 'lucide-react';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import { Button, IconButton, EmptyState, Dialog } from '@/components/ui';
import { 
  getStoredActivities, 
  getDailyActivitySummary, 
  INITIAL_DAILY_SUMMARY,
  DailyActivitySummary, 
  CadenceActivityRecord 
} from '@/lib/activityStore';

interface DailyActivityReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  repName: string;
}

export default function DailyActivityReportModal({
  isOpen,
  onClose,
  repName
}: DailyActivityReportModalProps) {
  const [summary, setSummary] = useState<DailyActivitySummary>(INITIAL_DAILY_SUMMARY);
  const [copiedSlack, setCopiedSlack] = useState(false);
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<'All' | 'Phone' | 'Email' | 'LinkedIn'>('All');

  useEffect(() => {
    if (isOpen) {
      setSummary(getDailyActivitySummary(repName));
    }
  }, [isOpen, repName]);

  const filteredActivities = summary.activities.filter(a => {
    if (selectedChannelFilter === 'All') return true;
    return a.channel === selectedChannelFilter;
  });

  // Generate End-of-Day Markdown / Slack summary for managers
  const generateEodReportText = (): string => {
    return `*📋 END-OF-DAY SDR CADENCE ACTIVITY REPORT*
*Rep:* ${repName}
*Date:* ${summary.date}
----------------------------------------
*📊 OUTREACH & PRODUCTION SUMMARY:*
• Total Completed Activities: *${summary.totalActivities}*
• Cold Calls & Phone Dials: *${summary.callsMade}*
• Cadence Emails Dispatched: *${summary.emailsSent}*
• LinkedIn Touches Logged: *${summary.linkedInTouches}*
• Appointments Booked: *${summary.appointmentsBooked}* 🎯
• Callbacks Scheduled: *${summary.callbacksScheduled}* 🔄
• DNC Quarantined: *${summary.dncFlagged}* 🚫
• Not Interested: *${summary.notInterested}*

*📝 COMPLETED CADENCE TOUCHPOINTS AUDIT:*
${summary.activities.map((a, idx) => `${idx + 1}. [${a.timestamp}] *${a.prospectName}* (${a.companyName}) — *${a.channel}* | ${a.stepName} | Disp: _${a.disposition}_`).join('\n')}

_Generated via Appointmentlyy AI Boris Calling Cockpit_`;
  };

  const handleCopySlackReport = () => {
    navigator.clipboard.writeText(generateEodReportText());
    setCopiedSlack(true);
    setTimeout(() => setCopiedSlack(false), 2000);
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Rep', 'Prospect', 'Company', 'Channel', 'Cadence Day', 'Touch #', 'Step Name', 'Disposition', 'Website', 'LinkedIn', 'Notes'];
    const rows = summary.activities.map(a => [
      `"${a.timestamp}"`,
      `"${a.repName}"`,
      `"${a.prospectName}"`,
      `"${a.companyName}"`,
      `"${a.channel}"`,
      a.cadenceDay,
      a.touchNumber,
      `"${a.stepName}"`,
      `"${a.disposition}"`,
      `"${a.website || ''}"`,
      `"${a.linkedinUrl || ''}"`,
      `"${(a.notesSnippet || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SDR_Daily_Activity_Report_${repName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Daily activity report"
      size="xl"
      className="max-w-4xl overflow-hidden"
      bare
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden text-fg">
        {/* HEADER */}
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-h2 text-fg">
              Daily activity report
            </h2>
            <p className="mt-0.5 text-body text-fg-secondary">
              {repName}: completed cadence activities, <span className="tabular-nums">{summary.date}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopySlackReport}
              title="Copy formatted summary to paste into Slack, Discord, or Email to manager"
              icon={copiedSlack ? <Check className="text-success-fg" /> : <Copy />}
            >
              <span>{copiedSlack ? 'Copied report' : 'Copy for Slack or email'}</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleExportCsv}
              icon={<Download />}
            >
              Export CSV
            </Button>

            <IconButton label="Close" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        </div>

        {/* METRICS STRIP */}
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-line bg-app p-6 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-line bg-surface p-3 shadow-xs">
            <span className="block text-caption text-fg-tertiary">Total outreach</span>
            <span className="block text-kpi tabular-nums text-fg">{summary.totalActivities}</span>
            <span className="mt-0.5 block text-caption text-fg-secondary">Touches completed</span>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 shadow-xs">
            <span className="block text-caption text-fg-tertiary">Phone dials</span>
            <span className="block text-kpi tabular-nums text-fg">{summary.callsMade}</span>
            <span className="mt-0.5 block text-caption text-fg-secondary">Calls logged</span>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 shadow-xs">
            <span className="block text-caption text-fg-tertiary">Emails sent</span>
            <span className="block text-kpi tabular-nums text-fg">{summary.emailsSent}</span>
            <span className="mt-0.5 block text-caption text-fg-secondary">Dispatches sent</span>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 shadow-xs">
            <span className="block text-caption text-fg-tertiary">LinkedIn touches</span>
            <span className="block text-kpi tabular-nums text-fg">{summary.linkedInTouches}</span>
            <span className="mt-0.5 block text-caption text-fg-secondary">Profiles engaged</span>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 shadow-xs">
            <span className="block text-caption text-fg-tertiary">Meetings booked</span>
            <span className="block text-kpi tabular-nums text-success-fg">{summary.appointmentsBooked}</span>
            <span className="mt-0.5 block text-caption text-fg-secondary">Appointments set</span>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 shadow-xs">
            <span className="block text-caption text-fg-tertiary">Callbacks</span>
            <span className="block text-kpi tabular-nums text-fg">{summary.callbacksScheduled}</span>
            <span className="mt-0.5 block text-caption text-fg-secondary">Carry-overs queued</span>
          </div>
        </div>

        {/* CHANNEL FILTER TABS */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-tertiary">Channel</span>
            <div className="inline-flex rounded-md border border-line bg-subtle p-0.5">
              {(['All', 'Phone', 'Email', 'LinkedIn'] as const).map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setSelectedChannelFilter(ch)}
                  aria-pressed={selectedChannelFilter === ch}
                  className={`focus-ring inline-flex h-7 cursor-pointer items-center rounded-[6px] px-3 text-small font-medium transition-colors duration-150 ${
                    selectedChannelFilter === ch
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-secondary hover:text-fg'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <span className="text-small tabular-nums text-fg-secondary">
            Showing {filteredActivities.length} of {summary.activities.length} activities
          </span>
        </div>

        {/* ACTIVITY TABLE */}
        <div className="flex-1 overflow-y-auto bg-surface p-6">
          {filteredActivities.length === 0 ? (
            <EmptyState
              icon={<Clock />}
              title={`No activities logged for ${selectedChannelFilter} today yet`}
              description="Mark cadence steps as completed or log call outcomes on the calling floor to build your report."
              className="py-12"
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full border-collapse text-left text-small">
                <thead>
                  <tr className="bg-subtle text-caption text-fg-tertiary">
                    <th className="px-3 py-2.5 font-medium">Time</th>
                    <th className="px-3 py-2.5 font-medium">Prospect and account</th>
                    <th className="px-3 py-2.5 font-medium">Channel</th>
                    <th className="px-3 py-2.5 font-medium">Cadence touchpoint</th>
                    <th className="px-3 py-2.5 font-medium">Outcome</th>
                    <th className="px-3 py-2.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((act) => (
                    <tr key={act.id} className="border-t border-line transition-colors hover:bg-subtle">
                      <td className="whitespace-nowrap px-3 py-2.5 text-caption tabular-nums text-fg-secondary">
                        {act.timestamp}
                      </td>
                      <td className="px-3 py-2.5 text-fg">
                        <div className="text-body-strong">{act.prospectName}</div>
                        <div className="text-caption text-fg-secondary">{act.companyName}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-small text-fg-secondary">
                          {act.channel === 'Phone' && <PhoneCall className="size-3.5" />}
                          {act.channel === 'Email' && <Mail className="size-3.5" />}
                          {act.channel === 'LinkedIn' && <LinkedinIcon className="size-3.5" />}
                          <span>{act.channel}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-fg">
                        <div className="text-body-strong">{act.stepName}</div>
                        <div className="text-caption tabular-nums text-fg-secondary">Day {act.cadenceDay} · Touch {act.touchNumber}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex h-5 items-center rounded-sm px-1.5 text-caption ${
                          act.disposition.toLowerCase().includes('meeting') || act.disposition.toLowerCase().includes('booked') ? 'bg-success-bg text-success-fg' :
                          act.disposition.toLowerCase().includes('dnc') ? 'bg-danger-bg text-danger-fg' :
                          act.disposition.toLowerCase().includes('callback') ? 'bg-warning-bg text-warning-fg' :
                          'bg-subtle text-fg-secondary'
                        }`}>
                          {act.disposition}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-3 py-2.5 text-fg" title={act.notesSnippet}>
                        {act.notesSnippet}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3 text-small text-fg-secondary">
          <span>Activities are saved on this device and sync across open tabs.</span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

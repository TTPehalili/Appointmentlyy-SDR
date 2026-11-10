'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { 
  BarChart3, 
  Calendar, 
  Users, 
  PhoneCall, 
  Mail, 
  CheckCircle2, 
  Ban, 
  ThumbsDown, 
  Clock, 
  TrendingUp, 
  Filter, 
  Download, 
  Search, 
  Sparkles, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldAlert, 
  CalendarClock,
  RotateCcw,
  Target,
  ExternalLink,
  ChevronDown,
  Lock,
  Building2,
  UserCheck,
  Layers,
  Award,
  Zap,
  LayoutGrid,
  List
} from 'lucide-react';
import { useSession } from '@/lib/session';
import { PageHeader, SegmentedControl, Button, StatTile, Badge, Tooltip, EmptyState, buttonClasses } from '@/components/ui';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { getStoredActivities, subscribeToActivities, type CadenceActivityRecord } from '@/lib/activityStore';

export type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RepMetric {
  id: string;
  name: string;
  role: string;
  avatar: string;
  status: 'Online' | 'In Call' | 'Break' | 'Offline';
  tenant: string;
  campaign: string;
  callsMade: number;
  connectRate: number; // percentage
  emailsSent: number;
  linkedInTouches: number;
  appointmentsBooked: number;
  quotaTarget: number;
  quotaAttainment: number; // percentage
  dncFlagged: number;
  notInterested: number;
  callbacksScheduled: number;
  avgTalkTimeSec: number;
  qaSparringScore: number; // out of 100
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  tenant: string;
  repName: string;
  prospectName: string;
  companyName: string;
  channel: 'Phone' | 'Email' | 'LinkedIn';
  disposition: 'Meeting Booked' | 'DNC Quarantined' | 'Not Interested' | 'Callback Scheduled' | 'Follow-Up Email' | 'No Answer';
  notesSnippet: string;
}

const PERIOD_DAYS: Record<TimePeriod, number> = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };

/** Activities inside the selected period (today for 'daily'). */
function activitiesInPeriod(all: CadenceActivityRecord[], period: TimePeriod): CadenceActivityRecord[] {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (PERIOD_DAYS[period] - 1));
  return all.filter((a) => {
    const t = Date.parse(a.isoDate);
    return !isNaN(t) && t >= start.getTime();
  });
}

const isBooked = (d: string) => /book|meeting|appointment/i.test(d);
const isDnc = (d: string) => /dnc|do not call|do-not-call/i.test(d);
const isNotInterested = (d: string) => /not interested/i.test(d);
const isCallback = (d: string) => /callback|call back|scheduled/i.test(d);
const isNoConnect = (d: string) => /no answer|voicemail|busy|wrong number|disconnected/i.test(d);

function emptyRepMetric(name: string, tenant: string): RepMetric {
  return {
    id: `rep_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'me'}`,
    name,
    role: 'Rep',
    avatar: name.split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase(),
    status: 'Offline',
    tenant,
    campaign: 'All campaigns',
    callsMade: 0,
    connectRate: 0,
    emailsSent: 0,
    linkedInTouches: 0,
    appointmentsBooked: 0,
    quotaTarget: 0,
    quotaAttainment: 0,
    dncFlagged: 0,
    notInterested: 0,
    callbacksScheduled: 0,
    avgTalkTimeSec: 0,
    qaSparringScore: 0,
  };
}

/** Real workspaces: per-rep metrics computed from the activity the team actually logged. */
function repMetricsFromActivities(activities: CadenceActivityRecord[], tenant: string): RepMetric[] {
  const byRep = new Map<string, RepMetric & { connected: number }>();
  for (const a of activities) {
    const name = (a.repName || 'Unassigned').trim() || 'Unassigned';
    const r = byRep.get(name) || { ...emptyRepMetric(name, tenant), connected: 0 };
    const d = a.disposition || '';
    if (a.channel === 'Phone') {
      r.callsMade++;
      if (!isNoConnect(d)) r.connected++;
    } else if (a.channel === 'Email') r.emailsSent++;
    else if (a.channel === 'LinkedIn') r.linkedInTouches++;
    if (isBooked(d)) r.appointmentsBooked++;
    if (isDnc(d)) r.dncFlagged++;
    if (isNotInterested(d)) r.notInterested++;
    if (isCallback(d)) r.callbacksScheduled++;
    byRep.set(name, r);
  }
  return Array.from(byRep.values()).map(({ connected, ...r }) => ({
    ...r,
    connectRate: r.callsMade > 0 ? Math.round((connected / r.callsMade) * 1000) / 10 : 0,
  }));
}

function activityLogFromRecords(activities: CadenceActivityRecord[], tenant: string): ActivityLogItem[] {
  return activities.map((a) => ({
    id: a.id,
    timestamp: a.timestamp,
    tenant,
    repName: a.repName,
    prospectName: a.prospectName,
    companyName: a.companyName,
    channel: a.channel,
    disposition: (isBooked(a.disposition)
      ? 'Meeting Booked'
      : isDnc(a.disposition)
      ? 'DNC Quarantined'
      : isNotInterested(a.disposition)
      ? 'Not Interested'
      : isCallback(a.disposition)
      ? 'Callback Scheduled'
      : a.channel === 'Email'
      ? 'Follow-Up Email'
      : 'No Answer') as ActivityLogItem['disposition'],
    notesSnippet: a.notesSnippet,
  }));
}

// Sample rep performance for the demo workspace only (see useDemoWorkspace).
const MASTER_PERFORMANCE_DATA: Record<TimePeriod, RepMetric[]> = {
  daily: [
    // Apex Global BPO
    {
      id: 'rep_1',
      name: 'Alex Mercer',
      role: 'Senior Outbound SDR',
      avatar: 'AM',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 58,
      connectRate: 36.2,
      emailsSent: 42,
      linkedInTouches: 18,
      appointmentsBooked: 3,
      quotaTarget: 3,
      quotaAttainment: 100,
      dncFlagged: 1,
      notInterested: 5,
      callbacksScheduled: 4,
      avgTalkTimeSec: 184,
      qaSparringScore: 94
    },
    {
      id: 'rep_5',
      name: 'Marcus Brody',
      role: 'Junior SDR',
      avatar: 'MB',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 66,
      connectRate: 25.7,
      emailsSent: 25,
      linkedInTouches: 8,
      appointmentsBooked: 1,
      quotaTarget: 2,
      quotaAttainment: 50,
      dncFlagged: 1,
      notInterested: 9,
      callbacksScheduled: 2,
      avgTalkTimeSec: 138,
      qaSparringScore: 85
    },
    {
      id: 'rep_6',
      name: 'Carlo Reyes',
      role: 'Appointment Setter',
      avatar: 'CR',
      status: 'Online',
      tenant: 'Apex Global BPO',
      campaign: 'APAC Expansion',
      callsMade: 48,
      connectRate: 33.3,
      emailsSent: 30,
      linkedInTouches: 14,
      appointmentsBooked: 2,
      quotaTarget: 2,
      quotaAttainment: 100,
      dncFlagged: 0,
      notInterested: 6,
      callbacksScheduled: 3,
      avgTalkTimeSec: 165,
      qaSparringScore: 90
    },
    // ShorePartners BPO
    {
      id: 'rep_2',
      name: 'Sarah Jenkins',
      role: 'Outbound Appointment Setter',
      avatar: 'SJ',
      status: 'Online',
      tenant: 'ShorePartners BPO',
      campaign: 'Enterprise Outbound',
      callsMade: 64,
      connectRate: 31.8,
      emailsSent: 35,
      linkedInTouches: 15,
      appointmentsBooked: 2,
      quotaTarget: 3,
      quotaAttainment: 66.7,
      dncFlagged: 0,
      notInterested: 8,
      callbacksScheduled: 6,
      avgTalkTimeSec: 152,
      qaSparringScore: 91
    },
    {
      id: 'rep_7',
      name: 'Liam Torres',
      role: 'Senior SDR',
      avatar: 'LT',
      status: 'In Call',
      tenant: 'ShorePartners BPO',
      campaign: 'ShorePartners Cloud Leads',
      callsMade: 55,
      connectRate: 34.5,
      emailsSent: 38,
      linkedInTouches: 16,
      appointmentsBooked: 2,
      quotaTarget: 3,
      quotaAttainment: 66.7,
      dncFlagged: 1,
      notInterested: 7,
      callbacksScheduled: 5,
      avgTalkTimeSec: 172,
      qaSparringScore: 93
    },
    // CloudStaff Outsourcing
    {
      id: 'rep_3',
      name: 'David Vance',
      role: 'B2B Sales Representative',
      avatar: 'DV',
      status: 'Online',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'FinTech Call Center',
      callsMade: 52,
      connectRate: 28.8,
      emailsSent: 30,
      linkedInTouches: 12,
      appointmentsBooked: 2,
      quotaTarget: 3,
      quotaAttainment: 66.7,
      dncFlagged: 2,
      notInterested: 7,
      callbacksScheduled: 3,
      avgTalkTimeSec: 168,
      qaSparringScore: 88
    },
    {
      id: 'rep_8',
      name: 'Camille Santos',
      role: 'Outbound Setter',
      avatar: 'CS',
      status: 'Break',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'CloudStaff SaaS Pipeline',
      callsMade: 46,
      connectRate: 32.6,
      emailsSent: 32,
      linkedInTouches: 14,
      appointmentsBooked: 1,
      quotaTarget: 2,
      quotaAttainment: 50,
      dncFlagged: 0,
      notInterested: 6,
      callbacksScheduled: 4,
      avgTalkTimeSec: 160,
      qaSparringScore: 89
    },
    // Vanguard BPO Solutions
    {
      id: 'rep_4',
      name: 'Elena Gomez',
      role: 'Outbound Specialist',
      avatar: 'EG',
      status: 'Break',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Medical BPO',
      callsMade: 44,
      connectRate: 40.9,
      emailsSent: 28,
      linkedInTouches: 10,
      appointmentsBooked: 1,
      quotaTarget: 2,
      quotaAttainment: 50,
      dncFlagged: 0,
      notInterested: 4,
      callbacksScheduled: 5,
      avgTalkTimeSec: 210,
      qaSparringScore: 96
    },
    {
      id: 'rep_9',
      name: 'Michael Chang',
      role: 'B2B SDR',
      avatar: 'MC',
      status: 'Online',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Vanguard Healthcare Outbound',
      callsMade: 50,
      connectRate: 36.0,
      emailsSent: 34,
      linkedInTouches: 12,
      appointmentsBooked: 2,
      quotaTarget: 2,
      quotaAttainment: 100,
      dncFlagged: 1,
      notInterested: 5,
      callbacksScheduled: 4,
      avgTalkTimeSec: 175,
      qaSparringScore: 92
    }
  ],
  weekly: [
    // Apex Global BPO
    {
      id: 'rep_1',
      name: 'Alex Mercer',
      role: 'Senior Outbound SDR',
      avatar: 'AM',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 278,
      connectRate: 35.6,
      emailsSent: 195,
      linkedInTouches: 84,
      appointmentsBooked: 14,
      quotaTarget: 15,
      quotaAttainment: 93.3,
      dncFlagged: 3,
      notInterested: 24,
      callbacksScheduled: 18,
      avgTalkTimeSec: 188,
      qaSparringScore: 94
    },
    {
      id: 'rep_5',
      name: 'Marcus Brody',
      role: 'Junior SDR',
      avatar: 'MB',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 320,
      connectRate: 26.3,
      emailsSent: 110,
      linkedInTouches: 40,
      appointmentsBooked: 6,
      quotaTarget: 10,
      quotaAttainment: 60.0,
      dncFlagged: 4,
      notInterested: 42,
      callbacksScheduled: 11,
      avgTalkTimeSec: 142,
      qaSparringScore: 85
    },
    {
      id: 'rep_6',
      name: 'Carlo Reyes',
      role: 'Appointment Setter',
      avatar: 'CR',
      status: 'Online',
      tenant: 'Apex Global BPO',
      campaign: 'APAC Expansion',
      callsMade: 245,
      connectRate: 33.8,
      emailsSent: 150,
      linkedInTouches: 65,
      appointmentsBooked: 9,
      quotaTarget: 10,
      quotaAttainment: 90.0,
      dncFlagged: 2,
      notInterested: 28,
      callbacksScheduled: 16,
      avgTalkTimeSec: 168,
      qaSparringScore: 91
    },
    // ShorePartners BPO
    {
      id: 'rep_2',
      name: 'Sarah Jenkins',
      role: 'Outbound Appointment Setter',
      avatar: 'SJ',
      status: 'Online',
      tenant: 'ShorePartners BPO',
      campaign: 'Enterprise Outbound',
      callsMade: 312,
      connectRate: 32.1,
      emailsSent: 168,
      linkedInTouches: 72,
      appointmentsBooked: 12,
      quotaTarget: 15,
      quotaAttainment: 80.0,
      dncFlagged: 2,
      notInterested: 36,
      callbacksScheduled: 26,
      avgTalkTimeSec: 156,
      qaSparringScore: 91
    },
    {
      id: 'rep_7',
      name: 'Liam Torres',
      role: 'Senior SDR',
      avatar: 'LT',
      status: 'In Call',
      tenant: 'ShorePartners BPO',
      campaign: 'ShorePartners Cloud Leads',
      callsMade: 280,
      connectRate: 34.0,
      emailsSent: 175,
      linkedInTouches: 70,
      appointmentsBooked: 11,
      quotaTarget: 15,
      quotaAttainment: 73.3,
      dncFlagged: 3,
      notInterested: 30,
      callbacksScheduled: 22,
      avgTalkTimeSec: 170,
      qaSparringScore: 92
    },
    // CloudStaff Outsourcing
    {
      id: 'rep_3',
      name: 'David Vance',
      role: 'B2B Sales Representative',
      avatar: 'DV',
      status: 'Online',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'FinTech Call Center',
      callsMade: 264,
      connectRate: 29.5,
      emailsSent: 148,
      linkedInTouches: 60,
      appointmentsBooked: 10,
      quotaTarget: 15,
      quotaAttainment: 66.7,
      dncFlagged: 5,
      notInterested: 31,
      callbacksScheduled: 15,
      avgTalkTimeSec: 164,
      qaSparringScore: 88
    },
    {
      id: 'rep_8',
      name: 'Camille Santos',
      role: 'Outbound Setter',
      avatar: 'CS',
      status: 'Break',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'CloudStaff SaaS Pipeline',
      callsMade: 230,
      connectRate: 32.0,
      emailsSent: 140,
      linkedInTouches: 55,
      appointmentsBooked: 8,
      quotaTarget: 10,
      quotaAttainment: 80.0,
      dncFlagged: 1,
      notInterested: 25,
      callbacksScheduled: 19,
      avgTalkTimeSec: 162,
      qaSparringScore: 90
    },
    // Vanguard BPO Solutions
    {
      id: 'rep_4',
      name: 'Elena Gomez',
      role: 'Outbound Specialist',
      avatar: 'EG',
      status: 'Break',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Medical BPO',
      callsMade: 228,
      connectRate: 41.2,
      emailsSent: 132,
      linkedInTouches: 52,
      appointmentsBooked: 9,
      quotaTarget: 10,
      quotaAttainment: 90.0,
      dncFlagged: 1,
      notInterested: 18,
      callbacksScheduled: 22,
      avgTalkTimeSec: 215,
      qaSparringScore: 96
    },
    {
      id: 'rep_9',
      name: 'Michael Chang',
      role: 'B2B SDR',
      avatar: 'MC',
      status: 'Online',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Vanguard Healthcare Outbound',
      callsMade: 250,
      connectRate: 35.2,
      emailsSent: 155,
      linkedInTouches: 62,
      appointmentsBooked: 9,
      quotaTarget: 10,
      quotaAttainment: 90.0,
      dncFlagged: 2,
      notInterested: 24,
      callbacksScheduled: 20,
      avgTalkTimeSec: 178,
      qaSparringScore: 92
    }
  ],
  monthly: [
    // Apex Global BPO
    {
      id: 'rep_1',
      name: 'Alex Mercer',
      role: 'Senior Outbound SDR',
      avatar: 'AM',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 1140,
      connectRate: 36.8,
      emailsSent: 780,
      linkedInTouches: 340,
      appointmentsBooked: 58,
      quotaTarget: 60,
      quotaAttainment: 96.7,
      dncFlagged: 11,
      notInterested: 98,
      callbacksScheduled: 74,
      avgTalkTimeSec: 192,
      qaSparringScore: 94
    },
    {
      id: 'rep_5',
      name: 'Marcus Brody',
      role: 'Junior SDR',
      avatar: 'MB',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 1310,
      connectRate: 27.2,
      emailsSent: 460,
      linkedInTouches: 165,
      appointmentsBooked: 26,
      quotaTarget: 40,
      quotaAttainment: 65.0,
      dncFlagged: 15,
      notInterested: 175,
      callbacksScheduled: 48,
      avgTalkTimeSec: 145,
      qaSparringScore: 85
    },
    {
      id: 'rep_6',
      name: 'Carlo Reyes',
      role: 'Appointment Setter',
      avatar: 'CR',
      status: 'Online',
      tenant: 'Apex Global BPO',
      campaign: 'APAC Expansion',
      callsMade: 980,
      connectRate: 34.2,
      emailsSent: 620,
      linkedInTouches: 270,
      appointmentsBooked: 37,
      quotaTarget: 40,
      quotaAttainment: 92.5,
      dncFlagged: 7,
      notInterested: 112,
      callbacksScheduled: 68,
      avgTalkTimeSec: 170,
      qaSparringScore: 91
    },
    // ShorePartners BPO
    {
      id: 'rep_2',
      name: 'Sarah Jenkins',
      role: 'Outbound Appointment Setter',
      avatar: 'SJ',
      status: 'Online',
      tenant: 'ShorePartners BPO',
      campaign: 'Enterprise Outbound',
      callsMade: 1260,
      connectRate: 33.2,
      emailsSent: 690,
      linkedInTouches: 295,
      appointmentsBooked: 49,
      quotaTarget: 60,
      quotaAttainment: 81.7,
      dncFlagged: 8,
      notInterested: 142,
      callbacksScheduled: 105,
      avgTalkTimeSec: 160,
      qaSparringScore: 91
    },
    {
      id: 'rep_7',
      name: 'Liam Torres',
      role: 'Senior SDR',
      avatar: 'LT',
      status: 'In Call',
      tenant: 'ShorePartners BPO',
      campaign: 'ShorePartners Cloud Leads',
      callsMade: 1120,
      connectRate: 34.5,
      emailsSent: 710,
      linkedInTouches: 280,
      appointmentsBooked: 45,
      quotaTarget: 60,
      quotaAttainment: 75.0,
      dncFlagged: 10,
      notInterested: 125,
      callbacksScheduled: 88,
      avgTalkTimeSec: 172,
      qaSparringScore: 92
    },
    // CloudStaff Outsourcing
    {
      id: 'rep_3',
      name: 'David Vance',
      role: 'B2B Sales Representative',
      avatar: 'DV',
      status: 'Online',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'FinTech Call Center',
      callsMade: 1080,
      connectRate: 30.1,
      emailsSent: 610,
      linkedInTouches: 245,
      appointmentsBooked: 41,
      quotaTarget: 60,
      quotaAttainment: 68.3,
      dncFlagged: 18,
      notInterested: 128,
      callbacksScheduled: 62,
      avgTalkTimeSec: 166,
      qaSparringScore: 88
    },
    {
      id: 'rep_8',
      name: 'Camille Santos',
      role: 'Outbound Setter',
      avatar: 'CS',
      status: 'Break',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'CloudStaff SaaS Pipeline',
      callsMade: 940,
      connectRate: 32.5,
      emailsSent: 560,
      linkedInTouches: 220,
      appointmentsBooked: 33,
      quotaTarget: 40,
      quotaAttainment: 82.5,
      dncFlagged: 5,
      notInterested: 104,
      callbacksScheduled: 76,
      avgTalkTimeSec: 164,
      qaSparringScore: 90
    },
    // Vanguard BPO Solutions
    {
      id: 'rep_4',
      name: 'Elena Gomez',
      role: 'Outbound Specialist',
      avatar: 'EG',
      status: 'Break',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Medical BPO',
      callsMade: 940,
      connectRate: 42.1,
      emailsSent: 540,
      linkedInTouches: 210,
      appointmentsBooked: 38,
      quotaTarget: 40,
      quotaAttainment: 95.0,
      dncFlagged: 4,
      notInterested: 76,
      callbacksScheduled: 92,
      avgTalkTimeSec: 218,
      qaSparringScore: 96
    },
    {
      id: 'rep_9',
      name: 'Michael Chang',
      role: 'B2B SDR',
      avatar: 'MC',
      status: 'Online',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Vanguard Healthcare Outbound',
      callsMade: 1020,
      connectRate: 35.8,
      emailsSent: 630,
      linkedInTouches: 250,
      appointmentsBooked: 37,
      quotaTarget: 40,
      quotaAttainment: 92.5,
      dncFlagged: 7,
      notInterested: 98,
      callbacksScheduled: 80,
      avgTalkTimeSec: 180,
      qaSparringScore: 92
    }
  ],
  quarterly: [
    // Apex Global BPO
    {
      id: 'rep_1',
      name: 'Alex Mercer',
      role: 'Senior Outbound SDR',
      avatar: 'AM',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 3350,
      connectRate: 36.5,
      emailsSent: 2310,
      linkedInTouches: 990,
      appointmentsBooked: 172,
      quotaTarget: 180,
      quotaAttainment: 95.6,
      dncFlagged: 32,
      notInterested: 290,
      callbacksScheduled: 215,
      avgTalkTimeSec: 190,
      qaSparringScore: 94
    },
    {
      id: 'rep_5',
      name: 'Marcus Brody',
      role: 'Junior SDR',
      avatar: 'MB',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 3880,
      connectRate: 26.9,
      emailsSent: 1350,
      linkedInTouches: 490,
      appointmentsBooked: 76,
      quotaTarget: 120,
      quotaAttainment: 63.3,
      dncFlagged: 44,
      notInterested: 515,
      callbacksScheduled: 140,
      avgTalkTimeSec: 144,
      qaSparringScore: 85
    },
    {
      id: 'rep_6',
      name: 'Carlo Reyes',
      role: 'Appointment Setter',
      avatar: 'CR',
      status: 'Online',
      tenant: 'Apex Global BPO',
      campaign: 'APAC Expansion',
      callsMade: 2920,
      connectRate: 34.0,
      emailsSent: 1840,
      linkedInTouches: 790,
      appointmentsBooked: 110,
      quotaTarget: 120,
      quotaAttainment: 91.7,
      dncFlagged: 20,
      notInterested: 330,
      callbacksScheduled: 202,
      avgTalkTimeSec: 171,
      qaSparringScore: 91
    },
    // ShorePartners BPO
    {
      id: 'rep_2',
      name: 'Sarah Jenkins',
      role: 'Outbound Appointment Setter',
      avatar: 'SJ',
      status: 'Online',
      tenant: 'ShorePartners BPO',
      campaign: 'Enterprise Outbound',
      callsMade: 3720,
      connectRate: 32.9,
      emailsSent: 2040,
      linkedInTouches: 880,
      appointmentsBooked: 146,
      quotaTarget: 180,
      quotaAttainment: 81.1,
      dncFlagged: 24,
      notInterested: 410,
      callbacksScheduled: 310,
      avgTalkTimeSec: 158,
      qaSparringScore: 91
    },
    {
      id: 'rep_7',
      name: 'Liam Torres',
      role: 'Senior SDR',
      avatar: 'LT',
      status: 'In Call',
      tenant: 'ShorePartners BPO',
      campaign: 'ShorePartners Cloud Leads',
      callsMade: 3310,
      connectRate: 34.2,
      emailsSent: 2100,
      linkedInTouches: 830,
      appointmentsBooked: 133,
      quotaTarget: 180,
      quotaAttainment: 73.9,
      dncFlagged: 28,
      notInterested: 370,
      callbacksScheduled: 260,
      avgTalkTimeSec: 173,
      qaSparringScore: 92
    },
    // CloudStaff Outsourcing
    {
      id: 'rep_3',
      name: 'David Vance',
      role: 'B2B Sales Representative',
      avatar: 'DV',
      status: 'Online',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'FinTech Call Center',
      callsMade: 3190,
      connectRate: 29.8,
      emailsSent: 1790,
      linkedInTouches: 720,
      appointmentsBooked: 121,
      quotaTarget: 180,
      quotaAttainment: 67.2,
      dncFlagged: 51,
      notInterested: 375,
      callbacksScheduled: 180,
      avgTalkTimeSec: 165,
      qaSparringScore: 88
    },
    {
      id: 'rep_8',
      name: 'Camille Santos',
      role: 'Outbound Setter',
      avatar: 'CS',
      status: 'Break',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'CloudStaff SaaS Pipeline',
      callsMade: 2800,
      connectRate: 32.2,
      emailsSent: 1650,
      linkedInTouches: 650,
      appointmentsBooked: 98,
      quotaTarget: 120,
      quotaAttainment: 81.7,
      dncFlagged: 16,
      notInterested: 305,
      callbacksScheduled: 220,
      avgTalkTimeSec: 164,
      qaSparringScore: 90
    },
    // Vanguard BPO Solutions
    {
      id: 'rep_4',
      name: 'Elena Gomez',
      role: 'Outbound Specialist',
      avatar: 'EG',
      status: 'Break',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Medical BPO',
      callsMade: 2780,
      connectRate: 41.8,
      emailsSent: 1580,
      linkedInTouches: 630,
      appointmentsBooked: 114,
      quotaTarget: 120,
      quotaAttainment: 95.0,
      dncFlagged: 12,
      notInterested: 220,
      callbacksScheduled: 265,
      avgTalkTimeSec: 216,
      qaSparringScore: 96
    },
    {
      id: 'rep_9',
      name: 'Michael Chang',
      role: 'B2B SDR',
      avatar: 'MC',
      status: 'Online',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Vanguard Healthcare Outbound',
      callsMade: 3020,
      connectRate: 35.5,
      emailsSent: 1860,
      linkedInTouches: 740,
      appointmentsBooked: 110,
      quotaTarget: 120,
      quotaAttainment: 91.7,
      dncFlagged: 21,
      notInterested: 290,
      callbacksScheduled: 235,
      avgTalkTimeSec: 181,
      qaSparringScore: 92
    }
  ],
  yearly: [
    // Apex Global BPO
    {
      id: 'rep_1',
      name: 'Alex Mercer',
      role: 'Senior Outbound SDR',
      avatar: 'AM',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 13200,
      connectRate: 36.2,
      emailsSent: 9150,
      linkedInTouches: 3920,
      appointmentsBooked: 675,
      quotaTarget: 700,
      quotaAttainment: 96.4,
      dncFlagged: 124,
      notInterested: 1140,
      callbacksScheduled: 840,
      avgTalkTimeSec: 191,
      qaSparringScore: 94
    },
    {
      id: 'rep_5',
      name: 'Marcus Brody',
      role: 'Junior SDR',
      avatar: 'MB',
      status: 'In Call',
      tenant: 'Apex Global BPO',
      campaign: 'Apex Global BPO',
      callsMade: 15300,
      connectRate: 26.8,
      emailsSent: 5350,
      linkedInTouches: 1940,
      appointmentsBooked: 302,
      quotaTarget: 480,
      quotaAttainment: 62.9,
      dncFlagged: 172,
      notInterested: 2040,
      callbacksScheduled: 550,
      avgTalkTimeSec: 143,
      qaSparringScore: 85
    },
    {
      id: 'rep_6',
      name: 'Carlo Reyes',
      role: 'Appointment Setter',
      avatar: 'CR',
      status: 'Online',
      tenant: 'Apex Global BPO',
      campaign: 'APAC Expansion',
      callsMade: 11600,
      connectRate: 34.1,
      emailsSent: 7300,
      linkedInTouches: 3120,
      appointmentsBooked: 435,
      quotaTarget: 480,
      quotaAttainment: 90.6,
      dncFlagged: 80,
      notInterested: 1310,
      callbacksScheduled: 790,
      avgTalkTimeSec: 171,
      qaSparringScore: 91
    },
    // ShorePartners BPO
    {
      id: 'rep_2',
      name: 'Sarah Jenkins',
      role: 'Outbound Appointment Setter',
      avatar: 'SJ',
      status: 'Online',
      tenant: 'ShorePartners BPO',
      campaign: 'Enterprise Outbound',
      callsMade: 14650,
      connectRate: 32.6,
      emailsSent: 8120,
      linkedInTouches: 3490,
      appointmentsBooked: 580,
      quotaTarget: 700,
      quotaAttainment: 82.9,
      dncFlagged: 92,
      notInterested: 1620,
      callbacksScheduled: 1210,
      avgTalkTimeSec: 159,
      qaSparringScore: 91
    },
    {
      id: 'rep_7',
      name: 'Liam Torres',
      role: 'Senior SDR',
      avatar: 'LT',
      status: 'In Call',
      tenant: 'ShorePartners BPO',
      campaign: 'ShorePartners Cloud Leads',
      callsMade: 13100,
      connectRate: 34.2,
      emailsSent: 8350,
      linkedInTouches: 3300,
      appointmentsBooked: 526,
      quotaTarget: 700,
      quotaAttainment: 75.1,
      dncFlagged: 110,
      notInterested: 1480,
      callbacksScheduled: 1040,
      avgTalkTimeSec: 173,
      qaSparringScore: 92
    },
    // CloudStaff Outsourcing
    {
      id: 'rep_3',
      name: 'David Vance',
      role: 'B2B Sales Representative',
      avatar: 'DV',
      status: 'Online',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'FinTech Call Center',
      callsMade: 12600,
      connectRate: 29.6,
      emailsSent: 7100,
      linkedInTouches: 2860,
      appointmentsBooked: 478,
      quotaTarget: 700,
      quotaAttainment: 68.3,
      dncFlagged: 198,
      notInterested: 1490,
      callbacksScheduled: 710,
      avgTalkTimeSec: 165,
      qaSparringScore: 88
    },
    {
      id: 'rep_8',
      name: 'Camille Santos',
      role: 'Outbound Setter',
      avatar: 'CS',
      status: 'Break',
      tenant: 'CloudStaff Outsourcing',
      campaign: 'CloudStaff SaaS Pipeline',
      callsMade: 11100,
      connectRate: 32.3,
      emailsSent: 6500,
      linkedInTouches: 2600,
      appointmentsBooked: 390,
      quotaTarget: 480,
      quotaAttainment: 81.3,
      dncFlagged: 64,
      notInterested: 1210,
      callbacksScheduled: 870,
      avgTalkTimeSec: 164,
      qaSparringScore: 90
    },
    // Vanguard BPO Solutions
    {
      id: 'rep_4',
      name: 'Elena Gomez',
      role: 'Outbound Specialist',
      avatar: 'EG',
      status: 'Break',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Medical BPO',
      callsMade: 11000,
      connectRate: 41.6,
      emailsSent: 6250,
      linkedInTouches: 2510,
      appointmentsBooked: 452,
      quotaTarget: 480,
      quotaAttainment: 94.2,
      dncFlagged: 46,
      notInterested: 875,
      callbacksScheduled: 1045,
      avgTalkTimeSec: 217,
      qaSparringScore: 96
    },
    {
      id: 'rep_9',
      name: 'Michael Chang',
      role: 'B2B SDR',
      avatar: 'MC',
      status: 'Online',
      tenant: 'Vanguard BPO Solutions',
      campaign: 'Vanguard Healthcare Outbound',
      callsMade: 11900,
      connectRate: 35.4,
      emailsSent: 7350,
      linkedInTouches: 2940,
      appointmentsBooked: 436,
      quotaTarget: 480,
      quotaAttainment: 90.8,
      dncFlagged: 82,
      notInterested: 1150,
      callbacksScheduled: 930,
      avgTalkTimeSec: 181,
      qaSparringScore: 92
    }
  ]
};

// Recent Live Activity Stream with Tenant Grounding
const RECENT_ACTIVITY_STREAM: ActivityLogItem[] = [
  {
    id: 'act_1',
    timestamp: '2 mins ago',
    tenant: 'Apex Global BPO',
    repName: 'Emil Halili',
    prospectName: 'Julian Vance',
    companyName: 'Apex Global BPO',
    channel: 'Phone',
    disposition: 'Meeting Booked',
    notesSnippet: 'Confirmed 250 seats CS/Sales floor. Meeting locked for Thursday 2:00 PM with Founder Emil.'
  },
  {
    id: 'act_2',
    timestamp: '6 mins ago',
    tenant: 'Apex Global BPO',
    repName: 'Emil Halili',
    prospectName: 'Jonathan Duarte',
    companyName: 'OmniCloud Technologies',
    channel: 'Email',
    disposition: 'Follow-Up Email',
    notesSnippet: 'Dispatched custom cold email targeting their current outsourcer hold rate drop-off.'
  },
  {
    id: 'act_3',
    timestamp: '11 mins ago',
    tenant: 'Apex Global BPO',
    repName: 'Marcus Brody',
    prospectName: 'Thomas Thorne',
    companyName: 'Apex Virtual Centers',
    channel: 'Phone',
    disposition: 'Not Interested',
    notesSnippet: 'Locked in 2-year broker contract with overseas aggregator. Disqualified for current quarter.'
  },
  {
    id: 'act_4',
    timestamp: '18 mins ago',
    tenant: 'Apex Global BPO',
    repName: 'Carlo Reyes',
    prospectName: 'Denise Howard',
    companyName: 'Pacific BPO Group',
    channel: 'Phone',
    disposition: 'Callback Scheduled',
    notesSnippet: 'Managing Director in board review. Requested redial Monday morning 10:00 AM SGT.'
  },
  {
    id: 'act_5',
    timestamp: '25 mins ago',
    tenant: 'Apex Global BPO',
    repName: 'Emil Halili',
    prospectName: 'Robert Vance',
    companyName: 'Alpha Health Center',
    channel: 'Phone',
    disposition: 'DNC Quarantined',
    notesSnippet: 'Prospect requested Do Not Call. System-wide 100% suppression applied immediately.'
  },
  // ShorePartners BPO
  {
    id: 'act_6',
    timestamp: '7 mins ago',
    tenant: 'ShorePartners BPO',
    repName: 'Sarah Jenkins',
    prospectName: 'Marcus Brody',
    companyName: 'Nexus Call Solutions',
    channel: 'Email',
    disposition: 'Follow-Up Email',
    notesSnippet: 'Dispatched Day 7 Email #3 with 90s Loom teardown link regarding 100% call QA.'
  },
  {
    id: 'act_7',
    timestamp: '15 mins ago',
    tenant: 'ShorePartners BPO',
    repName: 'Liam Torres',
    prospectName: 'Gordon Ramsey',
    companyName: 'Enterprise Cloud Corp',
    channel: 'Phone',
    disposition: 'Meeting Booked',
    notesSnippet: 'Secured 30-min discovery for Enterprise Cloud setter integration.'
  },
  // CloudStaff Outsourcing
  {
    id: 'act_8',
    timestamp: '14 mins ago',
    tenant: 'CloudStaff Outsourcing',
    repName: 'David Vance',
    prospectName: 'Robert Sterling',
    companyName: 'BPO Alliance UK',
    channel: 'Phone',
    disposition: 'DNC Quarantined',
    notesSnippet: 'Prospect explicitly requested Do Not Call. Organization-wide quarantine activated.'
  },
  {
    id: 'act_9',
    timestamp: '20 mins ago',
    tenant: 'CloudStaff Outsourcing',
    repName: 'Camille Santos',
    prospectName: 'Clara Oswald',
    companyName: 'FinTech Growth Partners',
    channel: 'LinkedIn',
    disposition: 'Meeting Booked',
    notesSnippet: 'Accepted connection and booked discovery call on anti-broker seat pricing.'
  },
  // Vanguard BPO Solutions
  {
    id: 'act_10',
    timestamp: '21 mins ago',
    tenant: 'Vanguard BPO Solutions',
    repName: 'Elena Gomez',
    prospectName: 'Elena Rostova',
    companyName: 'ClearDial Telephony',
    channel: 'Phone',
    disposition: 'Callback Scheduled',
    notesSnippet: 'In middle of client shift handover. Requested callback next Tuesday morning 9:00 AM.'
  },
  {
    id: 'act_11',
    timestamp: '29 mins ago',
    tenant: 'Vanguard BPO Solutions',
    repName: 'Michael Chang',
    prospectName: 'Arthur Dent',
    companyName: 'Vanguard MedCare BPO',
    channel: 'Phone',
    disposition: 'Meeting Booked',
    notesSnippet: 'HIPAA compliant SDR floor consultation booked for Thursday 3:00 PM.'
  }
];

export default function RepPerformanceDashboard() {
  const { session, role, isAdmin, tenantName, repName } = useSession();
  const isRepMode = role === 'Rep';
  const isDemo = useDemoWorkspace();

  // Real workspaces report on the activity the team logged (Dialer, Inbox, Outreach).
  const [loggedActivities, setLoggedActivities] = useState<CadenceActivityRecord[]>([]);
  useEffect(() => {
    if (isDemo) return;
    const load = () => setLoggedActivities(getStoredActivities());
    load();
    return subscribeToActivities(load);
  }, [isDemo]);

  const [timePeriod, setTimePeriod] = useState<TimePeriod>('weekly');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('all');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('all');
  const [selectedDispositionFilter, setSelectedDispositionFilter] = useState<string>('all');
  const [searchRepQuery, setSearchRepQuery] = useState('');
  const [sortField, setSortField] = useState<'appointmentsBooked' | 'callsMade' | 'quotaAttainment' | 'connectRate'>('appointmentsBooked');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Bar Graph Visualization State for Admins, Floor Admins, Managers, Supervisors
  const [chartMetric, setChartMetric] = useState<'appointments' | 'outreach' | 'connectRate' | 'qaScore'>('appointments');
  const [viewMode, setViewMode] = useState<'both' | 'graph' | 'table'>('both');
  const [hoveredRepId, setHoveredRepId] = useState<string | null>(null);

  // 1. Get raw period data
  const periodActivities = useMemo(
    () => (isDemo ? [] : activitiesInPeriod(loggedActivities, timePeriod)),
    [isDemo, loggedActivities, timePeriod]
  );
  const rawPeriodReps = useMemo(
    () => (isDemo
      ? MASTER_PERFORMANCE_DATA[timePeriod] || MASTER_PERFORMANCE_DATA.weekly
      : repMetricsFromActivities(periodActivities, tenantName)),
    [isDemo, timePeriod, periodActivities, tenantName]
  );
  const noLoggedActivity = !isDemo && loggedActivities.length === 0;

  // 2. Strict Tenant Scoping:
  // Floor Admins, Tenant Managers, Admins, and Reps ONLY see stats of their organization!
  const organizationReps = useMemo(() => {
    if (!isDemo) return rawPeriodReps;
    const matched = rawPeriodReps.filter(
      (r) => r.tenant.toLowerCase() === tenantName.toLowerCase()
    );
    // If tenant name has no preconfigured mock records, fall back gracefully to the current tenant name
    if (matched.length === 0) {
      return rawPeriodReps.map((r) => ({ ...r, tenant: tenantName }));
    }
    return matched;
  }, [rawPeriodReps, tenantName, isDemo]);

  // Available campaigns in this specific organization
  const availableCampaigns = useMemo(() => {
    const set = new Set<string>();
    organizationReps.forEach((r) => set.add(r.campaign));
    return Array.from(set);
  }, [organizationReps]);

  // 3. Strict Rep Scoping:
  // When the user is in Rep Mode, they MUST ONLY see their own personal stats!
  const currentRepRecord = useMemo(() => {
    const match = organizationReps.find(
      (r) => r.name.toLowerCase() === repName.toLowerCase()
    );
    if (match) return match;
    // Real workspaces never show someone else's numbers as "you".
    return isDemo ? organizationReps[0] : emptyRepMetric(repName || 'You', tenantName);
  }, [organizationReps, repName, isDemo, tenantName]);

  // 4. Filtered Reps List (Role & Tenant Enforced)
  const filteredReps = useMemo(() => {
    if (isRepMode) {
      // Rep Mode: Strictly locked to current logged-in rep
      return currentRepRecord ? [currentRepRecord] : [];
    }

    // Floor Admin / Tenant Manager Mode: Filter within active organization
    return organizationReps
      .filter((r) => {
        const matchesRep = selectedRepFilter === 'all' || r.id === selectedRepFilter;
        const matchesCampaign = selectedCampaignFilter === 'all' || r.campaign === selectedCampaignFilter;
        const matchesSearch =
          searchRepQuery.trim() === '' ||
          r.name.toLowerCase().includes(searchRepQuery.toLowerCase()) ||
          r.campaign.toLowerCase().includes(searchRepQuery.toLowerCase());
        return matchesRep && matchesCampaign && matchesSearch;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
      });
  }, [
    isRepMode,
    currentRepRecord,
    organizationReps,
    selectedRepFilter,
    selectedCampaignFilter,
    searchRepQuery,
    sortField,
    sortAsc
  ]);

  // 5. Dynamic Scaling & Benchmarks for the Bar Graph Visualizer
  const chartData = useMemo(() => {
    const list = filteredReps;
    if (list.length === 0) {
      return {
        maxBooked: 1,
        maxOutreach: 1,
        maxConnect: 100,
        maxQa: 100,
        avgConnectTeam: '0.0',
        avgBookedTeam: '0.0',
        topPerformer: null
      };
    }

    const maxBooked = Math.max(...list.map((r) => Math.max(r.appointmentsBooked, r.quotaTarget)), 1);
    const maxOutreach = Math.max(...list.map((r) => r.callsMade + r.emailsSent + r.linkedInTouches), 1);
    const maxConnect = Math.max(...list.map((r) => r.connectRate), 50);
    const maxQa = 100;

    const avgConnectTeam = (list.reduce((sum, r) => sum + r.connectRate, 0) / list.length).toFixed(1);
    const avgBookedTeam = (list.reduce((sum, r) => sum + r.appointmentsBooked, 0) / list.length).toFixed(1);
    
    let topRep = list[0];
    if (chartMetric === 'appointments') {
      topRep = [...list].sort((a, b) => b.appointmentsBooked - a.appointmentsBooked)[0];
    } else if (chartMetric === 'outreach') {
      topRep = [...list].sort((a, b) => (b.callsMade + b.emailsSent + b.linkedInTouches) - (a.callsMade + a.emailsSent + a.linkedInTouches))[0];
    } else if (chartMetric === 'connectRate') {
      topRep = [...list].sort((a, b) => b.connectRate - a.connectRate)[0];
    } else if (chartMetric === 'qaScore') {
      topRep = [...list].sort((a, b) => b.qaSparringScore - a.qaSparringScore)[0];
    }

    return {
      maxBooked,
      maxOutreach,
      maxConnect,
      maxQa,
      avgConnectTeam,
      avgBookedTeam,
      topPerformer: topRep
    };
  }, [filteredReps, chartMetric]);

  // 6. Aggregated Metrics (Calculated Strictly for Rep or Scoped Organization)
  const aggregateStats = useMemo(() => {
    const list = filteredReps;
    const totalCalls = list.reduce((sum, r) => sum + r.callsMade, 0);
    const totalEmails = list.reduce((sum, r) => sum + r.emailsSent, 0);
    const totalLinkedIn = list.reduce((sum, r) => sum + r.linkedInTouches, 0);
    const totalOutreach = totalCalls + totalEmails + totalLinkedIn;
    const totalBooked = list.reduce((sum, r) => sum + r.appointmentsBooked, 0);
    const totalTarget = list.reduce((sum, r) => sum + r.quotaTarget, 0);
    const totalDnc = list.reduce((sum, r) => sum + r.dncFlagged, 0);
    const totalNotInterested = list.reduce((sum, r) => sum + r.notInterested, 0);
    const totalCallbacks = list.reduce((sum, r) => sum + r.callbacksScheduled, 0);
    const avgConnect = list.length > 0 ? (list.reduce((sum, r) => sum + r.connectRate, 0) / list.length).toFixed(1) : '0';
    const avgScore = list.length > 0 ? Math.round(list.reduce((sum, r) => sum + r.qaSparringScore, 0) / list.length) : 0;
    const quotaPct = totalTarget > 0 ? ((totalBooked / totalTarget) * 100).toFixed(1) : '0';

    return {
      totalOutreach,
      totalCalls,
      totalEmails,
      totalLinkedIn,
      totalBooked,
      totalTarget,
      quotaPct,
      totalDnc,
      totalNotInterested,
      totalCallbacks,
      avgConnect,
      avgScore
    };
  }, [filteredReps]);

  // 6. Live Activity Stream Filtered by Role and Tenant
  const filteredActivities = useMemo(() => {
    const stream = isDemo ? RECENT_ACTIVITY_STREAM : activityLogFromRecords(periodActivities, tenantName);
    return stream.filter((act) => {
      // Must match active tenant
      const matchesTenant = act.tenant.toLowerCase() === tenantName.toLowerCase();
      if (!matchesTenant) return false;

      // In Rep mode: strictly only show current rep's activities
      if (isRepMode) {
        return act.repName.toLowerCase() === repName.toLowerCase();
      }

      // In Admin/Manager mode: allow rep filtering if selected
      if (selectedRepFilter !== 'all') {
        const repObj = organizationReps.find((r) => r.id === selectedRepFilter);
        if (repObj && act.repName.toLowerCase() !== repObj.name.toLowerCase()) {
          return false;
        }
      }

      // Disposition filter
      if (selectedDispositionFilter !== 'all') {
        if (selectedDispositionFilter === 'Meeting Booked' && act.disposition !== 'Meeting Booked') return false;
        if (selectedDispositionFilter === 'DNC Quarantined' && act.disposition !== 'DNC Quarantined') return false;
        if (selectedDispositionFilter === 'Not Interested' && act.disposition !== 'Not Interested') return false;
        if (selectedDispositionFilter === 'Callback Scheduled' && act.disposition !== 'Callback Scheduled') return false;
      }

      return true;
    });
  }, [tenantName, isRepMode, repName, selectedRepFilter, selectedDispositionFilter, organizationReps, isDemo, periodActivities]);

  // Export CSV Report Action
  const handleExportCSV = () => {
    const headers = ['Rep Name', 'Tenant', 'Campaign', 'Calls Made', 'Connect Rate %', 'Emails Sent', 'LinkedIn Touches', 'Booked', 'Quota Target', 'Attainment %', 'DNC', 'Not Interested', 'Callbacks', 'QA Score'];
    const rows = filteredReps.map((r) => [
      `"${r.name}"`,
      `"${r.tenant}"`,
      `"${r.campaign}"`,
      r.callsMade,
      `${r.connectRate}%`,
      r.emailsSent,
      r.linkedInTouches,
      r.appointmentsBooked,
      r.quotaTarget,
      `${r.quotaAttainment}%`,
      r.dncFlagged,
      r.notInterested,
      r.callbacksScheduled,
      r.qaSparringScore
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${isRepMode ? repName.replace(/\s+/g, '_') : tenantName.replace(/\s+/g, '_')}_performance_${timePeriod}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 bg-app text-fg font-sans antialiased overflow-hidden">

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        <div className="max-w-7xl w-full mx-auto px-4 py-6 md:px-8 space-y-6">
          
          {/* TOP BANNER & TIMEFRAME SELECTOR */}
          <PageHeader
            className="pb-0"
            title={isRepMode ? `${repName}'s performance` : `${tenantName} performance`}
            description={isRepMode 
              ? `Your calls, bookings and progress to target.` 
              : `Calls, emails, meetings booked and do-not-call compliance across ${tenantName}.`}
            meta={
              <>
                <span className="inline-flex items-center gap-1.5 text-small text-fg-secondary">
                  {isRepMode ? (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      <span>Your stats only</span>
                    </>
                  ) : (
                    <>
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{tenantName} floor ({role})</span>
                    </>
                  )}
                </span>
                {/* Timeframe Selector (Daily, Weekly, Monthly, Quarterly, Yearly) */}
                <SegmentedControl
                  label="Date range"
                  size="sm"
                  value={timePeriod}
                  onChange={(period) => setTimePeriod(period as TimePeriod)}
                  items={(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as TimePeriod[]).map((period) => ({
                    value: period,
                    label: period === 'daily' ? 'Today' : period === 'weekly' ? 'This week' : period === 'monthly' ? 'This month' : period === 'quarterly' ? 'This quarter' : 'This year',
                  }))}
                />
              </>
            }
            secondaryActions={
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCSV}
                title="Export Data as CSV"
                icon={<Download />}
              >
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            }
          />

          {noLoggedActivity ? (
            <div className="rounded-lg border border-line bg-surface shadow-xs">
              <EmptyState
                icon={<PhoneCall />}
                title="No calls logged yet"
                description="Calls, emails and meetings your team logs from the Dialer and Outreach will show up here."
                action={
                  <Link href="/dialer" className={buttonClasses('primary', 'sm')}>
                    Open the Dialer
                  </Link>
                }
              />
            </div>
          ) : (<>

          {/* GRANULAR FILTER TOOLBAR */}
          <div className="bg-surface border border-line rounded-lg p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-body-strong text-fg">
              <div className="flex items-center gap-1.5">
                <Filter className="h-4 w-4 text-fg-secondary" />
                <span>
                  {isRepMode ? 'Showing your stats' : `Filters (${tenantName})`}
                </span>
              </div>
              {!isRepMode && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRepFilter('all');
                    setSelectedCampaignFilter('all');
                    setSelectedDispositionFilter('all');
                    setSearchRepQuery('');
                  }}
                  className="focus-ring rounded-sm text-small text-fg-secondary hover:text-fg hover:underline cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-body">
              {/* Filter 1: By Rep */}
              <div>
                <label className="text-caption text-fg-secondary block mb-1">
                  Rep
                </label>
                {isRepMode ? (
                  // LOCKED VIEW FOR REP: STRICT PERSONAL STATS ONLY
                  <div className="flex h-9 items-center justify-between px-3 bg-subtle border border-line rounded-sm text-body text-fg">
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2 h-2 rounded-full bg-success-500 shrink-0" />
                      <span className="truncate">{repName} (your stats only)</span>
                    </div>
                    <span className="text-caption text-fg-tertiary shrink-0 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      <span>Locked</span>
                    </span>
                  </div>
                ) : (
                  // ADMIN / MANAGER VIEW: SCOPED ONLY TO THIS TENANT'S REPS
                  <select
                    value={selectedRepFilter}
                    onChange={(e) => setSelectedRepFilter(e.target.value)}
                    className="focus-ring w-full h-9 bg-surface border border-line-strong rounded-sm px-3 text-body text-fg focus:outline-none focus:border-brand-600"
                  >
                    <option value="all">All {tenantName} Reps ({organizationReps.length})</option>
                    {organizationReps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Filter 2: By Campaign */}
              <div>
                <label className="text-caption text-fg-secondary block mb-1">
                  Campaign
                </label>
                {isRepMode ? (
                  // Rep View: Shows their active campaign
                  <div className="h-9 px-3 bg-subtle border border-line rounded-sm text-body text-fg truncate flex items-center justify-between">
                    <span className="truncate">{currentRepRecord?.campaign || tenantName}</span>
                    <span className="text-caption text-fg-tertiary shrink-0">Assigned</span>
                  </div>
                ) : (
                  // Admin View: Strictly campaigns belonging to this organization
                  <select
                    value={selectedCampaignFilter}
                    onChange={(e) => setSelectedCampaignFilter(e.target.value)}
                    className="focus-ring w-full h-9 bg-surface border border-line-strong rounded-sm px-3 text-body text-fg focus:outline-none focus:border-brand-600"
                  >
                    <option value="all">All {tenantName} Campaigns ({availableCampaigns.length})</option>
                    {availableCampaigns.map((camp) => (
                      <option key={camp} value={camp}>
                        {camp}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Filter 3: By Disposition */}
              <div>
                <label className="text-caption text-fg-secondary block mb-1">
                  Outcome
                </label>
                <select
                  value={selectedDispositionFilter}
                  onChange={(e) => setSelectedDispositionFilter(e.target.value)}
                  className="focus-ring w-full h-9 bg-surface border border-line-strong rounded-sm px-3 text-body text-fg focus:outline-none focus:border-brand-600"
                >
                  <option value="all">All outcomes</option>
                  <option value="Meeting Booked">Meeting Booked</option>
                  <option value="DNC Quarantined">DNC Quarantined</option>
                  <option value="Not Interested">Not Interested</option>
                  <option value="Callback Scheduled">Callback / Carry-Over</option>
                </select>
              </div>

              {/* Filter 4: Search Box */}
              <div>
                <label className="text-caption text-fg-secondary block mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-tertiary" />
                  <input
                    type="text"
                    value={searchRepQuery}
                    onChange={(e) => setSearchRepQuery(e.target.value)}
                    placeholder={isRepMode ? "Filter activities..." : "Search rep or account..."}
                    className="focus-ring w-full h-9 pl-9 pr-3 bg-surface border border-line-strong rounded-sm text-body text-fg placeholder:text-fg-disabled focus:outline-none focus:border-brand-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TOP 5 MASTER METRICS CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Card 1: Appointments Booked */}
            <StatTile
              label={isRepMode ? 'Your bookings' : 'Meetings booked'}
              value={aggregateStats.totalBooked}
              target={`${aggregateStats.totalTarget} target`}
              hint={<span className="tabular-nums">{aggregateStats.quotaPct}% of target, 88.9% hold rate</span>}
            />

            {/* Card 2: Total Activities */}
            <StatTile
              label={isRepMode ? 'Your total outreach' : 'Total outreach'}
              value={aggregateStats.totalOutreach}
              hint={<span className="tabular-nums">{aggregateStats.totalCalls} calls, {aggregateStats.totalEmails} emails, {aggregateStats.totalLinkedIn} LinkedIn</span>}
            />

            {/* Card 3: DNC Quarantine Compliance */}
            <StatTile
              label={isRepMode ? 'Your do-not-call flags' : 'Do-not-call flagged'}
              value={aggregateStats.totalDnc}
              hint={
                <span className="inline-flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>Blocked across the organization</span>
                </span>
              }
            />

            {/* Card 4: Not Interested / Disqualified */}
            <StatTile
              label={isRepMode ? 'Your not interested' : 'Not interested'}
              value={aggregateStats.totalNotInterested}
              hint="Top reasons: 48% broker locked, 32% budget"
            />

            {/* Card 5: Carry-Over / Follow-ups Due */}
            <StatTile
              label={isRepMode ? 'Your follow-ups' : 'Follow-ups carried over'}
              value={aggregateStats.totalCallbacks}
              hint="In next week's follow-up queue"
            />
          </div>

          {/* REPS PERFORMANCE & ACTIVITY VISUALIZER (BAR GRAPH + ROSTER) */}
          <div className="bg-surface border border-line rounded-lg p-5 shadow-xs space-y-5">
            {/* Header with Title and Mode Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-h2 text-fg">
                  {isRepMode
                    ? 'Your performance and progress to target'
                    : `Rep performance at ${tenantName}`}
                </h2>
                <p className="text-small text-fg-secondary mt-0.5">
                  {isRepMode
                    ? `Bookings, outreach by channel and call quality scores for ${repName}.`
                    : `Compare reps side by side in ${tenantName}.`}
                </p>
              </div>

              {/* View Mode Controls: Split View / Graph Only / Table Only */}
              <div className="flex flex-wrap items-center gap-2 text-body">
                {/* View Mode Switcher */}
                <div role="group" aria-label="View" className="inline-flex items-center rounded-md border border-line bg-subtle p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('both')}
                    aria-pressed={viewMode === 'both'}
                    className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                      viewMode === 'both' ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Split view</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('graph')}
                    aria-pressed={viewMode === 'graph'}
                    className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                      viewMode === 'graph' ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    aria-pressed={viewMode === 'table'}
                    className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                      viewMode === 'table' ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    <span>Table</span>
                  </button>
                </div>

                {/* Sort selector (Shown when Table is in view) */}
                {(viewMode === 'both' || viewMode === 'table') && !isRepMode && (
                  <div className="flex items-center gap-1 pl-2 border-l border-line">
                    <span className="text-small text-fg-tertiary mr-1">Sort</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (sortField === 'appointmentsBooked') setSortAsc(!sortAsc);
                        else { setSortField('appointmentsBooked'); setSortAsc(false); }
                      }}
                      aria-pressed={sortField === 'appointmentsBooked'}
                      className={`focus-ring h-8 px-3 rounded-md border text-small font-medium cursor-pointer transition-colors ${
                        sortField === 'appointmentsBooked' ? 'bg-subtle text-fg border-line-strong' : 'bg-surface border-line text-fg-secondary hover:bg-subtle hover:text-fg'
                      }`}
                    >
                      Bookings {sortField === 'appointmentsBooked' ? (sortAsc ? '↑' : '↓') : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (sortField === 'callsMade') setSortAsc(!sortAsc);
                        else { setSortField('callsMade'); setSortAsc(false); }
                      }}
                      aria-pressed={sortField === 'callsMade'}
                      className={`focus-ring h-8 px-3 rounded-md border text-small font-medium cursor-pointer transition-colors ${
                        sortField === 'callsMade' ? 'bg-subtle text-fg border-line-strong' : 'bg-surface border-line text-fg-secondary hover:bg-subtle hover:text-fg'
                      }`}
                    >
                      Calls {sortField === 'callsMade' ? (sortAsc ? '↑' : '↓') : ''}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* COMPONENT: INTERACTIVE BAR GRAPH VISUALIZER                                */}
            {/* ========================================================================= */}
            {(viewMode === 'both' || viewMode === 'graph') && (
              <div className="p-4 sm:p-5 rounded-lg border border-line space-y-4">
                {/* Metric Switcher Toolbar & Insights Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-line">
                  {/* Metric Switcher Pills */}
                  <div role="group" aria-label="Chart metric" className="inline-flex flex-wrap items-center rounded-md border border-line bg-subtle p-0.5">
                    <button
                      type="button"
                      onClick={() => setChartMetric('appointments')}
                      aria-pressed={chartMetric === 'appointments'}
                      className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        chartMetric === 'appointments'
                          ? 'bg-surface text-fg shadow-xs'
                          : 'text-fg-secondary hover:text-fg'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Booked vs target</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setChartMetric('outreach')}
                      aria-pressed={chartMetric === 'outreach'}
                      className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        chartMetric === 'outreach'
                          ? 'bg-surface text-fg shadow-xs'
                          : 'text-fg-secondary hover:text-fg'
                      }`}
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      <span>Outreach by channel</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setChartMetric('connectRate')}
                      aria-pressed={chartMetric === 'connectRate'}
                      className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        chartMetric === 'connectRate'
                          ? 'bg-surface text-fg shadow-xs'
                          : 'text-fg-secondary hover:text-fg'
                      }`}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>Connect rate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setChartMetric('qaScore')}
                      aria-pressed={chartMetric === 'qaScore'}
                      className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        chartMetric === 'qaScore'
                          ? 'bg-surface text-fg shadow-xs'
                          : 'text-fg-secondary hover:text-fg'
                      }`}
                    >
                      <Award className="h-3.5 w-3.5" />
                      <span>Call quality score</span>
                    </button>
                  </div>

                  {/* Floor Intelligence / Benchmark Legend */}
                  <div className="flex flex-wrap items-center gap-3 text-small">
                    {chartData.topPerformer && (
                      <div className="flex items-center gap-1.5 text-fg">
                        <Award className="h-4 w-4 text-fg-secondary" />
                        <span className="text-fg-secondary">Top:</span>
                        <span className="text-body-strong">{chartData.topPerformer.name}</span>
                        <span className="tabular-nums text-fg-secondary">
                          {chartMetric === 'appointments' && `${chartData.topPerformer.appointmentsBooked} Booked (${chartData.topPerformer.quotaAttainment}%)`}
                          {chartMetric === 'outreach' && `${chartData.topPerformer.callsMade + chartData.topPerformer.emailsSent + chartData.topPerformer.linkedInTouches} Outreach`}
                          {chartMetric === 'connectRate' && `${chartData.topPerformer.connectRate}% Connect`}
                          {chartMetric === 'qaScore' && `${chartData.topPerformer.qaSparringScore}/100`}
                        </span>
                      </div>
                    )}

                    {/* Chart Legend */}
                    <div className="flex items-center gap-3 text-caption text-fg-secondary">
                      {chartMetric === 'appointments' && (
                        <>
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-chart-1" />
                            <span>Booked</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-chart-target" />
                            <span>Target</span>
                          </span>
                        </>
                      )}
                      {chartMetric === 'outreach' && (
                        <>
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-chart-1" />
                            <span>Calls</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-chart-2" />
                            <span>Emails</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-chart-3" />
                            <span>LinkedIn</span>
                          </span>
                        </>
                      )}
                      {chartMetric === 'connectRate' && (
                        <span className="flex items-center gap-1 text-fg tabular-nums">
                          <span>Team average: {chartData.avgConnectTeam}%</span>
                        </span>
                      )}
                      {chartMetric === 'qaScore' && (
                        <span className="flex items-center gap-1 text-fg tabular-nums">
                          <span>Passing score: 85/100</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* The Bar Graph Grid */}
                <div className="relative pt-6 pb-2">
                  {/* Benchmark Guideline for Connect Rate or QA Score */}
                  {chartMetric === 'connectRate' && (
                    <div 
                      className="absolute w-full border-t border-dashed border-chart-target z-10 pointer-events-none flex items-center justify-end pr-2"
                      style={{ bottom: `calc(75px + ${(Number(chartData.avgConnectTeam) / chartData.maxConnect) * 190}px)` }}
                    >
                      <span className="text-caption tabular-nums bg-surface text-fg-secondary border border-line px-1.5 rounded-sm -translate-y-1/2">
                        Average: {chartData.avgConnectTeam}%
                      </span>
                    </div>
                  )}

                  {chartMetric === 'qaScore' && (
                    <div 
                      className="absolute w-full border-t border-dashed border-chart-target z-10 pointer-events-none flex items-center justify-end pr-2"
                      style={{ bottom: `calc(75px + ${(85 / 100) * 190}px)` }}
                    >
                      <span className="text-caption tabular-nums bg-surface text-fg-secondary border border-line px-1.5 rounded-sm -translate-y-1/2">
                        Passing score: 85/100
                      </span>
                    </div>
                  )}

                  {/* Columns Canvas */}
                  <div className="h-64 flex items-end justify-around gap-2 sm:gap-6 px-2 sm:px-6">
                    {filteredReps.map((r) => {
                      const isHovered = hoveredRepId === r.id;
                      const totalOutreach = r.callsMade + r.emailsSent + r.linkedInTouches;

                      return (
                        <div
                          key={r.id}
                          onMouseEnter={() => setHoveredRepId(r.id)}
                          onMouseLeave={() => setHoveredRepId(null)}
                          className={`flex-1 min-w-0 max-w-[140px] flex flex-col items-center justify-end h-full rounded-md transition-colors cursor-pointer group ${
                            isHovered ? 'bg-subtle' : ''
                          }`}
                        >
                          {/* Top Value Badges */}
                          <div className="mb-2 text-center select-none">
                            {chartMetric === 'appointments' && (
                              <div className="flex flex-col items-center">
                                <span className={`text-caption tabular-nums ${
                                  r.quotaAttainment >= 90 ? 'text-success-fg' : 'text-fg-secondary'
                                }`}>
                                  {r.quotaAttainment}%
                                </span>
                                <span className="text-body-strong text-fg mt-0.5 tabular-nums">
                                  {r.appointmentsBooked}<span className="text-caption text-fg-tertiary font-normal">/{r.quotaTarget}</span>
                                </span>
                              </div>
                            )}

                            {chartMetric === 'outreach' && (
                              <div className="flex flex-col items-center">
                                <span className="text-caption tabular-nums text-fg">
                                  {totalOutreach}
                                </span>
                              </div>
                            )}

                            {chartMetric === 'connectRate' && (
                              <div className="flex flex-col items-center">
                                <span className="text-caption tabular-nums text-fg">
                                  {r.connectRate}%
                                </span>
                              </div>
                            )}

                            {chartMetric === 'qaScore' && (
                              <div className="flex flex-col items-center">
                                <span className={`text-caption tabular-nums ${
                                  r.qaSparringScore >= 90 ? 'text-fg' : 'text-fg-secondary'
                                }`}>
                                  {r.qaSparringScore}/100
                                </span>
                              </div>
                            )}
                          </div>

                          {/* The Rendered Bar */}
                          <div className="w-full h-44 flex items-end justify-center relative">
                            {/* METRIC 1: Appointments vs Quota Dual Bar */}
                            {chartMetric === 'appointments' && (
                              <div className="w-full flex items-end justify-center gap-1.5 h-full">
                                {/* Booked Appointments Bar */}
                                <div
                                  style={{ height: `${Math.max((r.appointmentsBooked / chartData.maxBooked) * 100, 8)}%` }}
                                  className="w-1/2 max-w-[36px] bg-chart-1 rounded-t-sm transition-all duration-300 group-hover:opacity-90 relative"
                                >
                                  {r.appointmentsBooked >= r.quotaTarget && (
                                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-success-fg" aria-label="Target hit">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </span>
                                  )}
                                </div>

                                {/* Target Quota Bar (Ghost Reference) */}
                                <div
                                  style={{ height: `${Math.max((r.quotaTarget / chartData.maxBooked) * 100, 8)}%` }}
                                  className="w-1/2 max-w-[36px] bg-subtle border border-b-0 border-dashed border-chart-target rounded-t-sm transition-all duration-300"
                                  title={`Target: ${r.quotaTarget}`}
                                />
                              </div>
                            )}

                            {/* METRIC 2: Outreach Volume Multi-Channel Stacked Bar */}
                            {chartMetric === 'outreach' && (
                              <div
                                style={{ height: `${Math.max((totalOutreach / chartData.maxOutreach) * 100, 8)}%` }}
                                className="w-full max-w-[50px] rounded-t-sm overflow-hidden flex flex-col justify-end transition-all duration-300 group-hover:opacity-90"
                              >
                                {/* Top: LinkedIn Touches */}
                                <div
                                  style={{ height: `${totalOutreach > 0 ? (r.linkedInTouches / totalOutreach) * 100 : 0}%` }}
                                  className="w-full bg-chart-3 transition-all"
                                  title={`LinkedIn: ${r.linkedInTouches}`}
                                />
                                {/* Mid: Emails Sent */}
                                <div
                                  style={{ height: `${totalOutreach > 0 ? (r.emailsSent / totalOutreach) * 100 : 0}%` }}
                                  className="w-full bg-chart-2 transition-all"
                                  title={`Emails: ${r.emailsSent}`}
                                />
                                {/* Base: Phone Dials */}
                                <div
                                  style={{ height: `${totalOutreach > 0 ? (r.callsMade / totalOutreach) * 100 : 0}%` }}
                                  className="w-full bg-chart-1 transition-all"
                                  title={`Dials: ${r.callsMade}`}
                                />
                              </div>
                            )}

                            {/* METRIC 3: Connect Rate % Bar */}
                            {chartMetric === 'connectRate' && (
                              <div
                                style={{ height: `${Math.max((r.connectRate / chartData.maxConnect) * 100, 8)}%` }}
                                className="w-full max-w-[50px] bg-chart-1 rounded-t-sm transition-all duration-300 group-hover:opacity-90"
                              />
                            )}

                            {/* METRIC 4: QA Sparring Score Bar */}
                            {chartMetric === 'qaScore' && (
                              <div
                                style={{ height: `${Math.max((r.qaSparringScore / chartData.maxQa) * 100, 8)}%` }}
                                className="w-full max-w-[50px] bg-chart-1 rounded-t-sm transition-all duration-300 group-hover:opacity-90"
                              />
                            )}
                          </div>

                          {/* X-Axis: Rep Profile Capsule */}
                          <div className="mt-3 pt-2 border-t border-line w-full flex flex-col items-center text-center">
                            <div className="w-7 h-7 shrink-0 rounded-full bg-subtle text-ink-700 flex items-center justify-center text-caption">
                              {r.avatar}
                            </div>
                            <span className="text-small font-medium text-fg mt-1 truncate max-w-[110px]">
                              {r.name}
                            </span>
                            <span className="text-caption text-fg-tertiary truncate max-w-[110px]">
                              {r.campaign}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rep Detail Tooltip Bar on Hover */}
                {hoveredRepId && (
                  <div className="p-3 bg-subtle rounded-md flex flex-wrap items-center justify-between gap-3 text-small animate-in fade-in duration-100">
                    {(() => {
                      const rep = filteredReps.find(r => r.id === hoveredRepId);
                      if (!rep) return null;
                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-surface border border-line text-ink-700 flex items-center justify-center text-caption">
                              {rep.avatar}
                            </div>
                            <div>
                              <strong className="text-fg">{rep.name}</strong>
                              <span className="text-fg-tertiary mx-1.5">&middot;</span>
                              <span className="text-fg-tertiary">{rep.campaign} ({rep.role})</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 tabular-nums text-small text-fg-secondary">
                            <span>Calls: <strong className="text-fg">{rep.callsMade}</strong></span>
                            <span>Connect: <strong className="text-fg">{rep.connectRate}%</strong></span>
                            <span>Emails: <strong className="text-fg">{rep.emailsSent}</strong></span>
                            <span>LinkedIn: <strong className="text-fg">{rep.linkedInTouches}</strong></span>
                            <span className="text-fg font-medium">
                              Booked: {rep.appointmentsBooked}/{rep.quotaTarget} ({rep.quotaAttainment}%)
                            </span>
                            <span>Quality: <strong className="text-fg">{rep.qaSparringScore}/100</strong></span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* DATA ROSTER TABLE                                                         */}
            {/* ========================================================================= */}
            {(viewMode === 'both' || viewMode === 'table') && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-body">
                <thead className="bg-subtle text-caption text-fg-tertiary">
                  <tr>
                    <th className="py-2.5 px-3.5 font-medium">Rep and campaign</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 text-right font-medium">Calls</th>
                    <th className="py-2.5 px-3 text-right font-medium">Connect %</th>
                    <th className="py-2.5 px-3 text-right font-medium">Emails</th>
                    <th className="py-2.5 px-3 text-right font-medium">LinkedIn</th>
                    <th className="py-2.5 px-3.5 text-right font-medium">Booked</th>
                    <th className="py-2.5 px-3 text-right font-medium">Target %</th>
                    <th className="py-2.5 px-3 text-right font-medium"><Tooltip content="Do not call: numbers flagged and blocked">DNC</Tooltip></th>
                    <th className="py-2.5 px-3 text-right font-medium">Not interested</th>
                    <th className="py-2.5 px-3 text-right font-medium">Callbacks</th>
                    <th className="py-2.5 px-3 text-right font-medium">Quality score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredReps.map((r, idx) => (
                    <tr 
                      key={r.id} 
                      className={`transition-colors ${
                        isRepMode ? 'hover:bg-subtle' : 'hover:bg-subtle'
                      }`}
                    >
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 shrink-0 rounded-full bg-subtle text-ink-700 flex items-center justify-center text-caption">
                            {r.avatar}
                          </div>
                          <div>
                            <div className="text-body-strong text-fg flex items-center gap-1.5">
                              <span>{r.name}</span>
                              {isRepMode ? (
                                <Badge tone="neutral">You</Badge>
                              ) : (
                                idx === 0 && (
                                  <span className="inline-flex items-center gap-1 text-caption text-fg-secondary">
                                    <Award className="h-3.5 w-3.5" />
                                    Top
                                  </span>
                                )
                              )}
                            </div>
                            <div className="text-small text-fg-tertiary">
                              {r.campaign} &middot; {r.role}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1.5 text-small whitespace-nowrap ${
                          r.status === 'In Call'
                            ? 'text-success-fg'
                            : r.status === 'Online'
                            ? 'text-fg'
                            : r.status === 'Break'
                            ? 'text-warning-fg'
                            : 'text-fg-secondary'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            r.status === 'In Call' ? 'bg-success-500' : r.status === 'Online' ? 'bg-success-500' : r.status === 'Break' ? 'bg-warning-400' : 'bg-fg-disabled'
                          }`} />
                          {r.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums text-fg">
                        {r.callsMade}
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums text-fg">
                        {r.connectRate}%
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums text-fg">
                        {r.emailsSent}
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums text-fg">
                        {r.linkedInTouches}
                      </td>

                      <td className="py-3 px-3.5 text-right tabular-nums text-body-strong text-fg">
                        {r.appointmentsBooked}
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums">
                        <span className={`${
                          r.quotaAttainment >= 90 ? 'text-success-fg' : r.quotaAttainment >= 70 ? 'text-fg' : 'text-warning-fg'
                        }`}>
                          {r.quotaAttainment}%
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums text-fg">
                        {r.dncFlagged}
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums text-fg-secondary">
                        {r.notInterested}
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums text-fg">
                        {r.callbacksScheduled}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <span className="tabular-nums text-fg">
                          {r.qaSparringScore}/100
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>

          {/* TWO-COLUMN LOWER SECTION: CADENCE CONVERSION FUNNEL & LIVE ACTIVITY STREAM */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: 27-Day Cadence Funnel Analysis (6 cols) */}
            <div className="lg:col-span-6 bg-surface border border-line rounded-lg p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-h3 text-fg">
                    {isRepMode ? 'Your follow-up sequence funnel' : `${tenantName} follow-up sequence funnel`}
                  </h3>
                  <p className="text-small text-fg-secondary">
                    How many prospects stay in at each step of the 21-day sequence.
                  </p>
                </div>
                <span className="text-small tabular-nums text-fg-secondary shrink-0">
                  {aggregateStats.totalBooked} total bookings
                </span>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { stage: 'Day 1: Initial Hook (Email #1 & LI #1)', count: aggregateStats.totalOutreach, pct: '100%', drop: 'Baseline' },
                  { stage: 'Day 2: The Phone Push (Phone #1)', count: Math.round(aggregateStats.totalOutreach * 0.72), pct: '72%', drop: '-28%' },
                  { stage: 'Day 3: Voicemail Drop + Synergy Email #2', count: Math.round(aggregateStats.totalOutreach * 0.48), pct: '48%', drop: '-24%' },
                  { stage: 'Day 7: Value Add 90s Teardown (Email #3)', count: Math.round(aggregateStats.totalOutreach * 0.35), pct: '35%', drop: '-13%' },
                  { stage: 'Day 9: Shifted Phone Call (Phone #3)', count: Math.round(aggregateStats.totalOutreach * 0.24), pct: '24%', drop: '-11%' },
                  { stage: 'Day 15: Pivot Angle Reverse Sell (Phone #4)', count: Math.round(aggregateStats.totalOutreach * 0.16), pct: '16%', drop: '-8%' },
                  { stage: 'Executive Meeting Locked & Verified', count: aggregateStats.totalBooked, pct: `${aggregateStats.quotaPct}%`, drop: 'Target Hit' },
                ].map((st, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-small">
                      <span className="text-fg">{st.stage}</span>
                      <span className="tabular-nums text-fg-tertiary shrink-0">{st.count} prospects ({st.pct})</span>
                    </div>
                    <div className="w-full bg-subtle h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          i === 6 ? 'bg-chart-3' : 'bg-chart-1'
                        }`}
                        style={{ width: st.pct.includes('%') ? st.pct : '20%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Live Activity & Telemetry Feed (6 cols) */}
            <div className="lg:col-span-6 bg-surface border border-line rounded-lg p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-h3 text-fg">
                    {isRepMode ? 'Your recent activity' : `Recent activity at ${tenantName}`}
                  </h3>
                  <p className="text-small text-fg-secondary">
                    Calls, emails and call outcomes as they happen.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-small tabular-nums text-fg-tertiary">
                    {filteredActivities.length} events
                  </span>
                  <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
                </div>
              </div>

              <div className="space-y-3 pt-1">
                {filteredActivities.length === 0 ? (
                  <div className="p-6 text-center text-small text-fg-secondary rounded-lg border border-dashed border-line">
                    No activity matches these filters.
                  </div>
                ) : (
                  filteredActivities.map((act) => (
                    <div key={act.id} className="p-3 border border-line rounded-md space-y-1 text-small">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-fg">{act.repName}</strong>
                          <span className="text-fg-tertiary">&rarr;</span>
                          <span className="text-fg">{act.prospectName} ({act.companyName})</span>
                        </div>
                        <span className="text-caption tabular-nums text-fg-tertiary shrink-0">{act.timestamp}</span>
                      </div>

                      <div className="flex items-center gap-2 pt-0.5">
                        <span className={`inline-flex h-5 items-center rounded-sm px-1.5 text-caption whitespace-nowrap ${
                          act.disposition === 'Meeting Booked'
                            ? 'bg-success-bg text-success-fg'
                            : act.disposition === 'DNC Quarantined'
                            ? 'bg-danger-bg text-danger-fg'
                            : act.disposition === 'Callback Scheduled'
                            ? 'bg-subtle text-fg'
                            : 'bg-subtle text-fg-secondary'
                        }`}>
                          {act.disposition}
                        </span>
                        <span className="text-caption text-fg-tertiary">
                          Channel: {act.channel}
                        </span>
                      </div>

                      <p className="text-small text-fg-secondary pt-1">
                        {act.notesSnippet}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          </>)}
        </div>
      </div>
    </div>
  );
}

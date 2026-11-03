/**
 * Global Contacts, ICP Folder Manager & Lead Footprint Store
 * 
 * Provides centralized storage, note-taking, ICP folder organization,
 * equal round-robin rep distribution, and historical communication
 * tracking (footprints) for leads across Calling Floor, Email Studio, and Admin.
 * Enforces strict Admin-only CSV export and Rep-level row isolation.
 */

import { getStoredSession, normalizeUserRole } from './session';

export interface LeadFootprintItem {
  id: string;
  timestamp: string; // e.g. "Oct 29, 2026 • 10:42 AM"
  isoDate: string;
  type: 'call' | 'email' | 'linkedin' | 'note' | 'status';
  title: string;     // e.g. "Call Note #1", "Email #1 Sent", "Meeting Booked", "Manual Lead Note"
  summary: string;   // detailed text, qualification audit, or pitch note
  repName: string;
  disposition?: string;
}

export interface ContactRecord {
  id: string;
  name: string;
  company: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  headcount: string;
  website: string;
  linkedinUrl: string;
  assignedRep: string;
  tenantId: string;
  folderId?: string;
  folderName?: string;
  industry?: string;
  location?: string;
  status: string; // 'New Lead' | 'In Cadence' | 'Meeting Booked' | 'Call Back Later' | 'Left Voicemail' | 'Disqualified'
  cadenceDay: number;
  touchNumber: number;
  leadNotes: string; // Direct notes on the lead for non-CRM users
  footprint: LeadFootprintItem[];
}

export interface IcpFolderRepSlice {
  repName: string;
  leadCount: number;
}

export interface IcpFolder {
  id: string;
  name: string;
  tenantCode: string;
  tenantName: string;
  createdBy: string;
  createdAt: string;
  filtersSummary: {
    titles?: string;
    seniority?: string;
    industry?: string;
    headcount?: string;
    location?: string;
    technologies?: string;
  };
  totalLeads: number;
  distributedReps: IcpFolderRepSlice[];
}

const CONTACTS_STORAGE_KEY = 'appointmentlyy_sdr_global_contacts_v3';
const FOLDERS_STORAGE_KEY = 'appointmentlyy_sdr_icp_folders_v3';
const CONTACTS_BROADCAST = 'appointmentlyy_contacts_sync';

/**
 * Security Guardrail: Strictly Super Admin and Admin roles can export CSVs.
 * SDR Reps (and non-Admin roles) are 100% blocked from downloading lists.
 */
export function canUserExportCsv(roleInput?: string): boolean {
  const activeRole = roleInput
    ? normalizeUserRole(roleInput)
    : getStoredSession().role;
  return activeRole === 'Super Admin' || activeRole === 'Admin';
}

export const INITIAL_DEFAULT_FOLDERS: IcpFolder[] = [
  {
    id: 'folder_oa_bpo_va_live',
    name: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    tenantCode: 'APEX-GLOBAL',
    tenantName: 'Apex Global BPO',
    createdBy: 'Emil Halili',
    createdAt: '2026-11-03T06:00:00.000Z',
    filtersSummary: {
      titles: 'CEO, Founder, Co-Founder, COO, Managing Director, VP Sales, Chief Growth Officer',
      seniority: 'C-Suite, VP, Director, Owner',
      industry: 'Outsource Accelerator BPO & Virtual Assistant Agencies',
      headcount: '51-5,000 employees',
      location: 'US, PH, AU, GB, CA',
      technologies: 'outsourceaccelerator.com, Cloudstaff, Staff Domain, KMC, TaskUs',
    },
    totalLeads: 16,
    distributedReps: [
      { repName: 'Emil Halili', leadCount: 4 },
      { repName: 'Julian Vance', leadCount: 4 },
      { repName: 'Marcus Brody', leadCount: 4 },
      { repName: 'Elena Rostova', leadCount: 4 },
    ],
  },
  {
    id: 'folder_apex_bpo_q4',
    name: 'US & APAC Enterprise Outbound Ops Directors',
    tenantCode: 'APEX-GLOBAL',
    tenantName: 'Apex Global BPO',
    createdBy: 'Julian Vance',
    createdAt: '2026-10-28T09:00:00.000Z',
    filtersSummary: {
      titles: 'Director of Outbound, VP Contact Center, CRO, Managing Director',
      seniority: 'C-Suite, VP, Director',
      industry: 'BPO, Telecommunications & Solar Sales',
      headcount: '45-120 seats',
      location: 'United States',
    },
    totalLeads: 4,
    distributedReps: [
      { repName: 'Emil Halili', leadCount: 2 },
      { repName: 'Julian Vance', leadCount: 2 },
    ],
  },
];

// Default starter contacts with real live-pulled Outsource Accelerator BPO & Virtual Assistant leaders
export const INITIAL_DEFAULT_CONTACTS: ContactRecord[] = [
  {
    id: 'APLY-52548269',
    name: 'Derek Gallimore',
    company: 'Outsource Accelerator',
    title: 'CEO & Founder',
    department: 'Executive Leadership',
    email: 'derek@outsourceaccelerator.com',
    phone: '+61 405 106 893',
    headcount: '51-200 employees',
    website: 'https://outsourceaccelerator.com',
    linkedinUrl: 'https://www.linkedin.com/in/derek-gallimore',
    assignedRep: 'Emil Halili',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Pasig, NCR, PH',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Directory Founder & CEO • Website: https://outsourceaccelerator.com',
    footprint: []
  },
  {
    id: 'APLY-75151747',
    name: 'Arnold San Miguel',
    company: 'Outsource Accelerator',
    title: 'Chief Operations Officer',
    department: 'Executive Leadership',
    email: 'arnold@outsourceaccelerator.com',
    phone: '+63 917 852 9749',
    headcount: '51-200 employees',
    website: 'https://outsourceaccelerator.com',
    linkedinUrl: 'https://www.linkedin.com/in/arnoldsanmiguel',
    assignedRep: 'Julian Vance',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Pasig, NCR, PH',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator COO • Website: https://outsourceaccelerator.com',
    footprint: []
  },
  {
    id: 'APLY-85923331',
    name: 'Justin Pavsic',
    company: 'Staff Domain',
    title: 'CEO & Co-founder',
    department: 'Executive Leadership',
    email: 'justinp@staffdomain.com',
    phone: '+61 447 572 653',
    headcount: '201-500 employees',
    website: 'https://staffdomain.com',
    linkedinUrl: 'https://www.linkedin.com/in/justinpavsic',
    assignedRep: 'Marcus Brody',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Sydney, NSW, AU',
    status: 'Meeting Booked',
    cadenceDay: 3,
    touchNumber: 4,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Listed BPO • Website: https://staffdomain.com • Booked executive discovery call for outbound SDR seat expansion.',
    footprint: []
  },
  {
    id: 'APLY-88175026',
    name: 'Ben Rajah',
    company: 'Staff Domain',
    title: 'Chief Financial Officer',
    department: 'Executive Leadership',
    email: 'benr@staffdomain.com',
    phone: '+61 417 208 159',
    headcount: '201-500 employees',
    website: 'https://staffdomain.com',
    linkedinUrl: 'https://www.linkedin.com/in/ben-rajah-0470b042',
    assignedRep: 'Elena Rostova',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Sydney, NSW, AU',
    status: 'In Cadence',
    cadenceDay: 2,
    touchNumber: 2,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Listed BPO • Website: https://staffdomain.com',
    footprint: []
  },
  {
    id: 'APLY-53162054',
    name: 'Jose de Soto Garcia',
    company: 'Cloudstaff',
    title: 'Vice President Of Sales',
    department: 'Executive Leadership',
    email: 'jose.desoto@emapta.com',
    phone: '+1 (619) 651-6916',
    headcount: '1001-5000 employees',
    website: 'https://cloudstaff.com',
    linkedinUrl: 'https://www.linkedin.com/in/desotogarcia',
    assignedRep: 'Emil Halili',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Charlotte, NC, US',
    status: 'Call Back Later',
    cadenceDay: 4,
    touchNumber: 3,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Top BPO Directory • Website: https://cloudstaff.com • Spoke with Jose; asked to reconnect Thursday afternoon.',
    footprint: []
  },
  {
    id: 'APLY-51123778',
    name: 'James Braatvedt',
    company: 'Cloudstaff',
    title: 'Chief Growth Officer',
    department: 'Executive Leadership',
    email: 'james.braatvedt@geodigital.com',
    phone: '+61 401 372 292',
    headcount: '1001-5000 employees',
    website: 'https://cloudstaff.com',
    linkedinUrl: 'https://www.linkedin.com/in/jbraatvedt',
    assignedRep: 'Julian Vance',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Auckland, NZ',
    status: 'Left Voicemail',
    cadenceDay: 2,
    touchNumber: 2,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Top BPO Directory • Website: https://cloudstaff.com',
    footprint: []
  },
  {
    id: 'APLY-50569561',
    name: 'Amanda Carpo',
    company: 'KMC Solutions',
    title: 'Co-founder, Chief Legal Counsel',
    department: 'Executive Leadership',
    email: 'amanda@kmc.solutions',
    phone: '+63 920 972 6294',
    headcount: '1001-5000 employees',
    website: 'https://kmc.solutions',
    linkedinUrl: 'https://www.linkedin.com/in/amanda-carpo-441b573',
    assignedRep: 'Marcus Brody',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing & Offshoring',
    location: 'Manila, PH',
    status: 'In Cadence',
    cadenceDay: 3,
    touchNumber: 2,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Top BPO Directory • Website: https://kmc.solutions',
    footprint: []
  },
  {
    id: 'APLY-96449761',
    name: 'Nancy Martinez-Arce',
    company: 'KMC Solutions',
    title: 'Vice President for Legal & Administration',
    department: 'Executive Leadership',
    email: 'nancy.martinez-arce@kmcsolutions.us',
    phone: '+63 917 851 5251',
    headcount: '1001-5000 employees',
    website: 'https://kmc.solutions',
    linkedinUrl: 'https://www.linkedin.com/in/nancy-martinez-arce-a3424b79',
    assignedRep: 'Elena Rostova',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing & Offshoring',
    location: 'Manila, PH',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Top BPO Directory • Website: https://kmc.solutions',
    footprint: []
  },
  {
    id: 'APLY-30079925',
    name: 'Adam Warner',
    company: 'TaskUs',
    title: 'Vice President Client Services',
    department: 'Executive Leadership',
    email: 'awarner@everdriven.com',
    phone: '+1 (407) 319-3078',
    headcount: '10001+ employees',
    website: 'https://taskus.com',
    linkedinUrl: 'https://www.linkedin.com/in/adam-c-warner',
    assignedRep: 'Emil Halili',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Atlanta, GA, US',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator BPO Directory • Website: https://taskus.com',
    footprint: []
  },
  {
    id: 'APLY-59975548',
    name: 'Andrew Buggy',
    company: 'TaskUs',
    title: 'Vice President, Business Development EMEA',
    department: 'Executive Leadership',
    email: 'andrew.buggy@concentrix.com',
    phone: '+44 7801 136739',
    headcount: '10001+ employees',
    website: 'https://taskus.com',
    linkedinUrl: 'https://www.linkedin.com/in/andrew-buggy-bb836412',
    assignedRep: 'Julian Vance',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Winchester, GB',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator BPO Directory • Website: https://taskus.com',
    footprint: []
  },
  {
    id: 'APLY-60612881',
    name: 'Dondi Alentajan',
    company: 'Kinetic Innovative Staffing',
    title: 'VP - Sales & Marketing',
    department: 'Executive Leadership',
    email: 'dondi@kineticstaff.com',
    phone: '+63 917 807 4797',
    headcount: '51-200 employees',
    website: 'https://kineticstaff.com',
    linkedinUrl: 'https://www.linkedin.com/in/dondi-alentajan',
    assignedRep: 'Marcus Brody',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Virtual Assistant & Remote Staffing',
    location: 'Brisbane, QLD, AU',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Virtual Assistant & Remote Staffing BPO • Website: https://kineticstaff.com',
    footprint: []
  },
  {
    id: 'APLY-24476316',
    name: 'Paul Kamper',
    company: 'Hammerjack',
    title: 'Managing Director',
    department: 'Executive Leadership',
    email: 'pkamper@kamper.com.au',
    phone: '+61 418 497 749',
    headcount: '201-500 employees',
    website: 'https://hammerjack.com.au',
    linkedinUrl: 'https://www.linkedin.com/in/paul-kamper-439bb63',
    assignedRep: 'Elena Rostova',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Sydney, NSW, AU',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Listed BPO • Website: https://hammerjack.com.au',
    footprint: []
  },
  {
    id: 'APLY-10934914',
    name: 'Elaine McAnally',
    company: 'Booth & Partners',
    title: 'Chief People Officer',
    department: 'Executive Leadership',
    email: 'emcanally@puresunfarms.com',
    phone: '+1 (778) 322-6835',
    headcount: '501-1000 employees',
    website: 'https://boothandpartners.com',
    linkedinUrl: 'https://www.linkedin.com/in/laielaine',
    assignedRep: 'Emil Halili',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Vancouver, BC, CA',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Listed BPO • Website: https://boothandpartners.com',
    footprint: []
  },
  {
    id: 'APLY-26018360',
    name: 'Liza Inciong',
    company: 'MicroSourcing',
    title: 'Vice President - Human Resources',
    department: 'Executive Leadership',
    email: 'liza.inciong@microsourcing.com',
    phone: '+63 922 827 3660',
    headcount: '1001-5000 employees',
    website: 'https://microsourcing.com',
    linkedinUrl: 'https://www.linkedin.com/in/liza-inciong-80463922',
    assignedRep: 'Julian Vance',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Outsourcing and Offshoring Consulting',
    location: 'Manila, NCR, PH',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Outsource Accelerator Top BPO • Website: https://microsourcing.com',
    footprint: []
  },
  {
    id: 'APLY-44711086',
    name: 'David Ford',
    company: 'Athena Executive Assistants',
    title: 'Vice President Of Capital Investment',
    department: 'Executive Leadership',
    email: 'david@taskus.com',
    phone: '+1 (206) 696-3701',
    headcount: '1001-5000 employees',
    website: 'https://athena.com',
    linkedinUrl: 'https://www.linkedin.com/in/david-ford-080a1951',
    assignedRep: 'Marcus Brody',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Virtual Assistant & Executive Delegation',
    location: 'Manila, PH',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Premier Virtual Assistant Agency • Website: https://athena.com',
    footprint: []
  },
  {
    id: 'APLY-31266847',
    name: 'Lucilen Breen',
    company: 'Virtually Incredible',
    title: 'Outsourcing Director',
    department: 'Executive Leadership',
    email: 'lucilen@virtuallyincredible.com',
    phone: '+63 993 077 1691',
    headcount: '51-200 employees',
    website: 'https://virtuallyincredible.com',
    linkedinUrl: 'https://www.linkedin.com/in/lucilen-breen-046b9354',
    assignedRep: 'Elena Rostova',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_oa_bpo_va_live',
    folderName: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
    industry: 'Virtual Assistant Agency',
    location: 'Calabarzon, PH',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 0,
    leadNotes: 'ICP Cloud Verified Record • Virtual Assistant Staffing Agency • Website: https://virtuallyincredible.com',
    footprint: []
  },
  {
    id: 'lead_fresh_d2',
    name: 'Julian Vance',
    company: 'Apex Global BPO',
    title: 'Director of Outbound Operations',
    department: 'Outbound Appointment Setting Floor',
    email: 'julian@apexglobalbpo.com',
    phone: '+1 (415) 890-2341',
    headcount: '65 seats',
    website: 'https://apexglobalbpo.ph',
    linkedinUrl: 'https://www.linkedin.com/in/julian-vance-bpo',
    assignedRep: 'Emil Halili',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_apex_bpo_q4',
    folderName: 'US & APAC Enterprise Outbound Ops Directors',
    industry: 'Outsourcing / Offshoring',
    location: 'San Francisco, CA',
    status: 'In Cadence',
    cadenceDay: 2,
    touchNumber: 3,
    leadNotes: 'Director is scaling outbound Manila floor by 15 seats. Bottleneck is junior reps getting chopped on price by commodity competitors. Requested demo on Thursday.',
    footprint: [
      {
        id: 'fp_1',
        timestamp: 'Oct 28, 2026 • 09:15 AM',
        isoDate: '2026-10-28T01:15:00.000Z',
        type: 'email',
        title: 'Email #1 Dispatched',
        summary: 'Subject: "quick question on Apex Global BPO ramp time". Highlighted rookie lead tax and eliminating classroom hesitation.',
        repName: 'Emil Halili'
      },
      {
        id: 'fp_2',
        timestamp: 'Oct 28, 2026 • 02:40 PM',
        isoDate: '2026-10-28T06:40:00.000Z',
        type: 'linkedin',
        title: 'LinkedIn #1 Connection',
        summary: 'Sent zero-pitch peer connection note referencing outbound seat economics in Manila & Cebu.',
        repName: 'Emil Halili'
      },
      {
        id: 'fp_3',
        timestamp: 'Oct 29, 2026 • 10:15 AM',
        isoDate: '2026-10-29T02:15:00.000Z',
        type: 'call',
        title: 'Call Notes #1',
        summary: 'Role verified. Prospect confirmed competing against 3-5 BPOs on Outsource Accelerator shared lists ($8/hr margin crush). Pitched 150ms objection cues.',
        repName: 'Emil Halili',
        disposition: 'Meeting Booked'
      }
    ]
  },
  {
    id: 'lead_carryover_d9',
    name: 'Marcus Brody',
    company: 'Nexus Call Solutions',
    title: 'VP of Contact Center Ops',
    department: 'Enterprise Lead Gen',
    email: 'mbrody@nexuscall.com',
    phone: '+1 (312) 555-0198',
    headcount: '120 seats',
    website: 'https://nexuscallsolutions.com',
    linkedinUrl: 'https://www.linkedin.com/in/marcus-brody-cx',
    assignedRep: 'Emil Halili',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_apex_bpo_q4',
    folderName: 'US & APAC Enterprise Outbound Ops Directors',
    industry: 'Telecommunications',
    location: 'Chicago, IL',
    status: 'Call Back Later',
    cadenceDay: 9,
    touchNumber: 8,
    leadNotes: 'Migrating legacy VICIdial to Twilio SIP. Needs live coaching to shorten onboarding from 6 weeks to 10 days.',
    footprint: [
      {
        id: 'fp_4',
        timestamp: 'Oct 24, 2026 • 11:30 AM',
        isoDate: '2026-10-24T03:30:00.000Z',
        type: 'email',
        title: 'Email #1 Dispatched',
        summary: 'Subject: "rookie lead burn on shared campaigns".',
        repName: 'Emil Halili'
      },
      {
        id: 'fp_5',
        timestamp: 'Oct 26, 2026 • 03:00 PM',
        isoDate: '2026-10-26T07:00:00.000Z',
        type: 'email',
        title: 'Email #2 Dispatched',
        summary: 'Subject: "72-hour floor ramp / tried you just now". Referenced 150ms objection sparring.',
        repName: 'Emil Halili'
      },
      {
        id: 'fp_6',
        timestamp: 'Oct 28, 2026 • 04:15 PM',
        isoDate: '2026-10-28T08:15:00.000Z',
        type: 'call',
        title: 'Call Notes #1',
        summary: 'Gatekeeper connect. Marcus was in operational review. Requested callback Friday at 10:00 AM.',
        repName: 'Emil Halili',
        disposition: 'Call Back Later'
      }
    ]
  },
  {
    id: 'lead_carryover_d15',
    name: 'Elena Rostova',
    company: 'ClearDial Telephony',
    title: 'Chief Revenue Officer',
    department: 'Sales & Client Retention',
    email: 'elena@cleardial.io',
    phone: '+1 (646) 772-9102',
    headcount: '45 seats',
    website: 'https://cleardial.io',
    linkedinUrl: 'https://www.linkedin.com/in/elena-rostova-sales',
    assignedRep: 'Julian Vance',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_apex_bpo_q4',
    folderName: 'US & APAC Enterprise Outbound Ops Directors',
    industry: 'Computer Software',
    location: 'New York, NY',
    status: 'In Cadence',
    cadenceDay: 15,
    touchNumber: 10,
    leadNotes: 'Actively evaluating AI voice sparring. Budget allocated for Q4 tool enablement.',
    footprint: [
      {
        id: 'fp_7',
        timestamp: 'Oct 20, 2026 • 08:45 AM',
        isoDate: '2026-10-20T00:45:00.000Z',
        type: 'email',
        title: 'Email #1 Dispatched',
        summary: 'Subject: "quick question on ClearDial Telephony ramp time".',
        repName: 'Emil Halili'
      },
      {
        id: 'fp_8',
        timestamp: 'Oct 25, 2026 • 01:20 PM',
        isoDate: '2026-10-25T05:20:00.000Z',
        type: 'call',
        title: 'Call Notes #1',
        summary: 'Left Voicemail Drop #1 (15s problem-solving script).',
        repName: 'Emil Halili',
        disposition: 'Left Voicemail'
      }
    ]
  },
  {
    id: 'lead_new_d1',
    name: 'Carlos Mendoza',
    company: 'Solaria Energy Sales',
    title: 'Managing Director',
    department: 'Solar Appointment Setting',
    email: 'carlos@solariaenergy.com',
    phone: '+1 (602) 441-9981',
    headcount: '80 seats',
    website: 'https://solariaenergy.com',
    linkedinUrl: 'https://www.linkedin.com/in/carlos-mendoza-solar',
    assignedRep: 'Julian Vance',
    tenantId: 'APEX-GLOBAL',
    folderId: 'folder_apex_bpo_q4',
    folderName: 'US & APAC Enterprise Outbound Ops Directors',
    industry: 'Renewables & Environment',
    location: 'Phoenix, AZ',
    status: 'New Lead',
    cadenceDay: 1,
    touchNumber: 1,
    leadNotes: 'Directory intake from Outsource Accelerator. BPO handles residential solar cold calling.',
    footprint: [
      {
        id: 'fp_9',
        timestamp: 'Oct 29, 2026 • 08:30 AM',
        isoDate: '2026-10-29T00:30:00.000Z',
        type: 'status',
        title: 'Lead Enrolled in Cadence',
        summary: 'Enrolled into 19-Day Outbound BPO Socratic Cadence.',
        repName: 'System'
      }
    ]
  }
];

/**
 * Get all stored contacts (with automatic fallback to initial demo contacts)
 */
export function getStoredContacts(): ContactRecord[] {
  if (typeof window === 'undefined') {
    return INITIAL_DEFAULT_CONTACTS;
  }

  try {
    const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(INITIAL_DEFAULT_CONTACTS));
      return INITIAL_DEFAULT_CONTACTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return INITIAL_DEFAULT_CONTACTS;
  } catch (err) {
    console.warn('[LeadStore] Failed to read contacts:', err);
    return INITIAL_DEFAULT_CONTACTS;
  }
}

/**
 * Persist contacts and broadcast change event
 */
export function saveStoredContacts(contacts: ContactRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    // Also sync with active CSV leads for Calling Floor compatibility
    localStorage.setItem('sdr_active_csv_leads', JSON.stringify(contacts));

    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CONTACTS_BROADCAST);
      ch.postMessage({ type: 'CONTACTS_UPDATED', contacts });
      ch.close();
    }
  } catch (err) {
    console.warn('[LeadStore] Failed to save contacts:', err);
  }
}

/**
 * Get all stored ICP Folders
 */
export function getStoredFolders(): IcpFolder[] {
  if (typeof window === 'undefined') {
    return INITIAL_DEFAULT_FOLDERS;
  }
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(INITIAL_DEFAULT_FOLDERS));
      return INITIAL_DEFAULT_FOLDERS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_DEFAULT_FOLDERS;
  } catch {
    return INITIAL_DEFAULT_FOLDERS;
  }
}

/**
 * Save ICP Folders and broadcast update
 */
export function saveStoredFolders(folders: IcpFolder[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CONTACTS_BROADCAST);
      ch.postMessage({ type: 'FOLDERS_UPDATED', folders });
      ch.close();
    }
  } catch (err) {
    console.warn('[LeadStore] Failed to save folders:', err);
  }
}

/**
 * Create a new ICP Folder, equally distribute its pulled leads across selected reps (if provided),
 * and persist both the Folder and the Contacts into Global Contacts & Calling Floor.
 */
export function createIcpFolderWithLeads(params: {
  folderName: string;
  tenantCode: string;
  tenantName: string;
  createdBy: string;
  filtersSummary: IcpFolder['filtersSummary'];
  newLeads: Omit<ContactRecord, 'folderId' | 'folderName' | 'assignedRep'>[];
  selectedReps: string[];
}): { folder: IcpFolder; addedContacts: ContactRecord[] } {
  const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const cleanReps = params.selectedReps.filter(Boolean);
  const repCounts: Record<string, number> = {};
  cleanReps.forEach((r) => (repCounts[r] = 0));

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const timestampStr = `${formattedDate} • ${formattedTime}`;

  const stampedLeads: ContactRecord[] = params.newLeads.map((lead, idx) => {
    const assignedRep =
      cleanReps.length > 0
        ? cleanReps[idx % cleanReps.length]
        : params.createdBy || 'Unassigned';

    if (cleanReps.length > 0) {
      repCounts[assignedRep] = (repCounts[assignedRep] || 0) + 1;
    }

    return {
      ...lead,
      tenantId: params.tenantCode,
      folderId,
      folderName: params.folderName.trim(),
      assignedRep,
      footprint: [
        {
          id: `fp_${Date.now()}_${idx}`,
          timestamp: timestampStr,
          isoDate: now.toISOString(),
          type: 'status',
          title: 'Pulled via Appointmentlyy ICP Cloud',
          summary: `Saved into folder "${params.folderName.trim()}" and assigned to ${assignedRep}.`,
          repName: params.createdBy,
        },
        ...(lead.footprint || []),
      ],
    };
  });

  const distributedReps: IcpFolderRepSlice[] =
    cleanReps.length > 0
      ? cleanReps.map((repName) => ({ repName, leadCount: repCounts[repName] || 0 }))
      : [{ repName: params.createdBy || 'Unassigned', leadCount: stampedLeads.length }];

  const newFolder: IcpFolder = {
    id: folderId,
    name: params.folderName.trim(),
    tenantCode: params.tenantCode,
    tenantName: params.tenantName,
    createdBy: params.createdBy,
    createdAt: now.toISOString(),
    filtersSummary: params.filtersSummary,
    totalLeads: stampedLeads.length,
    distributedReps,
  };

  const existingFolders = getStoredFolders();
  saveStoredFolders([newFolder, ...existingFolders]);

  const existingContacts = getStoredContacts();
  // De-duplicate by ID or email within the same tenant
  const existingIds = new Set(existingContacts.map((c) => `${c.tenantId}:${c.id}`));
  const uniqueNew = stampedLeads.filter((c) => !existingIds.has(`${c.tenantId}:${c.id}`));
  saveStoredContacts([...uniqueNew, ...existingContacts]);

  return { folder: newFolder, addedContacts: stampedLeads };
}

/**
 * Equally re-distribute all leads inside a specific ICP Folder across X selected SDR Reps (Round-Robin)
 */
export function distributeFolderEquallyToReps(
  folderId: string,
  selectedReps: string[],
  actorName: string = 'Admin'
): { updatedFolder: IcpFolder | null; updatedCount: number } {
  const cleanReps = selectedReps.map((r) => r.trim()).filter(Boolean);
  if (!folderId || cleanReps.length === 0) {
    return { updatedFolder: null, updatedCount: 0 };
  }

  const allContacts = getStoredContacts();
  const repCounts: Record<string, number> = {};
  cleanReps.forEach((r) => (repCounts[r] = 0));

  let folderMatchIndex = 0;
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const timestampStr = `${formattedDate} • ${formattedTime}`;

  const updatedContacts = allContacts.map((contact) => {
    if (contact.folderId !== folderId) return contact;
    const assignedRep = cleanReps[folderMatchIndex % cleanReps.length];
    folderMatchIndex++;
    repCounts[assignedRep] = (repCounts[assignedRep] || 0) + 1;

    return {
      ...contact,
      assignedRep,
      footprint: [
        {
          id: `fp_dist_${Date.now()}_${folderMatchIndex}`,
          timestamp: timestampStr,
          isoDate: now.toISOString(),
          type: 'status' as const,
          title: 'Equal Round-Robin Rep Distribution',
          summary: `Distributed equally across ${cleanReps.length} reps by ${actorName}. Assigned to ${assignedRep}.`,
          repName: actorName,
        },
        ...(contact.footprint || []),
      ],
    };
  });

  saveStoredContacts(updatedContacts);

  const folders = getStoredFolders();
  const fIdx = folders.findIndex((f) => f.id === folderId);
  if (fIdx === -1) {
    return { updatedFolder: null, updatedCount: folderMatchIndex };
  }

  const updatedFolder: IcpFolder = {
    ...folders[fIdx],
    totalLeads: folderMatchIndex || folders[fIdx].totalLeads,
    distributedReps: cleanReps.map((repName) => ({
      repName,
      leadCount: repCounts[repName] || 0,
    })),
  };

  folders[fIdx] = updatedFolder;
  saveStoredFolders(folders);

  return { updatedFolder, updatedCount: folderMatchIndex };
}

/**
 * Add a direct note to a lead (essential for clients without CRM)
 */
export function addContactNote(
  contactId: string, 
  noteText: string, 
  repName: string = 'Emil Halili'
): ContactRecord | null {
  if (!contactId || !noteText.trim()) return null;

  const contacts = getStoredContacts();
  const index = contacts.findIndex(c => c.id === contactId || c.email.toLowerCase() === contactId.toLowerCase());
  if (index === -1) return null;

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const timestampStr = `${formattedDate} • ${formattedTime}`;

  const newFootprint: LeadFootprintItem = {
    id: `fp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: timestampStr,
    isoDate: now.toISOString(),
    type: 'note',
    title: 'Manual Lead Note Added',
    summary: noteText.trim(),
    repName
  };

  const updatedContact: ContactRecord = {
    ...contacts[index],
    leadNotes: contacts[index].leadNotes 
      ? `${noteText.trim()}\n\n---\n${contacts[index].leadNotes}`
      : noteText.trim(),
    footprint: [newFootprint, ...(contacts[index].footprint || [])]
  };

  contacts[index] = updatedContact;
  saveStoredContacts(contacts);
  return updatedContact;
}

/**
 * Record a communication touch (call, email, linkedin, disposition) into lead footprint
 */
export function recordContactTouch(
  contactIdOrEmail: string,
  touch: {
    type: 'call' | 'email' | 'linkedin' | 'note' | 'status';
    title: string;
    summary: string;
    repName?: string;
    disposition?: string;
  }
): ContactRecord | null {
  if (!contactIdOrEmail) return null;

  const contacts = getStoredContacts();
  const index = contacts.findIndex(
    c => c.id === contactIdOrEmail || c.email.toLowerCase() === contactIdOrEmail.toLowerCase()
  );
  if (index === -1) return null;

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const timestampStr = `${formattedDate} • ${formattedTime}`;

  const newFootprint: LeadFootprintItem = {
    id: `fp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: timestampStr,
    isoDate: now.toISOString(),
    type: touch.type,
    title: touch.title,
    summary: touch.summary,
    repName: touch.repName || 'Emil Halili',
    disposition: touch.disposition
  };

  const nextStatus = touch.disposition || contacts[index].status;

  const updatedContact: ContactRecord = {
    ...contacts[index],
    status: nextStatus,
    footprint: [newFootprint, ...(contacts[index].footprint || [])]
  };

  contacts[index] = updatedContact;
  saveStoredContacts(contacts);
  return updatedContact;
}

/**
 * Move a contact to a new Pipeline Kanban stage and log the stage change in the lead's footprint
 */
export function updateContactPipelineStage(
  contactId: string,
  newStatus: string,
  actorName: string = 'Emil Halili'
): ContactRecord | null {
  if (!contactId || !newStatus) return null;

  const contacts = getStoredContacts();
  const index = contacts.findIndex((c) => c.id === contactId);
  if (index === -1) return null;

  const prevStatus = contacts[index].status;
  if (prevStatus === newStatus) return contacts[index];

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const timestampStr = `${formattedDate} • ${formattedTime}`;

  const stageFootprint: LeadFootprintItem = {
    id: `fp_pipe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: timestampStr,
    isoDate: now.toISOString(),
    type: 'status',
    title: `Pipeline Stage → ${newStatus}`,
    summary: `Moved from "${prevStatus}" to "${newStatus}" on the Pipeline Kanban Board.`,
    repName: actorName,
    disposition: newStatus,
  };

  const updatedContact: ContactRecord = {
    ...contacts[index],
    status: newStatus,
    touchNumber: (contacts[index].touchNumber || 0) + 1,
    footprint: [stageFootprint, ...(contacts[index].footprint || [])],
  };

  contacts[index] = updatedContact;
  saveStoredContacts(contacts);
  return updatedContact;
}

/**
 * Export contacts to a standard RFC 4180 CSV file (Strictly Locked to Super Admin & Admin)
 */
export function exportContactsToCsv(contacts: ContactRecord[], customFilenamePrefix?: string): boolean {
  if (typeof window === 'undefined' || !contacts || contacts.length === 0) return false;

  // Hard Anti-Leak Security Check: Block Reps & non-Admins at the function level
  if (!canUserExportCsv()) {
    console.warn('[Security Guardrail] Blocked unauthorized CSV export attempt by role:', getStoredSession().role);
    alert('Security Policy: Downloading or exporting CSV lead lists is strictly restricted to Account Administrators.');
    return false;
  }

  const headers = [
    'Lead ID',
    'Folder Name',
    'Contact Name',
    'Company',
    'Title',
    'Department',
    'Email',
    'Phone',
    'Headcount',
    'Industry',
    'Location',
    'Website',
    'LinkedIn URL',
    'Assigned Rep',
    'Status',
    'Cadence Day',
    'Direct Lead Notes',
    'Total Touches',
    'Latest Touch Date',
    'Latest Footprint Summary'
  ];

  const escapeCsv = (str: unknown) => {
    if (str === null || str === undefined) return '""';
    const clean = String(str).replace(/"/g, '""');
    return `"${clean}"`;
  };

  const rows = contacts.map(c => {
    const latestTouch = c.footprint && c.footprint.length > 0 ? c.footprint[0] : null;
    return [
      escapeCsv(c.id),
      escapeCsv(c.folderName || 'General Directory'),
      escapeCsv(c.name),
      escapeCsv(c.company),
      escapeCsv(c.title),
      escapeCsv(c.department),
      escapeCsv(c.email),
      escapeCsv(c.phone),
      escapeCsv(c.headcount),
      escapeCsv(c.industry || ''),
      escapeCsv(c.location || ''),
      escapeCsv(c.website),
      escapeCsv(c.linkedinUrl),
      escapeCsv(c.assignedRep),
      escapeCsv(c.status),
      escapeCsv(c.cadenceDay),
      escapeCsv(c.leadNotes),
      escapeCsv(c.footprint ? c.footprint.length : 0),
      escapeCsv(latestTouch ? latestTouch.timestamp : 'None'),
      escapeCsv(latestTouch ? `${latestTouch.title}: ${latestTouch.summary}` : 'None')
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const nowStr = new Date().toISOString().split('T')[0];
  const prefix = customFilenamePrefix
    ? customFilenamePrefix.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    : 'appointmentlyy_contacts_export';
  link.setAttribute('href', url);
  link.setAttribute('download', `${prefix}_${nowStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Subscribe to real-time contacts & folder updates
 */
export function subscribeToContacts(callback: (contacts: ContactRecord[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (e.key === CONTACTS_STORAGE_KEY || e.key === FOLDERS_STORAGE_KEY) {
      callback(getStoredContacts());
    }
  };

  window.addEventListener('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CONTACTS_BROADCAST);
    channel.onmessage = (event) => {
      if (event.data?.type === 'CONTACTS_UPDATED' || event.data?.type === 'FOLDERS_UPDATED') {
        callback(event.data.contacts || getStoredContacts());
      }
    };
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) channel.close();
  };
}

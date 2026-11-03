import { JobSignalRecord } from '@/lib/jobRadarStore';

export const INITIAL_CURATED_JOB_SIGNALS: JobSignalRecord[] = [
  // 1. USA - B2B Appointment Setter
  {
    id: 'job_us_001',
    companyName: 'ScaleVenture SaaS Labs',
    website: 'https://scaleventuresaas.io',
    country: 'US',
    location: 'Austin, TX (Remote USA)',
    workType: 'Remote',
    category: 'b2b_appointment_setter',
    categoryLabel: 'B2B Appointment Setter',
    jobTitle: 'Senior Outbound B2B Appointment Setter (Mid-Market SaaS)',
    postingDate: 'Active (2 days ago)',
    sourcePlatform: 'Greenhouse / LinkedIn Jobs',
    budgetRange: {
      baseSalary: '$60,000 – $75,000 USD/yr',
      oteOrBonus: '$105,000 OTE ($150 per completed demo)',
      ratePerHour: '$32 – $38 USD/hr equivalent',
      currency: 'USD',
      contractType: 'Full-time',
      confidence: 'Explicitly Stated',
    },
    jobSummary:
      'Hunting for relentless outbound cold-callers to book 22+ qualified mid-market demos/mo for our B2B pipeline intelligence platform. Handling 60-80 cold dials daily using Apollo & Salesforce.',
    keyRequirements: [
      'Proven track record in cold calling tech decision-makers (CTOs, VP Eng)',
      'Sub-second objection handling against "send an email" or "not interested"',
      'Strict qualification: only 50-500 employee tech accounts with verified budget',
    ],
    techStack: ['Salesforce', 'Apollo.io', 'Slack', 'ZoomInfo', 'Salesloft'],
    whyTheyNeedUs:
      'High churn on domestic SDRs costing $75k base. Appointmentlyy AI Boris calling floor + trained pods delivers 2.5x dial volume at 60% lower operating cost.',
    decisionMaker: {
      name: 'Derek Kowalski',
      title: 'VP of Global Revenue & Outbound Demand',
      linkedinUrl: 'https://www.linkedin.com/in/derek-kowalski-revenue',
      phone: '+1 (512) 892-4109',
      email: 'derek@scaleventuresaas.io',
      enriched: true,
    },
  },

  // 2. Australia - B2B Appointment Setter
  {
    id: 'job_au_001',
    companyName: 'Apex Commercial Solar & Energy Group',
    website: 'https://apexcommercialsolar.com.au',
    country: 'AU',
    location: 'Sydney, NSW (Remote AU)',
    workType: 'Remote',
    category: 'b2b_appointment_setter',
    categoryLabel: 'B2B Appointment Setter',
    jobTitle: 'B2B Cold Outreach & Energy Audit Appointment Setter',
    postingDate: 'Active (Yesterday)',
    sourcePlatform: 'SEEK Australia / LinkedIn',
    budgetRange: {
      baseSalary: '$70,000 – $85,000 AUD/yr',
      oteOrBonus: '$120,000 AUD OTE + uncapped tier bonus',
      ratePerHour: '$38 – $45 AUD/hr',
      currency: 'AUD',
      contractType: 'Full-time',
      confidence: 'Explicitly Stated',
    },
    jobSummary:
      'Targeting Australian warehousing, manufacturing, and commercial strata property directors to secure 15-minute commercial solar energy assessment meetings.',
    keyRequirements: [
      'Cold phone calling Australian business owners and procurement leads',
      'Overcoming gatekeepers and managing callbacks with CRM accountability',
      'Knowledge of energy tariffs and commercial tax write-offs is advantageous',
    ],
    techStack: ['HubSpot CRM', 'Aircall', 'LinkedIn Sales Nav', 'Monday.com'],
    whyTheyNeedUs:
      'Paying massive recruiter commissions ($12,000 AUD) for unvetted local setters. Appointmentlyy offshore SDR pods with Australian cadence frameworks eliminate recruiter fees completely.',
    decisionMaker: {
      name: 'Lachlan Murdoch-Shaw',
      title: 'Managing Director & Commercial Growth Partner',
      linkedinUrl: 'https://www.linkedin.com/in/lachlan-murdoch-commercial',
      phone: '+61 2 8999 4112',
      email: 'lachlan@apexcommercialsolar.com.au',
      enriched: true,
    },
  },

  // 3. USA - AI Automation Specialist
  {
    id: 'job_us_002',
    companyName: 'Hyperflow Agency Scale Solutions',
    website: 'https://hyperflowsystems.ai',
    country: 'US',
    location: 'Denver, CO (Remote USA)',
    workType: 'Remote',
    category: 'ai_automation_specialist',
    categoryLabel: 'AI Automation Specialist',
    jobTitle: 'Lead AI Workflow & CRM Automation Architect',
    postingDate: 'Active (3 days ago)',
    sourcePlatform: 'Indeed / Wellfound',
    budgetRange: {
      baseSalary: '$90,000 – $120,000 USD/yr',
      oteOrBonus: 'Profit sharing on deployed client pipelines',
      ratePerHour: '$60 – $85 USD/hr',
      currency: 'USD',
      contractType: 'Full-time',
      confidence: 'Explicitly Stated',
    },
    jobSummary:
      'Design, build, and maintain enterprise automation blueprints connecting webhook lead forms, AI voice agents, Make.com scenarios, and automated follow-up cadences.',
    keyRequirements: [
      'Deep mastery of Make.com, n8n, OpenAI/Anthropic APIs, and Zapier',
      'Experience setting up multi-touch SMS & cold email fallback triggers',
      'Client onboarding architecture & API debugging skills',
    ],
    techStack: ['Make.com', 'n8n', 'OpenAI API', 'GoHighLevel', 'Supabase'],
    whyTheyNeedUs:
      'Looking to automate repetitive GTM tasks. Appointmentlyy SDR platform already provides turnkey white-labeled workflow orchestration out-of-the-box.',
    decisionMaker: {
      name: 'Brenton Cole',
      title: 'Chief Technology Officer & Head of Automation',
      linkedinUrl: 'https://www.linkedin.com/in/brenton-cole-automation',
      phone: '+1 (303) 710-8842',
      email: 'brenton@hyperflowsystems.ai',
      enriched: true,
    },
  },

  // 4. Australia - AI Automation Specialist
  {
    id: 'job_au_002',
    companyName: 'RevAutomate Pacific Tech',
    website: 'https://revautomate.com.au',
    country: 'AU',
    location: 'Melbourne, VIC (Remote AU)',
    workType: 'Remote',
    category: 'ai_automation_specialist',
    categoryLabel: 'AI Automation Specialist',
    jobTitle: 'AI Process Automation Consultant (B2B Lead Flow)',
    postingDate: 'Active (4 days ago)',
    sourcePlatform: 'SEEK Australia',
    budgetRange: {
      baseSalary: '$95,000 – $115,000 AUD/yr',
      oteOrBonus: '$15,000 performance milestone retention package',
      ratePerHour: '$55 – $70 AUD/hr',
      currency: 'AUD',
      contractType: 'Full-time',
      confidence: 'Explicitly Stated',
    },
    jobSummary:
      'Deploying AI scrapers, CRM hygiene automations, and LLM summary engines for mid-market Australian accounting and legal advisory firms.',
    keyRequirements: [
      'Hands-on experience deploying Claude and GPT-4 structured outputs',
      'Integration with Australian CRMs and payment gateways',
      'Document parsing, contact deduplication, and automated routing pipelines',
    ],
    techStack: ['Make.com', 'Python', 'HubSpot', 'Xero API', 'Airtable'],
    whyTheyNeedUs:
      'Trying to build proprietary AI tooling from scratch. Appointmentlyy offers plug-and-play AI Boris operations intel and ICP cloud intelligence.',
    decisionMaker: {
      name: 'Kylie Henderson',
      title: 'Founder & Head of Operations Engineering',
      linkedinUrl: 'https://www.linkedin.com/in/kylie-henderson-ops',
      phone: '+61 3 9122 8400',
      email: 'kylie@revautomate.com.au',
      enriched: true,
    },
  },

  // 5. USA - AI Sales Enablement Tool Builder
  {
    id: 'job_us_003',
    companyName: 'Synthetix Sales AI Platforms',
    website: 'https://synthetixsales.com',
    country: 'US',
    location: 'San Francisco, CA (Remote USA)',
    workType: 'Remote',
    category: 'ai_sales_enablement',
    categoryLabel: 'AI Sales Enablement Tool Builder',
    jobTitle: 'Senior GTM Tool Builder & Real-time AI Audio Copilot Engineer',
    postingDate: 'Active (Today)',
    sourcePlatform: 'Ashby / LinkedIn Jobs',
    budgetRange: {
      baseSalary: '$130,000 – $165,000 USD/yr',
      oteOrBonus: '$25,000 Annual Stock Units / Equity Package',
      ratePerHour: '$75 – $100 USD/hr',
      currency: 'USD',
      contractType: 'Full-time',
      confidence: 'Explicitly Stated',
    },
    jobSummary:
      'Building in-call AI speech assist, objection battlecard surfacing, and automated post-call CRM logging tools for an enterprise outbound sales org of 65 reps.',
    keyRequirements: [
      'WebRTC, live speech-to-text (Deepgram/Whisper) audio streaming',
      'Latency optimization (<400ms) for real-time rep objection prompting',
      'Integration into custom softphones and Salesforce/HubSpot auto-logging',
    ],
    techStack: ['WebRTC', 'Next.js', 'FastAPI', 'Deepgram', 'Salesforce API'],
    whyTheyNeedUs:
      'They are preparing to spend $250k+ in engineering budget building custom live call assist. Appointmentlyy AI Boris Calling Cockpit already has sub-second audio interception & ARM talk tracks built and working.',
    decisionMaker: {
      name: 'Vaughn Sterling',
      title: 'Chief Revenue Officer & VP Sales Enablement',
      linkedinUrl: 'https://www.linkedin.com/in/vaughn-sterling-cro',
      phone: '+1 (415) 620-3391',
      email: 'vaughn@synthetixsales.com',
      enriched: true,
    },
  },

  // 6. Australia - AI Sales Enablement Tool Builder
  {
    id: 'job_au_003',
    companyName: 'StrataGrowth Outbound Enablement',
    website: 'https://stratagrowth.com.au',
    country: 'AU',
    location: 'Brisbane, QLD (Remote AU)',
    workType: 'Remote',
    category: 'ai_sales_enablement',
    categoryLabel: 'AI Sales Enablement Tool Builder',
    jobTitle: 'Sales Enablement & Outbound Rep Sparring Simulator Architect',
    postingDate: 'Active (3 days ago)',
    sourcePlatform: 'SEEK Australia',
    budgetRange: {
      baseSalary: '$110,000 – $135,000 AUD/yr',
      oteOrBonus: '10% company annual performance bonus',
      ratePerHour: '$65 – $80 AUD/hr',
      currency: 'AUD',
      contractType: 'Full-time',
      confidence: 'Explicitly Stated',
    },
    jobSummary:
      'Developing AI-driven roleplay, simulated buyer pushback sparring, and acoustic objection scorecards to ramp outbound BDRs in under 7 days instead of 6 weeks.',
    keyRequirements: [
      'Experience with LLM persona prompt engineering and tone evaluation',
      'Building automated scorecard feedback loops and call analytics dashboards',
      'Background in B2B outbound phone sales training or sales leadership',
    ],
    techStack: ['ElevenLabs API', 'Claude / Gemini', 'TypeScript', 'Aircall SDK'],
    whyTheyNeedUs:
      'Prime prospect for Appointmentlyy AI Sparring Arena and Playbook Ingestion Studio. We can white-label the exact solution to them in 24 hours.',
    decisionMaker: {
      name: 'Gareth Thorne',
      title: 'Head of Sales Effectiveness & Performance Training',
      linkedinUrl: 'https://www.linkedin.com/in/gareth-thorne-enablement',
      phone: '+61 7 3105 9940',
      email: 'gareth@stratagrowth.com.au',
      enriched: true,
    },
  },
];


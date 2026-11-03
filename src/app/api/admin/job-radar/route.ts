import { NextRequest, NextResponse } from 'next/server';
import {
  JobSignalRecord,
  JobSignalCategory,
  JobSignalCountry,
} from '@/lib/jobRadarStore';
import { INITIAL_CURATED_JOB_SIGNALS } from '@/lib/curatedJobSignals';

export interface JobRadarSearchRequest {
  country?: JobSignalCountry;
  category?: JobSignalCategory | 'all';
  searchQuery?: string;
  forceFreshGemini?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body: JobRadarSearchRequest = await req.json().catch(() => ({}));
    const {
      country = 'ALL',
      category = 'all',
      searchQuery = '',
      forceFreshGemini = false,
    } = body;

    const googleApiKey = process.env.GOOGLE_API_KEY;

    let geminiSignals: JobSignalRecord[] = [];

    // If Gemini key is available and fresh search requested or default trigger
    if (googleApiKey && forceFreshGemini) {
      const candidateModels = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'];
      
      const prompt = `You are an elite B2B Sales Intelligence Researcher.
Search for active REMOTE job postings in the USA and Australia published in the last 14 days for these 3 categories:
1. B2B Appointment Setters (Outbound Cold Calling SDRs / Lead Generation Representatives - must be strictly B2B)
2. AI Automation Specialists (Make.com, Zapier, Python, OpenAI API, CRM workflow builders)
3. AI Sales Enablement Tool Builders (GTM engineers, real-time call assist, sparring simulator developers)

Filtered by Country: ${country === 'ALL' ? 'USA and Australia' : country === 'US' ? 'USA Only' : 'Australia Only'}
Filtered by Category: ${category === 'all' ? 'All 3 Categories' : category}
${searchQuery ? `Specific keyword focus: "${searchQuery}"` : ''}

For EACH discovered job posting, you MUST extract:
- companyName: Company Name
- website: Company Website (https://domain.com)
- country: "US" or "AU"
- location: City/State + "Remote"
- workType: "Remote"
- category: "b2b_appointment_setter" | "ai_automation_specialist" | "ai_sales_enablement"
- categoryLabel: "B2B Appointment Setter" | "AI Automation Specialist" | "AI Sales Enablement Tool Builder"
- jobTitle: Exact job title
- postingDate: e.g. "Active (2 days ago)" or posting date
- sourcePlatform: e.g. "Greenhouse", "Lever", "LinkedIn Jobs", "SEEK Australia", or "Indeed"
- budgetRange: object with:
    baseSalary: string (e.g. "$65,000 - $80,000 USD/yr" or "$75,000 - $90,000 AUD/yr")
    oteOrBonus: string (e.g. "$110,000 OTE + $120/demo")
    ratePerHour: string (e.g. "$35 - $45/hr")
    currency: "USD" or "AUD"
    contractType: "Full-time" | "Contract (1099)" | "Agency / Contractor" | "Part-time"
    confidence: "Explicitly Stated" or "Market Estimate"
- jobSummary: 2 concise sentences summarizing the role and daily metrics
- keyRequirements: array of 3 bullet points
- techStack: array of tools mentioned (e.g. ["Salesforce", "Apollo", "Make.com"])
- whyTheyNeedUs: 1-2 punchy sentences on why Appointmentlyy SDR platform or trained offshore pod solves their problem for 60% less cost.
- decisionMaker: object with:
    name: Full name of the most probable hiring manager (CEO, Founder, VP Sales, Head of Revenue)
    title: Their role
    linkedinUrl: Realistic or exact LinkedIn profile URL
    phone: Office or direct phone number
    email: Work email format (e.g. first@company.com)

Return a strict JSON object with:
{
  "signals": [ /* array of JobSignalRecord */ ]
}`;

      for (const model of candidateModels) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(22000),
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 4096,
                  responseMimeType: 'application/json',
                },
              }),
            }
          );

          if (res.ok) {
            const data = await res.json();
            const text = (data?.candidates?.[0]?.content?.parts || [])
              .map((p: { text?: string }) => p.text || '')
              .join('');

            if (text) {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed?.signals) && parsed.signals.length > 0) {
                geminiSignals = parsed.signals.map((s: Partial<JobSignalRecord>, idx: number) => ({
                  ...s,
                  id: s.id || `live_gemini_${Date.now()}_${idx}`,
                  country: s.country === 'AU' ? 'AU' : 'US',
                  workType: 'Remote',
                  pushedToLeads: false,
                })) as JobSignalRecord[];
                break;
              }
            }
          }
        } catch (modelErr) {
          console.warn(`[Job Radar] Model ${model} search failed, falling back:`, modelErr);
        }
      }
    }

    // Merge Gemini live signals with our curated high-yield signals
    let combinedSignals: JobSignalRecord[] = [
      ...geminiSignals,
      ...INITIAL_CURATED_JOB_SIGNALS,
    ];

    // Deduplicate by company name
    const seenCompanies = new Set<string>();
    combinedSignals = combinedSignals.filter((item) => {
      const key = item.companyName.toLowerCase().trim();
      if (seenCompanies.has(key)) return false;
      seenCompanies.add(key);
      return true;
    });

    // Apply Filters
    if (country !== 'ALL') {
      combinedSignals = combinedSignals.filter((s) => s.country === country);
    }

    if (category !== 'all') {
      combinedSignals = combinedSignals.filter((s) => s.category === category);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      combinedSignals = combinedSignals.filter(
        (s) =>
          s.companyName.toLowerCase().includes(q) ||
          s.jobTitle.toLowerCase().includes(q) ||
          s.jobSummary.toLowerCase().includes(q) ||
          s.techStack.some((t) => t.toLowerCase().includes(q)) ||
          s.decisionMaker.name.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      success: true,
      totalCount: combinedSignals.length,
      signals: combinedSignals,
      geminiLiveActive: geminiSignals.length > 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Job Radar API Error]:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute Job Radar search query.',
        signals: INITIAL_CURATED_JOB_SIGNALS,
      },
      { status: 500 }
    );
  }
}

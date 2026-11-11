import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';
import { 
  DEFAULT_OUTBOUND_FRAMEWORKS, 
  DEFAULT_ANTI_SALES_CTAS, 
  OutboundFramework, 
  AntiSalesCta,
  OutboundChannel
} from '@/lib/outboundFrameworks';

interface OutboundWriterPayload {
  channel: OutboundChannel;
  touchType?: string;
  lead: {
    name: string;
    company: string;
    title: string;
    department?: string;
    headcount?: string;
    phone?: string;
    email?: string;
    website?: string;
    linkedinUrl?: string;
    techStack?: string;
    painPoint?: string;
    outsourcer?: string;
    buyingSignals?: string[];
    customVariables?: Record<string, string>;
  };
  frameworkId?: string;
  antiSalesCtaId?: string;
  customPromptInstruction?: string;
  tone?: 'Ultra-Casual' | 'Crisp & Direct' | 'Founder Peer-to-Peer' | 'Zero Fluff' | 'Natural Spoken';
}

function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const payload: OutboundWriterPayload = await req.json();
    const { 
      channel = 'Email', 
      touchType = 'Outreach',
      lead, 
      frameworkId, 
      antiSalesCtaId, 
      customPromptInstruction = '',
      tone = 'Crisp & Direct'
    } = payload;

    if (!lead || !lead.name) {
      return NextResponse.json(
        { error: 'Lead data with name and company is required' },
        { status: 400 }
      );
    }

    const googleApiKey = process.env.GOOGLE_API_KEY;

    // Resolve framework from registered or active frameworks
    const framework: OutboundFramework = 
      DEFAULT_OUTBOUND_FRAMEWORKS.find(f => f.id === frameworkId) ||
      DEFAULT_OUTBOUND_FRAMEWORKS.find(f => f.channel === channel && f.isDefault) ||
      DEFAULT_OUTBOUND_FRAMEWORKS.find(f => f.channel === channel) ||
      DEFAULT_OUTBOUND_FRAMEWORKS[0];

    // Resolve Anti-Sales CTA
    const selectedCta: AntiSalesCta = 
      DEFAULT_ANTI_SALES_CTAS.find(c => c.id === antiSalesCtaId) ||
      DEFAULT_ANTI_SALES_CTAS.find(c => c.channel === channel || c.channel === 'All') ||
      DEFAULT_ANTI_SALES_CTAS[0];

    const firstName = lead.name.split(' ')[0] || 'there';
    const primarySignal = (lead.buyingSignals && lead.buyingSignals.length > 0)
      ? lead.buyingSignals.join(', ')
      : 'scaling outbound client acquisition';
    const tech = lead.techStack || 'Apollo.io and HubSpot CRM';
    const competitor = lead.outsourcer || 'Titan BPO Solutions';
    const pain = lead.painPoint || 'objection drop-offs when prospects mention shared broker lists';
    const headcount = lead.headcount || '250 Seats';

    // Format all CSV custom variables into clear key-value lines
    const customVarsText = lead.customVariables && Object.keys(lead.customVariables).length > 0
      ? Object.entries(lead.customVariables).map(([k, v]) => `  - ${k}: ${v}`).join('\n')
      : '  - None provided';

    // Channel-specific instructions
    let channelRules = '';
    if (channel === 'Phone') {
      channelRules = `CHANNEL: B2B COLD CALL (SPOKEN TELEPROMPTER SCRIPT)
- Tone: Extremely natural, confident, calm, conversational spoken speech.
- Formatting: 2 short spoken paragraphs. Sentence 1: permission / pattern-interrupt opener. Sentence 2: the specific bottleneck hypothesis citing their CSV data.
- Constraint: Strictly 35 to 55 words total. Must take less than 20 seconds to speak aloud. No written jargon.`;
    } else if (channel === 'Email') {
      channelRules = `CHANNEL: COLD EMAIL
- Formatting: Lowercase subject line strictly under 4 words. 2 to 3 short paragraphs.
- Constraint: Strictly 40 to 65 words total. Zero marketing fluff. Zero pleasantries like "hope you are well".`;
    } else {
      channelRules = `CHANNEL: LINKEDIN OUTREACH
- Formatting: If connection invite, strictly under 220 characters with zero pitch. If InMail, strictly under 55 words.`;
    }

    // System prompt engineered strictly around CSV intelligence + Framework
    const systemPrompt = `You are an elite enterprise B2B sales copywriter and cold calling specialist.
Your primary and authoritative source of knowledge about the prospect is the CSV lead intelligence provided below.

${channelRules}

CRITICAL ANTI-SALES COPYWRITING RULES:
1. Ground every sentence in the prospect's actual CSV data: Company (${lead.company}), Headcount (${headcount}), Tech Stack (${tech}), Competitor/Incumbent (${competitor}), and Pain (${pain}).
2. NEVER use fake rapport or corporate buzzwords ("game-changing", "revolutionary", "delighted to connect", "hope this finds you well").
3. ANTI-SALES CTA: The ending sentence must be low-friction, permission-based, or no-oriented (e.g. giving them an out, asking if it's bad timing, or asking if they want a 2-min breakdown).

PROSPECT INTELLIGENCE (FROM IMPORTED CSV):
- Name: ${lead.name} (First Name: ${firstName})
- Company: ${lead.company}
- Job Title: ${lead.title}
- Department: ${lead.department || 'Operations'}
- Floor Scale / Headcount: ${headcount}
- Tech Stack: ${tech}
- Incumbent / Competitor: ${competitor}
- Primary Bottleneck / Pain: ${pain}
- Buying Signals: ${primarySignal}
- Website: ${lead.website || 'N/A'}
- LinkedIn: ${lead.linkedinUrl || 'N/A'}
- Custom CSV Fields:
${customVarsText}

FRAMEWORK SELECTED BY USER:
- Name: ${framework.name} (${framework.authorOrStyle})
- Framework Instructions:
${framework.promptInstruction}

PREFERRED ANTI-SALES CLOSING STYLE:
"${selectedCta.ctaText}"

USER SPECIFIED CUSTOM GUIDANCE:
${customPromptInstruction ? `User specified: "${customPromptInstruction}"` : 'None. Adhere strictly to the chosen framework and CSV context.'}

OUTPUT FORMAT:
Return a STRICT JSON object with these exact keys:
{
  "subject": "${channel === 'Email' ? 'lowercase under 4 words' : ''}",
  "body": "The full spoken cold call script or message text. Use line breaks \\n\\n for spoken pauses.",
  "antiSalesCtaUsed": "The exact closing sentence used in the body.",
  "prospectInsight": "1-sentence note explaining how this copy directly connects to ${lead.company}'s CSV signals.",
  "alternativeHooks": [
    "Alternative 1-sentence opening hook",
    "Second alternative 1-sentence opening hook"
  ]
}
Return pure valid JSON only. Do not wrap in markdown quotes.`;

    let generatedData: any = null;
    let modelUsed = 'fallback_template';

    if (googleApiKey) {
      const candidateModels = [
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash'
      ];

      for (const model of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.35,
                maxOutputTokens: 600
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResponse) {
              const cleaned = textResponse.replace(/^```json/i, '').replace(/```$/i, '').trim();
              generatedData = JSON.parse(cleaned);
              modelUsed = model;
              break;
            }
          } else {
            console.warn(`[OutboundWriter] Model ${model} returned status ${res.status}`);
          }
        } catch (callErr) {
          console.warn(`[OutboundWriter] Attempt with ${model} failed:`, callErr);
        }
      }
    }

    // Deterministic fallback if offline
    if (!generatedData || !generatedData.body) {
      if (channel === 'Phone') {
        generatedData = {
          subject: '',
          body: `Hey ${firstName}, know I caught you out of the blue. Have you got 20 seconds for me to tell you why I called, and you can tell me if it makes sense?\n\nI noticed ${lead.company} runs ${headcount} with ${tech}. Most leaders we talk to tell us their biggest margin leak is callers getting shopped the second a prospect mentions ${competitor}.\n\n${selectedCta.ctaText}`,
          antiSalesCtaUsed: selectedCta.ctaText,
          prospectInsight: `Uses ${lead.company}'s CSV scale (${headcount}) and tech (${tech}) to immediately establish peer relevance.`,
          alternativeHooks: [
            `${firstName}, I know I'm an interruption—do you want to hang up right now or give me 25 seconds?`,
            `Julian, I'm sure you're in the middle of ten things managing operations at ${lead.company}.`
          ]
        };
      } else if (channel === 'Email') {
        generatedData = {
          subject: `${lead.company.toLowerCase().replace(/[^a-z0-9]/g, '')} lead burn`,
          body: `Hi ${firstName},\n\nSaw your team is managing ${headcount} with ${tech}. Most BPO leaders we talk to mention callers lose 40% of dials because prospects claim they already get pitched by ${competitor}.\n\n${selectedCta.ctaText}`,
          antiSalesCtaUsed: selectedCta.ctaText,
          prospectInsight: `Highlights ${lead.company}'s ${headcount} scale and removes sales pressure by directly citing ${competitor} friction from CSV.`,
          alternativeHooks: [
            `${firstName} - noticed ${lead.company} is scaling outbound with ${tech}.`,
            `Probably caught you at a busy time as you manage ${headcount} at ${lead.company}.`
          ]
        };
      } else {
        generatedData = {
          subject: '',
          body: `Hi ${firstName} - impressed seeing ${lead.company} scale to ${headcount}. Curious how your team is navigating ${pain} with ${tech}. Would love to connect and follow your work!`,
          antiSalesCtaUsed: selectedCta.ctaText,
          prospectInsight: `Ultra-short connection request under 200 chars referencing their ${headcount} scale with zero pitch.`,
          alternativeHooks: [
            `Hey ${firstName}, quick question—is ${pain} an uphill battle for your reps at ${lead.company}?`,
            `Saw you're heading outbound at ${lead.company}—curious if you're running into the shared list bottleneck.`
          ]
        };
      }
    }

    const wordCount = countWords(generatedData.body);
    const charCount = generatedData.body.length;
    const readingTimeSec = channel === 'Phone' 
      ? Math.max(8, Math.round(wordCount / 2.5)) // spoken ~150 wpm
      : Math.max(3, Math.round(wordCount / 3.8)); // read ~230 wpm

    return NextResponse.json({
      success: true,
      subject: generatedData.subject || '',
      body: generatedData.body,
      wordCount,
      charCount,
      readingTimeSec,
      frameworkUsed: framework.name,
      antiSalesCtaUsed: generatedData.antiSalesCtaUsed || selectedCta.ctaText,
      prospectInsight: generatedData.prospectInsight || `Synthesized from CSV data for ${lead.company}`,
      alternativeHooks: generatedData.alternativeHooks || [],
      modelUsed
    });

  } catch (error: any) {
    console.error('[OutboundWriter API Error]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to synthesize outbound copy' },
      { status: 500 }
    );
  }
}

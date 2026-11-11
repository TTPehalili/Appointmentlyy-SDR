import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';
import { getServiceSupabase } from '@/lib/supabase';
import { ArmRebuttalResponse } from '@/types';
import { applyRateLimit, validateTextPayload } from '@/lib/security';

interface LeadPersonaContext {
  name?: string;
  company?: string;
  title?: string;
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
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, { maxRequests: 60, windowMs: 60000 });
  if (rateLimitResponse) return rateLimitResponse;
  const auth = await requireApiSession(req);
  if (auth instanceof NextResponse) return auth;

  const startTime = Date.now();

  try {
    const body = await req.json();
    const text: string = (body.text || '').trim();
    const campaignId: string | undefined = body.campaignId;
    const lead: LeadPersonaContext | undefined = body.lead;
    const guruStyle: string | undefined = body.guruStyle || 'Josh Braun Disarming';

    if (text) {
      const validation = validateTextPayload(text, 1500);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    if (!text || text.length < 2) {
      return NextResponse.json<ArmRebuttalResponse>({
        has_objection: false,
        latency_ms: Date.now() - startTime
      });
    }

    const lowerText = text.toLowerCase();
    const googleApiKey = process.env.GOOGLE_API_KEY;

    // --- TIER 1: LIVE PERSONA-AWARE GEMINI SYNTHESIS ---
    // Rule: Never use a one-size-fits-all script. Each prospect has a unique persona.
    if (googleApiKey) {
      const candidateModels = [
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash'
      ];

      const firstName = lead?.name?.split(' ')[0] || 'there';
      const company = lead?.company || 'their organization';
      const title = lead?.title || 'Executive';
      const headcount = lead?.headcount || '50+ Seats';
      const tech = lead?.techStack || 'Apollo and HubSpot';
      const competitor = lead?.outsourcer || 'Incumbent BPO';
      const pain = lead?.painPoint || 'objection drop-off on shared broker lists';

      const prompt = `You are AI Boris, the elite objection handling engine for outbound SDRs.
RULE NUMBER 1: NEVER USE A ONE-SIZE-FITS-ALL SCRIPT. Each prospect has a unique persona.
The response must sound completely unscripted, natural, conversational, calm, and tailored strictly to this specific prospect based on their CSV profile.

PROSPECT PERSONA INTELLIGENCE:
- Name: ${lead?.name || 'Prospect'} (${firstName})
- Title: ${title}
- Company: ${company}
- Floor Scale / Headcount: ${headcount}
- Current Tech Stack: ${tech}
- Incumbent / Competitor: ${competitor}
- Primary Known Bottleneck: ${pain}
- Signals: ${(lead?.buyingSignals || []).join(', ') || 'Scaling outbound sales'}

OBJECTION RAISED BY PROSPECT ON LIVE CALL:
"${text}"

GURU STYLE TO APPLY: ${guruStyle} (e.g. Josh Braun disarming peer, Chris Voss tactical empathy, or Benjamin Dennehy radical honesty)

Write an ultra-customized ARM (Acknowledge, Respond, Move) rebuttal:
1. ACKNOWLEDGE: Disarm defensiveness. Validate why they feel this way without arguing or sounding robotic.
2. RESPOND: Reframe their objection by tying it directly to their specific company scale (${headcount}), tech (${tech}), or competitor setup (${competitor}). Explain the contrast without a canned pitch.
3. MOVE: Propose a low-pressure, anti-sales question (e.g. permission-based, no-oriented, or giving them total freedom to decline).

Return strict JSON conforming to:
{
  "has_objection": true,
  "objection_type": "Category (e.g. Pricing, Incumbent, Brush-Off, Training, Skepticism)",
  "acknowledge": "Spoken acknowledgment sentence.",
  "respond": "Spoken response sentence grounded in their unique persona.",
  "move": "Spoken low-friction closing question.",
  "fullSpoken": "Full spoken paragraph for teleprompter.",
  "personaAngle": "1-sentence note on why this angle works for ${company}"
}

If the input is just a friendly greeting or neutral comment with NO objection or resistance, return:
{ "has_objection": false }

Output pure JSON only.`;

      for (const model of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.3,
                maxOutputTokens: 600
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (candidateText) {
              const cleaned = candidateText.replace(/^```json/i, '').replace(/```$/i, '').trim();
              const parsed = JSON.parse(cleaned);
              if (parsed.has_objection) {
                return NextResponse.json<ArmRebuttalResponse>({
                  has_objection: true,
                  objection_type: parsed.objection_type || 'Sales Friction',
                  acknowledge: parsed.acknowledge,
                  respond: parsed.respond,
                  move: parsed.move,
                  source: 'ai_inference',
                  latency_ms: Date.now() - startTime
                });
              } else {
                return NextResponse.json<ArmRebuttalResponse>({
                  has_objection: false,
                  latency_ms: Date.now() - startTime
                });
              }
            }
          }
        } catch (modelErr) {
          console.warn(`[Rebuttal API] Model ${model} notice:`, modelErr);
        }
      }
    }

    // --- TIER 2: DATABASE & RULE FALLBACK ---
    const PRESET_OBJECTIONS = [
      {
        type: 'Incumbent Vendor',
        keywords: ['already have', 'already use', 'work with another', 'existing vendor', 'current agency', 'internal team', 'locked into', 'in-house', 'contract with', 'titan'],
        acknowledge: `100% fair, ${lead?.name ? lead.name.split(' ')[0] : 'Julian'}—you have an established rhythm with them.`,
        respond: `Most leaders managing ${lead?.headcount || '250 seats'} tell us their incumbent does fine on volume, but callers get shopped on price the second a prospect picks up.`,
        move: 'Would you be completely opposed to a 10-minute diagnostic to benchmark how other BPOs insulated their margins?'
      },
      {
        type: 'Budget / Pricing',
        keywords: ['no budget', 'too expensive', 'cannot afford', 'cost prohibitive', 'cutting costs', 'tight budget', 'price is too high', 'rate card', 'cost?'],
        acknowledge: 'I completely get it—running an outbound floor means protecting every dollar of margin.',
        respond: `This replaces the money already burned when callers fumble leads from ${lead?.outsourcer || 'shared lists'}.`,
        move: 'Let’s take budget off the table. Take 15 minutes with Emil; if the math doesn’t show an immediate return, we shake hands and walk away. Fair?'
      },
      {
        type: 'Timing / Send Info',
        keywords: ['send an email', 'send me an email', 'send info', 'send your deck', 'call me back', 'busy right now', 'bad time'],
        acknowledge: 'Happy to do that! I know you have a busy floor to manage.',
        respond: `Because we customize our live coaching to your exact service lines and ${lead?.headcount || 'seats'}, a generic PDF won’t show you how it works on live calls.`,
        move: 'Give Emil just 15 minutes on screen. If you don’t find it valuable in 5 minutes, you can hang up. How does Thursday look?'
      }
    ];

    const detectedPreset = PRESET_OBJECTIONS.find(item =>
      item.keywords.some(kw => lowerText.includes(kw))
    );

    if (detectedPreset) {
      return NextResponse.json<ArmRebuttalResponse>({
        has_objection: true,
        objection_type: detectedPreset.type,
        acknowledge: detectedPreset.acknowledge,
        respond: detectedPreset.respond,
        move: detectedPreset.move,
        source: 'rule_engine',
        latency_ms: Date.now() - startTime
      });
    }

    return NextResponse.json<ArmRebuttalResponse>({
      has_objection: false,
      latency_ms: Date.now() - startTime
    });

  } catch (error) {
    console.error('[Rebuttal API] Error processing objection:', error);
    return NextResponse.json<ArmRebuttalResponse>(
      { has_objection: false, latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}

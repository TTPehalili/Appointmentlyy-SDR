import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';
import { 
  COLD_EMAIL_FRAMEWORKS,
  sanitizeColdEmail,
  getDeterministicColdEmail,
  enforceMaxThreeWords,
  suggestSubjectLinesFromIdea,
  ColdEmailGeneratedDraft
} from '@/lib/coldEmailStudio';

interface ColdEmailApiPayload {
  action?: 'generate-email' | 'suggest-subject-lines';
  frameworkId?: string;
  userIdea?: string;
  subjectLineIdea?: string;
  emailBody?: string;
  prospect?: {
    name?: string;
    company?: string;
    title?: string;
    techStack?: string;
    painPoint?: string;
    headcount?: string;
  };
  tone?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const payload: ColdEmailApiPayload = await req.json();
    const { 
      action = 'generate-email',
      frameworkId = 'braun-poke-the-bear', 
      userIdea = '', 
      subjectLineIdea = '',
      emailBody = '',
      prospect = { name: 'Julian', company: 'Apex BPO', title: 'Director of Outbound Operations' },
      tone = 'Crisp & Direct'
    } = payload;

    const googleApiKey = process.env.GOOGLE_API_KEY;
    const selectedFramework = COLD_EMAIL_FRAMEWORKS.find(f => f.id === frameworkId) || COLD_EMAIL_FRAMEWORKS[0];

    const targetName = prospect.name || 'Julian';
    const targetCompany = prospect.company || 'Apex BPO';
    const targetTitle = prospect.title || 'Outbound Leader';
    const targetTech = prospect.techStack || 'Apollo and HubSpot';
    const targetPain = prospect.painPoint || 'setters fumbling competitor objections and burning shared lists';

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash'
    ];

    // =========================================================================
    // ACTION 1: DEDICATED SUBJECT LINE IDEA ANALYZER (MAX 3 WORDS RULE)
    // =========================================================================
    if (action === 'suggest-subject-lines') {
      const ideaToAnalyze = (subjectLineIdea || userIdea || 'broker margin leaks').trim();

      if (googleApiKey) {
        const subjectPrompt = `You are an elite B2B sales copywriter specializing in ultra-short, high open-rate subject lines for manual sales emails.
The user wants subject line variations based on their idea: "${ideaToAnalyze}".
Target Prospect: ${targetCompany} (${targetName}, ${targetTitle}).
Identified Pain / Context: ${targetPain}.
Email Body Context: ${emailBody || 'Focused on BPO caller performance, seat economics, and lead burn'}.

MANDATORY RULES (CRITICAL):
1. MAXIMUM OF 3 WORDS ONLY: Every subject line MUST have 1, 2, or 3 words ONLY (e.g. "quick question", "apex lead burn", "broker margin leak", "seat conversion leak", "rookie ramp time").
2. 4 WORDS OR MORE IS STRICTLY FORBIDDEN.
3. ALL LOWERCASE: Use all lowercase for casual, natural peer-to-peer tone.
4. ZERO PUNCTUATION & ZERO EMOJIS: No periods, no commas, no dashes, no emojis.
5. Provide exactly 3 distinct variations:
   - Variation 1 (Friction Hook): Direct bottleneck or pain from the user's idea.
   - Variation 2 (Low Friction): Casual internal peer note (e.g. "quick question").
   - Variation 3 (Seat Economics): Operational scale or metric angle.

Return strictly valid JSON:
{
  "subjectLines": [
    { "label": "Friction Hook", "text": "max 3 words", "angle": "Based on your idea • Max 3 words" },
    { "label": "Low Friction", "text": "max 3 words", "angle": "Casual internal peer note" },
    { "label": "Seat Economics", "text": "max 3 words", "angle": "Account & metric observation" }
  ]
}
Output valid JSON only. Do not wrap in markdown fences.`;

        for (const model of candidateModels) {
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: subjectPrompt }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.5,
                  maxOutputTokens: 300
                }
              })
            });

            if (res.ok) {
              const data = await res.json();
              const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleanedJson);

              if (parsed && Array.isArray(parsed.subjectLines) && parsed.subjectLines.length > 0) {
                const sanitized = parsed.subjectLines.map((s: any) => ({
                  label: s.label || 'Subject',
                  text: enforceMaxThreeWords(s.text || ''),
                  angle: s.angle || 'Max 3 words lowercase'
                }));

                return NextResponse.json({
                  source: 'gemini_ai',
                  modelUsed: model,
                  subjectLines: sanitized
                });
              }
            }
          } catch (callErr) {
            console.warn(`[ColdEmailStudio] Subject lines model ${model} failed:`, callErr);
          }
        }
      }

      // Fallback generator enforcing max 3 words
      const fallbackSubjects = suggestSubjectLinesFromIdea(ideaToAnalyze, {
        name: targetName,
        company: targetCompany,
        title: targetTitle
      });

      return NextResponse.json({
        source: 'deterministic_fallback',
        subjectLines: fallbackSubjects
      });
    }

    // =========================================================================
    // ACTION 2: FULL COLD EMAIL SYNTHESIS WITH MAX 3-WORD SUBJECT LINES
    // =========================================================================
    const prompt = `You are an elite enterprise B2B sales copywriter and manual cold email specialist.
Your goal is to write a manual cold email that an SDR or BDM can copy and paste into Gmail/Outlook to send to a decision maker.

TARGET PROSPECT:
- Name: ${targetName}
- Company: ${targetCompany}
- Title: ${targetTitle}
- Tech Stack: ${targetTech}
- Identified Pain: ${targetPain}

USER RAW IDEA / STRATEGY:
"${userIdea || selectedFramework.defaultIdeaTemplate}"

FRAMEWORK TO ADHERE TO:
Name: ${selectedFramework.name} (${selectedFramework.authorOrStyle})
Framework Instructions:
${selectedFramework.promptInstruction}

MANDATORY COPYWRITING RULES (STRICT VIOLATION IF BROKEN):
1. ZERO EM DASHES: Do NOT use em dashes ("—", "–", or "--") anywhere. Use periods, commas, or clean short clauses.
2. ZERO EMOJIS: Do NOT use a single emoji anywhere.
3. CONCISE: Body must be strictly between 40 and 70 words total. Zero marketing fluff. Zero pleasantries like "Hope you are doing well" or "I am reaching out because".
4. ANTI-SALES CTA: The ending sentence must be low-friction, permission-based, or no-oriented.
5. SUBJECT LINES: Provide 3 short subject lines with MAXIMUM OF 3 WORDS ONLY (strictly 1 to 3 words, lowercase, no punctuation).

OUTPUT FORMAT:
Return strictly a valid JSON object matching this schema:
{
  "subjectLines": [
    { "label": "Friction Hook", "text": "max 3 words", "angle": "Uncovers hidden leak" },
    { "label": "Low Friction", "text": "max 3 words", "angle": "Under 3 words lowercase" },
    { "label": "Seat Economics", "text": "max 3 words", "angle": "Operational focus" }
  ],
  "body": "The full cold email body including greeting and sign-off. Use double line breaks \\n\\n between paragraphs. Max 65 words.",
  "structuralBreakdown": {
    "triggerOrHook": "1-sentence hook",
    "tensionOrObservation": "1-sentence tension or problem observation",
    "truthOrValue": "1-sentence core consultative truth",
    "ctaSentence": "1-sentence low friction question"
  },
  "ctaVariations": [
    { "label": "Interest-Based", "text": "1-sentence question", "style": "Interest-Based" },
    { "label": "No-Oriented", "text": "1-sentence negative constraint question", "style": "No-Oriented" },
    { "label": "Permission-Video", "text": "1-sentence permission question", "style": "Permission-Video" }
  ],
  "readingGradeLevel": "5th Grade"
}
Output valid JSON only. Do not wrap in markdown fences.`;

    if (googleApiKey) {
      for (const model of candidateModels) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.4,
                maxOutputTokens: 600
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedJson);

            if (parsed && parsed.body) {
              const { cleanText, emDashesCount, emojisCount } = sanitizeColdEmail(parsed.body);
              const sanitizedSubjects = (parsed.subjectLines || []).map((s: any) => ({
                label: s.label || 'Subject',
                text: enforceMaxThreeWords(s.text || ''),
                angle: s.angle || 'Max 3 words lowercase'
              }));

              const sanitizedCtas = (parsed.ctaVariations || []).map((c: any) => ({
                label: c.label || 'CTA',
                text: sanitizeColdEmail(c.text || '').cleanText,
                style: c.style || 'Interest-Based'
              }));

              const result: ColdEmailGeneratedDraft = {
                id: `ai-draft-${Date.now()}`,
                subjectLines: sanitizedSubjects.length > 0 ? sanitizedSubjects : [
                  { label: 'Low Friction', text: 'quick question', angle: 'Minimal cognitive load' }
                ],
                selectedSubjectIndex: 0,
                body: cleanText,
                structuralBreakdown: {
                  triggerOrHook: sanitizeColdEmail(parsed.structuralBreakdown?.triggerOrHook || '').cleanText,
                  tensionOrObservation: sanitizeColdEmail(parsed.structuralBreakdown?.tensionOrObservation || '').cleanText,
                  truthOrValue: sanitizeColdEmail(parsed.structuralBreakdown?.truthOrValue || '').cleanText,
                  ctaSentence: sanitizeColdEmail(parsed.structuralBreakdown?.ctaSentence || '').cleanText
                },
                ctaVariations: sanitizedCtas.length > 0 ? sanitizedCtas : [
                  { label: 'Interest-Based', text: 'Worth a quick look, or bad timing?', style: 'Interest-Based' }
                ],
                selectedCtaIndex: 0,
                wordCount: cleanText.split(/\s+/).filter(Boolean).length,
                readingGradeLevel: parsed.readingGradeLevel || '5th Grade',
                frameworkUsed: selectedFramework.name,
                prospectTargetName: targetName,
                prospectTargetCompany: targetCompany,
                userRawIdea: userIdea,
                sanitizationAudit: {
                  emDashesRemoved: emDashesCount,
                  emojisRemoved: emojisCount,
                  isClean: true
                }
              };

              return NextResponse.json({
                source: 'gemini_ai',
                modelUsed: model,
                draft: result
              });
            }
          }
        } catch (callErr) {
          console.warn(`[ColdEmailStudio] Model ${model} failed, attempting next:`, callErr);
        }
      }
    }

    // Deterministic fallback if API offline or rate-limited
    const fallback = getDeterministicColdEmail(frameworkId, userIdea, {
      name: targetName,
      company: targetCompany,
      title: targetTitle
    });

    return NextResponse.json({
      source: 'deterministic_fallback',
      draft: fallback
    });

  } catch (error: any) {
    console.error('Error generating cold email:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate cold email' },
      { status: 500 }
    );
  }
}

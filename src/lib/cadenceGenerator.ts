/**
 * Context-Injected Live Cadence Engine
 * Injects lead metadata into cold outreach scripts across Cold Call, Email, and LinkedIn.
 */

import { Lead, CadencePackage } from '@/types';

export class CadenceGenerator {
  public static async generateCadenceForLead(
    lead: Lead,
    campaignContext = 'BPO Outbound Demand Generation'
  ): Promise<CadencePackage> {
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Prospect';
    const company = lead.company || 'your team';
    const title = lead.title || 'Executive';
    const custom = lead.custom_variables || {};

    const techStack = custom['Tech Stack'] || custom.tech_stack || custom.tech || 'Salesforce & Outreach';
    const outsourcer = custom['Current Outsourcer'] || custom.outsourcer || custom.incumbent || 'an incumbent agency';
    const painPoint = custom['Pain Point'] || custom.pain_point || 'outbound hold rate and show-up drop-off';

    // 1. If Gemini is available, generate ultra-personalized copy
    if (googleApiKey) {
      try {
        const prompt = `You are an elite sales cadence architect for enterprise outbound BDRs.
Generate tailored multi-channel outreach copy for this prospect:

Lead Name: ${name}
Company: ${company}
Job Title: ${title}
Tech Stack: ${techStack}
Current Outsourcer / Setup: ${outsourcer}
Key Friction / Pain Point: ${painPoint}
Campaign Context: ${campaignContext}

Output a STRICT JSON object conforming exactly to this structure:
{
  "coldCallOpener": "Opening 2 sentences acknowledging their title, referencing their tech/vendor setup, and asking permission for 20 seconds without sounding robotic.",
  "diagnosticQuestion": "A provocative disqualifying question uncovering their exact bottleneck.",
  "emailSubject": "Punchy under-4-word subject line in lowercase",
  "emailBody": "Short 3-paragraph consultative email under 90 words with high specificity.",
  "linkedInConnection": "Personalized connection invite note strictly under 280 characters.",
  "linkedInInMail": "2-paragraph direct InMail focused on their workflow bottleneck."
}

Return pure JSON only.`;

        // Fast, available models first; each try is capped so a slow model can't stall the import.
        let res: Response | null = null;
        for (const model of ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest']) {
          try {
            res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
                }),
                signal: AbortSignal.timeout(15000)
              }
            );
            if (res.ok) break;
          } catch {
            res = null;
          }
        }

        if (res?.ok) {
          const data = await res.json();
          const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate) {
            const parsed = JSON.parse(candidate);
            return {
              leadId: lead.id,
              leadName: name,
              company,
              coldCallOpener: parsed.coldCallOpener,
              diagnosticQuestion: parsed.diagnosticQuestion,
              emailSubject: parsed.emailSubject,
              emailBody: parsed.emailBody,
              linkedInConnection: parsed.linkedInConnection,
              linkedInInMail: parsed.linkedInInMail
            };
          }
        }
      } catch (err) {
        console.warn('[CadenceGenerator] AI synthesis notice, utilizing template engine:', err);
      }
    }

    // 2. High-converting deterministic template generator
    return {
      leadId: lead.id,
      leadName: name,
      company,
      coldCallOpener: `Hey ${lead.first_name || 'there'}, know I caught you out of the blue. I noticed your team at ${company} is running ${techStack}—do you have 20 seconds for me to tell you why I called, and you can tell me if it makes sense?`,
      diagnosticQuestion: `Most leaders in ${title} roles we speak with tell us that despite having ${outsourcer}, their biggest leak is still ${painPoint}. Are you seeing that on your reps' calendars, or is outbound already exceeding quota?`,
      emailSubject: `${company} <> ${techStack} outbound bottleneck`,
      emailBody: `Hi ${lead.first_name || 'there'},\n\nNoticed ${company} is scaling outbound with ${techStack}. Typically when teams partner with ${outsourcer}, the tier-1 volume is fine, but ${painPoint} causes 30% of discovery meetings to slip through the cracks.\n\nWe engineered Boris AI to give outbound SDRs sub-second live objection handling on live calls, doubling qualification hold-rates.\n\nOpen to a 5-minute diagnostic to benchmark your current cost-per-discovery next Thursday?`,
      linkedInConnection: `Hi ${lead.first_name || 'there'} - came across your work leading ${title} at ${company}. Curious how your team is optimizing ${painPoint} with ${techStack}. Would love to connect!`,
      linkedInInMail: `Hi ${lead.first_name || 'there'},\n\nSeeing how ${company} is scaling, many leaders in your shoes are reviewing whether ${outsourcer} is actually hitting discovery conversion targets.\n\nWould you be open to a 2-minute breakdown on how Boris AI intercepts objection drop-offs in real time?`
    };
  }
}

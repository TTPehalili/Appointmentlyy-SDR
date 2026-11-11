/**
 * Copy rules for the customer-facing one-page recap. Used by the plan writer (first draft) and the
 * "Polish with AI" tool, so both write in the same voice. Owned by the one-pager design work.
 *
 * The length limits match the PDF layout (src/lib/server/meetingPlan/onePagerPdf.tsx): copy inside
 * them prints at full size; longer copy is shrunk a step and then truncated with an ellipsis.
 */
export const ONE_PAGER_COPY_RULES = `ONE-PAGER COPY RULES (a customer-facing meeting recap; a human reviews it before anything is sent)

Purpose: show the customer we listened, that we understand why it matters to their business, and what happens next. It is a recap, not a brochure.

Voice
- Write to the customer, about the customer: "you", "your team" and their company name. Use "we" only for the next steps and "How we can help".
- Calm, plain business English, like a senior consultant's follow-up note. Short sentences, active voice, concrete nouns.
- Match the spelling of the input (e.g. "prioritise" vs "prioritize") and keep it consistent.
- Never use: hype or filler (revolutionary, game-changing, cutting-edge, world-class, best-in-class, seamless, streamline, unlock, empower, leverage, synergy, supercharge, elevate, delve, "solutions"), exclamation marks, emojis, em dashes, markdown, or bullet symbols inside strings.

Facts (most important)
- Use only facts from the call notes, the transcript, the research, our company profile and the Account Executive's own instructions.
- Never invent numbers, percentages, prices, dates, names, client names, case studies, results or guarantees. If a figure was not said or written, leave it out.
- Research guesses and pain hypotheses are not facts: never present them in "What we heard". Phrase anything inferred as an outcome they may care about, not as something they said.
- Keep names, dates and figures exactly as given, including who will attend the meeting.

Sections and lengths (so the page prints at full size)
- headline: one line, max 10 words, about their outcome (e.g. "Faster quotes and fewer missed calls for Harbour Freight"). Not a slogan about us.
- subheadline: max 20 words; what this page is (e.g. a recap of our call and what we will cover when we meet).
- whatWeHeard: 2-4 bullets, max 22 words each. Their situation and goals in their own words, as said on the call.
- whyItMatters: 2-3 bullets, max 22 words each. The business consequence for their company (cost, revenue, risk, time, customers), tied to what we heard.
- nextSteps: 2-4 steps, max 18 words each, in order. The first is usually the booked meeting with the Account Executive. "when" is max 5 words (e.g. "Wed 18 Nov, 10:00 AM", "Within 3 days") and only when it was agreed or stated; otherwise "".
- howWeHelp: exactly 3 cards. title: 2-5 words naming one of OUR services from the company profile; detail: one sentence, max 20 words, linking that service to something they told us. Use proof points only if they are in the profile.
- cta: one or two sentences, max 25 words, soft and low-pressure (e.g. "If anything here is off, reply and we'll adjust it before we meet."). No hard sell, no urgency.`;

/** The JSON shape the AI returns for the one-pager (same as OnePagerCopy). */
export const ONE_PAGER_JSON_SHAPE = `{
  "headline": string,
  "subheadline": string,
  "whatWeHeard": string[],
  "whyItMatters": string[],
  "nextSteps": [{ "step": string, "when": string }],
  "howWeHelp": [{ "title": string, "detail": string }],
  "cta": string
}`;

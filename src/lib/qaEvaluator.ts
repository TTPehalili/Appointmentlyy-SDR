/**
 * Automated Post-Call QA Grading and ARM Scoring Engine
 * Analyzes call transcripts against BPO outbound frameworks, measuring script adherence,
 * ARM objection handling execution, and talk-to-listen ratios.
 */

export interface DialogueTurn {
  role: 'prospect' | 'rep';
  content: string;
  timestamp?: string;
  armTag?: 'A' | 'R' | 'M' | null;
  coachingFeedback?: string;
}

export interface QaEvaluationResult {
  sessionId: string;
  overallScore: number;
  overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  armExecutionScore: number;
  scriptAdherenceScore: number;
  talkToListenRatio: {
    repPercent: number;
    prospectPercent: number;
    isOptimal: boolean;
  };
  annotatedTranscript: DialogueTurn[];
  strengths: string[];
  weaknesses: string[];
  coachingActionItems: string[];
}

export class QaEvaluator {
  /**
   * Evaluates a full call transcript against the ARM BPO sales rubric
   */
  public static async evaluateCall(
    sessionId: string,
    transcript: DialogueTurn[],
    scenarioContext?: string
  ): Promise<QaEvaluationResult> {
    const googleApiKey = process.env.GOOGLE_API_KEY;

    // 1. Calculate talk-to-listen ratio from dialogue turns
    let repWords = 0;
    let prospectWords = 0;

    for (const turn of transcript) {
      const words = turn.content.trim().split(/\s+/).length;
      if (turn.role === 'rep') {
        repWords += words;
      } else {
        prospectWords += words;
      }
    }

    const totalWords = repWords + prospectWords || 1;
    const repPercent = Math.round((repWords / totalWords) * 100);
    const prospectPercent = 100 - repPercent;
    const isOptimalRatio = repPercent >= 40 && repPercent <= 58;

    // 2. AI-driven granular rubric grading if Gemini is configured
    if (googleApiKey && transcript.length >= 2) {
      try {
        const transcriptFormatted = transcript
          .map((t, idx) => `[Turn ${idx + 1}] ${t.role.toUpperCase()}: "${t.content}"`)
          .join('\n');

        const prompt = `You are a world-class VP of Sales Enablement and BPO Quality Assurance Auditor.
Grade this cold call roleplay transcript strictly on the ARM (Acknowledge, Respond, Move) objection handling methodology and consultative script execution.

Scenario Context: ${scenarioContext || 'Outbound cold call to mid-market executive'}

Transcript:
${transcriptFormatted}

Evaluate the rep's performance and return a STRICT JSON response:
{
  "overallScore": 88,
  "overallGrade": "A",
  "armExecutionScore": 92,
  "scriptAdherenceScore": 85,
  "strengths": [
    "Specific positive observation 1",
    "Specific positive observation 2"
  ],
  "weaknesses": [
    "Specific critique 1",
    "Specific critique 2"
  ],
  "coachingActionItems": [
    "Concrete tactical advice 1",
    "Concrete tactical advice 2"
  ],
  "turnAnnotations": [
    {
      "turnIndex": 1,
      "armTag": "A",
      "feedback": "Concise coaching note on this rep turn"
    }
  ]
}

Only rep turns should be annotated in turnAnnotations. 'armTag' should be 'A', 'R', 'M', or null.
Return valid JSON only.`;

        interface TurnAnnotation {
          turnIndex: number;
          armTag?: 'A' | 'R' | 'M' | null;
          feedback?: string;
        }

        interface ParsedQaOutput {
          overallScore?: number;
          overallGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
          armExecutionScore?: number;
          scriptAdherenceScore?: number;
          strengths?: string[];
          weaknesses?: string[];
          coachingActionItems?: string[];
          turnAnnotations?: TurnAnnotation[];
        }

        // Fast, available models first; each try is capped so a slow model can't stall the scorecard.
        const candidateModels = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash'];
        let parsed: ParsedQaOutput | null = null;

        for (const model of candidateModels) {
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
                }),
                signal: AbortSignal.timeout(20000)
              }
            );

            if (res.ok) {
              const data = await res.json();
              const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (candidate) {
                parsed = JSON.parse(candidate) as ParsedQaOutput;
                break;
              }
            }
          } catch (modelErr) {
            console.warn(`[QaEvaluator] Error with ${model}:`, modelErr);
          }
        }

        if (parsed) {
          // Merge turn annotations into transcript
          const annotated = transcript.map((turn, idx) => {
              const ann = (parsed.turnAnnotations || []).find((a: TurnAnnotation) => a.turnIndex === idx + 1);
              return {
                ...turn,
                armTag: ann?.armTag || null,
                coachingFeedback: ann?.feedback || undefined
              };
            });

            return {
              sessionId,
              overallScore: Math.min(100, Math.max(0, parsed.overallScore || 80)),
              overallGrade: parsed.overallGrade || this.computeGrade(parsed.overallScore || 80),
              armExecutionScore: Math.min(100, Math.max(0, parsed.armExecutionScore || 82)),
              scriptAdherenceScore: Math.min(100, Math.max(0, parsed.scriptAdherenceScore || 78)),
              talkToListenRatio: { repPercent, prospectPercent, isOptimal: isOptimalRatio },
              annotatedTranscript: annotated,
              strengths: parsed.strengths || ['Maintained steady conversational composure under pushback'],
              weaknesses: parsed.weaknesses || ['Could tighten value proposition brevity under 15 seconds'],
              coachingActionItems: parsed.coachingActionItems || ['Focus on transitioning from [R] to [M] with a 10-minute diagnostic question']
            };
          }
      } catch (err) {
        console.warn('[QaEvaluator] AI grading notice, utilizing heuristic scoring:', err);
      }
    }

    // Heuristic Fallback Evaluator
    return this.fallbackHeuristicScoring(sessionId, transcript, repPercent, prospectPercent, isOptimalRatio);
  }

  private static fallbackHeuristicScoring(
    sessionId: string,
    transcript: DialogueTurn[],
    repPercent: number,
    prospectPercent: number,
    isOptimal: boolean
  ): QaEvaluationResult {
    let armCount = 0;
    const annotated = transcript.map(turn => {
      if (turn.role === 'rep') {
        const text = turn.content.toLowerCase();
        let tag: 'A' | 'R' | 'M' | null = null;
        let feedback = 'Standard response delivery.';

        if (text.includes('understand') || text.includes('hear you') || text.includes('fair point') || text.includes('makes sense')) {
          tag = 'A';
          feedback = 'Strong tactical empathy acknowledgment.';
          armCount++;
        } else if (text.includes('most teams') || text.includes('differentiator') || text.includes('model') || text.includes('instead of')) {
          tag = 'R';
          feedback = 'Effective value proposition reframe without defensiveness.';
          armCount++;
        } else if (text.includes('?') && (text.includes('diagnostic') || text.includes('benchmark') || text.includes('calendar') || text.includes('thursday'))) {
          tag = 'M';
          feedback = 'Assertive low-friction micro-commitment closing move.';
          armCount++;
        }

        return { ...turn, armTag: tag, coachingFeedback: feedback };
      }
      return turn;
    });

    const armScore = Math.min(95, Math.max(60, 65 + armCount * 10));
    const scriptScore = isOptimal ? 88 : 74;
    const overallScore = Math.round((armScore * 0.6) + (scriptScore * 0.4));

    return {
      sessionId,
      overallScore,
      overallGrade: this.computeGrade(overallScore),
      armExecutionScore: armScore,
      scriptAdherenceScore: scriptScore,
      talkToListenRatio: { repPercent, prospectPercent, isOptimal },
      annotatedTranscript: annotated,
      strengths: [
        'Quick tone validation without arguing with prospect objections',
        'Maintained structured cadence across conversational turns'
      ],
      weaknesses: [
        'Could tighten acknowledgment phrase brevity to keep talk ratio below 50%',
        'Ensure closing move asks for a benchmark diagnostic rather than generic demo'
      ],
      coachingActionItems: [
        'Practice the 3-second Rule: Validate prospect skepticism before pitching value',
        'Use the Incumbent Pivot: Frame Boris as an overflow multiplier'
      ]
    };
  }

  private static computeGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

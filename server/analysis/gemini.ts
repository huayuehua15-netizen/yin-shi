import { GoogleGenAI, Type } from '@google/genai';
import { APP_VERSION } from '../config';
import { normalizeParsedAnalysis } from './normalize';
import type { AnalysisMeta, AnalysisResult } from './types';

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': `cadence/${APP_VERSION}`,
      },
    },
  });
}

export async function transcribeWithGemini(
  ai: GoogleGenAI,
  audioBase64: string,
  mimeType: string,
  speakerARole: string,
  speakerBRole: string
): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: audioBase64,
          },
        },
        {
          text: `Transcribe this sales call audio verbatim. Identify speaker turns as Speaker A (${speakerARole}) and Speaker B (${speakerBRole}), and include approximate [MM:SS] timestamps at the start of each speaker turn.`,
        },
      ],
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Transcription returned empty text from Gemini.');
  }
  return text;
}

const analysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    durationSec: {
      type: Type.INTEGER,
      description: 'Total estimated duration of the call in seconds (minimum 30).',
    },
    transcript: {
      type: Type.ARRAY,
      description: 'Speaker-diarized transcript turns in chronological order.',
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: {
            type: Type.STRING,
            description: 'Must be exactly "Speaker A" or "Speaker B".',
          },
          speakerLabel: {
            type: Type.STRING,
            description: 'Human-readable speaker name or role.',
          },
          startSec: { type: Type.INTEGER },
          endSec: { type: Type.INTEGER },
          text: { type: Type.STRING },
          sentimentScore: {
            type: Type.NUMBER,
            description: 'Sentiment score from -1.0 (negative) to 1.0 (positive).',
          },
          topicTag: {
            type: Type.STRING,
            description: 'Short 1-3 word topic label for this turn.',
          },
        },
        required: ['speaker', 'speakerLabel', 'startSec', 'endSec', 'text', 'sentimentScore'],
      },
    },
    sentimentTimeline: {
      type: Type.ARRAY,
      description:
        '8 to 14 evenly spaced engagement and sentiment points across the call duration.',
      items: {
        type: Type.OBJECT,
        properties: {
          timeSec: { type: Type.INTEGER },
          engagement: {
            type: Type.INTEGER,
            description: 'Overall conversational engagement score 0 to 100.',
          },
          prospectSentiment: {
            type: Type.INTEGER,
            description: 'Prospect sentiment positivity score 0 to 100.',
          },
          repEnergy: {
            type: Type.INTEGER,
            description: 'Salesperson energy and pacing score 0 to 100.',
          },
          label: {
            type: Type.STRING,
            description:
              'Optional concise inflection label for peaks, dips, objections, or commitments.',
          },
          milestoneType: {
            type: Type.STRING,
            description: 'Optional: "peak", "dip", "objection", or "commitment".',
          },
        },
        required: ['timeSec', 'engagement', 'prospectSentiment', 'repEnergy'],
      },
    },
    coaching: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: '2-sentence executive summary of the call performance.',
        },
        strengths: {
          type: Type.ARRAY,
          description: 'Exactly 3 specific things the salesperson did well.',
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              detail: { type: Type.STRING },
              evidenceQuote: { type: Type.STRING },
              timestampSec: { type: Type.INTEGER },
            },
            required: ['title', 'detail', 'evidenceQuote', 'timestampSec'],
          },
        },
        missedOpportunities: {
          type: Type.ARRAY,
          description: 'Exactly 3 specific missed opportunities or coaching improvements.',
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              detail: { type: Type.STRING },
              evidenceQuote: { type: Type.STRING },
              timestampSec: { type: Type.INTEGER },
            },
            required: ['title', 'detail', 'evidenceQuote', 'timestampSec'],
          },
        },
        nextStepRecommendation: {
          type: Type.STRING,
          description: 'Concrete recommended follow-up action for the salesperson.',
        },
      },
      required: ['summary', 'strengths', 'missedOpportunities', 'nextStepRecommendation'],
    },
  },
  required: ['durationSec', 'transcript', 'sentimentTimeline', 'coaching'],
};

export async function analyzeTranscriptWithGemini(
  ai: GoogleGenAI,
  rawTranscript: string,
  meta: AnalysisMeta
): Promise<AnalysisResult> {
  const durationHint =
    meta.durationHintSec && meta.durationHintSec > 0 ? meta.durationHintSec : 120;

  const prompt = `Analyze the following sales call transcript and return structured sales coaching intelligence evaluated through the ${meta.methodology} framework for a ${meta.callStage} call.

Call Context:
- Title: ${meta.title}
- Account: ${meta.accountName}
- Call Stage: ${meta.callStage}
- Coaching Methodology: ${meta.methodology}
- Speaker A (Salesperson): ${meta.speakerARole}
- Speaker B (Prospect): ${meta.speakerBRole}
- Approximate Audio Duration (seconds): ${durationHint}

Instructions:
1. Segment and diarize the transcript cleanly between "Speaker A" (the salesperson) and "Speaker B" (the prospect). Preserve the spoken meaning accurately with monotonic startSec/endSec timestamps fitting within the call duration.
2. Produce an 8 to 14 point sentimentTimeline covering 0s to the end of the call, scoring overall conversational engagement (0-100), prospectSentiment (0-100), and repEnergy (0-100). Annotate notable peaks, dips, objections, or commitments with milestoneType and short labels.
3. Produce a coaching card tailored to ${meta.methodology}:
   - summary: concise 2-sentence executive assessment
   - strengths: EXACTLY 3 concrete things the salesperson did well, each with a verbatim evidenceQuote from the transcript and its timestampSec
   - missedOpportunities: EXACTLY 3 concrete missed opportunities or gaps, each with a verbatim evidenceQuote and timestampSec
   - nextStepRecommendation: specific next action for the deal.

Transcript:
"""
${rawTranscript}
"""`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are a principal enterprise sales coach and revenue intelligence analyst. Always return valid JSON matching the requested schema. Never fabricate transcript claims outside the provided conversation.',
      responseMimeType: 'application/json',
      responseSchema: analysisResponseSchema,
    },
  });

  const jsonText = response.text?.trim();
  if (!jsonText) {
    throw new Error('Analysis returned empty response from Gemini.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to parse structured coaching JSON from Gemini.');
  }

  return normalizeParsedAnalysis(parsed, meta, durationHint);
}

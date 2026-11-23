import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  addCallRecord,
  deleteCallRecord,
  readAllCalls,
  resolveSafeAudioPath,
  saveAudioUpload,
  updateCallRecord,
} from './server/store';
import { analyzeTranscriptLocally, generateLocalCoachReply } from './server/localAnalyzer';
import type {
  CallStage,
  CoachingCard,
  CoachingMethodology,
  CoachingPoint,
  MilestoneType,
  SalesCallRecord,
  SentimentPoint,
  SpeakerRole,
  TranscriptSegment,
} from './src/types/call';
import { normalizeSpeakerNames } from './src/utils/callAnalytics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

type LlmProviderMode = 'gemini' | 'openai-compatible' | 'local';

function hasValidGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

function hasOpenAiCompatibleConfig(): boolean {
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return Boolean(baseUrl || (apiKey && apiKey !== 'MY_OPENAI_API_KEY'));
}

function hasAudioTranscriptionBackend(): boolean {
  if (hasValidGeminiKey()) return true;
  const whisperUrl = process.env.WHISPER_BASE_URL?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  return Boolean(whisperUrl || (openaiKey && openaiKey !== 'MY_OPENAI_API_KEY'));
}

function getProviderCapabilities(): {
  llmProvider: LlmProviderMode;
  audioTranscription: boolean;
  providerLabel: string;
} {
  const forcedProvider = process.env.CADENCE_PROVIDER?.trim().toLowerCase();
  if (forcedProvider === 'local') {
    return {
      llmProvider: 'local',
      audioTranscription: false,
      providerLabel: 'Zero-Key Local Engine',
    };
  }
  if ((forcedProvider === 'auto' || !forcedProvider || forcedProvider === 'gemini') && hasValidGeminiKey()) {
    return {
      llmProvider: 'gemini',
      audioTranscription: true,
      providerLabel: 'Gemini API',
    };
  }
  if (hasOpenAiCompatibleConfig()) {
    const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini';
    return {
      llmProvider: 'openai-compatible',
      audioTranscription: hasAudioTranscriptionBackend(),
      providerLabel: `OpenAI-compatible (${model})`,
    };
  }
  return {
    llmProvider: 'local',
    audioTranscription: false,
    providerLabel: 'Zero-Key Local Engine',
  };
}

function getGeminiClient(): GoogleGenAI {
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
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveAudioMimeType(mimetype: string | undefined, filename: string | undefined): string {
  if (mimetype && mimetype.startsWith('audio/')) {
    return mimetype;
  }
  if (mimetype === 'video/webm') {
    return 'audio/webm';
  }
  const ext = (filename || '').toLowerCase().split('.').pop();
  switch (ext) {
    case 'mp3':
      return 'audio/mp3';
    case 'wav':
      return 'audio/wav';
    case 'm4a':
      return 'audio/mp4';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'aac':
      return 'audio/aac';
    case 'webm':
    default:
      return 'audio/webm';
  }
}

function resolveMethodology(val: unknown): CoachingMethodology {
  if (val === 'MEDDPICC' || val === 'SPIN Selling' || val === 'Challenger') {
    return val;
  }
  return 'General B2B';
}

function resolveCallStage(val: unknown): CallStage {
  if (
    val === 'Discovery' ||
    val === 'Product Demo' ||
    val === 'Renewal & Expansion' ||
    val === 'Security & Procurement'
  ) {
    return val;
  }
  return 'Discovery';
}

async function transcribeWithGemini(
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
      description: '8 to 14 evenly spaced engagement and sentiment points across the call duration.',
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
            description: 'Optional concise inflection label for peaks, dips, objections, or commitments.',
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

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeCoachingPoints(
  points: unknown,
  fallbackDuration: number,
  fallbackTitlePrefix: string
): CoachingPoint[] {
  const arr = Array.isArray(points) ? points : [];
  const normalized: CoachingPoint[] = arr.slice(0, 3).map((item, idx) => {
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : `${fallbackTitlePrefix} ${idx + 1}`,
      detail: typeof obj.detail === 'string' && obj.detail.trim() ? obj.detail.trim() : 'Review this segment for specific phrasing and discovery depth.',
      evidenceQuote: typeof obj.evidenceQuote === 'string' && obj.evidenceQuote.trim() ? obj.evidenceQuote.trim() : 'No direct quote captured.',
      timestampSec: Math.round(clampNumber(obj.timestampSec, 0, Math.max(30, fallbackDuration), 0)),
    };
  });

  while (normalized.length < 3) {
    normalized.push({
      title: `${fallbackTitlePrefix} ${normalized.length + 1}`,
      detail: 'Insufficient call length to extract a third distinct observation in this category.',
      evidenceQuote: 'End of call reached.',
      timestampSec: 0,
    });
  }
  return normalized;
}

async function analyzeTranscriptWithGemini(
  ai: GoogleGenAI,
  rawTranscript: string,
  meta: {
    title: string;
    accountName: string;
    speakerARole: string;
    speakerBRole: string;
    methodology: CoachingMethodology;
    callStage: CallStage;
    durationHintSec?: number;
  }
): Promise<{
  durationSec: number;
  transcript: TranscriptSegment[];
  sentimentTimeline: SentimentPoint[];
  coaching: CoachingCard;
}> {
  const durationHint = meta.durationHintSec && meta.durationHintSec > 0 ? meta.durationHintSec : 120;

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

function normalizeParsedAnalysis(
  parsed: Record<string, unknown>,
  meta: {
    speakerARole: string;
    speakerBRole: string;
  },
  durationHint: number
): {
  durationSec: number;
  transcript: TranscriptSegment[];
  sentimentTimeline: SentimentPoint[];
  coaching: CoachingCard;
} {
  const rawTurns = Array.isArray(parsed.transcript) ? parsed.transcript : [];
  const durationSec = Math.max(
    15,
    Math.round(clampNumber(parsed.durationSec, 15, 7200, durationHint))
  );

  const transcript: TranscriptSegment[] = rawTurns
    .map((item, idx) => {
      const seg = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const speaker: SpeakerRole = seg.speaker === 'Speaker B' ? 'Speaker B' : 'Speaker A';
      const startSec = Math.round(clampNumber(seg.startSec, 0, durationSec, idx * 10));
      const endSec = Math.max(
        startSec + 1,
        Math.round(clampNumber(seg.endSec, startSec + 1, durationSec + 10, startSec + 12))
      );
      return {
        id: `turn-${Date.now()}-${idx}`,
        speaker,
        speakerLabel:
          typeof seg.speakerLabel === 'string' && seg.speakerLabel.trim()
            ? seg.speakerLabel.trim()
            : speaker === 'Speaker A'
              ? meta.speakerARole
              : meta.speakerBRole,
        startSec,
        endSec,
        text: typeof seg.text === 'string' ? seg.text.trim() : '',
        sentimentScore: clampNumber(seg.sentimentScore, -1, 1, 0),
        topicTag:
          typeof seg.topicTag === 'string' && seg.topicTag.trim()
            ? seg.topicTag.trim()
            : undefined,
      };
    })
    .filter((seg) => seg.text.length > 0);

  const maxTurnEnd = transcript.reduce((acc, seg) => Math.max(acc, seg.endSec), durationSec);
  const finalDurationSec = Math.max(durationSec, maxTurnEnd);

  const rawTimeline = Array.isArray(parsed.sentimentTimeline) ? parsed.sentimentTimeline : [];
  const sentimentTimeline: SentimentPoint[] = rawTimeline
    .map((pt) => {
      const obj = (pt && typeof pt === 'object' ? pt : {}) as Record<string, unknown>;
      const validMilestone: MilestoneType | undefined =
        obj.milestoneType === 'peak' ||
        obj.milestoneType === 'dip' ||
        obj.milestoneType === 'objection' ||
        obj.milestoneType === 'commitment'
          ? obj.milestoneType
          : undefined;
      return {
        timeSec: Math.round(clampNumber(obj.timeSec, 0, finalDurationSec, 0)),
        engagement: Math.round(clampNumber(obj.engagement, 0, 100, 65)),
        prospectSentiment: Math.round(clampNumber(obj.prospectSentiment, 0, 100, 60)),
        repEnergy: Math.round(clampNumber(obj.repEnergy, 0, 100, 70)),
        label: typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : undefined,
        milestoneType: validMilestone,
      };
    })
    .sort((a, b) => a.timeSec - b.timeSec);

  const rawCoaching = (
    parsed.coaching && typeof parsed.coaching === 'object' ? parsed.coaching : {}
  ) as Record<string, unknown>;

  const coaching: CoachingCard = {
    summary:
      typeof rawCoaching.summary === 'string' && rawCoaching.summary.trim()
        ? rawCoaching.summary.trim()
        : 'Call analysis complete.',
    strengths: normalizeCoachingPoints(rawCoaching.strengths, finalDurationSec, 'Strength'),
    missedOpportunities: normalizeCoachingPoints(
      rawCoaching.missedOpportunities,
      finalDurationSec,
      'Missed Opportunity'
    ),
    nextStepRecommendation:
      typeof rawCoaching.nextStepRecommendation === 'string' &&
      rawCoaching.nextStepRecommendation.trim()
        ? rawCoaching.nextStepRecommendation.trim()
        : 'Send a concise recap email confirming next steps and target stakeholders.',
    nextStepCompleted: false,
  };

  return {
    durationSec: finalDurationSec,
    transcript,
    sentimentTimeline,
    coaching,
  };
}

async function transcribeWithOpenAiCompatible(
  audioBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const baseUrl = (
    process.env.WHISPER_BASE_URL?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const apiKey = process.env.OPENAI_API_KEY?.trim() || 'ollama';
  const model = process.env.WHISPER_MODEL?.trim() || 'whisper-1';

  const form = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  form.append('file', blob, filename || 'audio.webm');
  form.append('model', model);

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Audio transcription endpoint failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as { text?: string };
  if (!data.text?.trim()) {
    throw new Error('Audio transcription endpoint returned empty text.');
  }
  return data.text.trim();
}

async function analyzeTranscriptWithOpenAiCompatible(
  rawTranscript: string,
  meta: {
    title: string;
    accountName: string;
    speakerARole: string;
    speakerBRole: string;
    methodology: CoachingMethodology;
    callStage: CallStage;
    durationHintSec?: number;
  }
): Promise<{
  durationSec: number;
  transcript: TranscriptSegment[];
  sentimentTimeline: SentimentPoint[];
  coaching: CoachingCard;
}> {
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = process.env.OPENAI_API_KEY?.trim() || 'ollama';
  const model = process.env.LLM_MODEL?.trim() || 'llama3.1';
  const durationHint = meta.durationHintSec && meta.durationHintSec > 0 ? meta.durationHintSec : 120;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a principal enterprise sales coach. Respond strictly with valid JSON containing keys: durationSec (integer), transcript (array of {speaker:"Speaker A"|"Speaker B", speakerLabel, startSec, endSec, text, sentimentScore:-1..1, topicTag}), sentimentTimeline (8-12 objects with {timeSec, engagement:0..100, prospectSentiment:0..100, repEnergy:0..100, label?, milestoneType?}), coaching ({summary, strengths (3 items of {title, detail, evidenceQuote, timestampSec}), missedOpportunities (3 items of {title, detail, evidenceQuote, timestampSec}), nextStepRecommendation}).',
        },
        {
          role: 'user',
          content: `Title: ${meta.title}\nAccount: ${meta.accountName}\nMethodology: ${meta.methodology}\nStage: ${meta.callStage}\nSpeaker A: ${meta.speakerARole}\nSpeaker B: ${meta.speakerBRole}\nDuration Hint Sec: ${durationHint}\n\nTranscript:\n${rawTranscript}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM endpoint error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('LLM endpoint returned an empty response.');
  }
  const cleanJson = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleanJson) as Record<string, unknown>;
  return normalizeParsedAnalysis(parsed, meta, durationHint);
}

async function coachChatWithOpenAiCompatible(call: SalesCallRecord, question: string): Promise<string> {
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = process.env.OPENAI_API_KEY?.trim() || 'ollama';
  const model = process.env.LLM_MODEL?.trim() || 'llama3.1';

  const transcriptBlock = call.transcript
    .map(
      (seg) =>
        `[${Math.floor(seg.startSec / 60)}:${String(seg.startSec % 60).padStart(2, '0')}] ${seg.speaker} (${seg.speakerLabel}): ${seg.text}`
    )
    .join('\n');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are an executive B2B sales coach. Give crisp, practical advice grounded strictly in the provided call transcript.',
        },
        {
          role: 'user',
          content: `Call: ${call.title} (${call.accountName})\nMethodology: ${call.methodology || 'General B2B'}\nSummary: ${call.coaching.summary}\nTranscript:\n${transcriptBlock}\n\nQuestion: ${question}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM coach chat failed (${response.status}): ${errText}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || 'No coaching suggestion generated.';
}

function extractErrorDetails(err: unknown): { status: number; message: string } {
  if (err instanceof Error) {
    const msg = err.message || 'Unexpected server error';
    if (msg.includes('GEMINI_API_KEY')) {
      return { status: 400, message: msg };
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
      return {
        status: 403,
        message: 'Invalid or unauthorized Gemini API key. Please check Settings > Secrets.',
      };
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      return {
        status: 429,
        message: 'Gemini API rate limit or quota reached. Please retry shortly.',
      };
    }
    return { status: 500, message: msg };
  }
  return { status: 500, message: 'Unexpected error processing audio.' };
}

async function createServer() {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  app.use(express.json({ limit: '30mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/capabilities', (_req, res) => {
    res.json(getProviderCapabilities());
  });

  // Node.js persisted call library CRUD
  app.get('/api/calls', async (_req, res) => {
    try {
      const calls = await readAllCalls();
      res.json({ calls });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.patch('/api/calls/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body as {
        title?: string;
        accountName?: string;
        speakerARole?: string;
        speakerBRole?: string;
        nextStepCompleted?: boolean;
        toggleBookmarkTurnId?: string;
        coachNoteUpdate?: { turnId: string; note: string };
      };

      const updated = await updateCallRecord(id, (current) => {
        let nextTranscript = current.transcript;
        const nextSpeakerARole =
          typeof body.speakerARole === 'string' && body.speakerARole.trim()
            ? body.speakerARole.trim()
            : current.speakerARole;
        const nextSpeakerBRole =
          typeof body.speakerBRole === 'string' && body.speakerBRole.trim()
            ? body.speakerBRole.trim()
            : current.speakerBRole;

        if (nextSpeakerARole !== current.speakerARole || nextSpeakerBRole !== current.speakerBRole) {
          nextTranscript = nextTranscript.map((seg) => ({
            ...seg,
            speakerLabel: seg.speaker === 'Speaker A' ? nextSpeakerARole : nextSpeakerBRole,
          }));
        }

        if (body.toggleBookmarkTurnId) {
          nextTranscript = nextTranscript.map((seg) =>
            seg.id === body.toggleBookmarkTurnId ? { ...seg, bookmarked: !seg.bookmarked } : seg
          );
        }

        if (body.coachNoteUpdate && body.coachNoteUpdate.turnId) {
          const cleanNote = body.coachNoteUpdate.note.trim();
          nextTranscript = nextTranscript.map((seg) =>
            seg.id === body.coachNoteUpdate!.turnId
              ? { ...seg, coachNote: cleanNote || undefined }
              : seg
          );
        }

        return {
          ...current,
          title:
            typeof body.title === 'string' && body.title.trim() ? body.title.trim() : current.title,
          accountName:
            typeof body.accountName === 'string' && body.accountName.trim()
              ? body.accountName.trim()
              : current.accountName,
          speakerARole: nextSpeakerARole,
          speakerBRole: nextSpeakerBRole,
          transcript: nextTranscript,
          coaching:
            typeof body.nextStepCompleted === 'boolean'
              ? { ...current.coaching, nextStepCompleted: body.nextStepCompleted }
              : current.coaching,
        };
      });

      if (!updated) {
        res.status(404).json({ error: 'Call record not found.' });
        return;
      }

      res.json({ call: updated });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.delete('/api/calls/:id', async (req, res) => {
    try {
      const calls = await deleteCallRecord(req.params.id);
      res.json({ calls });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Stream uploaded audio with HTTP Range support
  app.get('/api/audio/:filename', (req, res) => {
    const filePath = resolveSafeAudioPath(req.params.filename);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Audio file not found.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const mimeType = resolveAudioMimeType(undefined, filePath);
    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) {
        res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(stat.size - 1, parseInt(match[2], 10)) : stat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // Dedicated audio transcription endpoint (Gemini or OpenAI-compatible Whisper)
  app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
      const capabilities = getProviderCapabilities();
      if (!capabilities.audioTranscription) {
        res.status(400).json({
          error:
            'No server audio transcription key is configured. Use browser live speech-to-text, paste your transcript, or configure GEMINI_API_KEY / WHISPER_BASE_URL.',
        });
        return;
      }

      const speakerNames = normalizeSpeakerNames(
        String(req.body?.speakerARole || 'Sales Rep'),
        String(req.body?.speakerBRole || 'Prospect')
      );

      let audioBuffer: Buffer | null = null;
      let audioBase64 = '';
      let mimeType = 'audio/webm';
      let filename = 'recording.webm';

      if (req.file) {
        audioBuffer = req.file.buffer;
        audioBase64 = req.file.buffer.toString('base64');
        mimeType = resolveAudioMimeType(req.file.mimetype, req.file.originalname);
        filename = req.file.originalname || filename;
      } else if (typeof req.body?.audioBase64 === 'string' && req.body.audioBase64.length > 0) {
        audioBase64 = req.body.audioBase64;
        audioBuffer = Buffer.from(audioBase64, 'base64');
        mimeType = resolveAudioMimeType(req.body.mimeType, filename);
      } else {
        res.status(400).json({ error: 'No audio file or audio payload provided.' });
        return;
      }

      const transcriptText = hasValidGeminiKey()
        ? await transcribeWithGemini(
            getGeminiClient(),
            audioBase64,
            mimeType,
            speakerNames.speakerARole,
            speakerNames.speakerBRole
          )
        : await transcribeWithOpenAiCompatible(audioBuffer, filename, mimeType);

      res.json({ transcriptText, mimeType });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Full sales call ingestion & coaching intelligence pipeline (Gemini, Ollama/OpenAI, or Zero-Key Local Engine)
  app.post('/api/analyze-call', upload.single('audio'), async (req, res) => {
    try {
      const capabilities = getProviderCapabilities();
      const callId = `call-${Date.now()}`;
      const title =
        typeof req.body?.title === 'string' && req.body.title.trim()
          ? req.body.title.trim()
          : req.file?.originalname
            ? req.file.originalname.replace(/\.[^/.]+$/, '')
            : 'Uploaded Sales Call';
      const accountName =
        typeof req.body?.accountName === 'string' && req.body.accountName.trim()
          ? req.body.accountName.trim()
          : 'Prospect Account';
      const speakerNames = normalizeSpeakerNames(
        String(req.body?.speakerARole || 'Sales Rep'),
        String(req.body?.speakerBRole || 'Prospect')
      );
      const methodology = resolveMethodology(req.body?.methodology);
      const callStage = resolveCallStage(req.body?.callStage);
      const durationHintSec = Number(req.body?.durationSec || 0) || undefined;
      const sourceType =
        req.body?.sourceType === 'microphone'
          ? 'microphone'
          : req.body?.sourceType === 'transcript'
            ? 'transcript'
            : 'uploaded';

      let rawTranscript =
        typeof req.body?.rawTranscript === 'string' ? req.body.rawTranscript.trim() : '';
      let storedAudioUrl: string | undefined;

      if (req.file) {
        const mimeType = resolveAudioMimeType(req.file.mimetype, req.file.originalname);
        storedAudioUrl = await saveAudioUpload(callId, req.file.originalname, req.file.buffer);
        if (!rawTranscript) {
          if (hasValidGeminiKey()) {
            rawTranscript = await transcribeWithGemini(
              getGeminiClient(),
              req.file.buffer.toString('base64'),
              mimeType,
              speakerNames.speakerARole,
              speakerNames.speakerBRole
            );
          } else if (hasAudioTranscriptionBackend()) {
            rawTranscript = await transcribeWithOpenAiCompatible(
              req.file.buffer,
              req.file.originalname,
              mimeType
            );
          }
        }
      } else if (!rawTranscript && typeof req.body?.audioBase64 === 'string' && req.body.audioBase64) {
        const mimeType = resolveAudioMimeType(req.body.mimeType, 'recording.webm');
        if (hasValidGeminiKey()) {
          rawTranscript = await transcribeWithGemini(
            getGeminiClient(),
            req.body.audioBase64,
            mimeType,
            speakerNames.speakerARole,
            speakerNames.speakerBRole
          );
        } else if (hasAudioTranscriptionBackend()) {
          rawTranscript = await transcribeWithOpenAiCompatible(
            Buffer.from(req.body.audioBase64, 'base64'),
            'recording.webm',
            mimeType
          );
        }
      }

      if (!rawTranscript) {
        res.status(400).json({
          error: capabilities.audioTranscription
            ? 'Provide an audio recording or a transcript to generate coaching intelligence.'
            : 'No audio transcription API key is configured. Paste the transcript text alongside your audio file (or use Paste Text / browser speech-to-text) to analyze in Zero-Key Local mode.',
        });
        return;
      }

      const requestedEngine =
        req.body?.analysisEngine === 'local' ? 'local' : 'auto';
      const effectiveProvider: LlmProviderMode =
        requestedEngine === 'local' ? 'local' : capabilities.llmProvider;

      const meta = {
        title,
        accountName,
        speakerARole: speakerNames.speakerARole,
        speakerBRole: speakerNames.speakerBRole,
        methodology,
        callStage,
        durationHintSec,
      };

      let analysis;
      if (effectiveProvider === 'local') {
        analysis = analyzeTranscriptLocally(rawTranscript, meta);
      } else if (effectiveProvider === 'openai-compatible') {
        try {
          analysis = await analyzeTranscriptWithOpenAiCompatible(rawTranscript, meta);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
            analysis = analyzeTranscriptLocally(rawTranscript, meta);
          } else {
            throw err;
          }
        }
      } else {
        try {
          analysis = await analyzeTranscriptWithGemini(getGeminiClient(), rawTranscript, meta);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
            analysis = analyzeTranscriptLocally(rawTranscript, meta);
          } else {
            throw err;
          }
        }
      }

      const callRecord: SalesCallRecord = {
        id: callId,
        title,
        accountName,
        callDate: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        durationSec: analysis.durationSec,
        speakerARole: speakerNames.speakerARole,
        speakerBRole: speakerNames.speakerBRole,
        methodology,
        callStage,
        audioUrl: storedAudioUrl,
        rawTranscript,
        transcript: analysis.transcript,
        sentimentTimeline: analysis.sentimentTimeline,
        coaching: analysis.coaching,
        sourceType,
      };

      await addCallRecord(callRecord);
      res.json({ call: callRecord });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Follow-up coaching assistant grounded in the selected call
  app.post('/api/coach-chat', async (req, res) => {
    try {
      const capabilities = getProviderCapabilities();
      const { call, question } = req.body as {
        call?: SalesCallRecord;
        question?: string;
      };

      if (!call || !question || !question.trim()) {
        res.status(400).json({ error: 'Call context and coaching question are required.' });
        return;
      }

      if (capabilities.llmProvider === 'local') {
        res.json({ reply: generateLocalCoachReply(call, question.trim()) });
        return;
      }

      if (capabilities.llmProvider === 'openai-compatible') {
        try {
          const reply = await coachChatWithOpenAiCompatible(call, question.trim());
          res.json({ reply });
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
            res.json({ reply: generateLocalCoachReply(call, question.trim()) });
            return;
          }
          throw err;
        }
      }

      const ai = getGeminiClient();
      const transcriptBlock = call.transcript
        .map(
          (seg) =>
            `[${Math.floor(seg.startSec / 60)}:${String(seg.startSec % 60).padStart(2, '0')}] ${seg.speaker} (${seg.speakerLabel}): ${seg.text}`
        )
        .join('\n');

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Call: ${call.title} (${call.accountName})
Methodology: ${call.methodology || 'General B2B'} | Stage: ${call.callStage || 'Sales Call'}
Speaker A: ${call.speakerARole}
Speaker B: ${call.speakerBRole}

Coaching Summary: ${call.coaching.summary}
Strengths: ${call.coaching.strengths.map((s) => s.title).join('; ')}
Missed Opportunities: ${call.coaching.missedOpportunities.map((m) => m.title).join('; ')}

Transcript:
${transcriptBlock}

User request: ${question.trim()}`,
          config: {
            systemInstruction:
              'You are an executive B2B sales coach. Give crisp, practical, evidence-backed advice or follow-up drafts grounded strictly in the provided call transcript. Use clean plain prose with bullet points when helpful.',
          },
        });

        res.json({ reply: response.text?.trim() || 'No coaching suggestion generated.' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
          res.json({ reply: generateLocalCoachReply(call, question.trim()) });
          return;
        }
        throw err;
      }
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
          ? 413
          : 400;
      const message =
        status === 413
          ? 'Audio file exceeds the 25 MB upload limit.'
          : err instanceof Error
            ? err.message
            : 'Invalid API request.';
      res.status(status).json({ error: message });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

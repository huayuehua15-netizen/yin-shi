import type { SalesCallRecord } from '../../src/types/call';
import { normalizeParsedAnalysis } from './normalize';
import type { AnalysisMeta, AnalysisResult } from './types';

export async function transcribeWithOpenAiCompatible(
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

export async function analyzeTranscriptWithOpenAiCompatible(
  rawTranscript: string,
  meta: AnalysisMeta
): Promise<AnalysisResult> {
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  );
  const apiKey = process.env.OPENAI_API_KEY?.trim() || 'ollama';
  const model = process.env.LLM_MODEL?.trim() || 'llama3.1';
  const durationHint =
    meta.durationHintSec && meta.durationHintSec > 0 ? meta.durationHintSec : 120;

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
  const cleanJson = content
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleanJson) as Record<string, unknown>;
  return normalizeParsedAnalysis(parsed, meta, durationHint);
}

export async function coachChatWithOpenAiCompatible(
  call: SalesCallRecord,
  question: string
): Promise<string> {
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  );
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

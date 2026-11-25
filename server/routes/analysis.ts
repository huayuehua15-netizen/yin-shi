import type { Express, Request, RequestHandler, Response } from 'express';
import { addCallRecord, saveAudioUpload } from '../store';
import {
  getProviderCapabilities,
  hasAudioTranscriptionBackend,
  hasValidGeminiKey,
  resolveAudioMimeType,
  resolveCallStage,
  resolveMethodology,
} from '../config';
import { extractErrorDetails } from '../errors';
import { normalizeSpeakerNames } from '../../src/utils/callAnalytics';
import { generateLocalCoachReply, analyzeTranscriptLocally } from '../localAnalyzer';
import {
  analyzeTranscriptWithGemini,
  getGeminiClient,
  transcribeWithGemini,
} from '../analysis/gemini';
import {
  analyzeTranscriptWithOpenAiCompatible,
  coachChatWithOpenAiCompatible,
  transcribeWithOpenAiCompatible,
} from '../analysis/openai';
import type { LlmProviderMode, SalesCallRecord } from '../../src/types/call';

/** Minimal structural type so this module doesn't depend on multer's typings. */
interface MultipartUpload {
  single(field: string): RequestHandler;
}

function isUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  return msg.includes('503') || msg.includes('UNAVAILABLE');
}

export function registerAnalysisRoutes(app: Express, upload: MultipartUpload): void {
  // Dedicated audio transcription endpoint (Gemini or OpenAI-compatible Whisper)
  app.post('/api/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
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
  app.post('/api/analyze-call', upload.single('audio'), async (req: Request, res: Response) => {
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
      } else if (
        !rawTranscript &&
        typeof req.body?.audioBase64 === 'string' &&
        req.body.audioBase64
      ) {
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

      const requestedEngine = req.body?.analysisEngine === 'local' ? 'local' : 'auto';
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
          if (!isUnavailable(err)) throw err;
          analysis = analyzeTranscriptLocally(rawTranscript, meta);
        }
      } else {
        try {
          analysis = await analyzeTranscriptWithGemini(getGeminiClient(), rawTranscript, meta);
        } catch (err) {
          if (!isUnavailable(err)) throw err;
          analysis = analyzeTranscriptLocally(rawTranscript, meta);
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
  app.post('/api/coach-chat', async (req: Request, res: Response) => {
    try {
      const capabilities = getProviderCapabilities();
      const { call, question, locale } = req.body as {
        call?: SalesCallRecord;
        question?: string;
        locale?: 'en' | 'zh';
      };
      const resolvedLocale: 'en' | 'zh' = locale === 'zh' ? 'zh' : 'en';

      if (!call || !question || !question.trim()) {
        res.status(400).json({ error: 'Call context and coaching question are required.' });
        return;
      }

      if (capabilities.llmProvider === 'local') {
        res.json({ reply: generateLocalCoachReply(call, question.trim(), resolvedLocale) });
        return;
      }

      if (capabilities.llmProvider === 'openai-compatible') {
        try {
          const reply = await coachChatWithOpenAiCompatible(call, question.trim());
          res.json({ reply });
          return;
        } catch (err) {
          if (isUnavailable(err)) {
            res.json({ reply: generateLocalCoachReply(call, question.trim(), resolvedLocale) });
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

      const languageHint =
        resolvedLocale === 'zh'
          ? 'Respond in Simplified Chinese (简体中文).'
          : 'Respond in English.';

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
            systemInstruction: `You are an executive B2B sales coach. Give crisp, practical, evidence-backed advice or follow-up drafts grounded strictly in the provided call transcript. Use clean plain prose with bullet points when helpful. ${languageHint}`,
          },
        });

        res.json({ reply: response.text?.trim() || 'No coaching suggestion generated.' });
      } catch (err) {
        if (!isUnavailable(err)) throw err;
        res.json({ reply: generateLocalCoachReply(call, question.trim(), resolvedLocale) });
      }
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });
}

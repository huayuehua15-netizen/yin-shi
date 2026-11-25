import type { Express, Request, Response } from 'express';
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
import { analyzeTranscriptLocally } from '../localAnalyzer';
import { withLocalFallback } from '../analysis/fallback';
import {
  analyzeTranscriptWithGemini,
  getGeminiClient,
  transcribeWithGemini,
} from '../analysis/gemini';
import {
  analyzeTranscriptWithOpenAiCompatible,
  transcribeWithOpenAiCompatible,
} from '../analysis/openai';
import type { AnalysisMeta, AnalysisResult } from '../analysis/types';
import type { LlmProviderMode, SalesCallRecord } from '../../src/types/call';
import type { MultipartUpload } from './upload';

/**
 * Routes an analysis request to the selected provider. When that provider is
 * temporarily unavailable (503 / UNAVAILABLE), the deterministic local engine
 * answers instead of failing the request.
 */
function runAnalysis(
  provider: LlmProviderMode,
  rawTranscript: string,
  meta: AnalysisMeta
): Promise<AnalysisResult> {
  const local = () => analyzeTranscriptLocally(rawTranscript, meta);
  if (provider === 'local') {
    return Promise.resolve(local());
  }
  if (provider === 'openai-compatible') {
    return withLocalFallback(
      () => analyzeTranscriptWithOpenAiCompatible(rawTranscript, meta),
      local
    );
  }
  return withLocalFallback(
    () => analyzeTranscriptWithGemini(getGeminiClient(), rawTranscript, meta),
    local
  );
}

export function registerAnalyzeCallRoute(app: Express, upload: MultipartUpload): void {
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

      const meta: AnalysisMeta = {
        title,
        accountName,
        speakerARole: speakerNames.speakerARole,
        speakerBRole: speakerNames.speakerBRole,
        methodology,
        callStage,
        durationHintSec,
      };

      const analysis = await runAnalysis(effectiveProvider, rawTranscript, meta);

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
}

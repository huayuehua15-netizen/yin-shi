import type { Express, Request, Response } from 'express';
import { getProviderCapabilities, hasValidGeminiKey, resolveAudioMimeType } from '../config';
import { extractErrorDetails } from '../errors';
import { normalizeSpeakerNames } from '../../src/utils/callAnalytics';
import { getGeminiClient, transcribeWithGemini } from '../analysis/gemini';
import { transcribeWithOpenAiCompatible } from '../analysis/openai';
import type { MultipartUpload } from './upload';

export function registerTranscribeRoute(app: Express, upload: MultipartUpload): void {
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
}

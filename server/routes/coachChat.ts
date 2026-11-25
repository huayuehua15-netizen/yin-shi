import type { Express, Request, Response } from 'express';
import { getProviderCapabilities } from '../config';
import { extractErrorDetails } from '../errors';
import { generateLocalCoachReply } from '../localAnalyzer';
import { withLocalFallback } from '../analysis/fallback';
import { getGeminiClient } from '../analysis/gemini';
import { coachChatWithOpenAiCompatible } from '../analysis/openai';
import type { SalesCallRecord } from '../../src/types/call';

export function registerCoachChatRoute(app: Express): void {
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

      const trimmedQuestion = question.trim();
      const local = () => generateLocalCoachReply(call, trimmedQuestion, resolvedLocale);

      if (capabilities.llmProvider === 'local') {
        res.json({ reply: local() });
        return;
      }

      if (capabilities.llmProvider === 'openai-compatible') {
        const reply = await withLocalFallback(
          () => coachChatWithOpenAiCompatible(call, trimmedQuestion),
          local
        );
        res.json({ reply });
        return;
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

      const reply = await withLocalFallback(async () => {
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

User request: ${trimmedQuestion}`,
          config: {
            systemInstruction: `You are an executive B2B sales coach. Give crisp, practical, evidence-backed advice or follow-up drafts grounded strictly in the provided call transcript. Use clean plain prose with bullet points when helpful. ${languageHint}`,
          },
        });
        return response.text?.trim() || 'No coaching suggestion generated.';
      }, local);

      res.json({ reply });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });
}

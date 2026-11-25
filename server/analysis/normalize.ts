import type {
  CoachingCard,
  CoachingPoint,
  MilestoneType,
  SentimentPoint,
  SpeakerRole,
  TranscriptSegment,
} from '../../src/types/call';
import type { AnalysisMeta, AnalysisResult } from './types';

export function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.min(max, Math.max(min, num));
}

export function normalizeCoachingPoints(
  points: unknown,
  fallbackDuration: number,
  fallbackTitlePrefix: string
): CoachingPoint[] {
  const arr = Array.isArray(points) ? points : [];
  const normalized: CoachingPoint[] = arr.slice(0, 3).map((item, idx) => {
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      title:
        typeof obj.title === 'string' && obj.title.trim()
          ? obj.title.trim()
          : `${fallbackTitlePrefix} ${idx + 1}`,
      detail:
        typeof obj.detail === 'string' && obj.detail.trim()
          ? obj.detail.trim()
          : 'Review this segment for specific phrasing and discovery depth.',
      evidenceQuote:
        typeof obj.evidenceQuote === 'string' && obj.evidenceQuote.trim()
          ? obj.evidenceQuote.trim()
          : 'No direct quote captured.',
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

/**
 * Turns whatever a model produced into a record the store and UI can trust:
 * monotonic timestamps, clamped scores, exactly three coaching points per
 * category, and a duration that covers the last turn.
 */
export function normalizeParsedAnalysis(
  parsed: Record<string, unknown>,
  meta: Pick<AnalysisMeta, 'speakerARole' | 'speakerBRole'>,
  durationHint: number
): AnalysisResult {
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
          typeof seg.topicTag === 'string' && seg.topicTag.trim() ? seg.topicTag.trim() : undefined,
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

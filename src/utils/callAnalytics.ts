import type {
  SalesCallRecord,
  SentimentPoint,
  SpeakerRole,
  TranscriptSegment,
} from '../types/call';

const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.aac', '.flac', '.mp4'];
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export function formatTimestamp(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00';
  }
  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatSrtTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function formatDurationLabel(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0s';
  }
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

export interface TalkRatioResult {
  speakerAPercent: number;
  speakerBPercent: number;
  speakerASec: number;
  speakerBSec: number;
}

export function computeTalkRatio(segments: TranscriptSegment[]): TalkRatioResult {
  let speakerASec = 0;
  let speakerBSec = 0;

  for (const seg of segments) {
    const duration = Math.max(1, seg.endSec - seg.startSec);
    if (seg.speaker === 'Speaker A') {
      speakerASec += duration;
    } else {
      speakerBSec += duration;
    }
  }

  const total = speakerASec + speakerBSec;
  if (total === 0) {
    return { speakerAPercent: 50, speakerBPercent: 50, speakerASec: 0, speakerBSec: 0 };
  }

  const speakerAPercent = Math.round((speakerASec / total) * 100);
  const speakerBPercent = 100 - speakerAPercent;

  return {
    speakerAPercent,
    speakerBPercent,
    speakerASec: Math.round(speakerASec),
    speakerBSec: Math.round(speakerBSec),
  };
}

export function filterTranscriptSegments(
  segments: TranscriptSegment[],
  speakerFilter: 'all' | SpeakerRole | 'bookmarked',
  query: string
): TranscriptSegment[] {
  const normalizedQuery = query.trim().toLowerCase();

  return segments.filter((seg) => {
    if (speakerFilter === 'bookmarked') {
      if (!seg.bookmarked) return false;
    } else if (speakerFilter !== 'all' && seg.speaker !== speakerFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      seg.text.toLowerCase().includes(normalizedQuery) ||
      seg.speakerLabel.toLowerCase().includes(normalizedQuery) ||
      (seg.topicTag ? seg.topicTag.toLowerCase().includes(normalizedQuery) : false) ||
      (seg.coachNote ? seg.coachNote.toLowerCase().includes(normalizedQuery) : false)
    );
  });
}

export function findActiveSegmentAtTime(
  segments: TranscriptSegment[],
  currentSec: number
): TranscriptSegment | null {
  if (segments.length === 0) {
    return null;
  }
  const exact = segments.find((seg) => currentSec >= seg.startSec && currentSec <= seg.endSec);
  if (exact) {
    return exact;
  }

  let nearest: TranscriptSegment | null = null;
  for (const seg of segments) {
    if (seg.startSec <= currentSec) {
      nearest = seg;
    } else {
      break;
    }
  }
  return nearest ?? segments[0];
}

export interface EngagementSummary {
  averageEngagement: number;
  averageProspectSentiment: number;
  peakPoint: SentimentPoint | null;
  lowestPoint: SentimentPoint | null;
}

export function computeEngagementSummary(timeline: SentimentPoint[]): EngagementSummary {
  if (timeline.length === 0) {
    return {
      averageEngagement: 0,
      averageProspectSentiment: 0,
      peakPoint: null,
      lowestPoint: null,
    };
  }

  let engagementSum = 0;
  let sentimentSum = 0;
  let peakPoint = timeline[0];
  let lowestPoint = timeline[0];

  for (const pt of timeline) {
    engagementSum += pt.engagement;
    sentimentSum += pt.prospectSentiment;
    if (pt.engagement > peakPoint.engagement) {
      peakPoint = pt;
    }
    if (pt.engagement < lowestPoint.engagement) {
      lowestPoint = pt;
    }
  }

  return {
    averageEngagement: Math.round(engagementSum / timeline.length),
    averageProspectSentiment: Math.round(sentimentSum / timeline.length),
    peakPoint,
    lowestPoint,
  };
}

export interface ConversationMetrics {
  repQuestionsCount: number;
  prospectQuestionsCount: number;
  longestRepMonologueSec: number;
  averageTurnLengthSec: number;
  bookmarkedCount: number;
}

export function computeConversationMetrics(segments: TranscriptSegment[]): ConversationMetrics {
  if (segments.length === 0) {
    return {
      repQuestionsCount: 0,
      prospectQuestionsCount: 0,
      longestRepMonologueSec: 0,
      averageTurnLengthSec: 0,
      bookmarkedCount: 0,
    };
  }

  let repQuestionsCount = 0;
  let prospectQuestionsCount = 0;
  let longestRepMonologueSec = 0;
  let totalTurnSec = 0;
  let bookmarkedCount = 0;

  let currentRepStreakSec = 0;

  for (const seg of segments) {
    const turnDur = Math.max(1, seg.endSec - seg.startSec);
    totalTurnSec += turnDur;

    const questionMarks = (seg.text.match(/\?/g) || []).length;
    if (seg.speaker === 'Speaker A') {
      repQuestionsCount += questionMarks;
      currentRepStreakSec += turnDur;
      if (currentRepStreakSec > longestRepMonologueSec) {
        longestRepMonologueSec = currentRepStreakSec;
      }
    } else {
      prospectQuestionsCount += questionMarks;
      currentRepStreakSec = 0;
    }

    if (seg.bookmarked) {
      bookmarkedCount += 1;
    }
  }

  return {
    repQuestionsCount,
    prospectQuestionsCount,
    longestRepMonologueSec: Math.round(longestRepMonologueSec),
    averageTurnLengthSec: Math.round(totalTurnSec / segments.length),
    bookmarkedCount,
  };
}

export interface LibraryOverview {
  totalCalls: number;
  totalDurationSec: number;
  avgRepTalkPercent: number;
  avgEngagement: number;
  avgProspectSentiment: number;
  totalRepQuestions: number;
  topicDistribution: Array<{ topic: string; count: number }>;
}

export function computeLibraryOverview(calls: SalesCallRecord[]): LibraryOverview {
  if (calls.length === 0) {
    return {
      totalCalls: 0,
      totalDurationSec: 0,
      avgRepTalkPercent: 50,
      avgEngagement: 0,
      avgProspectSentiment: 0,
      totalRepQuestions: 0,
      topicDistribution: [],
    };
  }

  let totalDurationSec = 0;
  let repTalkSum = 0;
  let engagementSum = 0;
  let sentimentSum = 0;
  let totalRepQuestions = 0;
  const topicCounts = new Map<string, number>();

  for (const call of calls) {
    totalDurationSec += call.durationSec;
    repTalkSum += computeTalkRatio(call.transcript).speakerAPercent;
    const eng = computeEngagementSummary(call.sentimentTimeline);
    engagementSum += eng.averageEngagement;
    sentimentSum += eng.averageProspectSentiment;
    totalRepQuestions += computeConversationMetrics(call.transcript).repQuestionsCount;

    for (const seg of call.transcript) {
      if (seg.topicTag) {
        const tag = seg.topicTag.trim();
        topicCounts.set(tag, (topicCounts.get(tag) || 0) + 1);
      }
    }
  }

  const topicDistribution = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalCalls: calls.length,
    totalDurationSec,
    avgRepTalkPercent: Math.round(repTalkSum / calls.length),
    avgEngagement: Math.round(engagementSum / calls.length),
    avgProspectSentiment: Math.round(sentimentSum / calls.length),
    totalRepQuestions,
    topicDistribution,
  };
}

export function validateAudioFile(file: {
  name: string;
  size: number;
  type: string;
}): { valid: boolean; error?: string } {
  if (!file || !file.name) {
    return { valid: false, error: 'Please select an audio file to analyze.' };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'The selected audio file is empty.' };
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    return { valid: false, error: 'Audio file exceeds the 25 MB upload limit.' };
  }

  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasAudioMime = file.type.startsWith('audio/') || file.type === 'video/webm';

  if (!hasSupportedExtension && !hasAudioMime) {
    return {
      valid: false,
      error: 'Unsupported format. Upload an MP3, WAV, M4A, WebM, OGG, AAC, or FLAC recording.',
    };
  }

  return { valid: true };
}

export function validateRawTranscript(text: string): { valid: boolean; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, error: 'Please paste a sales call transcript to analyze.' };
  }
  if (trimmed.length < 30) {
    return {
      valid: false,
      error: 'Transcript is too short. Provide at least a few lines of conversation.',
    };
  }
  return { valid: true };
}

export function normalizeSpeakerNames(
  speakerARole: string,
  speakerBRole: string
): { speakerARole: string; speakerBRole: string } {
  return {
    speakerARole: speakerARole.trim() || 'Sales Rep',
    speakerBRole: speakerBRole.trim() || 'Prospect',
  };
}

export function formatCoachingBriefMarkdown(call: SalesCallRecord): string {
  const talkRatio = computeTalkRatio(call.transcript);
  const summary = computeEngagementSummary(call.sentimentTimeline);
  const metrics = computeConversationMetrics(call.transcript);

  const lines: string[] = [
    `# Sales Coaching Brief: ${call.title}`,
    `Account: ${call.accountName} | Date: ${call.callDate} | Duration: ${formatDurationLabel(call.durationSec)}`,
    `Methodology: ${call.methodology || 'General B2B'} | Stage: ${call.callStage || 'Sales Call'}`,
    `Talk Ratio: Speaker A (${call.speakerARole}) ${talkRatio.speakerAPercent}% / Speaker B (${call.speakerBRole}) ${talkRatio.speakerBPercent}%`,
    `Average Engagement: ${summary.averageEngagement}/100 | Rep Questions: ${metrics.repQuestionsCount} | Longest Monologue: ${formatDurationLabel(metrics.longestRepMonologueSec)}`,
    '',
    '## Executive Summary',
    call.coaching.summary,
    '',
    '## 3 Things Done Well',
    ...call.coaching.strengths.map(
      (item, idx) =>
        `${idx + 1}. **${item.title}** (${formatTimestamp(item.timestampSec)}): ${item.detail}\n   Evidence: "${item.evidenceQuote}"`
    ),
    '',
    '## 3 Missed Opportunities',
    ...call.coaching.missedOpportunities.map(
      (item, idx) =>
        `${idx + 1}. **${item.title}** (${formatTimestamp(item.timestampSec)}): ${item.detail}\n   Evidence: "${item.evidenceQuote}"`
    ),
    '',
    '## Recommended Next Step',
    call.coaching.nextStepRecommendation,
  ];

  return lines.join('\n');
}

export function formatTranscriptSrt(call: SalesCallRecord): string {
  return call.transcript
    .map((seg, idx) => {
      const start = formatSrtTimestamp(seg.startSec);
      const end = formatSrtTimestamp(Math.max(seg.startSec + 1, seg.endSec));
      return `${idx + 1}\n${start} --> ${end}\n[${seg.speaker} - ${seg.speakerLabel}] ${seg.text}`;
    })
    .join('\n\n');
}

export function formatTranscriptTxt(call: SalesCallRecord): string {
  const header = `${call.title} (${call.accountName})\n${call.callDate} · Duration: ${formatDurationLabel(call.durationSec)}\n\n`;
  const body = call.transcript
    .map(
      (seg) =>
        `[${formatTimestamp(seg.startSec)}] ${seg.speaker} (${seg.speakerLabel}): ${seg.text}${
          seg.coachNote ? `\n  Coach Note: ${seg.coachNote}` : ''
        }`
    )
    .join('\n\n');
  return header + body;
}

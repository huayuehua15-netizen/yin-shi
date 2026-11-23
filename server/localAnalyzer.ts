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
} from '../src/types/call';
import { computeConversationMetrics, computeTalkRatio, formatTimestamp } from '../src/utils/callAnalytics';

export interface LocalAnalysisMeta {
  title: string;
  accountName: string;
  speakerARole: string;
  speakerBRole: string;
  methodology: CoachingMethodology;
  callStage: CallStage;
  durationHintSec?: number;
}

const POSITIVE_TERMS = [
  'agree',
  'aligned',
  'awesome',
  'clear',
  'clean',
  'commit',
  'confident',
  'excited',
  'fast',
  'good',
  'great',
  'helpful',
  'interested',
  'love',
  'perfect',
  'promising',
  'ready',
  'save',
  'savings',
  'smooth',
  'solved',
  'strong',
  'works',
  'yes',
  'approve',
  'approved',
  'value',
  'roi',
  'faster',
  'better',
  'impressed',
  '好',
  '同意',
  '不错',
  '可以',
  '清晰',
  '认可',
  '满意',
  '高效',
  '价值',
];

const NEGATIVE_TERMS = [
  'blocker',
  'budget',
  'cancel',
  'concern',
  'confused',
  'costly',
  'delay',
  'difficult',
  'expensive',
  'freeze',
  'frustrated',
  'gap',
  'hard',
  'issue',
  'lacks',
  'limit',
  'manual',
  'missing',
  'never',
  'no',
  'objection',
  'problem',
  'pushback',
  'refuse',
  'risk',
  'slow',
  'stuck',
  'tight',
  'unclear',
  'worried',
  'competitor',
  '贵',
  '预算',
  '担心',
  '风险',
  '拒绝',
  '困难',
  '问题',
  '延迟',
  '不够',
  '卡住',
];

const OBJECTION_TERMS = [
  'price',
  'pricing',
  'budget',
  'expensive',
  'cost',
  'competitor',
  'alternative',
  'erp',
  'freeze',
  'legal',
  'security',
  'timeline',
  'concern',
  'pushback',
  'too much',
  'not sure',
  '价格',
  '预算',
  '竞品',
  '法务',
  '安全',
  '太贵',
];

const COMMITMENT_TERMS = [
  'send',
  'thursday',
  'friday',
  'monday',
  'tuesday',
  'wednesday',
  'next week',
  'schedule',
  'calendar',
  'invite',
  'sign',
  'approved',
  'deal',
  'follow up',
  'next step',
  'demo',
  '安排',
  '发送',
  '下周',
  '签约',
  '下一步',
  '会议',
];

const QUANTIFIED_PATTERN =
  /(\$|€|£|¥|\d+%|\b\d+\s*(hours?|hrs?|minutes?|mins?|days?|weeks?|months?|seats?|licenses?|users?|k|m)\b)/i;

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function parseTimestampToSec(mmss: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(mmss.trim());
  if (!match) return null;
  if (match[3]) {
    return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
  }
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function inferSpeakerFromLabel(
  rawLabel: string,
  speakerARole: string,
  speakerBRole: string,
  fallbackIndex: number
): SpeakerRole {
  const lower = rawLabel.toLowerCase().trim();
  const aLower = speakerARole.toLowerCase().trim();
  const bLower = speakerBRole.toLowerCase().trim();

  if (
    lower === 'speaker a' ||
    lower === 'a' ||
    lower === 'rep' ||
    lower === 'sales' ||
    lower === 'salesperson' ||
    lower === 'ae' ||
    lower === 'sdr' ||
    lower === 'agent' ||
    lower === 'host' ||
    lower === '销售' ||
    (aLower && (lower === aLower || aLower.includes(lower) || lower.includes(aLower.split('(')[0].trim())))
  ) {
    return 'Speaker A';
  }

  if (
    lower === 'speaker b' ||
    lower === 'b' ||
    lower === 'prospect' ||
    lower === 'buyer' ||
    lower === 'customer' ||
    lower === 'client' ||
    lower === 'lead' ||
    lower === '客户' ||
    lower === '买家' ||
    (bLower && (lower === bLower || bLower.includes(lower) || lower.includes(bLower.split('(')[0].trim())))
  ) {
    return 'Speaker B';
  }

  return fallbackIndex % 2 === 0 ? 'Speaker A' : 'Speaker B';
}

export function scoreTextSentiment(text: string): number {
  const lower = text.toLowerCase();
  let score = 0.12;
  for (const term of POSITIVE_TERMS) {
    if (lower.includes(term)) score += 0.18;
  }
  for (const term of NEGATIVE_TERMS) {
    if (lower.includes(term)) score -= 0.22;
  }
  if (text.includes('?')) {
    score += 0.06;
  }
  if (QUANTIFIED_PATTERN.test(text)) {
    score += 0.08;
  }
  return Number(clamp(score, -0.95, 0.95).toFixed(2));
}

function detectTopicTag(text: string, speaker: SpeakerRole, index: number, total: number): string {
  const lower = text.toLowerCase();
  if (index === 0) return 'Opening & Framing';
  if (OBJECTION_TERMS.some((t) => lower.includes(t))) return 'Objection & Risk';
  if (COMMITMENT_TERMS.some((t) => lower.includes(t)) && index >= Math.max(1, total - 3)) {
    return 'Next Steps';
  }
  if (text.includes('?') || text.includes('？')) {
    return speaker === 'Speaker A' ? 'Discovery Question' : 'Buyer Question';
  }
  if (QUANTIFIED_PATTERN.test(text)) return 'Value & Metrics';
  return speaker === 'Speaker A' ? 'Solution Positioning' : 'Buyer Context';
}

export function parseRawTranscriptToSegments(
  rawTranscript: string,
  speakerARole: string,
  speakerBRole: string,
  durationHintSec?: number
): { durationSec: number; transcript: TranscriptSegment[] } {
  const lines = rawTranscript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  interface RawTurn {
    speaker?: SpeakerRole;
    explicitTimeSec?: number;
    text: string;
  }

  const parsedTurns: RawTurn[] = [];
  const linePattern =
    /^(?:\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*)?(?:([^:\n]{1,45}?)\s*[:：]\s+)?(.*)$/;

  for (const line of lines) {
    const match = linePattern.exec(line);
    if (!match) continue;
    const [, timeToken, rawSpeaker, body] = match;
    const explicitTimeSec = timeToken ? parseTimestampToSec(timeToken) ?? undefined : undefined;
    const text = (body || '').trim();
    if (!text) continue;

    if (rawSpeaker && rawSpeaker.trim().length > 0) {
      const speaker = inferSpeakerFromLabel(
        rawSpeaker,
        speakerARole,
        speakerBRole,
        parsedTurns.length
      );
      parsedTurns.push({ speaker, explicitTimeSec, text });
    } else if (parsedTurns.length > 0 && explicitTimeSec === undefined) {
      parsedTurns[parsedTurns.length - 1].text += ` ${text}`;
    } else {
      parsedTurns.push({
        speaker: parsedTurns.length % 2 === 0 ? 'Speaker A' : 'Speaker B',
        explicitTimeSec,
        text,
      });
    }
  }

  // If a single long block had no line breaks, split by sentences into alternating turns
  if (parsedTurns.length <= 1 && rawTranscript.trim().length > 0) {
    const singleText = parsedTurns[0]?.text || rawTranscript.trim();
    const sentences = singleText
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length >= 2) {
      parsedTurns.length = 0;
      sentences.forEach((sentence, idx) => {
        parsedTurns.push({
          speaker: idx % 2 === 0 ? 'Speaker A' : 'Speaker B',
          text: sentence,
        });
      });
    }
  }

  const totalWords = parsedTurns.reduce(
    (sum, t) => sum + Math.max(4, t.text.split(/\s+/).length),
    0
  );
  const estimatedDuration = Math.max(
    durationHintSec && durationHintSec > 0 ? Math.round(durationHintSec) : 0,
    Math.max(45, Math.round(totalWords * 0.48))
  );

  let cursorSec = 0;
  const segments: TranscriptSegment[] = parsedTurns.map((turn, idx) => {
    const words = Math.max(4, turn.text.split(/\s+/).length);
    const shareSec = Math.max(
      8,
      Math.round((words / Math.max(1, totalWords)) * estimatedDuration)
    );
    const startSec =
      turn.explicitTimeSec !== undefined && turn.explicitTimeSec >= cursorSec
        ? turn.explicitTimeSec
        : cursorSec;
    const endSec =
      idx === parsedTurns.length - 1
        ? Math.max(startSec + shareSec, estimatedDuration)
        : startSec + shareSec;
    cursorSec = endSec + 1;

    const speaker: SpeakerRole = turn.speaker ?? (idx % 2 === 0 ? 'Speaker A' : 'Speaker B');
    return {
      id: `turn-local-${Date.now()}-${idx}`,
      speaker,
      speakerLabel: speaker === 'Speaker A' ? speakerARole : speakerBRole,
      startSec,
      endSec,
      text: turn.text,
      sentimentScore: scoreTextSentiment(turn.text),
      topicTag: detectTopicTag(turn.text, speaker, idx, parsedTurns.length),
    };
  });

  const finalDurationSec = Math.max(
    estimatedDuration,
    segments[segments.length - 1]?.endSec ?? 45
  );

  return { durationSec: finalDurationSec, transcript: segments };
}

function buildSentimentTimeline(
  transcript: TranscriptSegment[],
  durationSec: number
): SentimentPoint[] {
  const count = clamp(Math.max(8, transcript.length), 8, 12);
  const points: SentimentPoint[] = [];

  for (let i = 0; i < count; i++) {
    const ratio = count === 1 ? 0 : i / (count - 1);
    const timeSec = Math.round(ratio * durationSec);
    const nearest =
      transcript.find((s) => timeSec >= s.startSec && timeSec <= s.endSec) ??
      transcript[Math.min(transcript.length - 1, Math.floor(ratio * transcript.length))];

    const baseSent = nearest ? Math.round((nearest.sentimentScore + 1) * 45 + 10) : 64;
    const wordDensity = nearest ? clamp(nearest.text.split(/\s+/).length, 6, 45) : 18;
    const hasQuestion = nearest?.text.includes('?') || nearest?.text.includes('？');

    const prospectSentiment = clamp(
      nearest?.speaker === 'Speaker B' ? baseSent : Math.round(baseSent * 0.9 + 6),
      20,
      96
    );
    const repEnergy = clamp(
      62 + Math.round(wordDensity * 0.55) + (hasQuestion ? 8 : 0),
      40,
      96
    );
    const engagement = clamp(
      Math.round(prospectSentiment * 0.55 + repEnergy * 0.45),
      28,
      96
    );

    const lower = nearest?.text.toLowerCase() ?? '';
    let milestoneType: MilestoneType | undefined;
    let label: string | undefined;

    if (i === 0) {
      milestoneType = 'commitment';
      label = 'Call opening';
    } else if (OBJECTION_TERMS.some((t) => lower.includes(t))) {
      milestoneType = 'objection';
      label = 'Buyer objection / risk';
    } else if (i === count - 1 && COMMITMENT_TERMS.some((t) => lower.includes(t))) {
      milestoneType = 'commitment';
      label = 'Next-step wrap';
    } else if (prospectSentiment >= 80 && i > 0) {
      milestoneType = 'peak';
      label = 'High buyer alignment';
    } else if (prospectSentiment <= 44) {
      milestoneType = 'dip';
      label = 'Sentiment dip';
    }

    points.push({
      timeSec,
      engagement,
      prospectSentiment,
      repEnergy,
      milestoneType,
      label,
    });
  }

  return points;
}

function truncateQuote(text: string): string {
  const clean = text.trim();
  if (clean.length <= 165) return clean;
  return `${clean.slice(0, 162).trim()}...`;
}

export function analyzeTranscriptLocally(
  rawTranscript: string,
  meta: LocalAnalysisMeta
): {
  durationSec: number;
  transcript: TranscriptSegment[];
  sentimentTimeline: SentimentPoint[];
  coaching: CoachingCard;
} {
  const { durationSec, transcript } = parseRawTranscriptToSegments(
    rawTranscript,
    meta.speakerARole,
    meta.speakerBRole,
    meta.durationHintSec
  );
  const sentimentTimeline = buildSentimentTimeline(transcript, durationSec);
  const talkRatio = computeTalkRatio(transcript);
  const metrics = computeConversationMetrics(transcript);

  const repTurns = transcript.filter((t) => t.speaker === 'Speaker A');
  const prospectTurns = transcript.filter((t) => t.speaker === 'Speaker B');
  const fallbackTurn = transcript[0] ?? {
    id: 'fallback-0',
    speaker: 'Speaker A' as SpeakerRole,
    speakerLabel: meta.speakerARole,
    startSec: 0,
    endSec: durationSec,
    text: rawTranscript.trim(),
    sentimentScore: 0.1,
  };

  const repQuestionTurn =
    repTurns.find((t) => t.text.includes('?') || t.text.includes('？')) ?? repTurns[0] ?? fallbackTurn;
  const quantifiedTurn =
    transcript.find((t) => QUANTIFIED_PATTERN.test(t.text)) ?? repTurns[Math.min(1, repTurns.length - 1)] ?? fallbackTurn;
  const positiveProspectTurn =
    [...prospectTurns].sort((a, b) => b.sentimentScore - a.sentimentScore)[0] ??
    transcript[transcript.length - 1] ??
    fallbackTurn;

  const objectionTurn =
    prospectTurns.find((t) => OBJECTION_TERMS.some((term) => t.text.toLowerCase().includes(term))) ??
    [...prospectTurns].sort((a, b) => a.sentimentScore - b.sentimentScore)[0] ??
    prospectTurns[0] ??
    fallbackTurn;

  const longestRepTurn =
    [...repTurns].sort((a, b) => (b.endSec - b.startSec) - (a.endSec - a.startSec))[0] ??
    repTurns[0] ??
    fallbackTurn;

  const lastTurn = transcript[transcript.length - 1] ?? fallbackTurn;
  const hasExplicitNextStep = COMMITMENT_TERMS.some((term) =>
    lastTurn.text.toLowerCase().includes(term)
  );

  const strengths: CoachingPoint[] = [
    metrics.repQuestionsCount >= 2
      ? {
          title: `Active discovery with ${metrics.repQuestionsCount} rep questions`,
          detail: `${meta.speakerARole} asked ${metrics.repQuestionsCount} questions across the call, keeping discovery two-way instead of pitching blindly.`,
          evidenceQuote: truncateQuote(repQuestionTurn.text),
          timestampSec: repQuestionTurn.startSec,
        }
      : {
          title: 'Structured call opening and context framing',
          detail: `${meta.speakerARole} set clear context early in the ${meta.callStage} discussion so ${meta.speakerBRole} could respond directly.`,
          evidenceQuote: truncateQuote((repTurns[0] ?? fallbackTurn).text),
          timestampSec: (repTurns[0] ?? fallbackTurn).startSec,
        },
    talkRatio.speakerAPercent <= 58
      ? {
          title: `Balanced talk-to-listen ratio (${talkRatio.speakerAPercent}% / ${talkRatio.speakerBPercent}%)`,
          detail: `Gave ${meta.speakerBRole} room to share priorities and constraints (${talkRatio.speakerBPercent}% buyer airtime), aligning with ${meta.methodology} discovery discipline.`,
          evidenceQuote: truncateQuote((prospectTurns[0] ?? fallbackTurn).text),
          timestampSec: (prospectTurns[0] ?? fallbackTurn).startSec,
        }
      : {
          title: 'Sustained momentum into concrete value points',
          detail: `${meta.speakerARole} anchored the conversation around tangible outcomes and buyer workflows during the mid-call exchange.`,
          evidenceQuote: truncateQuote(quantifiedTurn.text),
          timestampSec: quantifiedTurn.startSec,
        },
    {
      title: 'Drove positive buyer engagement at key alignment moments',
      detail: `Captured constructive feedback from ${meta.speakerBRole} when connecting product capabilities back to their workflow needs.`,
      evidenceQuote: truncateQuote(positiveProspectTurn.text),
      timestampSec: positiveProspectTurn.startSec,
    },
  ];

  const missedOpportunities: CoachingPoint[] = [
    talkRatio.speakerAPercent > 58 || metrics.longestRepMonologueSec >= 60
      ? {
          title: `Long rep speaking block (${Math.round(metrics.longestRepMonologueSec)}s monologue)`,
          detail: `Keep single turns under 45 seconds and pause with a check-in question so ${meta.speakerBRole} validates value before you continue.`,
          evidenceQuote: truncateQuote(longestRepTurn.text),
          timestampSec: longestRepTurn.startSec,
        }
      : {
          title: `Deepen ${meta.methodology} qualification & decision criteria`,
          detail: `Probe further into exact economic buyer sign-off, timeline milestones, and success metrics behind this statement.`,
          evidenceQuote: truncateQuote(objectionTurn.text),
          timestampSec: objectionTurn.startSec,
        },
    !transcript.some((t) => QUANTIFIED_PATTERN.test(t.text))
      ? {
          title: 'Quantify business impact in hours or dollars',
          detail: `The transcript lacks hard ROI numbers. Ask ${meta.speakerBRole} how many hours per week or dollars per quarter the current problem costs.`,
          evidenceQuote: truncateQuote(objectionTurn.text),
          timestampSec: objectionTurn.startSec,
        }
      : {
          title: 'Isolate objections and confirm underlying trade-offs',
          detail: `When ${meta.speakerBRole} surfaced friction or constraints, test whether it is a hard blocker or a solvable commercial/technical trade-off.`,
          evidenceQuote: truncateQuote(objectionTurn.text),
          timestampSec: objectionTurn.startSec,
        },
    !hasExplicitNextStep
      ? {
          title: 'Lock a dated next step with calendar commitment',
          detail: `Close the conversation by proposing a specific follow-up date, attendee list (including decision makers), and clear deliverable.`,
          evidenceQuote: truncateQuote(lastTurn.text),
          timestampSec: lastTurn.startSec,
        }
      : {
          title: 'Multi-thread additional stakeholders into the follow-up',
          detail: `Confirm whether finance, security, or operational leaders should join the upcoming milestone so the deal does not stall single-threaded.`,
          evidenceQuote: truncateQuote(lastTurn.text),
          timestampSec: lastTurn.startSec,
        },
  ];

  const avgEngagement = Math.round(
    sentimentTimeline.reduce((sum, p) => sum + p.engagement, 0) /
      Math.max(1, sentimentTimeline.length)
  );

  const summary = `Analyzed ${transcript.length} diarized turns for ${meta.accountName} under the ${meta.methodology} framework with a ${talkRatio.speakerAPercent}% / ${talkRatio.speakerBPercent}% talk ratio and ${avgEngagement}% average engagement. Focus next on isolating buyer constraints early and locking multi-threaded next steps.`;

  const nextStepRecommendation = `Send a concise recap to ${meta.speakerBRole} referencing "${truncateQuote(objectionTurn.text)}" and propose a dated follow-up review with key decision stakeholders.`;

  return {
    durationSec,
    transcript,
    sentimentTimeline,
    coaching: {
      summary,
      strengths,
      missedOpportunities,
      nextStepRecommendation,
      nextStepCompleted: false,
    },
  };
}

export function generateLocalCoachReply(call: SalesCallRecord, question: string): string {
  const q = question.toLowerCase();
  const talkRatio = computeTalkRatio(call.transcript);
  const topStrength = call.coaching.strengths[0];
  const topGap = call.coaching.missedOpportunities[0];
  const secondGap = call.coaching.missedOpportunities[1];

  if (q.includes('email') || q.includes('follow-up') || q.includes('follow up') || q.includes('邮件')) {
    return [
      `Subject: Recap & next steps — ${call.title} (${call.accountName})`,
      '',
      `Hi ${call.speakerBRole.split('(')[0].trim()},`,
      '',
      `Thanks for your time today. Building on your point ("${topGap?.evidenceQuote || call.coaching.nextStepRecommendation}"), here is a quick summary of what we aligned on:`,
      `• Key focus: ${topStrength?.title || 'Workflow alignment and measurable impact'}`,
      `• Open question to validate together: ${topGap?.detail || 'Confirm decision criteria and rollout timeline.'}`,
      '',
      `Recommended next step: ${call.coaching.nextStepRecommendation}`,
      '',
      `Best,`,
      `${call.speakerARole.split('(')[0].trim()}`,
    ].join('\n');
  }

  if (q.includes('rebuttal') || q.includes('objection') || q.includes('话术') || q.includes('异议')) {
    const quote = topGap?.evidenceQuote || 'your current constraints';
    return `Suggested 2-sentence rebuttal grounded in the call:\n\n"I hear your point around '${quote}'—that is exactly why teams evaluate measurable time and risk savings rather than line-item cost alone. If we quantify the impact before ${call.callStage || 'next review'}, would it make sense to bring the key stakeholder into a 15-minute alignment check?"`;
  }

  if (q.includes('question') || q.includes('discovery') || q.includes('问题')) {
    return [
      `3 ${call.methodology || 'B2B'} discovery questions for your next call with ${call.accountName}:`,
      `1. Metric anchor: "You mentioned '${topGap?.evidenceQuote || 'this workflow challenge'}' — how many hours or dollars per quarter does that cost your team today?"`,
      `2. Decision process (${formatTimestamp(secondGap?.timestampSec ?? 0)} context): "Outside of our call today, who else needs to sign off before rollout, and what criteria matter most to them?"`,
      `3. Risk reversal: "What would need to be proven in a pilot or review for your team to feel confident moving forward on schedule?"`,
    ].join('\n');
  }

  return [
    `Local Coaching Brief (${call.methodology || 'General B2B'} · Talk Ratio ${talkRatio.speakerAPercent}% / ${talkRatio.speakerBPercent}%):`,
    `• Top Strength: ${topStrength?.title} (at ${formatTimestamp(topStrength?.timestampSec ?? 0)})`,
    `• Priority Gap: ${topGap?.title} — ${topGap?.detail}`,
    `• Next Action: ${call.coaching.nextStepRecommendation}`,
  ].join('\n');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeConversationMetrics,
  computeEngagementSummary,
  computeLibraryOverview,
  computeTalkRatio,
  filterTranscriptSegments,
  findActiveSegmentAtTime,
  formatCoachingBriefMarkdown,
  formatDurationLabel,
  formatSrtTimestamp,
  formatTimestamp,
  formatTranscriptSrt,
  formatTranscriptTxt,
  validateAudioFile,
  validateRawTranscript,
} from './callAnalytics';
import type { SalesCallRecord, SentimentPoint, TranscriptSegment } from '../types/call';

const sampleSegments: TranscriptSegment[] = [
  {
    id: 's1',
    speaker: 'Speaker A',
    speakerLabel: 'Jordan Vance (Rep)',
    startSec: 0,
    endSec: 20,
    text: 'Thanks for taking the time today. What is your top Q4 renewal goal?',
    sentimentScore: 0.6,
    topicTag: 'Agenda Setting',
    bookmarked: true,
    coachNote: 'Great open-ended framing question',
  },
  {
    id: 's2',
    speaker: 'Speaker B',
    speakerLabel: 'Elena Rostova (VP Ops)',
    startSec: 21,
    endSec: 61,
    text: 'We want to consolidate regional reporting, though pricing predictability is a major concern.',
    sentimentScore: -0.2,
    topicTag: 'Pricing Concern',
  },
  {
    id: 's3',
    speaker: 'Speaker A',
    speakerLabel: 'Jordan Vance (Rep)',
    startSec: 62,
    endSec: 82,
    text: 'Understood. How many manual hours does your team lose each Friday?',
    sentimentScore: 0.5,
    topicTag: 'Discovery',
  },
];

const sampleTimeline: SentimentPoint[] = [
  { timeSec: 0, engagement: 64, prospectSentiment: 60, repEnergy: 70 },
  {
    timeSec: 30,
    engagement: 52,
    prospectSentiment: 42,
    repEnergy: 68,
    milestoneType: 'objection',
    label: 'Pricing pushback',
  },
  {
    timeSec: 75,
    engagement: 88,
    prospectSentiment: 81,
    repEnergy: 76,
    milestoneType: 'peak',
    label: 'ROI resonance',
  },
];

const sampleCall: SalesCallRecord = {
  id: 'c1',
  title: 'Q4 Renewal',
  accountName: 'Acme Corp',
  callDate: '2026-11-18',
  durationSec: 90,
  speakerARole: 'Jordan Vance (AE)',
  speakerBRole: 'Elena Rostova (VP Ops)',
  methodology: 'MEDDPICC',
  callStage: 'Renewal & Expansion',
  transcript: sampleSegments,
  sentimentTimeline: sampleTimeline,
  sourceType: 'sample',
  coaching: {
    summary: 'Strong recovery after pricing pushback.',
    strengths: [
      {
        title: 'Agenda control',
        detail: 'Aligned upfront.',
        evidenceQuote: 'Thanks for taking the time',
        timestampSec: 0,
      },
      {
        title: 'Pain quantification',
        detail: 'Anchored on Friday hours.',
        evidenceQuote: 'manual hours your team loses',
        timestampSec: 62,
      },
      {
        title: 'Active listening',
        detail: 'Validated concern.',
        evidenceQuote: 'Understood.',
        timestampSec: 62,
      },
    ],
    missedOpportunities: [
      {
        title: 'Budget authority',
        detail: 'Did not verify CFO sign-off.',
        evidenceQuote: 'pricing predictability',
        timestampSec: 21,
      },
      {
        title: 'Competitor check',
        detail: 'Did not ask alternatives.',
        evidenceQuote: 'consolidate regional reporting',
        timestampSec: 21,
      },
      {
        title: 'Timeline urgency',
        detail: 'Skipped implementation cutoff.',
        evidenceQuote: 'Q4 renewal goals',
        timestampSec: 0,
      },
    ],
    nextStepRecommendation: 'Send ROI calculator with CFO brief.',
  },
};

test('formatTimestamp and formatSrtTimestamp format cleanly', () => {
  assert.equal(formatTimestamp(0), '00:00');
  assert.equal(formatTimestamp(65), '01:05');
  assert.equal(formatTimestamp(3661), '1:01:01');
  assert.equal(formatTimestamp(-10), '00:00');
  assert.equal(formatSrtTimestamp(65.5), '00:01:05,500');
});

test('formatDurationLabel formats seconds and minutes accurately', () => {
  assert.equal(formatDurationLabel(45), '45s');
  assert.equal(formatDurationLabel(120), '2m');
  assert.equal(formatDurationLabel(708), '11m 48s');
});

test('computeTalkRatio calculates speaker A vs speaker B percentages summing to 100', () => {
  const ratio = computeTalkRatio(sampleSegments);
  assert.equal(ratio.speakerASec, 40);
  assert.equal(ratio.speakerBSec, 40);
  assert.equal(ratio.speakerAPercent, 50);
  assert.equal(ratio.speakerBPercent, 50);
});

test('filterTranscriptSegments filters by speaker, bookmarked, and search query', () => {
  assert.equal(filterTranscriptSegments(sampleSegments, 'Speaker B', '').length, 1);
  assert.equal(filterTranscriptSegments(sampleSegments, 'bookmarked', '').length, 1);
  assert.equal(filterTranscriptSegments(sampleSegments, 'all', 'pricing').length, 1);
  assert.equal(filterTranscriptSegments(sampleSegments, 'all', 'open-ended').length, 1);
  assert.equal(filterTranscriptSegments(sampleSegments, 'Speaker A', 'pricing').length, 0);
});

test('findActiveSegmentAtTime resolves exact and nearest preceding segment', () => {
  assert.equal(findActiveSegmentAtTime(sampleSegments, 25)?.id, 's2');
  assert.equal(findActiveSegmentAtTime(sampleSegments, 61.5)?.id, 's2');
  assert.equal(findActiveSegmentAtTime(sampleSegments, 70)?.id, 's3');
});

test('computeEngagementSummary calculates average, peak, and lowest points', () => {
  const summary = computeEngagementSummary(sampleTimeline);
  assert.equal(summary.averageEngagement, 68);
  assert.equal(summary.peakPoint?.timeSec, 75);
  assert.equal(summary.lowestPoint?.timeSec, 30);
});

test('computeConversationMetrics computes questions, longest monologue, and bookmarks', () => {
  const metrics = computeConversationMetrics(sampleSegments);
  assert.equal(metrics.repQuestionsCount, 2);
  assert.equal(metrics.prospectQuestionsCount, 0);
  assert.equal(metrics.longestRepMonologueSec, 20);
  assert.equal(metrics.bookmarkedCount, 1);
});

test('computeLibraryOverview aggregates calls deterministically', () => {
  const overview = computeLibraryOverview([sampleCall]);
  assert.equal(overview.totalCalls, 1);
  assert.equal(overview.totalDurationSec, 90);
  assert.equal(overview.avgRepTalkPercent, 50);
  assert.equal(overview.avgEngagement, 68);
  assert.equal(overview.totalRepQuestions, 2);
  assert.equal(overview.topicDistribution.length, 3);
});

test('validateAudioFile and validateRawTranscript enforce constraints', () => {
  assert.equal(validateAudioFile({ name: 'call.mp3', size: 1024, type: 'audio/mpeg' }).valid, true);
  assert.equal(
    validateAudioFile({ name: 'notes.pdf', size: 1024, type: 'application/pdf' }).valid,
    false
  );
  assert.equal(validateAudioFile({ name: 'empty.wav', size: 0, type: 'audio/wav' }).valid, false);
  assert.equal(validateRawTranscript('').valid, false);
  assert.equal(validateRawTranscript('Too short').valid, false);
  assert.equal(
    validateRawTranscript('Speaker A: Hi there, thanks for joining today to discuss Q4.').valid,
    true
  );
});

test('export formatters generate valid Markdown, SRT, and TXT outputs', () => {
  const md = formatCoachingBriefMarkdown(sampleCall);
  assert.match(md, /Sales Coaching Brief: Q4 Renewal/);
  assert.match(md, /MEDDPICC/);
  assert.match(md, /3 Things Done Well/);

  const srt = formatTranscriptSrt(sampleCall);
  assert.match(srt, /00:00:00,000 --> 00:00:20,000/);
  assert.match(srt, /\[Speaker A - Jordan Vance \(Rep\)\]/);

  const txt = formatTranscriptTxt(sampleCall);
  assert.match(txt, /Coach Note: Great open-ended framing question/);
});

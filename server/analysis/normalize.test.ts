import test from 'node:test';
import assert from 'node:assert/strict';
import { clampNumber, normalizeCoachingPoints, normalizeParsedAnalysis } from './normalize';

const meta = { speakerARole: 'Alex (AE)', speakerBRole: 'Sam (VP)' };

test('clampNumber keeps in-range values and falls back for junk', () => {
  assert.equal(clampNumber(42, 0, 100, 65), 42);
  assert.equal(clampNumber(-5, 0, 100, 65), 0);
  assert.equal(clampNumber(250, 0, 100, 65), 100);
  assert.equal(clampNumber('42', 0, 100, 65), 65);
  assert.equal(clampNumber(Number.NaN, 0, 100, 65), 65);
});

test('normalizeCoachingPoints always yields exactly three titled points', () => {
  const points = normalizeCoachingPoints(undefined, 120, 'Strength');
  assert.equal(points.length, 3);
  assert.deepEqual(
    points.map((p) => p.title),
    ['Strength 1', 'Strength 2', 'Strength 3']
  );
  assert.ok(points.every((p) => p.evidenceQuote.length > 0));
});

test('normalizeCoachingPoints caps extra entries and clamps timestamps', () => {
  const points = normalizeCoachingPoints(
    [
      { title: 'A', detail: 'd', evidenceQuote: 'q', timestampSec: 9999 },
      { title: 'B', detail: 'd', evidenceQuote: 'q', timestampSec: -3 },
      { title: 'C', detail: 'd', evidenceQuote: 'q', timestampSec: 10 },
      { title: 'D', detail: 'd', evidenceQuote: 'q', timestampSec: 20 },
    ],
    120,
    'Missed Opportunity'
  );
  assert.equal(points.length, 3);
  assert.equal(points[0].timestampSec, 120);
  assert.equal(points[1].timestampSec, 0);
  assert.equal(points[2].title, 'C');
});

test('normalizeParsedAnalysis repairs a malformed payload end to end', () => {
  const result = normalizeParsedAnalysis(
    {
      durationSec: 'not-a-number',
      transcript: [
        { speaker: 'Speaker B', startSec: 5, endSec: 2, text: '  We need approvals.  ' },
        { speaker: 'Narrator', startSec: 10, endSec: 14, text: '   ' },
        { speaker: 'Speaker A', startSec: 15, endSec: 20, text: 'Understood.' },
      ],
      sentimentTimeline: [
        { timeSec: 40, engagement: 130, prospectSentiment: -2, repEnergy: 70 },
        { timeSec: 10, engagement: 60, prospectSentiment: 55, repEnergy: 80, label: ' peak ' },
      ],
      coaching: { summary: '  Solid discovery.  ' },
    },
    meta,
    90
  );

  assert.equal(result.durationSec, 90);
  assert.equal(result.transcript.length, 2, 'blank turns are dropped');
  assert.equal(result.transcript[0].speakerLabel, 'Sam (VP)');
  assert.equal(result.transcript[0].text, 'We need approvals.');
  assert.equal(result.transcript[0].endSec, 6, 'endSec is repaired to at least startSec + 1');
  assert.equal(result.transcript[1].speaker, 'Speaker A');
  assert.equal(result.transcript[1].speakerLabel, 'Alex (AE)');

  assert.deepEqual(
    result.sentimentTimeline.map((pt) => pt.timeSec),
    [10, 40],
    'timeline is sorted by time'
  );
  assert.equal(result.sentimentTimeline[1].engagement, 100);
  assert.equal(result.sentimentTimeline[1].prospectSentiment, 0);
  assert.equal(result.sentimentTimeline[0].label, 'peak');

  assert.equal(result.coaching.summary, 'Solid discovery.');
  assert.equal(result.coaching.strengths.length, 3);
  assert.equal(result.coaching.missedOpportunities.length, 3);
  assert.ok(result.coaching.nextStepRecommendation.length > 0);
  assert.equal(result.coaching.nextStepCompleted, false);
});

test('normalizeParsedAnalysis extends duration up to the 10s turn allowance', () => {
  const result = normalizeParsedAnalysis(
    {
      durationSec: 30,
      transcript: [{ speaker: 'Speaker A', startSec: 25, endSec: 90, text: 'Long close.' }],
    },
    meta,
    30
  );
  // endSec is clamped to durationSec + 10, so a runaway timestamp can only
  // stretch the reported duration by ten seconds.
  assert.equal(result.transcript[0].endSec, 40);
  assert.equal(result.durationSec, 40);
});

test('normalizeParsedAnalysis preserves model-provided labels and next steps', () => {
  const result = normalizeParsedAnalysis(
    {
      durationSec: 120,
      transcript: [
        {
          speaker: 'Speaker A',
          speakerLabel: 'Alex (AE)',
          startSec: 0,
          endSec: 12,
          text: 'Thanks for joining.',
          sentimentScore: 0.4,
          topicTag: ' opening ',
        },
      ],
      sentimentTimeline: [{ timeSec: 0, engagement: 72, prospectSentiment: 61, repEnergy: 80 }],
      coaching: {
        summary: 'Strong opening.',
        strengths: [
          { title: 'Warm opener', detail: 'Good tone', evidenceQuote: 'Thanks', timestampSec: 0 },
        ],
        missedOpportunities: [
          { title: 'No agenda', detail: 'Set agenda', evidenceQuote: 'Thanks', timestampSec: 0 },
        ],
        nextStepRecommendation: 'Book the security review.',
      },
    },
    meta,
    120
  );

  assert.equal(result.transcript[0].speakerLabel, 'Alex (AE)');
  assert.equal(result.transcript[0].topicTag, 'opening');
  assert.equal(result.durationSec, 120);
  assert.equal(result.coaching.nextStepRecommendation, 'Book the security review.');
});

test('normalizeParsedAnalysis survives an empty object', () => {
  const result = normalizeParsedAnalysis({}, meta, 120);
  assert.equal(result.durationSec, 120);
  assert.deepEqual(result.transcript, []);
  assert.deepEqual(result.sentimentTimeline, []);
  assert.equal(result.coaching.summary, 'Call analysis complete.');
  assert.equal(result.coaching.strengths.length, 3);
});

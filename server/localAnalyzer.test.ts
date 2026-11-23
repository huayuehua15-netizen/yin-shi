import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTranscriptLocally,
  generateLocalCoachReply,
  parseRawTranscriptToSegments,
} from './localAnalyzer';

const SAMPLE_RAW = `[00:00] Rep: Thanks for joining today. What prompted your team to look at sales coaching software this quarter?
[00:25] Prospect: Our ramp time for new account executives is six months, and managers spend ten hours a week manually reviewing calls.
[01:05] Rep: Ten hours a week per manager adds up fast. How are you currently scoring discovery calls across the team?
[01:40] Prospect: Honestly we don't have a consistent scorecard yet, though our CFO is tightening software budgets right now.
[02:15] Rep: Makes sense. Let me send a summary tomorrow and see if we can schedule 15 minutes with your VP of Sales on Thursday.`;

test('parseRawTranscriptToSegments preserves speaker turns and explicit timestamps', () => {
  const result = parseRawTranscriptToSegments(
    SAMPLE_RAW,
    'Alex Rivera (AE)',
    'Samira Patel (VP Ops)'
  );
  assert.equal(result.transcript.length, 5);
  assert.equal(result.transcript[0].speaker, 'Speaker A');
  assert.equal(result.transcript[1].speaker, 'Speaker B');
  assert.equal(result.transcript[1].startSec, 25);
  assert.ok(result.durationSec >= 135);
});

test('analyzeTranscriptLocally produces timeline and 3+3 coaching points with real quotes', () => {
  const analysis = analyzeTranscriptLocally(SAMPLE_RAW, {
    title: 'Ramp Time Discovery',
    accountName: 'Beacon Cloud',
    speakerARole: 'Alex Rivera',
    speakerBRole: 'Samira Patel',
    methodology: 'MEDDPICC',
    callStage: 'Discovery',
  });

  assert.ok(analysis.sentimentTimeline.length >= 8);
  assert.equal(analysis.coaching.strengths.length, 3);
  assert.equal(analysis.coaching.missedOpportunities.length, 3);
  assert.ok(
    analysis.coaching.strengths.some((s) => s.evidenceQuote.length > 10),
    'Strengths must cite verbatim transcript text'
  );
  assert.ok(
    analysis.coaching.missedOpportunities.some((m) => m.evidenceQuote.includes('CFO') || m.evidenceQuote.length > 10),
    'Missed opportunities must cite verbatim transcript text'
  );
});

test('generateLocalCoachReply tailors email, rebuttal, and discovery prompts to call data', () => {
  const analysis = analyzeTranscriptLocally(SAMPLE_RAW, {
    title: 'Ramp Time Discovery',
    accountName: 'Beacon Cloud',
    speakerARole: 'Alex Rivera',
    speakerBRole: 'Samira Patel',
    methodology: 'SPIN Selling',
    callStage: 'Discovery',
  });

  const emailReply = generateLocalCoachReply(
    {
      id: 'c1',
      title: 'Ramp Time Discovery',
      accountName: 'Beacon Cloud',
      callDate: 'Nov 22, 2026',
      durationSec: analysis.durationSec,
      speakerARole: 'Alex Rivera',
      speakerBRole: 'Samira Patel',
      methodology: 'SPIN Selling',
      callStage: 'Discovery',
      transcript: analysis.transcript,
      sentimentTimeline: analysis.sentimentTimeline,
      coaching: analysis.coaching,
      sourceType: 'transcript',
    },
    'Draft a follow-up email addressing the missed opportunities'
  );

  assert.match(emailReply, /Beacon Cloud/);
  assert.match(emailReply, /Subject:/);
});

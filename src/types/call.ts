export type SpeakerRole = 'Speaker A' | 'Speaker B';

export type MilestoneType = 'peak' | 'dip' | 'objection' | 'commitment';

export interface TranscriptSegment {
  id: string;
  speaker: SpeakerRole;
  speakerLabel: string;
  startSec: number;
  endSec: number;
  text: string;
  sentimentScore: number; // -1.0 to 1.0
  topicTag?: string;
}

export interface SentimentPoint {
  timeSec: number;
  engagement: number; // 0 to 100
  prospectSentiment: number; // 0 to 100
  repEnergy: number; // 0 to 100
  label?: string;
  milestoneType?: MilestoneType;
}

export interface CoachingPoint {
  title: string;
  detail: string;
  evidenceQuote: string;
  timestampSec: number;
}

export interface CoachingCard {
  summary: string;
  strengths: CoachingPoint[];
  missedOpportunities: CoachingPoint[];
  nextStepRecommendation: string;
}

export interface SalesCallRecord {
  id: string;
  title: string;
  accountName: string;
  callDate: string;
  durationSec: number;
  speakerARole: string;
  speakerBRole: string;
  audioUrl?: string;
  rawTranscript?: string;
  transcript: TranscriptSegment[];
  sentimentTimeline: SentimentPoint[];
  coaching: CoachingCard;
  sourceType: 'sample' | 'uploaded' | 'microphone';
}

export interface CoachChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

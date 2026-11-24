export type SpeakerRole = 'Speaker A' | 'Speaker B';

export type MilestoneType = 'peak' | 'dip' | 'objection' | 'commitment';

export type CoachingMethodology = 'General B2B' | 'MEDDPICC' | 'SPIN Selling' | 'Challenger';

export type CallStage =
  'Discovery' | 'Product Demo' | 'Renewal & Expansion' | 'Security & Procurement';

export interface TranscriptSegment {
  id: string;
  speaker: SpeakerRole;
  speakerLabel: string;
  startSec: number;
  endSec: number;
  text: string;
  sentimentScore: number; // -1.0 to 1.0
  topicTag?: string;
  bookmarked?: boolean;
  coachNote?: string;
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
  nextStepCompleted?: boolean;
}

export interface SalesCallRecord {
  id: string;
  title: string;
  accountName: string;
  callDate: string;
  durationSec: number;
  speakerARole: string;
  speakerBRole: string;
  methodology?: CoachingMethodology;
  callStage?: CallStage;
  audioUrl?: string;
  rawTranscript?: string;
  transcript: TranscriptSegment[];
  sentimentTimeline: SentimentPoint[];
  coaching: CoachingCard;
  sourceType: 'sample' | 'uploaded' | 'microphone' | 'transcript';
}

export interface CoachChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export type LlmProviderMode = 'gemini' | 'openai-compatible' | 'local';

export interface ProviderCapabilities {
  llmProvider: LlmProviderMode;
  audioTranscription: boolean;
  providerLabel: string;
}

/** Partial record update accepted by `PATCH /api/calls/:id`. */
export interface CallRecordPatch {
  title?: string;
  accountName?: string;
  speakerARole?: string;
  speakerBRole?: string;
  nextStepCompleted?: boolean;
  toggleBookmarkTurnId?: string;
  coachNoteUpdate?: { turnId: string; note: string };
}

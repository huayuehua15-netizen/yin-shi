import type {
  CallStage,
  CoachingCard,
  CoachingMethodology,
  SentimentPoint,
  TranscriptSegment,
} from '../../src/types/call';

/** Call context handed to every analysis provider. */
export interface AnalysisMeta {
  title: string;
  accountName: string;
  speakerARole: string;
  speakerBRole: string;
  methodology: CoachingMethodology;
  callStage: CallStage;
  durationHintSec?: number;
}

/** Shape every provider must return, normalized and ready to persist. */
export interface AnalysisResult {
  durationSec: number;
  transcript: TranscriptSegment[];
  sentimentTimeline: SentimentPoint[];
  coaching: CoachingCard;
}

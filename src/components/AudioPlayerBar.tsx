import { Pause, Play, RotateCcw } from 'lucide-react';
import { getTranslations, type Locale } from '../i18n/translations';
import type { SalesCallRecord } from '../types/call';
import { computeTalkRatio, formatTimestamp } from '../utils/callAnalytics';

interface AudioPlayerBarProps {
  call: SalesCallRecord;
  currentTimeSec: number;
  isPlaying: boolean;
  playbackRate: number;
  locale: Locale;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onChangePlaybackRate: (rate: number) => void;
}

const SPEED_OPTIONS = [1, 1.25, 1.5];

export function AudioPlayerBar({
  call,
  currentTimeSec,
  isPlaying,
  playbackRate,
  locale,
  onTogglePlay,
  onSeek,
  onChangePlaybackRate,
}: AudioPlayerBarProps) {
  const talkRatio = computeTalkRatio(call.transcript);
  const progressPercent =
    call.durationSec > 0
      ? Math.min(100, Math.max(0, (currentTimeSec / call.durationSec) * 100))
      : 0;
  const t = getTranslations(locale);

  return (
    <section
      aria-label={t.playbackTalkRatioAria}
      className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 sm:px-5"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        {/* Playback controls + timeline scrubber */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? t.pauseAria : t.playAria}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTimeSec - 15))}
            aria-label={t.rewindAria}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center gap-3 min-w-0">
            <span className="font-mono tabular-nums text-xs font-medium text-slate-700 w-11 text-right shrink-0">
              {formatTimestamp(currentTimeSec)}
            </span>

            <div className="relative flex-1 flex items-center">
              <label htmlFor="call-timeline-scrubber" className="sr-only">
                {t.timelineScrubberAria}
              </label>
              <input
                id="call-timeline-scrubber"
                type="range"
                min={0}
                max={Math.max(1, call.durationSec)}
                step={1}
                value={Math.min(call.durationSec, Math.round(currentTimeSec))}
                onChange={(e) => onSeek(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              />
              <div
                aria-hidden="true"
                style={{ width: `${progressPercent}%` }}
                className="pointer-events-none absolute left-0 h-2 bg-blue-700/25 rounded-l-lg"
              />
            </div>

            <span className="font-mono tabular-nums text-xs text-slate-500 w-11 shrink-0">
              {formatTimestamp(call.durationSec)}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg shrink-0">
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => onChangePlaybackRate(rate)}
                className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap ${
                  playbackRate === rate
                    ? 'bg-white text-slate-900 shadow-xs font-medium'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        {/* Talk Ratio Meter */}
        <div className="md:w-72 md:pl-5 md:border-l md:border-slate-200 shrink-0">
          <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
            <span className="text-slate-600 font-medium whitespace-nowrap">
              {t.speakerA}{' '}
              <span className="font-mono tabular-nums text-slate-900">
                {talkRatio.speakerAPercent}%
              </span>
            </span>
            <span className="text-slate-500 whitespace-nowrap">{t.talkRatio}</span>
            <span className="text-slate-600 font-medium whitespace-nowrap">
              {t.speakerB}{' '}
              <span className="font-mono tabular-nums text-slate-900">
                {talkRatio.speakerBPercent}%
              </span>
            </span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex"
            role="img"
            aria-label={`${t.talkRatio}: ${t.speakerA} ${talkRatio.speakerAPercent}%, ${t.speakerB} ${talkRatio.speakerBPercent}%`}
          >
            <div
              style={{ width: `${talkRatio.speakerAPercent}%` }}
              className="h-full bg-blue-700 transition-all duration-200"
            />
            <div
              style={{ width: `${talkRatio.speakerBPercent}%` }}
              className="h-full bg-emerald-600 transition-all duration-200"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

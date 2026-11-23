import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SpeakerRole, TranscriptSegment } from '../types/call';
import {
  filterTranscriptSegments,
  findActiveSegmentAtTime,
  formatTimestamp,
} from '../utils/callAnalytics';

interface DiarizedTranscriptProps {
  segments: TranscriptSegment[];
  speakerARole: string;
  speakerBRole: string;
  currentTimeSec: number;
  onSeek: (timeSec: number) => void;
}

export function DiarizedTranscript({
  segments,
  speakerARole,
  speakerBRole,
  currentTimeSec,
  onSeek,
}: DiarizedTranscriptProps) {
  const [speakerFilter, setSpeakerFilter] = useState<'all' | SpeakerRole>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const activeSegment = useMemo(
    () => findActiveSegmentAtTime(segments, currentTimeSec),
    [segments, currentTimeSec]
  );

  const filteredSegments = useMemo(
    () => filterTranscriptSegments(segments, speakerFilter, searchQuery),
    [segments, speakerFilter, searchQuery]
  );

  const hasFilters = speakerFilter !== 'all' || searchQuery.trim().length > 0;

  return (
    <section
      aria-label="Diarized call transcript"
      data-testid="diarized-transcript-section"
      className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden"
    >
      <div className="p-5 border-b border-slate-200 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Diarized Transcript
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Speaker A: {speakerARole}
              <span aria-hidden="true"> · </span>
              Speaker B: {speakerBRole}
            </p>
          </div>

          <span className="text-xs font-mono tabular-nums text-slate-500">
            {filteredSegments.length} of {segments.length} turns
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div
            role="group"
            aria-label="Filter transcript by speaker"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0"
          >
            {(['all', 'Speaker A', 'Speaker B'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSpeakerFilter(option)}
                aria-pressed={speakerFilter === option}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  speakerFilter === option
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option === 'all' ? 'All Speakers' : option}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-0">
            <label htmlFor="transcript-search" className="sr-only">
              Search transcript
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="transcript-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keywords or topics..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear transcript search"
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
        {filteredSegments.length === 0 ? (
          <div className="p-10 text-center space-y-2.5">
            <p className="text-sm font-medium text-slate-800">
              No transcript turns match your current filters.
            </p>
            <p className="text-xs text-slate-500">
              Try clearing your search query or switching back to All Speakers.
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSpeakerFilter('all');
                  setSearchQuery('');
                }}
                className="mt-1 inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          filteredSegments.map((seg) => {
            const isActive = activeSegment?.id === seg.id;
            const isSpeakerA = seg.speaker === 'Speaker A';

            return (
              <div
                key={seg.id}
                data-active-segment={isActive ? 'true' : 'false'}
                className={`px-5 py-4 transition-colors ${
                  isActive ? 'bg-blue-50/75' : 'hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 text-xs min-w-0">
                    <span
                      className={`font-semibold whitespace-nowrap ${
                        isSpeakerA ? 'text-blue-800' : 'text-emerald-800'
                      }`}
                    >
                      {seg.speaker}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-slate-600 font-medium truncate">
                      {seg.speakerLabel}
                    </span>
                    {seg.topicTag && (
                      <>
                        <span className="text-slate-300 hidden sm:inline" aria-hidden="true">·</span>
                        <span className="text-slate-500 hidden sm:inline truncate">
                          {seg.topicTag}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSeek(seg.startSec)}
                    aria-label={`Jump to ${formatTimestamp(seg.startSec)}`}
                    className={`font-mono tabular-nums text-xs px-2 py-0.5 rounded transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isActive
                        ? 'bg-blue-700 text-white font-medium'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                  >
                    {formatTimestamp(seg.startSec)}
                  </button>
                </div>

                <p className="text-sm leading-relaxed text-slate-800">{seg.text}</p>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

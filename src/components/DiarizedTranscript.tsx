import { Bookmark, MessageSquarePlus, Search, X } from 'lucide-react';
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
  onToggleBookmark: (turnId: string) => void;
  onSaveCoachNote: (turnId: string, note: string) => void;
}

export function DiarizedTranscript({
  segments,
  speakerARole,
  speakerBRole,
  currentTimeSec,
  onSeek,
  onToggleBookmark,
  onSaveCoachNote,
}: DiarizedTranscriptProps) {
  const [speakerFilter, setSpeakerFilter] = useState<'all' | SpeakerRole | 'bookmarked'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNoteTurnId, setEditingNoteTurnId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');

  const activeSegment = useMemo(
    () => findActiveSegmentAtTime(segments, currentTimeSec),
    [segments, currentTimeSec]
  );

  const filteredSegments = useMemo(
    () => filterTranscriptSegments(segments, speakerFilter, searchQuery),
    [segments, speakerFilter, searchQuery]
  );

  const bookmarkedCount = useMemo(
    () => segments.filter((s) => s.bookmarked).length,
    [segments]
  );

  const hasFilters = speakerFilter !== 'all' || searchQuery.trim().length > 0;

  const openNoteEditor = (seg: TranscriptSegment) => {
    setEditingNoteTurnId(seg.id);
    setDraftNote(seg.coachNote || '');
  };

  const submitNote = (turnId: string) => {
    onSaveCoachNote(turnId, draftNote);
    setEditingNoteTurnId(null);
    setDraftNote('');
  };

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
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 overflow-x-auto"
          >
            {(['all', 'Speaker A', 'Speaker B', 'bookmarked'] as const).map((option) => (
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
                {option === 'all'
                  ? 'All Speakers'
                  : option === 'bookmarked'
                    ? `Bookmarked (${bookmarkedCount})`
                    : option}
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
              placeholder="Search keywords, topics, or notes..."
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

      <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
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
            const isEditingNote = editingNoteTurnId === seg.id;

            return (
              <div
                key={seg.id}
                data-active-segment={isActive ? 'true' : 'false'}
                className={`group px-5 py-4 transition-colors ${
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

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleBookmark(seg.id)}
                      aria-label={
                        seg.bookmarked
                          ? `Remove bookmark at ${formatTimestamp(seg.startSec)}`
                          : `Bookmark turn at ${formatTimestamp(seg.startSec)}`
                      }
                      aria-pressed={Boolean(seg.bookmarked)}
                      className={`inline-flex items-center justify-center w-7 h-7 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                        seg.bookmarked
                          ? 'text-blue-700 bg-blue-100/70'
                          : 'text-slate-400 opacity-70 group-hover:opacity-100 hover:text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${seg.bookmarked ? 'fill-current' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => openNoteEditor(seg)}
                      aria-label={`Add coach note at ${formatTimestamp(seg.startSec)}`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 opacity-70 group-hover:opacity-100 hover:text-slate-700 hover:bg-slate-200/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                    </button>

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
                </div>

                <p className="text-sm leading-relaxed text-slate-800">{seg.text}</p>

                {seg.coachNote && !isEditingNote && (
                  <div className="mt-2 px-3 py-1.5 rounded-md bg-amber-50/80 border border-amber-200/80 text-xs text-amber-950 flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold">Coach Note: </span>
                      <span>{seg.coachNote}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openNoteEditor(seg)}
                      className="text-amber-800 hover:underline shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                )}

                {isEditingNote && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <label htmlFor={`note-input-${seg.id}`} className="sr-only">
                      Coach note for {formatTimestamp(seg.startSec)}
                    </label>
                    <input
                      id={`note-input-${seg.id}`}
                      type="text"
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value)}
                      placeholder="Write a manager coaching note..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => submitNote(seg.id)}
                      className="px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingNoteTurnId(null)}
                      className="px-2 py-1.5 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

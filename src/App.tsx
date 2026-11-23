import { Pencil } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { CoachingCard } from './components/CoachingCard';
import { DiarizedTranscript } from './components/DiarizedTranscript';
import { SentimentGraph } from './components/SentimentGraph';
import { Sidebar } from './components/Sidebar';
import { TeamOverview } from './components/TeamOverview';
import { TopHeader } from './components/TopHeader';
import { UploadCallModal } from './components/UploadCallModal';
import { SAMPLE_CALLS } from './data/sampleCalls';
import type { SalesCallRecord } from './types/call';
import {
  formatCoachingBriefMarkdown,
  formatDurationLabel,
  formatTranscriptSrt,
  formatTranscriptTxt,
} from './utils/callAnalytics';

export default function App() {
  const [calls, setCalls] = useState<SalesCallRecord[]>(SAMPLE_CALLS);
  const [activeCallId, setActiveCallId] = useState<string>(SAMPLE_CALLS[0].id);
  const [activeView, setActiveView] = useState<'call' | 'overview'>('call');

  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [uploadModalMode, setUploadModalMode] = useState<'upload' | 'record' | 'transcript'>('upload');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [copiedBrief, setCopiedBrief] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Inline Call Metadata & Speaker Roles Editor
  const [isEditingMeta, setIsEditingMeta] = useState<boolean>(false);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftAccount, setDraftAccount] = useState<string>('');
  const [draftSpeakerA, setDraftSpeakerA] = useState<string>('');
  const [draftSpeakerB, setDraftSpeakerB] = useState<string>('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Hydrate persisted calls from Node.js backend on mount
  useEffect(() => {
    let active = true;
    fetch('/api/calls')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load persisted calls');
        return (await res.json()) as { calls?: SalesCallRecord[] };
      })
      .then((data) => {
        if (!active || !Array.isArray(data.calls) || data.calls.length === 0) return;
        setCalls(data.calls);
        setActiveCallId((prev) =>
          data.calls!.some((c) => c.id === prev) ? prev : data.calls![0].id
        );
      })
      .catch(() => {
        // Keep initial seeded sample calls if backend unavailable during boot
      });
    return () => {
      active = false;
    };
  }, []);

  const activeCall = useMemo(
    () => calls.find((c) => c.id === activeCallId) ?? calls[0],
    [calls, activeCallId]
  );

  // Reset playback and inline editor state when switching calls
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTimeSec(0);
    setIsEditingMeta(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [activeCallId]);

  useEffect(() => {
    if (!isPlaying) return;

    if (activeCall.audioUrl && audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      void audioRef.current.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentTimeSec((prev) => {
        const next = prev + playbackRate;
        if (next >= activeCall.durationSec) {
          setIsPlaying(false);
          return activeCall.durationSec;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isPlaying, playbackRate, activeCall]);

  useEffect(() => {
    if (!isPlaying && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  const handleSeek = (targetSec: number) => {
    const clamped = Math.min(activeCall.durationSec, Math.max(0, targetSec));
    setCurrentTimeSec(clamped);
    if (activeCall.audioUrl && audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
  };

  const handleTogglePlay = () => {
    if (currentTimeSec >= activeCall.durationSec) {
      handleSeek(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleCopyBrief = async () => {
    const markdown = formatCoachingBriefMarkdown(activeCall);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // Clipboard fallback in restricted iframes
    }
    setCopiedBrief(true);
    window.setTimeout(() => setCopiedBrief(false), 2000);
  };

  const handleExportFormat = (format: 'md' | 'srt' | 'txt') => {
    let content = '';
    let mime = 'text/plain;charset=utf-8';
    if (format === 'md') {
      content = formatCoachingBriefMarkdown(activeCall);
      mime = 'text/markdown;charset=utf-8';
    } else if (format === 'srt') {
      content = formatTranscriptSrt(activeCall);
    } else {
      content = formatTranscriptTxt(activeCall);
    }

    const slug = activeCall.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug || 'sales-call'}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const patchActiveCall = async (payload: Record<string, unknown>) => {
    setSyncError(null);
    try {
      const response = await fetch(`/api/calls/${encodeURIComponent(activeCall.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { call?: SalesCallRecord; error?: string };
      if (!response.ok || !data.call) {
        throw new Error(data.error || 'Failed to save changes.');
      }
      setCalls((prev) => prev.map((c) => (c.id === data.call!.id ? data.call! : c)));
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Unable to persist update.');
    }
  };

  const openMetaEditor = () => {
    setDraftTitle(activeCall.title);
    setDraftAccount(activeCall.accountName);
    setDraftSpeakerA(activeCall.speakerARole);
    setDraftSpeakerB(activeCall.speakerBRole);
    setIsEditingMeta(true);
  };

  const saveMetaEdits = (e: FormEvent) => {
    e.preventDefault();
    const title = draftTitle.trim() || activeCall.title;
    const accountName = draftAccount.trim() || activeCall.accountName;
    const speakerARole = draftSpeakerA.trim() || activeCall.speakerARole;
    const speakerBRole = draftSpeakerB.trim() || activeCall.speakerBRole;

    setCalls((prev) =>
      prev.map((c) =>
        c.id === activeCall.id
          ? {
              ...c,
              title,
              accountName,
              speakerARole,
              speakerBRole,
              transcript: c.transcript.map((seg) => ({
                ...seg,
                speakerLabel: seg.speaker === 'Speaker A' ? speakerARole : speakerBRole,
              })),
            }
          : c
      )
    );
    setIsEditingMeta(false);
    void patchActiveCall({ title, accountName, speakerARole, speakerBRole });
  };

  const handleToggleBookmark = (turnId: string) => {
    setCalls((prev) =>
      prev.map((c) =>
        c.id === activeCall.id
          ? {
              ...c,
              transcript: c.transcript.map((seg) =>
                seg.id === turnId ? { ...seg, bookmarked: !seg.bookmarked } : seg
              ),
            }
          : c
      )
    );
    void patchActiveCall({ toggleBookmarkTurnId: turnId });
  };

  const handleSaveCoachNote = (turnId: string, note: string) => {
    const cleanNote = note.trim();
    setCalls((prev) =>
      prev.map((c) =>
        c.id === activeCall.id
          ? {
              ...c,
              transcript: c.transcript.map((seg) =>
                seg.id === turnId ? { ...seg, coachNote: cleanNote || undefined } : seg
              ),
            }
          : c
      )
    );
    void patchActiveCall({ coachNoteUpdate: { turnId, note: cleanNote } });
  };

  const handleToggleNextStep = () => {
    const nextVal = !activeCall.coaching.nextStepCompleted;
    setCalls((prev) =>
      prev.map((c) =>
        c.id === activeCall.id
          ? { ...c, coaching: { ...c.coaching, nextStepCompleted: nextVal } }
          : c
      )
    );
    void patchActiveCall({ nextStepCompleted: nextVal });
  };

  const handleCallAnalyzed = (newCall: SalesCallRecord) => {
    setCalls((prev) => [newCall, ...prev]);
    setActiveCallId(newCall.id);
    setActiveView('call');
    setCurrentTimeSec(0);
    setIsPlaying(false);
  };

  const handleDeleteCall = async (callId: string) => {
    setCalls((prev) => {
      const next = prev.filter((c) => c.id !== callId);
      if (next.length > 0 && activeCallId === callId) {
        setActiveCallId(next[0].id);
      }
      return next;
    });
    try {
      await fetch(`/api/calls/${encodeURIComponent(callId)}`, { method: 'DELETE' });
    } catch {
      // ignore offline delete error
    }
  };

  const openModal = (mode: 'upload' | 'record' | 'transcript') => {
    setUploadModalMode(mode);
    setUploadModalOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        calls={calls}
        activeCallId={activeCall.id}
        activeView={activeView}
        onChangeView={setActiveView}
        onSelectCall={setActiveCallId}
        onOpenUploadModal={openModal}
        onDeleteCall={(id) => void handleDeleteCall(id)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeCall={activeCall}
          activeView={activeView}
          copiedBrief={copiedBrief}
          onCopyBrief={() => void handleCopyBrief()}
          onExportFormat={handleExportFormat}
          onOpenUpload={() => openModal('upload')}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {activeCall.audioUrl && (
          <audio
            ref={audioRef}
            src={activeCall.audioUrl}
            onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
            onEnded={() => setIsPlaying(false)}
          />
        )}

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto space-y-6">
          {syncError && (
            <div
              role="alert"
              className="px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
            >
              {syncError}
            </div>
          )}

          {activeView === 'overview' ? (
            <TeamOverview
              calls={calls}
              onSelectCall={(id) => {
                setActiveCallId(id);
                setActiveView('call');
              }}
              onOpenUpload={() => openModal('upload')}
            />
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 text-balance">
                      {activeCall.title}
                    </h1>
                    <p className="mt-1.5 text-sm text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-slate-800">{activeCall.accountName}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>{activeCall.callDate}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatDurationLabel(activeCall.durationSec)}
                      </span>
                      {activeCall.callStage && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span>{activeCall.callStage}</span>
                        </>
                      )}
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>
                        {activeCall.speakerARole} vs {activeCall.speakerBRole}
                      </span>
                    </p>
                  </div>

                  {!isEditingMeta && (
                    <button
                      type="button"
                      onClick={openMetaEditor}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 self-start"
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit Roles</span>
                    </button>
                  )}
                </div>

                {isEditingMeta && (
                  <form
                    onSubmit={saveMetaEdits}
                    className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
                  >
                    <div>
                      <label htmlFor="edit-call-title" className="block text-xs font-medium text-slate-600 mb-1">
                        Call Title
                      </label>
                      <input
                        id="edit-call-title"
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-account-name" className="block text-xs font-medium text-slate-600 mb-1">
                        Account Name
                      </label>
                      <input
                        id="edit-account-name"
                        type="text"
                        value={draftAccount}
                        onChange={(e) => setDraftAccount(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-speaker-a" className="block text-xs font-medium text-slate-600 mb-1">
                        Speaker A Label
                      </label>
                      <input
                        id="edit-speaker-a"
                        type="text"
                        value={draftSpeakerA}
                        onChange={(e) => setDraftSpeakerA(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-speaker-b" className="block text-xs font-medium text-slate-600 mb-1">
                        Speaker B Label
                      </label>
                      <input
                        id="edit-speaker-b"
                        type="text"
                        value={draftSpeakerB}
                        onChange={(e) => setDraftSpeakerB(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingMeta(false)}
                        className="px-3 py-1.5 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <AudioPlayerBar
                call={activeCall}
                currentTimeSec={currentTimeSec}
                isPlaying={isPlaying}
                playbackRate={playbackRate}
                onTogglePlay={handleTogglePlay}
                onSeek={handleSeek}
                onChangePlaybackRate={setPlaybackRate}
              />

              <SentimentGraph
                timeline={activeCall.sentimentTimeline}
                transcript={activeCall.transcript}
                durationSec={activeCall.durationSec}
                currentTimeSec={currentTimeSec}
                onSeek={handleSeek}
              />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className="xl:col-span-7 min-w-0">
                  <DiarizedTranscript
                    key={activeCall.id}
                    segments={activeCall.transcript}
                    speakerARole={activeCall.speakerARole}
                    speakerBRole={activeCall.speakerBRole}
                    currentTimeSec={currentTimeSec}
                    onSeek={handleSeek}
                    onToggleBookmark={handleToggleBookmark}
                    onSaveCoachNote={handleSaveCoachNote}
                  />
                </div>

                <div className="xl:col-span-5 min-w-0">
                  <CoachingCard
                    key={activeCall.id}
                    call={activeCall}
                    onSeek={handleSeek}
                    onToggleNextStep={handleToggleNextStep}
                  />
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {uploadModalOpen && (
        <UploadCallModal
          key={uploadModalMode}
          isOpen={uploadModalOpen}
          initialMode={uploadModalMode}
          onClose={() => setUploadModalOpen(false)}
          onCallAnalyzed={handleCallAnalyzed}
        />
      )}
    </div>
  );
}

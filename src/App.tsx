import { Keyboard, Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from './api/client';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { CoachingCard } from './components/CoachingCard';
import { DiarizedTranscript } from './components/DiarizedTranscript';
import { SentimentGraph } from './components/SentimentGraph';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Sidebar } from './components/Sidebar';
import { TeamOverview } from './components/TeamOverview';
import { TopHeader } from './components/TopHeader';
import { UploadCallModal } from './components/UploadCallModal';
import { SAMPLE_CALLS } from './data/sampleCalls';
import { getTranslations, LOCALE_STORAGE_KEY, type Locale } from './i18n/translations';
import type { CallRecordPatch, CallStage, SalesCallRecord } from './types/call';
import {
  formatCoachingBriefMarkdown,
  formatDurationLabel,
  formatTranscriptSrt,
  formatTranscriptTxt,
} from './utils/callAnalytics';
import { resolveShortcut } from './utils/keyboard';

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      return window.localStorage.getItem(LOCALE_STORAGE_KEY) === 'zh' ? 'zh' : 'en';
    } catch {
      return 'en';
    }
  });
  const t = getTranslations(locale);

  const [calls, setCalls] = useState<SalesCallRecord[]>(SAMPLE_CALLS);
  const [activeCallId, setActiveCallId] = useState<string>(SAMPLE_CALLS[0].id);
  const [activeView, setActiveView] = useState<'call' | 'overview'>('call');

  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [uploadModalMode, setUploadModalMode] = useState<'upload' | 'record' | 'transcript'>(
    'upload'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [copiedBrief, setCopiedBrief] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);

  // Inline Call Metadata & Speaker Roles Editor
  const [isEditingMeta, setIsEditingMeta] = useState<boolean>(false);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftAccount, setDraftAccount] = useState<string>('');
  const [draftSpeakerA, setDraftSpeakerA] = useState<string>('');
  const [draftSpeakerB, setDraftSpeakerB] = useState<string>('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore storage errors
    }
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const handleToggleLocale = () => {
    setLocale((prev) => (prev === 'en' ? 'zh' : 'en'));
  };

  // Hydrate persisted calls from Node.js backend on mount
  useEffect(() => {
    const controller = new AbortController();
    api
      .listCalls(controller.signal)
      .then((persisted) => {
        if (persisted.length === 0) return;
        setCalls(persisted);
        setActiveCallId((prev) =>
          persisted.some((call) => call.id === prev) ? prev : persisted[0].id
        );
      })
      .catch(() => {
        // Keep the seeded sample calls when the backend is unreachable during boot.
      });
    return () => controller.abort();
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

  const handleSeek = useCallback(
    (targetSec: number) => {
      const clamped = Math.min(activeCall.durationSec, Math.max(0, targetSec));
      setCurrentTimeSec(clamped);
      if (activeCall.audioUrl && audioRef.current) {
        audioRef.current.currentTime = clamped;
      }
    },
    [activeCall.durationSec, activeCall.audioUrl]
  );

  const handleTogglePlay = useCallback(() => {
    if (currentTimeSec >= activeCall.durationSec) {
      handleSeek(0);
    }
    setIsPlaying((prev) => !prev);
  }, [activeCall.durationSec, currentTimeSec, handleSeek]);

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
    let content: string;
    let mime = 'text/plain;charset=utf-8';
    if (format === 'md') {
      content = formatCoachingBriefMarkdown(activeCall);
      mime = 'text/markdown;charset=utf-8';
    } else if (format === 'srt') {
      content = formatTranscriptSrt(activeCall);
    } else {
      content = formatTranscriptTxt(activeCall);
    }

    const slug = activeCall.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
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

  const patchActiveCall = async (payload: CallRecordPatch) => {
    setSyncError(null);
    try {
      const updated = await api.updateCall(activeCall.id, payload);
      setCalls((prev) => prev.map((call) => (call.id === updated.id ? updated : call)));
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
      await api.deleteCall(callId);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Unable to delete this call.');
    }
  };

  const openModal = (mode: 'upload' | 'record' | 'transcript') => {
    setUploadModalMode(mode);
    setUploadModalOpen(true);
  };

  // Global keyboard shortcuts: playback, library navigation, and dialogs.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveShortcut(event, { overlayOpen: uploadModalOpen || shortcutsOpen });
      if (!action) return;

      if (action === 'toggle-play' || action === 'seek-backward' || action === 'seek-forward') {
        event.preventDefault();
      }

      switch (action) {
        case 'toggle-play':
          handleTogglePlay();
          break;
        case 'seek-backward':
          handleSeek(currentTimeSec - 5);
          break;
        case 'seek-forward':
          handleSeek(currentTimeSec + 5);
          break;
        case 'next-call':
        case 'prev-call': {
          if (calls.length === 0) return;
          const currentIndex = calls.findIndex((call) => call.id === activeCallId);
          const delta = action === 'next-call' ? 1 : -1;
          const nextIndex = (currentIndex + delta + calls.length) % calls.length;
          setActiveView('call');
          setActiveCallId(calls[nextIndex].id);
          break;
        }
        case 'open-upload':
          openModal('upload');
          break;
        case 'toggle-shortcuts':
          setShortcutsOpen((prev) => !prev);
          break;
        case 'close-overlay':
          setUploadModalOpen(false);
          setShortcutsOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeCall,
    activeCallId,
    calls,
    currentTimeSec,
    handleSeek,
    handleTogglePlay,
    uploadModalOpen,
    shortcutsOpen,
  ]);

  const localizedStage =
    activeCall.callStage && activeCall.callStage in t.callStages
      ? t.callStages[activeCall.callStage as CallStage]
      : activeCall.callStage;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        calls={calls}
        activeCallId={activeCall.id}
        activeView={activeView}
        locale={locale}
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
          locale={locale}
          onToggleLocale={handleToggleLocale}
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
              locale={locale}
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
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span>{activeCall.callDate}</span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatDurationLabel(activeCall.durationSec)}
                      </span>
                      {localizedStage && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span>{localizedStage}</span>
                        </>
                      )}
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span>
                        {activeCall.speakerARole} {t.vs} {activeCall.speakerBRole}
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
                      <span>{t.editRoles}</span>
                    </button>
                  )}
                </div>

                {isEditingMeta && (
                  <form
                    onSubmit={saveMetaEdits}
                    className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
                  >
                    <div>
                      <label
                        htmlFor="edit-call-title"
                        className="block text-xs font-medium text-slate-600 mb-1"
                      >
                        {t.callTitle}
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
                      <label
                        htmlFor="edit-account-name"
                        className="block text-xs font-medium text-slate-600 mb-1"
                      >
                        {t.accountName}
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
                      <label
                        htmlFor="edit-speaker-a"
                        className="block text-xs font-medium text-slate-600 mb-1"
                      >
                        {t.speakerALabel}
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
                      <label
                        htmlFor="edit-speaker-b"
                        className="block text-xs font-medium text-slate-600 mb-1"
                      >
                        {t.speakerBLabel}
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
                        {t.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingMeta(false)}
                        className="px-3 py-1.5 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {t.cancel}
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
                locale={locale}
                onTogglePlay={handleTogglePlay}
                onSeek={handleSeek}
                onChangePlaybackRate={setPlaybackRate}
              />

              <SentimentGraph
                timeline={activeCall.sentimentTimeline}
                transcript={activeCall.transcript}
                durationSec={activeCall.durationSec}
                currentTimeSec={currentTimeSec}
                locale={locale}
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
                    locale={locale}
                    onSeek={handleSeek}
                    onToggleBookmark={handleToggleBookmark}
                    onSaveCoachNote={handleSaveCoachNote}
                  />
                </div>

                <div className="xl:col-span-5 min-w-0">
                  <CoachingCard
                    key={activeCall.id}
                    call={activeCall}
                    locale={locale}
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
          locale={locale}
          onClose={() => setUploadModalOpen(false)}
          onCallAnalyzed={handleCallAnalyzed}
        />
      )}

      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        aria-label={t.shortcutsAria}
        title={t.shortcutsAria}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/95 border border-slate-200 text-xs font-medium text-slate-600 shadow-lg hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <Keyboard className="w-4 h-4" />
        <span className="hidden sm:inline">{t.shortcutsHint}</span>
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-500">
          ?
        </kbd>
      </button>

      {shortcutsOpen && <ShortcutsModal locale={locale} onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { CoachingCard } from './components/CoachingCard';
import { DiarizedTranscript } from './components/DiarizedTranscript';
import { SentimentGraph } from './components/SentimentGraph';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { UploadCallModal } from './components/UploadCallModal';
import { SAMPLE_CALLS } from './data/sampleCalls';
import type { SalesCallRecord } from './types/call';
import { formatCoachingBriefMarkdown, formatDurationLabel } from './utils/callAnalytics';

export default function App() {
  const [calls, setCalls] = useState<SalesCallRecord[]>(SAMPLE_CALLS);
  const [activeCallId, setActiveCallId] = useState<string>(SAMPLE_CALLS[0].id);

  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [uploadModalMode, setUploadModalMode] = useState<'upload' | 'record'>('upload');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [copiedBrief, setCopiedBrief] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeCall = useMemo(
    () => calls.find((c) => c.id === activeCallId) ?? calls[0],
    [calls, activeCallId]
  );

  // Reset playback state when switching calls
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTimeSec(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [activeCallId]);

  // Synchronized playback loop: uses real HTMLAudioElement when audioUrl exists,
  // or deterministic timeline progression for pre-loaded sample calls.
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
      setCopiedBrief(true);
      window.setTimeout(() => setCopiedBrief(false), 2000);
    } catch {
      // Clipboard fallback in restricted iframes
      setCopiedBrief(true);
      window.setTimeout(() => setCopiedBrief(false), 2000);
    }
  };

  const handleCallAnalyzed = (newCall: SalesCallRecord) => {
    setCalls((prev) => [newCall, ...prev]);
    setActiveCallId(newCall.id);
    setCurrentTimeSec(0);
    setIsPlaying(false);
  };

  const handleDeleteCall = (callId: string) => {
    setCalls((prev) => {
      const next = prev.filter((c) => c.id !== callId);
      if (next.length > 0 && activeCallId === callId) {
        setActiveCallId(next[0].id);
      }
      return next;
    });
  };

  const openModal = (mode: 'upload' | 'record') => {
    setUploadModalMode(mode);
    setUploadModalOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        calls={calls}
        activeCallId={activeCall.id}
        onSelectCall={setActiveCallId}
        onOpenUploadModal={openModal}
        onDeleteCall={handleDeleteCall}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeCall={activeCall}
          copiedBrief={copiedBrief}
          onCopyBrief={() => void handleCopyBrief()}
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
          {/* Call Title & Unboxed Metadata */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
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
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span>{activeCall.speakerARole} vs {activeCall.speakerBRole}</span>
              </p>
            </div>
          </div>

          {/* Synchronized Scrubber + Talk Ratio */}
          <AudioPlayerBar
            call={activeCall}
            currentTimeSec={currentTimeSec}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onChangePlaybackRate={setPlaybackRate}
          />

          {/* Sentiment & Engagement Graph */}
          <SentimentGraph
            timeline={activeCall.sentimentTimeline}
            durationSec={activeCall.durationSec}
            currentTimeSec={currentTimeSec}
            onSeek={handleSeek}
          />

          {/* Two-Column Core Intelligence Split: Diarized Transcript + AI Coaching Card */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-7 min-w-0">
              <DiarizedTranscript
                segments={activeCall.transcript}
                speakerARole={activeCall.speakerARole}
                speakerBRole={activeCall.speakerBRole}
                currentTimeSec={currentTimeSec}
                onSeek={handleSeek}
              />
            </div>

            <div className="xl:col-span-5 min-w-0">
              <CoachingCard call={activeCall} onSeek={handleSeek} />
            </div>
          </div>
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

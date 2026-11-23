import { FileAudio, Loader2, Mic, Square, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import type { SalesCallRecord } from '../types/call';
import { formatTimestamp, validateAudioFile } from '../utils/callAnalytics';

interface UploadCallModalProps {
  isOpen: boolean;
  initialMode: 'upload' | 'record';
  onClose: () => void;
  onCallAnalyzed: (call: SalesCallRecord) => void;
}

export function UploadCallModal({
  isOpen,
  initialMode,
  onClose,
  onCallAnalyzed,
}: UploadCallModalProps) {
  const [mode, setMode] = useState<'upload' | 'record'>(initialMode);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [accountName, setAccountName] = useState('');
  const [speakerARole, setSpeakerARole] = useState('Sales Rep');
  const [speakerBRole, setSpeakerBRole] = useState('Prospect');
  const [isDragging, setIsDragging] = useState(false);

  // Microphone recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Analysis submission state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stopRecordingResources();
    }
    return () => {
      stopRecordingResources();
    };
  }, [isOpen]);

  const stopRecordingResources = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore cleanup stop errors
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setIsRecording(false);
    setMicLevel(0);
  };

  if (!isOpen) {
    return null;
  }

  const handleFilePick = (file: File | undefined) => {
    setErrorMessage(null);
    if (!file) return;
    const check = validateAudioFile({ name: file.name, size: file.size, type: file.type });
    if (!check.valid) {
      setErrorMessage(check.error || 'Invalid audio file.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFilePick(e.target.files?.[0]);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilePick(e.dataTransfer.files?.[0]);
  };

  const transcribeRecordedBlob = async (blob: Blob) => {
    setIsTranscribing(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'microphone-recording.webm');
      formData.append('speakerARole', speakerARole);
      formData.append('speakerBRole', speakerBRole);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as { transcriptText?: string; error?: string };
      if (!response.ok || !data.transcriptText) {
        throw new Error(data.error || 'Transcription failed.');
      }
      setTranscribedText(data.transcriptText);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to transcribe microphone audio.'
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    setErrorMessage(null);
    setTranscribedText('');
    setRecordedBlob(null);
    if (recordedPreviewUrl) {
      URL.revokeObjectURL(recordedPreviewUrl);
      setRecordedPreviewUrl(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('Microphone recording is not supported in this browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) {
          chunksRef.current.push(evt.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedPreviewUrl(URL.createObjectURL(blob));
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        if (audioCtxRef.current) {
          void audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        if (blob.size > 0) {
          void transcribeRecordedBlob(blob);
        }
      };

      // Live audio level meter
      try {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateMeter = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
          rafRef.current = window.requestAnimationFrame(updateMeter);
        };
        rafRef.current = window.requestAnimationFrame(updateMeter);
      } catch {
        // Level meter optional if AudioContext blocked
      }

      setRecordSeconds(0);
      setIsRecording(true);
      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Microphone access failed: ${err.message}`
          : 'Could not access microphone. Check browser permissions.'
      );
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsRecording(false);
    setMicLevel(0);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleAnalyzeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === 'upload') {
      if (!selectedFile) {
        setErrorMessage('Please select or drop an audio file before analyzing.');
        return;
      }
      const check = validateAudioFile({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
      });
      if (!check.valid) {
        setErrorMessage(check.error || 'Invalid audio file.');
        return;
      }

      setIsAnalyzing(true);
      setStatusMessage('Transcribing audio with Gemini 3.5 Transcribe and generating coaching card...');

      try {
        const formData = new FormData();
        formData.append('audio', selectedFile);
        formData.append('title', title.trim() || selectedFile.name.replace(/\.[^/.]+$/, ''));
        formData.append('accountName', accountName.trim() || 'Prospect Account');
        formData.append('speakerARole', speakerARole.trim() || 'Sales Rep');
        formData.append('speakerBRole', speakerBRole.trim() || 'Prospect');
        formData.append('sourceType', 'uploaded');

        const response = await fetch('/api/analyze-call', {
          method: 'POST',
          body: formData,
        });
        const data = (await response.json()) as { call?: SalesCallRecord; error?: string };
        if (!response.ok || !data.call) {
          throw new Error(data.error || 'Failed to analyze sales call audio.');
        }

        const localAudioUrl = URL.createObjectURL(selectedFile);
        onCallAnalyzed({ ...data.call, audioUrl: localAudioUrl });
        onClose();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to analyze uploaded audio file.'
        );
      } finally {
        setIsAnalyzing(false);
        setStatusMessage('');
      }
      return;
    }

    // Microphone mode
    if (!transcribedText.trim() && !recordedBlob) {
      setErrorMessage('Record audio from your microphone or paste a transcript to analyze.');
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage('Analyzing diarization, engagement sentiment, and coaching card...');

    try {
      let response: Response;
      if (transcribedText.trim()) {
        response = await fetch('/api/analyze-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawTranscript: transcribedText.trim(),
            durationSec: Math.max(30, recordSeconds || 90),
            title: title.trim() || 'Live Microphone Coaching Session',
            accountName: accountName.trim() || 'Prospect Account',
            speakerARole: speakerARole.trim() || 'Sales Rep',
            speakerBRole: speakerBRole.trim() || 'Prospect',
            sourceType: 'microphone',
          }),
        });
      } else if (recordedBlob) {
        const formData = new FormData();
        formData.append('audio', recordedBlob, 'microphone-recording.webm');
        formData.append('durationSec', String(Math.max(15, recordSeconds)));
        formData.append('title', title.trim() || 'Live Microphone Coaching Session');
        formData.append('accountName', accountName.trim() || 'Prospect Account');
        formData.append('speakerARole', speakerARole.trim() || 'Sales Rep');
        formData.append('speakerBRole', speakerBRole.trim() || 'Prospect');
        formData.append('sourceType', 'microphone');
        response = await fetch('/api/analyze-call', {
          method: 'POST',
          body: formData,
        });
      } else {
        throw new Error('No microphone recording or transcript found.');
      }

      const data = (await response.json()) as { call?: SalesCallRecord; error?: string };
      if (!response.ok || !data.call) {
        throw new Error(data.error || 'Failed to analyze recorded call.');
      }

      onCallAnalyzed({
        ...data.call,
        audioUrl: recordedPreviewUrl || undefined,
      });
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to analyze microphone recording.'
      );
    } finally {
      setIsAnalyzing(false);
      setStatusMessage('');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-call-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2
              id="upload-call-modal-title"
              className="font-display text-base font-semibold text-slate-900"
            >
              Ingest Sales Call Audio
            </h2>
            <p className="text-xs text-slate-500">
              Upload a call file or capture audio via microphone for transcription and AI coaching.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isAnalyzing}
            aria-label="Close modal"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAnalyzeSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('upload');
                setErrorMessage(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'upload'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Audio File</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('record');
                setErrorMessage(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'record'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Record Microphone</span>
            </button>
          </div>

          {mode === 'upload' ? (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                  isDragging
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-300 bg-slate-50/70 hover:border-slate-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="audio-file-input"
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <FileAudio className="w-8 h-8 text-slate-500 mx-auto mb-2.5" aria-hidden="true" />
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                    <p className="text-xs font-mono tabular-nums text-slate-500">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 text-xs font-medium text-blue-700 hover:underline"
                    >
                      Choose a different file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-800">
                      Drag and drop a sales call recording here
                    </p>
                    <p className="text-xs text-slate-500">
                      MP3, WAV, M4A, WebM, OGG, AAC, or FLAC up to 25 MB
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Browse Audio Files
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isRecording ? 'Recording in progress' : 'Microphone Audio Capture'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Powered by Gemini 3.5 Transcribe
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-sm font-semibold text-slate-800">
                    {formatTimestamp(recordSeconds)}
                  </span>
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 whitespace-nowrap"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop &amp; Transcribe</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      disabled={isTranscribing || isAnalyzing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>{recordedBlob ? 'Re-record' : 'Start Recording'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Input level meter */}
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  style={{ width: `${isRecording ? Math.max(8, micLevel) : 0}%` }}
                  className="h-full bg-blue-700 transition-all duration-100"
                />
              </div>

              {recordedPreviewUrl && !isRecording && (
                <audio controls src={recordedPreviewUrl} className="w-full h-9" />
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="mic-transcript-preview"
                    className="text-xs font-medium text-slate-700"
                  >
                    Transcribed Call Text (editable before analysis)
                  </label>
                  {isTranscribing && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Transcribing audio...
                    </span>
                  )}
                </div>
                <textarea
                  id="mic-transcript-preview"
                  rows={4}
                  value={transcribedText}
                  onChange={(e) => setTranscribedText(e.target.value)}
                  placeholder="Record with your microphone to auto-transcribe, or paste/edit call dialogue here..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          )}

          {/* Call Context Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="call-title-input" className="block text-xs font-medium text-slate-700 mb-1">
                Call Title
              </label>
              <input
                id="call-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Q4 Renewal Discovery"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="account-name-input" className="block text-xs font-medium text-slate-700 mb-1">
                Account Name
              </label>
              <input
                id="account-name-input"
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g., Acme Corp"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="speaker-a-input" className="block text-xs font-medium text-slate-700 mb-1">
                Speaker A (Salesperson)
              </label>
              <input
                id="speaker-a-input"
                type="text"
                value={speakerARole}
                onChange={(e) => setSpeakerARole(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="speaker-b-input" className="block text-xs font-medium text-slate-700 mb-1">
                Speaker B (Prospect)
              </label>
              <input
                id="speaker-b-input"
                type="text"
                value={speakerBRole}
                onChange={(e) => setSpeakerBRole(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
            >
              {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              className="px-3.5 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isAnalyzing}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAnalyzing || isRecording || isTranscribing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing Call...</span>
                </>
              ) : (
                <span>Analyze Sales Call</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

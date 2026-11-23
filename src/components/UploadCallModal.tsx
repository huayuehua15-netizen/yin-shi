import { FileAudio, FileText, Loader2, Mic, Square, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { getTranslations, type Locale } from '../i18n/translations';
import type { CallStage, CoachingMethodology, SalesCallRecord } from '../types/call';
import {
  formatTimestamp,
  validateAudioFile,
  validateRawTranscript,
} from '../utils/callAnalytics';

interface UploadCallModalProps {
  isOpen: boolean;
  initialMode: 'upload' | 'record' | 'transcript';
  locale: Locale;
  onClose: () => void;
  onCallAnalyzed: (call: SalesCallRecord) => void;
}

const METHODOLOGIES: CoachingMethodology[] = [
  'General B2B',
  'MEDDPICC',
  'SPIN Selling',
  'Challenger',
];

const CALL_STAGES: CallStage[] = [
  'Discovery',
  'Product Demo',
  'Renewal & Expansion',
  'Security & Procurement',
];

interface ProviderCapabilities {
  llmProvider: 'gemini' | 'openai-compatible' | 'local';
  audioTranscription: boolean;
  providerLabel: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function UploadCallModal({
  isOpen,
  initialMode,
  locale,
  onClose,
  onCallAnalyzed,
}: UploadCallModalProps) {
  const t = getTranslations(locale);
  const [mode, setMode] = useState<'upload' | 'record' | 'transcript'>(initialMode);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTranscript, setUploadTranscript] = useState('');
  const [pastedTranscript, setPastedTranscript] = useState('');
  const [title, setTitle] = useState('');
  const [accountName, setAccountName] = useState('');
  const [speakerARole, setSpeakerARole] = useState('Sales Rep');
  const [speakerBRole, setSpeakerBRole] = useState('Prospect');
  const [methodology, setMethodology] = useState<CoachingMethodology>('MEDDPICC');
  const [callStage, setCallStage] = useState<CallStage>('Discovery');
  const [isDragging, setIsDragging] = useState(false);
  const [capabilities, setCapabilities] = useState<ProviderCapabilities | null>(null);
  const [analysisEngine, setAnalysisEngine] = useState<'auto' | 'local'>('auto');

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
  const speechRecRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopRecordingResources();
      return;
    }
    let active = true;
    fetch('/api/capabilities')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProviderCapabilities | null) => {
        if (active && data) {
          setCapabilities(data);
        }
      })
      .catch(() => {
        // Fallback silently if offline
      });
    return () => {
      active = false;
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
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignore speech recognition stop errors
      }
      speechRecRef.current = null;
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
        if (speechRecRef.current) {
          try {
            speechRecRef.current.stop();
          } catch {
            // ignore
          }
          speechRecRef.current = null;
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        if (audioCtxRef.current) {
          void audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        if (blob.size > 0 && capabilities?.audioTranscription) {
          void transcribeRecordedBlob(blob);
        }
      };

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
        // Level meter optional
      }

      // Optional browser-native SpeechRecognition (works with zero API key)
      try {
        const win = window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        };
        const SpeechRecCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
        if (SpeechRecCtor && !capabilities?.audioTranscription) {
          const rec = new SpeechRecCtor();
          rec.continuous = true;
          rec.interimResults = false;
          rec.lang = locale === 'zh' ? 'zh-CN' : navigator.language || 'en-US';
          rec.onresult = (evt) => {
            let chunk = '';
            for (let i = evt.resultIndex; i < evt.results.length; i++) {
              if (evt.results[i].isFinal && evt.results[i][0]?.transcript) {
                chunk += evt.results[i][0]!.transcript.trim() + ' ';
              }
            }
            if (chunk.trim()) {
              setTranscribedText((prev) => (prev ? `${prev}\n${chunk.trim()}` : chunk.trim()));
            }
          };
          rec.onerror = () => {
            // Keep audio recording running even if speech recognition is unavailable
          };
          rec.start();
          speechRecRef.current = rec;
        }
      } catch {
        // Web Speech API unavailable
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
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
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
        setErrorMessage(
          locale === 'zh'
            ? '请先选择或拖拽上传一个音频文件。'
            : 'Please select or drop an audio file before analyzing.'
        );
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

      if (capabilities && !capabilities.audioTranscription && !uploadTranscript.trim()) {
        setErrorMessage(
          locale === 'zh'
            ? '当前未配置云端语音转写密钥，请在下方填写配套对话文本（或切换到“粘贴文本”模式）。'
            : 'No cloud audio transcription key is configured. Paste the call text below to sync with your audio file, or switch to Paste Text.'
        );
        return;
      }

      setIsAnalyzing(true);
      setStatusMessage(
        capabilities?.audioTranscription
          ? `${t.analyzingCall} (${methodology})`
          : `${t.analyzingCall} (${capabilities?.providerLabel || t.engineLocalOption})`
      );

      try {
        const formData = new FormData();
        formData.append('audio', selectedFile);
        if (uploadTranscript.trim()) {
          formData.append('rawTranscript', uploadTranscript.trim());
        }
        formData.append('title', title.trim() || selectedFile.name.replace(/\.[^/.]+$/, ''));
        formData.append('accountName', accountName.trim() || 'Prospect Account');
        formData.append('speakerARole', speakerARole.trim() || 'Sales Rep');
        formData.append('speakerBRole', speakerBRole.trim() || 'Prospect');
        formData.append('methodology', methodology);
        formData.append('callStage', callStage);
        formData.append('sourceType', 'uploaded');
        formData.append('analysisEngine', analysisEngine);

        const response = await fetch('/api/analyze-call', {
          method: 'POST',
          body: formData,
        });
        const data = (await response.json()) as { call?: SalesCallRecord; error?: string };
        if (!response.ok || !data.call) {
          throw new Error(data.error || 'Failed to analyze sales call audio.');
        }

        onCallAnalyzed(data.call);
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

    if (mode === 'transcript') {
      const check = validateRawTranscript(pastedTranscript);
      if (!check.valid) {
        setErrorMessage(check.error || 'Please paste a valid transcript.');
        return;
      }

      setIsAnalyzing(true);
      setStatusMessage(`${t.analyzingCall} (${methodology})`);

      try {
        const response = await fetch('/api/analyze-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawTranscript: pastedTranscript.trim(),
            durationSec: Math.max(60, Math.round(pastedTranscript.trim().split(/\s+/).length * 0.45)),
            title: title.trim() || 'Transcript Coaching Review',
            accountName: accountName.trim() || 'Prospect Account',
            speakerARole: speakerARole.trim() || 'Sales Rep',
            speakerBRole: speakerBRole.trim() || 'Prospect',
            methodology,
            callStage,
            sourceType: 'transcript',
            analysisEngine,
          }),
        });
        const data = (await response.json()) as { call?: SalesCallRecord; error?: string };
        if (!response.ok || !data.call) {
          throw new Error(data.error || 'Failed to analyze transcript.');
        }

        onCallAnalyzed(data.call);
        onClose();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to analyze transcript.'
        );
      } finally {
        setIsAnalyzing(false);
        setStatusMessage('');
      }
      return;
    }

    // Microphone mode
    if (!transcribedText.trim() && !recordedBlob) {
      setErrorMessage(
        locale === 'zh'
          ? '请先使用麦克风录音或输入对话文本后再分析。'
          : 'Record audio from your microphone or paste a transcript to analyze.'
      );
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage(`${t.analyzingCall} (${methodology})`);

    try {
      let response: Response;
      if (recordedBlob) {
        const formData = new FormData();
        formData.append('audio', recordedBlob, 'microphone-recording.webm');
        if (transcribedText.trim()) {
          formData.append('rawTranscript', transcribedText.trim());
        }
        formData.append('durationSec', String(Math.max(15, recordSeconds)));
        formData.append('title', title.trim() || 'Live Microphone Coaching Session');
        formData.append('accountName', accountName.trim() || 'Prospect Account');
        formData.append('speakerARole', speakerARole.trim() || 'Sales Rep');
        formData.append('speakerBRole', speakerBRole.trim() || 'Prospect');
        formData.append('methodology', methodology);
        formData.append('callStage', callStage);
        formData.append('sourceType', 'microphone');
        formData.append('analysisEngine', analysisEngine);
        response = await fetch('/api/analyze-call', {
          method: 'POST',
          body: formData,
        });
      } else {
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
            methodology,
            callStage,
            sourceType: 'microphone',
            analysisEngine,
          }),
        });
      }

      const data = (await response.json()) as { call?: SalesCallRecord; error?: string };
      if (!response.ok || !data.call) {
        throw new Error(data.error || 'Failed to analyze recorded call.');
      }

      onCallAnalyzed(data.call);
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
              {t.ingestModalTitle}
            </h2>
            <p className="text-xs text-slate-500">
              {t.ingestModalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isAnalyzing}
            aria-label={t.closeModalAria}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAnalyzeSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* 3-Tab Mode Switcher */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('upload');
                setErrorMessage(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-md whitespace-nowrap ${
                mode === 'upload'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>{t.tabUpload}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('record');
                setErrorMessage(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-md whitespace-nowrap ${
                mode === 'record'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mic className="w-3.5 h-3.5 shrink-0" />
              <span>{t.tabMicrophone}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('transcript');
                setErrorMessage(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-md whitespace-nowrap ${
                mode === 'transcript'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>{t.tabPasteText}</span>
            </button>
          </div>

          {mode === 'upload' && (
            <div className="space-y-3">
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
                      {t.chooseDifferentFile}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-800">
                      {t.dragDropAudio}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.audioFormatsHint}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      {t.browseAudioFiles}
                    </button>
                  </div>
                )}
              </div>

              {capabilities && !capabilities.audioTranscription && (
                <div>
                  <label
                    htmlFor="upload-accompanying-transcript"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.uploadTranscriptLabel}
                  </label>
                  <textarea
                    id="upload-accompanying-transcript"
                    rows={3}
                    value={uploadTranscript}
                    onChange={(e) => setUploadTranscript(e.target.value)}
                    placeholder={t.uploadTranscriptPlaceholder}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}
            </div>
          )}

          {mode === 'record' && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isRecording ? t.recordingInProgress : t.micCaptureTitle}
                  </p>
                  <p className="text-xs text-slate-500">
                    {capabilities?.audioTranscription
                      ? `${t.autoTranscribesVia} ${capabilities.providerLabel}`
                      : t.browserSpeechHint}
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
                      <span>{capabilities?.audioTranscription ? t.stopAndTranscribe : t.stopRecording}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      disabled={isTranscribing || isAnalyzing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>{recordedBlob ? t.reRecord : t.startRecording}</span>
                    </button>
                  )}
                </div>
              </div>

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
                    {t.micTranscriptLabel}
                  </label>
                  {isTranscribing && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t.transcribingAudio}
                    </span>
                  )}
                </div>
                <textarea
                  id="mic-transcript-preview"
                  rows={4}
                  value={transcribedText}
                  onChange={(e) => setTranscribedText(e.target.value)}
                  placeholder={t.micTranscriptPlaceholder}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          )}

          {mode === 'transcript' && (
            <div>
              <label
                htmlFor="paste-transcript-input"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {t.rawTranscriptLabel}
              </label>
              <textarea
                id="paste-transcript-input"
                rows={5}
                value={pastedTranscript}
                onChange={(e) => setPastedTranscript(e.target.value)}
                placeholder={t.rawTranscriptPlaceholder}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          )}

          {/* Call Context & Coaching Framework */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="call-title-input" className="block text-xs font-medium text-slate-700 mb-1">
                {t.callTitle}
              </label>
              <input
                id="call-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.callTitlePlaceholder}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="account-name-input" className="block text-xs font-medium text-slate-700 mb-1">
                {t.accountName}
              </label>
              <input
                id="account-name-input"
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={t.accountNamePlaceholder}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="speaker-a-input" className="block text-xs font-medium text-slate-700 mb-1">
                {t.speakerAField}
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
                {t.speakerBField}
              </label>
              <input
                id="speaker-b-input"
                type="text"
                value={speakerBRole}
                onChange={(e) => setSpeakerBRole(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="methodology-select" className="block text-xs font-medium text-slate-700 mb-1">
                {t.coachingMethodology}
              </label>
              <select
                id="methodology-select"
                value={methodology}
                onChange={(e) => setMethodology(e.target.value as CoachingMethodology)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {METHODOLOGIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="call-stage-select" className="block text-xs font-medium text-slate-700 mb-1">
                {t.callStage}
              </label>
              <select
                id="call-stage-select"
                value={callStage}
                onChange={(e) => setCallStage(e.target.value as CallStage)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {CALL_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {t.callStages[stage]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {capabilities && capabilities.llmProvider !== 'local' && (
            <div>
              <label htmlFor="analysis-engine-select" className="block text-xs font-medium text-slate-700 mb-1">
                {t.analysisEngine}
              </label>
              <select
                id="analysis-engine-select"
                value={analysisEngine}
                onChange={(e) => setAnalysisEngine(e.target.value as 'auto' | 'local')}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="auto">
                  {t.engineAutoPrefix} ({capabilities.providerLabel}, {t.engineAutoSuffix})
                </option>
                <option value="local">{t.engineLocalOption}</option>
              </select>
            </div>
          )}

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
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={isAnalyzing || isRecording || isTranscribing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.analyzingCall}</span>
                </>
              ) : (
                <span>{t.analyzeSalesCall}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

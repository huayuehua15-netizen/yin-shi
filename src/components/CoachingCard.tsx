import { AlertTriangle, Check, CheckCircle2, Loader2, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getTranslations, type Locale } from '../i18n/translations';
import type { CoachChatMessage, SalesCallRecord } from '../types/call';
import { formatTimestamp } from '../utils/callAnalytics';

interface CoachingCardProps {
  call: SalesCallRecord;
  locale: Locale;
  onSeek: (timeSec: number) => void;
  onToggleNextStep: () => void;
}

export function CoachingCard({ call, locale, onSeek, onToggleNextStep }: CoachingCardProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const t = getTranslations(locale);

  const askCoach = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isAsking) return;

    setChatError(null);
    const userMsg: CoachChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setIsAsking(true);

    try {
      const response = await fetch('/api/coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call, question: trimmed, locale }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'Could not generate coaching advice.');
      }

      const assistantMsg: CoachChatMessage = {
        id: `msg-a-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to reach coaching assistant.');
    } finally {
      setIsAsking(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void askCoach(question);
  };

  return (
    <section
      aria-label={t.coachingCardAria}
      data-testid="coaching-card-section"
      className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
    >
      {/* Header & Executive Summary */}
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="font-display text-base font-semibold text-slate-900">
            {t.coachingCardTitle}
          </h2>
          <span className="text-xs text-slate-500">
            {call.methodology || 'General B2B'} · {t.coachingCardMetaSuffix}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-slate-700">{call.coaching.summary}</p>
      </div>

      {/* 3 Things Done Well */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold text-slate-900">
            {t.thingsDoneWell}
          </h3>
        </div>

        <ol className="space-y-4">
          {call.coaching.strengths.slice(0, 3).map((item, idx) => (
            <li key={`strength-${idx}`} className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  <span className="font-mono tabular-nums text-emerald-700 mr-1.5">
                    0{idx + 1}.
                  </span>
                  {item.title}
                </p>
                <button
                  type="button"
                  onClick={() => onSeek(item.timestampSec)}
                  className="font-mono tabular-nums text-xs text-slate-600 hover:text-blue-700 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  {t.jump} {formatTimestamp(item.timestampSec)}
                </button>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{item.detail}</p>
              <blockquote className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 italic">
                &ldquo;{item.evidenceQuote}&rdquo;
              </blockquote>
            </li>
          ))}
        </ol>
      </div>

      {/* 3 Missed Opportunities */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold text-slate-900">
            {t.missedOpportunities}
          </h3>
        </div>

        <ol className="space-y-4">
          {call.coaching.missedOpportunities.slice(0, 3).map((item, idx) => (
            <li key={`missed-${idx}`} className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  <span className="font-mono tabular-nums text-amber-700 mr-1.5">
                    0{idx + 1}.
                  </span>
                  {item.title}
                </p>
                <button
                  type="button"
                  onClick={() => onSeek(item.timestampSec)}
                  className="font-mono tabular-nums text-xs text-slate-600 hover:text-blue-700 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  {t.jump} {formatTimestamp(item.timestampSec)}
                </button>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{item.detail}</p>
              <blockquote className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 italic">
                &ldquo;{item.evidenceQuote}&rdquo;
              </blockquote>
            </li>
          ))}
        </ol>
      </div>

      {/* Recommended Next Step with persisted completion toggle */}
      <div className="p-5 bg-slate-50/70">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-xs font-semibold text-slate-500">
            {t.recommendedNextStep}
          </h3>
          <button
            type="button"
            onClick={onToggleNextStep}
            aria-pressed={Boolean(call.coaching.nextStepCompleted)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
              call.coaching.nextStepCompleted
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{call.coaching.nextStepCompleted ? t.completed : t.markDone}</span>
          </button>
        </div>
        <p
          className={`text-sm leading-relaxed ${
            call.coaching.nextStepCompleted ? 'text-slate-500 line-through' : 'text-slate-800'
          }`}
        >
          {call.coaching.nextStepRecommendation}
        </p>
      </div>

      {/* Follow-up Coaching Q&A */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            {t.followUpCoaching}
          </h3>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              {t.clearThread}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {t.quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isAsking}
              onClick={() => void askCoach(prompt)}
              className="text-left text-xs px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {messages.length > 0 && (
          <div className="space-y-2.5 max-h-56 overflow-y-auto pt-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white ml-6'
                    : 'bg-slate-50 border border-slate-200 text-slate-800 mr-2'
                }`}
              >
                {msg.content}
              </div>
            ))}
          </div>
        )}

        {chatError && (
          <div
            role="alert"
            className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          >
            {chatError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <label htmlFor="coach-question-input" className="sr-only">
            {t.askCoachAria}
          </label>
          <input
            id="coach-question-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t.askCoachPlaceholder}
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={!question.trim() || isAsking}
            aria-label={t.sendQuestionAria}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isAsking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </section>
  );
}

import { ArrowUpRight } from 'lucide-react';
import { useMemo } from 'react';
import { getTranslations, type Locale } from '../i18n/translations';
import type { SalesCallRecord } from '../types/call';
import {
  computeConversationMetrics,
  computeEngagementSummary,
  computeLibraryOverview,
  computeTalkRatio,
  formatDurationLabel,
} from '../utils/callAnalytics';

interface TeamOverviewProps {
  calls: SalesCallRecord[];
  locale: Locale;
  onSelectCall: (callId: string) => void;
  onOpenUpload: () => void;
}

export function TeamOverview({ calls, locale, onSelectCall, onOpenUpload }: TeamOverviewProps) {
  const overview = useMemo(() => computeLibraryOverview(calls), [calls]);
  const maxTopicCount = Math.max(1, ...(overview.topicDistribution.map((t) => t.count) || [1]));
  const t = getTranslations(locale);

  return (
    <div className="space-y-6" data-testid="team-overview-section">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            {t.teamOverviewTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t.teamOverviewSubtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenUpload}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          {t.analyzeAnotherCall}
        </button>
      </div>

      {/* Deterministic Aggregate Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">{t.callsAnalyzed}</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-slate-950">
            {overview.totalCalls}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
            {formatDurationLabel(overview.totalDurationSec)} {t.totalSuffix}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">{t.avgRepTalkRatio}</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-slate-950">
            {overview.avgRepTalkPercent}%
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {t.targetTalkBalance}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">{t.avgEngagement}</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-blue-700">
            {overview.avgEngagement}%
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{t.acrossAllSegments}</div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">{t.avgProspectSentiment}</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-emerald-700">
            {overview.avgProspectSentiment}%
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{t.positiveToneIndex}</div>
        </div>

        <div className="p-4 sm:p-5 col-span-2 lg:col-span-1">
          <div className="text-xs font-medium text-slate-500">{t.repQuestionsLogged}</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-slate-950">
            {overview.totalRepQuestions}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{t.openClarifyingPrompts}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* High-Density Call Comparison Table */}
        <section
          aria-label={t.callComparisonAria}
          className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t.callBreakdownLedger}
            </h2>
            <span className="text-xs text-slate-500">{t.clickRowHint}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">{t.colCallAccount}</th>
                  <th className="py-2.5 px-3">{t.colFramework}</th>
                  <th className="py-2.5 px-3 text-right">{t.colDuration}</th>
                  <th className="py-2.5 px-3 text-right">{t.colRepTalk}</th>
                  <th className="py-2.5 px-3 text-right">{t.colEngagement}</th>
                  <th className="py-2.5 px-4 text-right">{t.colQuestions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {calls.map((call) => {
                  const ratio = computeTalkRatio(call.transcript);
                  const eng = computeEngagementSummary(call.sentimentTimeline);
                  const metrics = computeConversationMetrics(call.transcript);

                  return (
                    <tr
                      key={call.id}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onSelectCall(call.id)}
                          className="text-left group-hover:text-blue-700 focus-visible:outline-none focus-visible:underline"
                        >
                          <div className="font-medium text-slate-900 group-hover:text-blue-700 inline-flex items-center gap-1">
                            <span>{call.title}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="text-xs text-slate-500">
                            {call.accountName} · {call.callDate}
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                        {call.methodology || 'General B2B'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        {formatDurationLabel(call.durationSec)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-700">
                        {ratio.speakerAPercent}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs font-medium text-blue-700">
                        {eng.averageEngagement}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {metrics.repQuestionsCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Topic Frequency Distribution */}
        <section
          aria-label={t.topicDistributionAria}
          className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-5"
        >
          <h2 className="font-display text-base font-semibold text-slate-900">
            {t.recurringCallTopics}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 mb-4">
            {t.topicSubtitle}
          </p>

          {overview.topicDistribution.length === 0 ? (
            <p className="text-sm text-slate-500">{t.noTopicTags}</p>
          ) : (
            <ul className="space-y-3">
              {overview.topicDistribution.map((item) => {
                const widthPct = Math.max(12, Math.round((item.count / maxTopicCount) * 100));
                return (
                  <li key={item.topic} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 truncate pr-2">
                        {item.topic}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 shrink-0">
                        {item.count} {item.count === 1 ? t.turnSingular : t.turnPlural}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className="h-full bg-slate-800 rounded-full"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

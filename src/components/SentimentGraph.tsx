import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTranslations, type Locale } from '../i18n/translations';
import type { SentimentPoint, TranscriptSegment } from '../types/call';
import {
  computeConversationMetrics,
  computeEngagementSummary,
  formatDurationLabel,
  formatTimestamp,
} from '../utils/callAnalytics';

interface SentimentGraphProps {
  timeline: SentimentPoint[];
  transcript: TranscriptSegment[];
  durationSec: number;
  currentTimeSec: number;
  locale: Locale;
  onSeek: (timeSec: number) => void;
}

const DEFAULT_CHART_WIDTH = 760;
const CHART_HEIGHT = 200;
const PAD_LEFT = 42;
const PAD_RIGHT = 18;
const PAD_TOP = 22;
const PAD_BOTTOM = 34;

function buildSmoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  let path = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

export function SentimentGraph({
  timeline,
  transcript,
  durationSec,
  currentTimeSec,
  locale,
  onSeek,
}: SentimentGraphProps) {
  const [showProspectLine, setShowProspectLine] = useState(true);
  const [showRepEnergyLine, setShowRepEnergyLine] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // The chart is a real SVG with a 1:1 pixel mapping, so it has to track the
  // container width instead of stretching a fixed viewBox (which would scale
  // stroke weights and distort labels on wide screens).
  const [chartWidth, setChartWidth] = useState(DEFAULT_CHART_WIDTH);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const t = getTranslations(locale);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0);
      if (width > 0) setChartWidth(Math.max(420, width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const summary = useMemo(() => computeEngagementSummary(timeline), [timeline]);
  const convMetrics = useMemo(() => computeConversationMetrics(transcript), [transcript]);

  const effectiveDuration = Math.max(
    1,
    durationSec,
    timeline.length > 0 ? timeline[timeline.length - 1].timeSec : 1
  );

  const plotW = chartWidth - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const toX = useCallback(
    (timeSec: number) =>
      PAD_LEFT + (Math.min(effectiveDuration, Math.max(0, timeSec)) / effectiveDuration) * plotW,
    [effectiveDuration, plotW]
  );
  const toY = useCallback(
    (score: number) => PAD_TOP + (1 - Math.min(100, Math.max(0, score)) / 100) * plotH,
    [plotH]
  );

  const engagementCoords = useMemo(
    () => timeline.map((pt) => ({ x: toX(pt.timeSec), y: toY(pt.engagement) })),
    [timeline, toX, toY]
  );

  const prospectCoords = useMemo(
    () => timeline.map((pt) => ({ x: toX(pt.timeSec), y: toY(pt.prospectSentiment) })),
    [timeline, toX, toY]
  );

  const repEnergyCoords = useMemo(
    () => timeline.map((pt) => ({ x: toX(pt.timeSec), y: toY(pt.repEnergy) })),
    [timeline, toX, toY]
  );

  const engagementPath = useMemo(() => buildSmoothPath(engagementCoords), [engagementCoords]);
  const prospectPath = useMemo(() => buildSmoothPath(prospectCoords), [prospectCoords]);
  const repEnergyPath = useMemo(() => buildSmoothPath(repEnergyCoords), [repEnergyCoords]);

  const areaPath = useMemo(() => {
    if (engagementCoords.length === 0) return '';
    const first = engagementCoords[0];
    const last = engagementCoords[engagementCoords.length - 1];
    const baseY = PAD_TOP + plotH;
    return `${engagementPath} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`;
  }, [engagementCoords, engagementPath, plotH]);

  const playheadX = toX(currentTimeSec);
  const activePoint = hoveredIndex !== null ? timeline[hoveredIndex] : null;

  const yTicks = [0, 25, 50, 75, 100];
  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) =>
    Math.round((effectiveDuration / xTickCount) * i)
  );

  const milestones = timeline.filter((pt) => pt.label || pt.milestoneType);

  return (
    <section
      aria-label={t.sentimentGraphAria}
      data-testid="sentiment-graph-section"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            {t.sentimentGraphTitle}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span>
              {t.avgEngagement}{' '}
              <span className="font-mono tabular-nums font-medium text-slate-800">
                {summary.averageEngagement}%
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t.prospectSentiment}{' '}
              <span className="font-mono tabular-nums font-medium text-slate-800">
                {summary.averageProspectSentiment}%
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t.repQuestions}{' '}
              <span className="font-mono tabular-nums font-medium text-slate-800">
                {convMetrics.repQuestionsCount}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t.longestMonologue}{' '}
              <span className="font-mono tabular-nums font-medium text-slate-800">
                {formatDurationLabel(convMetrics.longestRepMonologueSec)}
              </span>
            </span>
            {summary.peakPoint && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {t.peak}{' '}
                  <span className="font-mono tabular-nums font-medium text-emerald-700">
                    {summary.peakPoint.engagement}%
                  </span>{' '}
                  {t.atTime} {formatTimestamp(summary.peakPoint.timeSec)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-700 font-medium whitespace-nowrap">
            <span className="w-3 h-0.5 bg-blue-700 inline-block" aria-hidden="true" />
            {t.engagement}
          </span>
          <button
            type="button"
            onClick={() => setShowProspectLine((v) => !v)}
            aria-pressed={showProspectLine}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              showProspectLine
                ? 'border-slate-300 bg-slate-50 text-slate-800 font-medium'
                : 'border-slate-200 bg-white text-slate-400'
            }`}
          >
            <span
              className={`w-3 h-0.5 inline-block ${showProspectLine ? 'bg-emerald-600' : 'bg-slate-300'}`}
              aria-hidden="true"
            />
            {t.prospectSentiment}
          </button>
          <button
            type="button"
            onClick={() => setShowRepEnergyLine((v) => !v)}
            aria-pressed={showRepEnergyLine}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              showRepEnergyLine
                ? 'border-slate-300 bg-slate-50 text-slate-800 font-medium'
                : 'border-slate-200 bg-white text-slate-400'
            }`}
          >
            <span
              className={`w-3 h-0.5 inline-block ${showRepEnergyLine ? 'bg-amber-600' : 'bg-slate-300'}`}
              aria-hidden="true"
            />
            {t.repEnergy}
          </button>
        </div>
      </div>

      {timeline.length === 0 ? (
        <div className="h-40 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-sm text-slate-500">
          {t.noTimelineData}
        </div>
      ) : (
        <div className="relative" ref={chartRef}>
          <svg
            viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
            role="img"
            aria-label={t.sentimentChartAria}
            data-testid="sentiment-chart-svg"
            style={{ height: CHART_HEIGHT }}
            className="w-full overflow-visible select-none"
          >
            <defs>
              <linearGradient id="engagementAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {yTicks.map((tick) => {
              const y = toY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={chartWidth - PAD_RIGHT}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray={tick === 50 ? '4 4' : undefined}
                    strokeWidth="1"
                  />
                  <text
                    x={PAD_LEFT - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 text-[13px] font-mono tabular-nums"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {xTicks.map((sec, idx) => {
              const x = toX(sec);
              return (
                <text
                  key={`${sec}-${idx}`}
                  x={x}
                  y={CHART_HEIGHT - 8}
                  textAnchor={idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'}
                  className="fill-slate-500 text-[13px] font-mono tabular-nums"
                >
                  {formatTimestamp(sec)}
                </text>
              );
            })}

            {areaPath && <path d={areaPath} fill="url(#engagementAreaGrad)" />}
            {engagementPath && (
              <path
                d={engagementPath}
                fill="none"
                stroke="#1D4ED8"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}

            {showProspectLine && prospectPath && (
              <path
                d={prospectPath}
                fill="none"
                stroke="#059669"
                strokeWidth="2"
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
            )}

            {showRepEnergyLine && repEnergyPath && (
              <path
                d={repEnergyPath}
                fill="none"
                stroke="#D97706"
                strokeWidth="2"
                strokeDasharray="2 3"
                strokeLinecap="round"
              />
            )}

            <line
              x1={playheadX}
              y1={PAD_TOP - 6}
              x2={playheadX}
              y2={PAD_TOP + plotH}
              stroke="#0F172A"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />

            {timeline.map((pt, idx) => {
              const cx = toX(pt.timeSec);
              const cy = toY(pt.engagement);
              const isHovered = hoveredIndex === idx;
              const isDipOrObj = pt.milestoneType === 'dip' || pt.milestoneType === 'objection';
              const isPeakOrCommit =
                pt.milestoneType === 'peak' || pt.milestoneType === 'commitment';

              const dotStroke = isDipOrObj ? '#B91C1C' : isPeakOrCommit ? '#15803D' : '#1D4ED8';

              return (
                <g key={`${pt.timeSec}-${idx}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={16}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => onSeek(pt.timeSec)}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered || pt.milestoneType ? 5 : 3.5}
                    fill="#FFFFFF"
                    stroke={dotStroke}
                    strokeWidth={isHovered ? 3 : 2}
                    className="pointer-events-none transition-all duration-150"
                  />
                </g>
              );
            })}
          </svg>

          {activePoint && (
            <div
              role="status"
              className="mt-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums font-semibold">
                  {formatTimestamp(activePoint.timeSec)}
                </span>
                {activePoint.label && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-200">{activePoint.label}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-4 font-mono tabular-nums">
                <span>
                  {t.tooltipEngagement}: {activePoint.engagement}%
                </span>
                <span>
                  {t.tooltipProspect}: {activePoint.prospectSentiment}%
                </span>
                <span>
                  {t.tooltipRepEnergy}: {activePoint.repEnergy}%
                </span>
              </div>
            </div>
          )}

          {milestones.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-medium text-slate-500 shrink-0 pr-1">
                {t.keyMoments}
              </span>
              <div className="flex items-center gap-2 flex-nowrap">
                {milestones.map((m, idx) => {
                  const toneClass =
                    m.milestoneType === 'objection' || m.milestoneType === 'dip'
                      ? 'text-amber-800 hover:bg-amber-50 border-amber-200'
                      : 'text-emerald-800 hover:bg-emerald-50 border-emerald-200';
                  return (
                    <button
                      key={`${m.timeSec}-${idx}`}
                      type="button"
                      onClick={() => onSeek(m.timeSec)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${toneClass}`}
                    >
                      <span className="font-mono tabular-nums font-medium">
                        {formatTimestamp(m.timeSec)}
                      </span>
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

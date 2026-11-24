import { BarChart3, FileText, Mic, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getTranslations, type Locale } from '../i18n/translations';
import type { SalesCallRecord } from '../types/call';
import { formatDurationLabel } from '../utils/callAnalytics';

interface SidebarProps {
  calls: SalesCallRecord[];
  activeCallId: string;
  activeView: 'call' | 'overview';
  locale: Locale;
  onChangeView: (view: 'call' | 'overview') => void;
  onSelectCall: (callId: string) => void;
  onOpenUploadModal: (initialMode: 'upload' | 'record' | 'transcript') => void;
  onDeleteCall: (callId: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  calls,
  activeCallId,
  activeView,
  locale,
  onChangeView,
  onSelectCall,
  onOpenUploadModal,
  onDeleteCall,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [libraryQuery, setLibraryQuery] = useState('');
  const t = getTranslations(locale);

  const visibleCalls = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.accountName.toLowerCase().includes(q) ||
        (c.methodology ? c.methodology.toLowerCase().includes(q) : false)
    );
  }, [calls, libraryQuery]);

  const sidebarBody = (
    <div className="flex h-full flex-col bg-slate-100/80 border-r border-slate-200">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
          {t.brandName}
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label={t.closeNavAria}
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Workspace View Switcher */}
      <div className="px-4 pt-4 pb-2">
        <div
          role="group"
          aria-label={t.workspaceViewAria}
          className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg"
        >
          <button
            type="button"
            onClick={() => {
              onChangeView('call');
              onCloseMobile();
            }}
            aria-pressed={activeView === 'call'}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeView === 'call'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>{t.callDetail}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeView('overview');
              onCloseMobile();
            }}
            aria-pressed={activeView === 'overview'}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeView === 'overview'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span>{t.overview}</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            onOpenUploadModal('upload');
            onCloseMobile();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <Upload className="w-4 h-4 shrink-0" />
          <span>{t.uploadAudio}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenUploadModal('record');
            onCloseMobile();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Mic className="w-4 h-4 shrink-0 text-blue-700" />
          <span>{t.recordMicrophone}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between px-2 mb-2">
          <h2 className="text-xs font-semibold text-slate-500 tracking-tight">
            {t.callLibrary} ({calls.length})
          </h2>
          <button
            type="button"
            onClick={() => onOpenUploadModal('transcript')}
            aria-label={t.addNewCallAria}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {calls.length > 2 && (
          <div className="relative px-1 mb-2.5">
            <label htmlFor="sidebar-call-search" className="sr-only">
              {t.filterCallLibraryLabel}
            </label>
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="sidebar-call-search"
              type="text"
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              placeholder={t.filterCallsPlaceholder}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {libraryQuery && (
              <button
                type="button"
                onClick={() => setLibraryQuery('')}
                aria-label={t.clearFilterAria}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <nav aria-label={t.salesCallLibraryAria} className="space-y-1">
          {visibleCalls.length === 0 ? (
            <p className="px-2 py-4 text-xs text-slate-500 text-center">{t.noMatchingCalls}</p>
          ) : (
            visibleCalls.map((call) => {
              const isActive = activeView === 'call' && call.id === activeCallId;
              return (
                <div
                  key={call.id}
                  className={`group relative rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white border border-slate-200 shadow-xs'
                      : 'border border-transparent hover:bg-slate-200/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCall(call.id);
                      onChangeView('call');
                      onCloseMobile();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className="w-full text-left px-3 py-2.5 pr-9 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <div
                      className={`text-sm font-medium leading-snug truncate ${
                        isActive ? 'text-slate-950' : 'text-slate-800'
                      }`}
                    >
                      {call.title}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                      <span className="truncate">{call.accountName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {formatDurationLabel(call.durationSec)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {call.callDate}
                      {call.methodology && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{call.methodology}</span>
                        </>
                      )}
                    </div>
                  </button>

                  {calls.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCall(call.id);
                      }}
                      aria-label={`${t.deleteCallAria} ${call.title}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 absolute right-2 top-2.5 inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-68 shrink-0 h-screen sticky top-0">{sidebarBody}</aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label={t.closeBackdropAria}
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-900/40"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-slate-100">
            {sidebarBody}
          </aside>
        </div>
      )}
    </>
  );
}

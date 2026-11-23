import { Mic, Plus, Trash2, Upload, X } from 'lucide-react';
import type { SalesCallRecord } from '../types/call';
import { formatDurationLabel } from '../utils/callAnalytics';

interface SidebarProps {
  calls: SalesCallRecord[];
  activeCallId: string;
  onSelectCall: (callId: string) => void;
  onOpenUploadModal: (initialMode: 'upload' | 'record') => void;
  onDeleteCall: (callId: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  calls,
  activeCallId,
  onSelectCall,
  onOpenUploadModal,
  onDeleteCall,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const sidebarBody = (
    <div className="flex h-full flex-col bg-slate-100/80 border-r border-slate-200">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Cadence
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            onOpenUploadModal('upload');
            onCloseMobile();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <Upload className="w-4 h-4 shrink-0" />
          <span>Upload Audio</span>
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
          <span>Record Microphone</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between px-2 mb-2">
          <h2 className="text-xs font-semibold text-slate-500 tracking-tight">
            Call Library ({calls.length})
          </h2>
          <button
            type="button"
            onClick={() => onOpenUploadModal('upload')}
            aria-label="Add new sales call"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <nav aria-label="Sales call library" className="space-y-1">
          {calls.map((call) => {
            const isActive = call.id === activeCallId;
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
                    {call.sourceType !== 'sample' && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{call.sourceType === 'microphone' ? 'Mic capture' : 'Uploaded'}</span>
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
                    aria-label={`Delete call ${call.title}`}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 absolute right-2 top-2.5 inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block w-68 shrink-0 h-screen sticky top-0">
        {sidebarBody}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close menu backdrop"
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

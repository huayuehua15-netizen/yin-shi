import { Check, Copy, Menu, Upload } from 'lucide-react';
import type { SalesCallRecord } from '../types/call';

interface TopHeaderProps {
  activeCall: SalesCallRecord;
  copiedBrief: boolean;
  onCopyBrief: () => void;
  onOpenUpload: () => void;
  onOpenMobileMenu: () => void;
}

export function TopHeader({
  activeCall,
  copiedBrief,
  onCopyBrief,
  onOpenUpload,
  onOpenMobileMenu,
}: TopHeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-4">
      <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open call library menu"
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0 flex-1 overflow-hidden">
          <span className="hidden sm:inline text-slate-500 whitespace-nowrap shrink-0">
            Call Intelligence
          </span>
          <span className="hidden sm:inline text-slate-300 shrink-0" aria-hidden="true">/</span>
          <span className="font-medium text-slate-900 truncate">
            {activeCall.title}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onCopyBrief}
          aria-label={copiedBrief ? 'Copied brief' : 'Copy coaching brief'}
          className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {copiedBrief ? (
            <>
              <Check className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="hidden sm:inline">Copied Brief</span>
              <span className="sm:hidden">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="hidden sm:inline">Copy Brief</span>
              <span className="sm:hidden">Brief</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenUpload}
          className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-lg bg-blue-700 text-white text-xs sm:text-sm font-medium hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <Upload className="w-4 h-4 shrink-0" />
          <span>New Call</span>
        </button>
      </div>
    </header>
  );
}

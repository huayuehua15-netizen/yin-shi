import { Check, ChevronDown, Copy, Download, Languages, Menu, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getTranslations, type Locale } from '../i18n/translations';
import type { SalesCallRecord } from '../types/call';

interface TopHeaderProps {
  activeCall: SalesCallRecord;
  activeView: 'call' | 'overview';
  copiedBrief: boolean;
  locale: Locale;
  onToggleLocale: () => void;
  onCopyBrief: () => void;
  onExportFormat: (format: 'md' | 'srt' | 'txt') => void;
  onOpenUpload: () => void;
  onOpenMobileMenu: () => void;
}

export function TopHeader({
  activeCall,
  activeView,
  copiedBrief,
  locale,
  onToggleLocale,
  onCopyBrief,
  onExportFormat,
  onOpenUpload,
  onOpenMobileMenu,
}: TopHeaderProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const t = getTranslations(locale);

  useEffect(() => {
    if (!exportOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [exportOpen]);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-2.5 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label={t.openMenuAria}
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label={t.breadcrumbAria} className="flex items-center gap-2 text-sm min-w-0 flex-1 overflow-hidden">
          <span className="hidden sm:inline text-slate-500 whitespace-nowrap shrink-0">
            {t.callIntelligence}
          </span>
          <span className="hidden sm:inline text-slate-300 shrink-0" aria-hidden="true">/</span>
          <span className="font-medium text-slate-900 truncate">
            {activeView === 'overview' ? t.teamOverview : activeCall.title}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <button
          type="button"
          data-testid="locale-toggle-btn"
          onClick={onToggleLocale}
          aria-label={t.switchLangAria}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Languages className="w-4 h-4 text-slate-500 shrink-0" />
          <span>{t.langButtonLabel}</span>
        </button>

        {activeView === 'call' && (
          <div className="relative" ref={menuRef}>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={onCopyBrief}
                aria-label={copiedBrief ? t.copiedBrief : t.copyBrief}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {copiedBrief ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="hidden sm:inline">{t.copiedBrief}</span>
                    <span className="sm:hidden">{t.copiedBriefShort}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="hidden sm:inline">{t.copyBrief}</span>
                    <span className="sm:hidden">{t.copyBriefShort}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setExportOpen((v) => !v)}
                aria-label={t.exportOptionsAria}
                aria-expanded={exportOpen}
                className="inline-flex items-center justify-center px-1.5 sm:px-2 border-l border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {exportOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-40"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onExportFormat('md');
                    setExportOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t.downloadMd}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onExportFormat('srt');
                    setExportOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t.downloadSrt}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onExportFormat('txt');
                    setExportOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t.downloadTxt}</span>
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onOpenUpload}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-blue-700 text-white text-xs sm:text-sm font-medium hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <Upload className="w-4 h-4 shrink-0" />
          <span>{t.newCall}</span>
        </button>
      </div>
    </header>
  );
}

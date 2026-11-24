import { Keyboard, X } from 'lucide-react';
import { getTranslations, type Locale } from '../i18n/translations';

interface ShortcutsModalProps {
  locale: Locale;
  onClose: () => void;
}

export function ShortcutsModal({ locale, onClose }: ShortcutsModalProps) {
  const t = getTranslations(locale);

  const shortcuts: Array<{ keys: string[]; label: string }> = [
    { keys: ['Space'], label: t.shortcutPlayPause },
    { keys: ['←'], label: t.shortcutSeekBack },
    { keys: ['→'], label: t.shortcutSeekForward },
    { keys: ['J'], label: t.shortcutNextCall },
    { keys: ['K'], label: t.shortcutPrevCall },
    { keys: ['U'], label: t.shortcutUpload },
    { keys: ['?'], label: t.shortcutHelp },
    { keys: ['Esc'], label: t.shortcutClose },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white">
              <Keyboard className="w-4 h-4" />
            </span>
            <h2 id="shortcuts-title" className="font-display text-base font-semibold text-slate-950">
              {t.shortcutsTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeDialogAria}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="px-5 py-2 divide-y divide-slate-100">
          {shortcuts.map((shortcut) => (
            <li key={shortcut.label} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-slate-700">{shortcut.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex min-w-7 items-center justify-center px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-600 shadow-xs"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="px-5 pb-4 text-xs text-slate-500">{t.shortcutsFooter}</p>
      </div>
    </div>
  );
}

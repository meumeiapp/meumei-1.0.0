import React from 'react';
import { X } from 'lucide-react';

export const modalLabelClass =
  'text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';

export const modalHelperTextClass = 'text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-500';

export const modalInputClass =
  'w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-sm sm:text-base text-zinc-900 dark:text-white rounded-lg sm:rounded-2xl px-3 sm:px-5 py-2 sm:py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400';

export const modalSelectClass =
  `${modalInputClass} pr-12 appearance-none`;

export const modalTextareaClass =
  `${modalInputClass} resize-none`;

export const modalSecondaryButtonClass =
  'h-9 sm:h-11 px-4 sm:px-6 rounded-lg sm:rounded-xl border border-zinc-200/80 dark:border-zinc-700 text-sm sm:text-base text-zinc-600 dark:text-zinc-300 font-semibold hover:border-indigo-400/50 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors';

export const modalPrimaryButtonClass =
  'h-9 sm:h-11 px-4 sm:px-6 rounded-lg sm:rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm sm:text-base text-white font-semibold shadow-lg shadow-indigo-500/30 transition-all';

interface PremiumModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
  zIndexClass?: string;
  panelClassName?: string;
  fullScreen?: boolean;
}

export const PremiumModalShell: React.FC<PremiumModalShellProps> = ({
  isOpen,
  onClose,
  children,
  maxWidthClass = 'max-w-3xl',
  zIndexClass = 'z-[80]',
  panelClassName,
  fullScreen = false
}) => {
  if (!isOpen) return null;

  const resolvedMaxWidthClass = fullScreen && maxWidthClass === 'max-w-3xl'
    ? 'max-w-5xl'
    : maxWidthClass;
  const wrapperClass = fullScreen
    ? 'flex h-full items-stretch justify-center px-3 sm:px-6 lg:px-10 text-center'
    : 'flex min-h-full items-center justify-center p-3 text-center sm:p-0';
  const panelBaseClass = fullScreen
    ? 'h-full w-full rounded-none sm:my-0 overflow-y-auto'
    : 'rounded-[28px] sm:my-10 overflow-visible';

  return (
    <div className={`fixed inset-0 ${zIndexClass} overflow-y-auto`} data-modal-root="true">
      <div className={wrapperClass}>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />
        <div
          className={`relative w-full ${resolvedMaxWidthClass} transform ${panelBaseClass} bg-white dark:bg-[#0d0d10] text-left shadow-2xl transition-all border border-white/10 dark:border-zinc-800/60 ${panelClassName || ''}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

interface PremiumModalHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  fullScreen?: boolean;
}

export const PremiumModalHeader: React.FC<PremiumModalHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  icon,
  onClose,
  fullScreen = false
}) => (
    <div
    className={`flex items-center justify-between px-4 sm:px-8 py-3 sm:py-6 border-b border-white/10 relative z-20 ${
      fullScreen ? 'rounded-none' : 'rounded-t-[28px]'
    }`}
  >
    <div>
      {eyebrow && (
        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.35em] text-zinc-400 mb-2">
          {eyebrow}
        </p>
      )}
      <div className="flex items-center gap-2">
        {icon ? <span className="text-indigo-500">{icon}</span> : null}
        <h2 className="text-lg sm:text-2xl font-semibold text-zinc-900 dark:text-white">{title}</h2>
      </div>
      {subtitle && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>
      )}
    </div>
    <div className="flex items-center gap-3">
      <span className="hidden sm:inline text-[11px] text-zinc-400 dark:text-zinc-400">ESC fecha</span>
      <button
        onClick={onClose}
        aria-label="Fechar modal"
        className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
      >
        <X size={20} />
      </button>
    </div>
  </div>
);

interface PremiumModalFooterProps {
  children: React.ReactNode;
  fullScreen?: boolean;
}

export const PremiumModalFooter: React.FC<PremiumModalFooterProps> = ({
  children,
  fullScreen = false
}) => (
  <div
    className={`px-4 sm:px-8 py-3 sm:py-6 border-t border-white/10 flex justify-end gap-3 bg-white/70 dark:bg-black/20 relative z-20 ${
      fullScreen ? 'rounded-none' : 'rounded-b-[28px]'
    }`}
  >
    {children}
  </div>
);

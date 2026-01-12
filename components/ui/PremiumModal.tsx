import React from 'react';
import { X } from 'lucide-react';

export const modalLabelClass =
  'text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';

export const modalHelperTextClass = 'text-[11px] text-zinc-500 dark:text-zinc-500';

export const modalInputClass =
  'w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-base text-zinc-900 dark:text-white rounded-2xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400';

export const modalSelectClass =
  `${modalInputClass} pr-12 appearance-none`;

export const modalTextareaClass =
  `${modalInputClass} resize-none`;

export const modalSecondaryButtonClass =
  'px-6 py-3 rounded-full border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold hover:border-indigo-400/50 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors';

export const modalPrimaryButtonClass =
  'px-8 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-500/30 transition-all';

interface PremiumModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
  zIndexClass?: string;
  panelClassName?: string;
}

export const PremiumModalShell: React.FC<PremiumModalShellProps> = ({
  isOpen,
  onClose,
  children,
  maxWidthClass = 'max-w-3xl',
  zIndexClass = 'z-[80]',
  panelClassName
}) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${zIndexClass} overflow-y-auto`}>
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />
        <div
          className={`relative w-full ${maxWidthClass} transform rounded-[28px] bg-white dark:bg-[#0d0d10] text-left shadow-2xl transition-all sm:my-10 border border-white/10 dark:border-zinc-800/60 overflow-visible ${panelClassName || ''}`}
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
}

export const PremiumModalHeader: React.FC<PremiumModalHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  icon,
  onClose
}) => (
  <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 rounded-t-[28px] relative z-20">
    <div>
      {eyebrow && (
        <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-400 mb-2">
          {eyebrow}
        </p>
      )}
      <div className="flex items-center gap-2">
        {icon ? <span className="text-indigo-500">{icon}</span> : null}
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">{title}</h2>
      </div>
      {subtitle && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>
      )}
    </div>
    <button
      onClick={onClose}
      aria-label="Fechar modal"
      className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
    >
      <X size={20} />
    </button>
  </div>
);

interface PremiumModalFooterProps {
  children: React.ReactNode;
}

export const PremiumModalFooter: React.FC<PremiumModalFooterProps> = ({ children }) => (
  <div className="px-8 py-6 border-t border-white/10 flex justify-end gap-4 rounded-b-[28px] bg-white/70 dark:bg-black/20 relative z-20">
    {children}
  </div>
);

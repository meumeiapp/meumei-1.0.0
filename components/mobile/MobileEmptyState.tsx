import React from 'react';

type MobileEmptyStateProps = {
  message: string;
  title?: string;
  icon?: React.ReactNode;
  className?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const MobileEmptyState: React.FC<MobileEmptyStateProps> = ({
  message,
  title,
  icon,
  className = '',
  actionLabel,
  onAction
}) => {
  const hasAction = Boolean(actionLabel && onAction);
  return (
    <div
      className={`rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-4 py-3 flex items-start gap-3 text-sm text-zinc-500 dark:text-zinc-400 ${className}`}
    >
      {icon && (
        <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        {title && (
          <p className="text-zinc-900 dark:text-white font-semibold">{title}</p>
        )}
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{message}</p>
        {hasAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 inline-flex items-center rounded-lg border border-indigo-300/70 bg-indigo-500/10 px-3 py-1.5 text-[12px] font-semibold text-indigo-600 transition hover:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default MobileEmptyState;

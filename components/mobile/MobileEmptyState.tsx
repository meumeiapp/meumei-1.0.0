import React from 'react';

type MobileEmptyStateProps = {
  message: string;
  title?: string;
  icon?: React.ReactNode;
  className?: string;
};

const MobileEmptyState: React.FC<MobileEmptyStateProps> = ({
  message,
  title,
  icon,
  className = ''
}) => {
  return (
    <div
      className={`rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-4 py-3 flex items-start gap-3 text-sm text-zinc-500 dark:text-zinc-400 ${className}`}
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
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{message}</p>
      </div>
    </div>
  );
};

export default MobileEmptyState;

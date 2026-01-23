import React from 'react';
import { Lock } from 'lucide-react';

interface MobileTransactionCardProps {
  title: string;
  amount: string;
  amountClassName?: string;
  dateLabel: string;
  statusLabel?: string;
  statusClassName?: string;
  category?: string;
  subtitle?: string;
  isHighlighted?: boolean;
  isLocked?: boolean;
  lockedLabel?: string;
  onClick?: () => void;
}

const MobileTransactionCard: React.FC<MobileTransactionCardProps> = ({
  title,
  amount,
  amountClassName,
  dateLabel,
  statusLabel,
  statusClassName,
  category,
  subtitle,
  isHighlighted,
  isLocked,
  lockedLabel,
  onClick
}) => {
  const wrapperClassName = `w-full text-left rounded-2xl border p-4 transition-colors ${
    isHighlighted
      ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-900/20'
      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517]'
  } ${onClick ? 'hover:bg-zinc-50 dark:hover:bg-[#1c1c20]' : ''}`;
  const resolvedAmountClass = amountClassName
    ? amountClassName
    : isLocked
      ? 'text-zinc-400 dark:text-zinc-500'
      : 'bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-200 bg-clip-text text-transparent';

  const content = (
    <>
      <div className="flex items-start justify-between gap-3 min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{title}</p>
        <span className={`text-base font-semibold tracking-tight text-right max-w-[160px] truncate ${resolvedAmountClass}`}>
          {amount}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <span className="truncate">{dateLabel}</span>
        {statusLabel && (
          <span className={`px-2 py-0.5 rounded-full font-semibold ${statusClassName || ''}`}>
            {statusLabel}
          </span>
        )}
        {category && <span className="truncate max-w-[160px]">{category}</span>}
        {isLocked && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            <Lock size={12} />
            {lockedLabel || 'Arquivado'}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{subtitle}</p>
      )}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={wrapperClassName}>
      {content}
    </button>
  ) : (
    <div className={wrapperClassName}>{content}</div>
  );
};

export default MobileTransactionCard;

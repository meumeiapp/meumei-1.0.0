import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface MobileModuleHeaderProps {
  title: string;
  onBack: () => void;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

const MobileModuleHeader: React.FC<MobileModuleHeaderProps> = ({
  title,
  onBack,
  subtitle,
  rightSlot
}) => {
  return (
    <div className="mb-2">
      <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#151517]/90 backdrop-blur px-3 py-2.5 shadow-sm">
        <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
            Voltar
          </button>
          <div className="min-w-0 text-center">
            <p className="text-[15px] font-semibold text-zinc-900 dark:text-white truncate">{title}</p>
            {subtitle && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center justify-end min-w-[36px]">{rightSlot}</div>
        </div>
      </div>
    </div>
  );
};

export default MobileModuleHeader;

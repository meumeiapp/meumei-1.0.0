import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerDetailItem {
  label: string;
  value: React.ReactNode;
}

interface MobileTransactionDrawerProps {
  open: boolean;
  title: string;
  amount?: string;
  statusLabel?: string;
  statusClassName?: string;
  details: DrawerDetailItem[];
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  actionsDisabled?: boolean;
}

const MobileTransactionDrawer: React.FC<MobileTransactionDrawerProps> = ({
  open,
  title,
  amount,
  statusLabel,
  statusClassName,
  details,
  onClose,
  onEdit,
  onDelete,
  actionsDisabled
}) => {
  if (!open) return null;

  const actionsBlocked = actionsDisabled || (!onEdit && !onDelete);

  const dockOffset = 'var(--mm-mobile-dock-height, 68px)';
  const content = (
    <div className="fixed inset-0 z-[1300]">
      <button
        type="button"
        onClick={onClose}
        className="absolute left-0 right-0 top-0 bg-black/40 backdrop-blur-sm"
        style={{ bottom: dockOffset }}
        aria-label="Fechar detalhes"
      />
      <div
        className="absolute left-0 right-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-none border-t border-zinc-200 dark:border-zinc-800 p-4 pb-6 overflow-y-auto"
        style={{
          bottom: dockOffset,
          maxHeight: 'calc(85vh - env(safe-area-inset-bottom) - 88px)'
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {amount && <span className="text-sm font-bold text-zinc-900 dark:text-white">{amount}</span>}
              {statusLabel && (
                <span className={`px-2 py-0.5 rounded-none text-[11px] font-semibold ${statusClassName || ''}`}>
                  {statusLabel}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="h-8 w-8 rounded-none bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {details.map((item) => (
            <div key={item.label} className="flex items-start justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wide text-zinc-400">{item.label}</span>
              <span className="text-sm text-right text-zinc-800 dark:text-zinc-200">{item.value}</span>
            </div>
          ))}
        </div>

        {!actionsBlocked && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className={`rounded-none border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${
                  actionsDisabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={actionsDisabled}
              >
                Editar
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className={`rounded-none border border-red-200 dark:border-red-900/40 py-2.5 text-sm font-semibold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 ${
                  actionsDisabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={actionsDisabled}
              >
                Excluir
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return content;
  }

  return createPortal(content, document.body);
};

export default MobileTransactionDrawer;

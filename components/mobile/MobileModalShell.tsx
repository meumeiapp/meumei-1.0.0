import React, { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';

interface MobileModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  modalName: string;
  hideHeader?: boolean;
  contentPaddingTop?: string;
  children: React.ReactNode;
}

const MobileModalShell: React.FC<MobileModalShellProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  modalName,
  hideHeader = false,
  contentPaddingTop = 'calc(var(--mm-mobile-top, 72px) + 16px)',
  children
}) => {
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || loggedRef.current) return;
    console.info('[layout][mobile-modal]', `${modalName} in-flow header applied`);
    loggedRef.current = true;
  }, [isOpen, modalName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label="Fechar modal"
      />
      <div
        className="relative z-10 h-[100dvh] overflow-y-auto overscroll-contain overflow-x-hidden"
        style={{ paddingTop: contentPaddingTop }}
      >
        <div className="mx-auto w-full max-w-2xl px-4 pb-8">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-2xl p-4">
            {!hideHeader && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft size={14} />
                  Voltar
                </button>
                <div className="mt-2">
                  <h1 className="text-lg font-bold text-zinc-900 dark:text-white">{title}</h1>
                  {subtitle && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>
                  )}
                </div>
              </>
            )}
            <div className={hideHeader ? '' : 'mt-4'}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileModalShell;

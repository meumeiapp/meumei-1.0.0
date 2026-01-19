import React, { useEffect, useRef, useState } from 'react';

type QuickAccessHelpProps = {
  label: string;
  title: string;
  body: string;
  className?: string;
};

const QuickAccessHelp: React.FC<QuickAccessHelpProps> = ({
  label,
  title,
  body,
  className
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(prev => !prev);
  };

  return (
    <div ref={rootRef} className={`absolute right-2 top-2 z-20 ${className || ''}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`Ajuda: ${label}`}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-zinc-900/80 text-xs font-bold text-emerald-200 shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 dark:border-zinc-700/70 dark:bg-zinc-900"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-white/10 bg-zinc-950 p-3 text-white shadow-2xl">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-300 whitespace-pre-line">{body}</p>
        </div>
      )}
    </div>
  );
};

export default QuickAccessHelp;

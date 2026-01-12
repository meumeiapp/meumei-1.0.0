import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { modalHelperTextClass, modalLabelClass } from './PremiumModal';

interface ColorPickerPopoverProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets: string[];
  buttonLabel?: string;
  helperText?: string;
  showHex?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  label,
  value,
  onChange,
  presets,
  buttonLabel,
  helperText,
  showHex = true,
  onOpenChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      onOpenChange?.(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && rootRef.current.contains(target)) return;
      setIsOpen(false);
      onOpenChange?.(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onOpenChange]);

  const toggleOpen = () => {
    setIsOpen(prev => {
      const next = !prev;
      onOpenChange?.(next);
      return next;
    });
  };

  return (
    <div className="relative space-y-2" ref={rootRef}>
      <label className={modalLabelClass}>{label}</label>
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full rounded-2xl border border-zinc-200/80 dark:border-zinc-700 bg-white/80 dark:bg-[#101014] px-4 py-3 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
        aria-label={label}
      >
        <span className="flex items-center gap-3">
          <span
            className="h-6 w-6 rounded-lg border border-white/40 shadow-sm"
            style={{ backgroundColor: value }}
          />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {buttonLabel || label}
          </span>
          {showHex && (
            <span className="text-[11px] text-zinc-400">{value.toUpperCase()}</span>
          )}
        </span>
        <ChevronDown size={18} className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {helperText && <p className={modalHelperTextClass}>{helperText}</p>}

      {isOpen && (
        <div className="absolute left-0 top-full z-[70] mt-3 w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0f1014]/95 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-6 gap-3">
            {presets.map((color) => {
              const isSelected = color === value;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange(color)}
                  aria-label={`Selecionar cor ${color}`}
                  className={`h-9 w-9 rounded-lg border transition flex items-center justify-center ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-400/50'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-indigo-300'
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {isSelected && <Check size={14} className="text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Personalizada</span>
            <div className="flex items-center gap-2">
              {showHex && <span className="text-[11px] text-zinc-400">{value.toUpperCase()}</span>}
              <input
                type="color"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-9 w-11 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent cursor-pointer"
                aria-label="Selecionar cor personalizada"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorPickerPopover;

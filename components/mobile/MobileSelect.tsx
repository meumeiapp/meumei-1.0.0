import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type MobileSelectOption = {
  value: string;
  label: string;
  description?: string;
  color?: string;
  disabled?: boolean;
};

type MobileSelectSize = 'default' | 'compact';

type MobileSelectProps = {
  id?: string;
  name?: string;
  value: string;
  options: MobileSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: MobileSelectSize;
  buttonClassName?: string;
  menuClassName?: string;
};

const MobileSelect: React.FC<MobileSelectProps> = ({
  id,
  name,
  value,
  options,
  onChange,
  placeholder = 'Selecione...',
  disabled = false,
  size = 'default',
  buttonClassName = '',
  menuClassName = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (wrapperRef.current && wrapperRef.current.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const sizeStyles =
    size === 'compact'
      ? {
          button: 'rounded-xl px-3 py-2 text-xs',
          menu: 'rounded-xl',
          item: 'px-3 py-2 text-xs',
          icon: 'right-3'
        }
      : {
          button: 'rounded-2xl px-4 py-3 text-sm',
          menu: 'rounded-2xl',
          item: 'px-4 py-2 text-sm',
          icon: 'right-4'
        };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        id={id}
        name={name}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={id ? `${id}-menu` : undefined}
        className={`w-full bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white ${sizeStyles.button} pr-10 text-left font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition ${disabled ? 'opacity-70 cursor-not-allowed' : ''} ${buttonClassName}`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selectedOption?.color && (
            <span
              className="h-2.5 w-2.5 rounded-full border border-white/40"
              style={{ backgroundColor: selectedOption.color }}
            />
          )}
          <span className="truncate">
            {selectedOption?.label || placeholder}
          </span>
        </span>
      </button>
      <ChevronDown
        className={`absolute ${sizeStyles.icon} top-1/2 -translate-y-1/2 text-zinc-400 transition-transform ${
          isOpen ? 'rotate-180' : ''
        }`}
        size={16}
      />
      {isOpen && options.length > 0 && (
        <div
          id={id ? `${id}-menu` : undefined}
          className={`absolute left-0 right-0 mt-2 ${sizeStyles.menu} border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#151517] shadow-xl z-20 overflow-hidden ${menuClassName}`}
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 ${sizeStyles.item} text-left ${
                    option.disabled
                      ? 'text-zinc-400 cursor-not-allowed'
                      : isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 text-zinc-900 dark:text-white'
                        : 'hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {option.color && (
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/40"
                        style={{ backgroundColor: option.color }}
                      />
                    )}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {option.description && (
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      {option.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileSelect;

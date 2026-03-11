import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  buttonClassName?: string;
  listClassName?: string;
  placeholderClassName?: string;
}

const SelectDropdown: React.FC<SelectDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Selecione',
  disabled = false,
  buttonClassName = '',
  listClassName = '',
  placeholderClassName = ''
}) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const update = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setListStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 2000
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const selected = options.find(option => option.value === value);
  const label = selected?.label || placeholder;

  return (
    <div ref={wrapperRef} className="w-full">
      <button
        type="button"
        onClick={() => !disabled && setOpen(prev => !prev)}
        className={`w-full flex items-center justify-between text-left ${buttonClassName} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={selected ? '' : `text-zinc-400 ${placeholderClassName}`}>{label}</span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path
            d="M6 8l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        (typeof document === 'undefined'
          ? null
          : createPortal(
              <div
                ref={listRef}
                className={`rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] shadow-lg overflow-y-auto ${listClassName}`}
                role="listbox"
                style={{ ...listStyle, touchAction: 'pan-y' }}
              >
                {options.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    role="option"
                    aria-selected={option.value === value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>,
              document.body
            ))}
    </div>
  );
};

export default SelectDropdown;

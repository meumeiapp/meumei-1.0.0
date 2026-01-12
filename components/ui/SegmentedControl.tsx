import React from 'react';

interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  ariaLabel
}: SegmentedControlProps<T>) => (
  <div
    className="inline-flex items-center gap-1 rounded-full border border-zinc-200/80 dark:border-zinc-700 bg-white/80 dark:bg-[#111114] p-1"
    role="group"
    aria-label={ariaLabel}
  >
    {options.map((option) => {
      const isActive = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={isActive}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            isActive
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-500 dark:text-zinc-300 hover:text-indigo-600'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export default SegmentedControl;

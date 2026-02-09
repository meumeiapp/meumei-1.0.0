import React from 'react';
import MobileModuleHeader from './MobileModuleHeader';

interface MobilePageShellProps {
  title: string;
  onBack: () => void;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  className?: string;
}

const MobilePageShell: React.FC<MobilePageShellProps> = ({
  title,
  onBack,
  subtitle,
  rightSlot,
  children,
  contentClassName = 'space-y-4',
  className
}) => {
  return (
    <div
      className={`min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-[calc(env(safe-area-inset-bottom)+72px)] transition-colors duration-300 overflow-x-hidden ${
        className || ''
      }`}
    >
      <div
        className="px-4"
        style={{ paddingTop: 'calc(var(--mm-mobile-top, 72px) + 8px)' }}
      >
        <MobileModuleHeader title={title} subtitle={subtitle} onBack={onBack} rightSlot={rightSlot} />
        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  );
};

export default MobilePageShell;

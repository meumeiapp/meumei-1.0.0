import React from 'react';

interface MobileFullWidthSectionProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  withDivider?: boolean;
  backgroundClassName?: string;
}

const MobileFullWidthSection: React.FC<MobileFullWidthSectionProps> = ({
  children,
  className,
  contentClassName = 'px-3 py-3',
  withDivider = true,
  backgroundClassName = 'bg-white dark:bg-[#151517]'
}) => {
  return (
    <section
      className={`relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen ${backgroundClassName} ${
        withDivider ? 'border-b border-zinc-200/70 dark:border-zinc-800/70' : ''
      } ${className || ''}`}
      style={withDivider ? { borderBottomWidth: '0.5px' } : undefined}
    >
      <div className={contentClassName}>{children}</div>
    </section>
  );
};

export default MobileFullWidthSection;

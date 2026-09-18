import { useState, type ReactNode } from 'react';

/**
 * An on-brand replacement for a bare `title` attribute - native browser
 * tooltips are inconsistent (slow to appear, unstyled, not reliably
 * observable/testable) so truncated node text gets a real, themed popover
 * instead. Appears above the trigger on hover; `label` is skipped entirely
 * when empty so callers can pass it unconditionally.
 */
export function Tooltip({ label, children, className = 'inline-block' }: { label: string; children: ReactNode; className?: string }) {
  const [show, setShow] = useState(false);

  if (!label) return <>{children}</>;

  return (
    <span
      // `className` supplies its own display utility (defaulting to
      // inline-block) - it must not be hardcoded here too. Tailwind's
      // display utilities all carry equal specificity, so whichever is
      // later in Tailwind's own generated stylesheet wins regardless of
      // this string's order - baking in "inline-block" alongside a
      // caller's "block" silently broke width/truncation for callers that
      // need block layout.
      className={`relative min-w-0 ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-solace-green/30 bg-solace-blue-dark px-2 py-1 font-mono text-[10px] text-white shadow-lg">
          {label}
        </span>
      )}
    </span>
  );
}

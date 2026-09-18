// Small, hand-written line icons for each node type - sized for a card's
// header row and colored via `currentColor` so they pick up whatever accent
// color the surrounding text already uses, no icon library needed.

const common = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function PublishIcon({ className = 'h-3 w-3' }: { className?: string }) {
  // An outward broadcast - a dot with two radiating arcs, reading as "sending out."
  return (
    <svg {...common} className={className}>
      <circle cx="4" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8 4.5c1.5 1 2.4 2.1 2.4 3.5s-.9 2.5-2.4 3.5" />
      <path d="M11 2.5c2.2 1.5 3.5 3.3 3.5 5.5s-1.3 4-3.5 5.5" />
    </svg>
  );
}

export function SubscribeIcon({ className = 'h-3 w-3' }: { className?: string }) {
  // A funnel - wide at top, narrowing down, reading as "collecting in."
  return (
    <svg {...common} className={className}>
      <path d="M2.5 3h11l-4 5.2v4.3l-3 1.5V8.2z" />
    </svg>
  );
}

export function QueueIcon({ className = 'h-3 w-3' }: { className?: string }) {
  // Stacked bars, reading as a backlog/list waiting to be drained.
  return (
    <svg {...common} className={className}>
      <rect x="2" y="3" width="12" height="2.4" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="2" y="6.8" width="12" height="2.4" rx="0.8" fill="currentColor" stroke="none" opacity="0.7" />
      <rect x="2" y="10.6" width="12" height="2.4" rx="0.8" fill="currentColor" stroke="none" opacity="0.45" />
    </svg>
  );
}

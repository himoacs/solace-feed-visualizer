import type { ReactNode } from 'react';
import { ScenarioControls } from './ScenarioControls';
import solaceIcon from '../assets/solace-icon.svg';

export type PanelId = 'broker' | 'taxonomy' | 'publisher' | 'consumer' | null;

interface LeftNavProps {
  active: PanelId;
  onSelect: (panel: PanelId) => void;
  sunburstOpen: boolean;
  onToggleSunburst: () => void;
}

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const ICONS = {
  broker: icon(<><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" /></>),
  taxonomy: icon(<><path d="M12 4v5M12 9H5v5M12 9h7v5" /><rect x="9" y="2" width="6" height="3" rx="1" /><rect x="2" y="14" width="6" height="3" rx="1" /><rect x="16" y="14" width="6" height="3" rx="1" /></>),
  publisher: icon(<><path d="M4 12l16-8-6 16-3-7-7-1z" /></>),
  consumer: icon(<><path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" /></>),
  explorer: icon(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v5M12 16v5" /></>),
};

export function LeftNav({ active, onSelect, sunburstOpen, onToggleSunburst }: LeftNavProps) {
  const items: { id: PanelId; label: string; icon: ReactNode }[] = [
    { id: 'broker', label: 'Broker', icon: ICONS.broker },
    { id: 'taxonomy', label: 'Taxonomy', icon: ICONS.taxonomy },
    { id: 'publisher', label: 'Publishers', icon: ICONS.publisher },
    { id: 'consumer', label: 'Consumers', icon: ICONS.consumer },
  ];

  const itemClass = (on: boolean) =>
    `flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] transition ${
      on ? 'bg-sc-nav-active text-white ring-1 ring-sc-ring' : 'text-sc-nav-icon hover:bg-white/5 hover:text-white'
    }`;

  return (
    <nav className="flex w-20 shrink-0 flex-col items-center gap-1 bg-sc-nav px-2 py-3">
      <div className="mb-3 flex flex-col items-center gap-1" title="Solace Feed Visualizer">
        <img src={solaceIcon} alt="Solace" className="h-9 w-9 rounded-md" />
        <span className="text-[9px] leading-tight text-white/60">Feed Visualizer</span>
      </div>

      {items.map((item) => (
        <button key={item.id ?? 'none'} onClick={() => onSelect(active === item.id ? null : item.id)} className={itemClass(active === item.id)}>
          {item.icon}
          {item.label}
        </button>
      ))}

      <div className="my-2 w-full border-t border-white/10" />

      <button
        onClick={onToggleSunburst}
        className={itemClass(sunburstOpen)}
        title="Split-view topic taxonomy visualizer, ported from explorer.solace.dev - keeps its own colors/theme"
      >
        {ICONS.explorer}
        Explorer
      </button>

      <div className="mt-auto w-full border-t border-white/10 pt-2">
        <p className="pb-1 text-center text-[9px] uppercase tracking-wide text-white/40">Scenario</p>
        <div className="[&>div>div]:flex-col">
          <ScenarioControls />
        </div>
      </div>
    </nav>
  );
}

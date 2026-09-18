import { ScenarioControls } from './ScenarioControls';
import solaceLogo from '../assets/solace-logo.png';

export type PanelId = 'broker' | 'taxonomy' | 'publisher' | 'consumer' | null;

interface LeftNavProps {
  active: PanelId;
  onSelect: (panel: PanelId) => void;
  sunburstOpen: boolean;
  onToggleSunburst: () => void;
}

export function LeftNav({ active, onSelect, sunburstOpen, onToggleSunburst }: LeftNavProps) {
  const items: { id: PanelId; label: string; disabled?: boolean }[] = [
    { id: 'broker', label: 'Broker Connection' },
    { id: 'taxonomy', label: 'Topic Taxonomy' },
    { id: 'publisher', label: 'Publishers' },
    { id: 'consumer', label: 'Consumers' },
  ];

  return (
    <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-white/10 bg-solace-blue-dark p-3">
      <div className="mb-3 px-1">
        <img src={solaceLogo} alt="Solace" className="h-5 w-auto" />
        <span className="mt-1 block font-heading text-sm text-white/70">Feed Visualizer</span>
      </div>

      {items.map((item) => (
        <button
          key={item.id ?? 'none'}
          disabled={item.disabled}
          onClick={() => onSelect(active === item.id ? null : item.id)}
          className={`rounded-md px-3 py-2 text-left text-sm transition ${
            item.disabled
              ? 'cursor-not-allowed text-white/30'
              : active === item.id
                ? 'bg-solace-green/15 text-solace-green'
                : 'text-white/80 hover:bg-white/5'
          }`}
          title={item.disabled ? 'Coming in a later milestone' : undefined}
        >
          {item.label}
        </button>
      ))}

      <div className="my-2 border-t border-white/10" />

      <button
        onClick={onToggleSunburst}
        className={`rounded-md px-3 py-2 text-left text-sm transition ${
          sunburstOpen ? 'bg-solace-blue-sky/15 text-solace-blue-sky' : 'text-white/80 hover:bg-white/5'
        }`}
        title="Split-view topic taxonomy visualizer, ported from explorer.solace.dev - keeps its own colors/theme"
      >
        Topic Explorer
      </button>

      <div className="mt-auto border-t border-white/10 pt-2">
        <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-white/30">Scenario</p>
        <ScenarioControls />
      </div>
    </nav>
  );
}

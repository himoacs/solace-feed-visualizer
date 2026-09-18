import type { ReactNode } from 'react';
import { useResizablePanel } from '../../hooks/useResizablePanel';

export function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // One shared width for every panel using this shell (Broker Connection,
  // Topic Taxonomy, Publishers, Consumers) - it's one shell component, not
  // four independently-sized panels.
  const { width, onPointerDown } = useResizablePanel({
    defaultWidth: 384,
    min: 280,
    max: 640,
    edge: 'right',
    storageKey: 'feed-viz-left-panel-width',
  });

  return (
    <div
      className="absolute inset-y-0 left-0 z-20 overflow-y-auto border-r border-white/10 bg-solace-blue-deep/98 p-5 shadow-2xl backdrop-blur"
      style={{ width }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-white">{title}</h2>
        <button className="text-white/50 hover:text-white" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">{children}</div>

      <div
        className="absolute inset-y-0 right-0 z-30 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-solace-green/50 active:bg-solace-green"
        onPointerDown={onPointerDown}
      />
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/50">{children}</label>;
}

export const inputClass =
  'w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-solace-green focus:outline-none';

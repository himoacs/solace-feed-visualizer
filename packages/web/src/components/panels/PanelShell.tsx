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
      className="absolute inset-y-0 left-0 z-20 overflow-y-auto border-r border-sc-border bg-white p-5 shadow-[2px_0_6px_rgba(12,45,74,0.12)]"
      style={{ width }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-sc-text">{title}</h2>
        <button className="text-sc-muted hover:text-sc-text" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">{children}</div>

      <div
        className="absolute inset-y-0 right-0 z-30 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-sc-select/40 active:bg-sc-select"
        onPointerDown={onPointerDown}
      />
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-[13px] text-sc-muted">{children}</label>;
}

export const inputClass =
  'w-full rounded border border-sc-border bg-white px-3 py-1.5 text-sm text-sc-text placeholder-sc-muted focus:border-sc-action focus:outline-none';

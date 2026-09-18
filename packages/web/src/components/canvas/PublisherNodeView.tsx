import { useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DeliveryMode, PublisherConfig, PublisherNode, TopicMode } from '@feed-viz/shared';
import { useCanvas } from '../../context/CanvasContext';
import { extractVariables } from '../../lib/topicTaxonomy';
import { formatRate, rateToSlider, sliderToRate } from '../../lib/rateScale';
import { inputClass } from '../panels/PanelShell';
import { Tooltip } from '../Tooltip';
import { StatusDot } from './StatusDot';
import { ConfirmDialog } from '../ConfirmDialog';
import { PublishIcon } from './icons';

export function PublisherNodeView({ data }: NodeProps & { data: { appNode: PublisherNode } }) {
  const node = data.appNode;
  const { runNode, pauseNode, stopNode, removeNode, editPublisher, renameNode, setRate } = useCanvas();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PublisherConfig>(node.config);
  const [nameDraft, setNameDraft] = useState(node.name);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isRunning = node.status === 'running';
  const draftHasVars = useMemo(() => extractVariables(draft.topicTemplate).length > 0, [draft.topicTemplate]);

  const startEditing = () => {
    setDraft(node.config);
    setNameDraft(node.name);
    setSaveError(null);
    setEditing(true);
  };
  const cancelEditing = () => {
    setEditing(false);
    setSaveError(null);
  };
  const saveEditing = () => {
    try {
      editPublisher(node.id, draft);
      renameNode(node.id, nameDraft);
      setEditing(false);
      setSaveError(null);
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  return (
    <div className="w-40 rounded-xl border border-solace-green/40 bg-solace-blue-deep/95 shadow-lg transition-colors duration-200 hover:border-solace-green/70">
      <Handle type="source" position={Position.Right} id="out" className="!bg-solace-green" />

      <div className="flex items-center gap-1.5 px-2.5 pt-2">
        <StatusDot status={node.status} />
        <PublishIcon className="h-3 w-3 shrink-0 text-solace-green" />
        <Tooltip label={node.name} className="min-w-0 flex-1">
          <span className="block truncate font-heading text-[12px] font-semibold text-white">{node.name}</span>
        </Tooltip>
        <button
          className="shrink-0 text-white/40 transition-colors hover:text-white"
          title={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '▴' : '▾'}
        </button>
      </div>

      <Tooltip label={node.config.topicTemplate} className="block px-2.5">
        <span className="block truncate font-mono text-[10px] text-white/50">{node.config.topicTemplate}</span>
      </Tooltip>

      <div className="mt-1 flex items-center justify-between px-2.5 pb-2">
        <button
          className="flex h-5 w-5 items-center justify-center rounded bg-solace-green/90 text-[10px] leading-none text-solace-blue-dark transition-colors hover:bg-solace-green"
          title={isRunning ? 'Pause' : 'Run'}
          onClick={() => (isRunning ? pauseNode(node.id) : runNode(node.id))}
        >
          {isRunning ? '❚❚' : '▶'}
        </button>
        <span className="font-mono text-[10px] text-white/50">sent {node.messagesSent}</span>
      </div>

      {node.config.deliveryMode === 'persistent' && node.messagesNacked > 0 && (
        <p className="-mt-1 px-2.5 pb-1.5 font-mono text-[10px] text-red-400">NACKed {node.messagesNacked}</p>
      )}

      {expanded && (
        <div className="border-t border-white/10 px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-solace-green">Publisher</span>
            <div className="flex items-center gap-2">
              {!editing && (
                <button className="text-white/40 transition-colors hover:text-white" title="Edit" onClick={startEditing}>
                  ✎
                </button>
              )}
              <button className="text-white/40 transition-colors hover:text-red-400" title="Remove" onClick={() => setConfirmOpen(true)}>
                ✕
              </button>
            </div>
          </div>

          {editing ? (
            <div className="mt-1.5 flex flex-col gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Name</label>
                <input className={inputClass} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
              </div>

              <div>
                <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Topic Template</label>
                <input
                  className={`${inputClass} font-mono text-[11px]`}
                  value={draft.topicTemplate}
                  onChange={(e) => setDraft((d) => ({ ...d, topicTemplate: e.target.value }))}
                />
              </div>

              {draftHasVars && (
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Topic Mode</label>
                  <select
                    className={inputClass}
                    value={draft.topicMode}
                    onChange={(e) => setDraft((d) => ({ ...d, topicMode: e.target.value as TopicMode }))}
                  >
                    <option value="round-robin">Round robin across expanded topics</option>
                    <option value="random">Random topic per message</option>
                    <option value="single">Always the first expanded topic</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">QoS / Delivery Mode</label>
                <select
                  className={inputClass}
                  value={draft.deliveryMode}
                  onChange={(e) => setDraft((d) => ({ ...d, deliveryMode: e.target.value as DeliveryMode }))}
                >
                  <option value="direct">Direct</option>
                  <option value="persistent">Persistent (guaranteed)</option>
                </select>
              </div>

              <div>
                <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Message Size (bytes)</label>
                <input
                  className={inputClass}
                  type="number"
                  value={draft.messageSizeBytes}
                  onChange={(e) => setDraft((d) => ({ ...d, messageSizeBytes: Number(e.target.value) }))}
                />
              </div>

              {saveError && (
                <p className="truncate text-[10px] text-red-400" title={saveError}>
                  {saveError}
                </p>
              )}

              <div className="flex gap-1.5">
                <button
                  className="flex-1 rounded bg-solace-green/90 py-1 text-[11px] font-medium text-solace-blue-dark transition-colors hover:bg-solace-green"
                  onClick={saveEditing}
                >
                  Save
                </button>
                <button
                  className="flex-1 rounded bg-white/10 py-1 text-[11px] text-white transition-colors hover:bg-white/20"
                  onClick={cancelEditing}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-white/60">
                <span>QoS: {node.config.deliveryMode}</span>
              </div>

              {node.config.deliveryMode === 'persistent' ? (
                <p className={`mt-1 font-mono text-[11px] ${node.messagesNacked > 0 ? 'text-red-400' : 'text-white/50'}`}>
                  NACKed: {node.messagesNacked}
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-white/30">Direct QoS has no ack/nack - discards here are silent.</p>
              )}

              <div className="mt-2">
                <label className="flex items-center justify-between text-[10px] text-white/50">
                  <span>Rate</span>
                  <span>{formatRate(node.config.ratePerSecond)} msg/s</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={1}
                  value={rateToSlider(node.config.ratePerSecond)}
                  onChange={(e) => setRate(node.id, sliderToRate(Number(e.target.value)))}
                  className="mt-1 w-full accent-solace-green"
                />
              </div>

              {node.error && (
                <p className="mt-1.5 truncate text-[10px] text-red-400" title={node.error}>
                  {node.error}
                </p>
              )}

              <div className="mt-2 flex gap-1.5">
                <button
                  className="flex-1 rounded bg-solace-green/90 py-1 text-[11px] font-medium text-solace-blue-dark transition-colors hover:bg-solace-green disabled:opacity-40"
                  onClick={() => runNode(node.id)}
                  disabled={isRunning}
                >
                  Run
                </button>
                <button
                  className="flex-1 rounded bg-white/10 py-1 text-[11px] text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                  onClick={() => pauseNode(node.id)}
                  disabled={!isRunning}
                >
                  Pause
                </button>
                <button
                  className="flex-1 rounded bg-white/10 py-1 text-[11px] text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                  onClick={() => stopNode(node.id)}
                  disabled={node.status === 'idle'}
                >
                  Stop
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Remove publisher?"
        body={`This disconnects the session and deletes its broker client-username (${node.clientUsername}).`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          removeNode(node.id);
        }}
      />
    </div>
  );
}

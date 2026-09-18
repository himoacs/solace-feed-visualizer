import { useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ConsumerConfig, ConsumerNode } from '@feed-viz/shared';
import { useCanvas } from '../../context/CanvasContext';
import { useBroker } from '../../context/BrokerContext';
import { getClientStats } from '../../lib/sempApi';
import { inputClass } from '../panels/PanelShell';
import { Tooltip } from '../Tooltip';
import { StatusDot } from './StatusDot';
import { ConfirmDialog } from '../ConfirmDialog';
import { QueueIcon, SubscribeIcon } from './icons';

/** Polls this consumer's own client stats (only meaningful for direct mode -
 * queue-mode discards live on the queue itself, see QueueNode.tsx) and flags
 * when the count just increased, so the caller can flash instead of just
 * showing a number that quietly creeps up. */
function useDirectDiscardCount(clientName: string, enabled: boolean) {
  const { broker } = useBroker();
  const [count, setCount] = useState<number | null>(null);
  const [justIncreased, setJustIncreased] = useState(false);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      prevRef.current = null;
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const stats = await getClientStats(broker, clientName);
      if (cancelled || !stats) return;
      if (prevRef.current !== null && stats.txDiscardedMsgCount > prevRef.current) {
        setJustIncreased(true);
        setTimeout(() => setJustIncreased(false), 700);
      }
      prevRef.current = stats.txDiscardedMsgCount;
      setCount(stats.txDiscardedMsgCount);
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [broker, clientName, enabled]);

  return { count, justIncreased };
}

export function ConsumerNodeView({ data }: NodeProps & { data: { appNode: ConsumerNode } }) {
  const node = data.appNode;
  const { runNode, pauseNode, stopNode, removeNode, editConsumer, renameNode } = useCanvas();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ConsumerConfig>(node.config);
  const [nameDraft, setNameDraft] = useState(node.name);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isRunning = node.status === 'running';
  const isQueue = node.config.mode === 'queue';
  const { count: discardCount, justIncreased: discardFlash } = useDirectDiscardCount(node.id, !isQueue && isRunning);

  const collapsedLabel = isQueue ? `Q: ${node.config.queueName}` : node.config.topicFilter;

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
  const saveEditing = async () => {
    setSaving(true);
    try {
      const toSave: ConsumerConfig =
        draft.mode === 'queue'
          ? { ...draft, queueSubscriptions: (draft.queueSubscriptions ?? []).map((s) => s.trim()).filter(Boolean) }
          : draft;
      await editConsumer(node.id, toSave);
      renameNode(node.id, nameDraft);
      setEditing(false);
      setSaveError(null);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateDraftSubscription = (index: number, value: string) =>
    setDraft((d) => (d.mode === 'queue' ? { ...d, queueSubscriptions: (d.queueSubscriptions ?? []).map((s, i) => (i === index ? value : s)) } : d));
  const addDraftSubscription = () =>
    setDraft((d) => (d.mode === 'queue' ? { ...d, queueSubscriptions: [...(d.queueSubscriptions ?? []), ''] } : d));
  const removeDraftSubscription = (index: number) =>
    setDraft((d) => (d.mode === 'queue' ? { ...d, queueSubscriptions: (d.queueSubscriptions ?? []).filter((_, i) => i !== index) } : d));

  return (
    <div
      className={`w-40 rounded-xl border bg-solace-blue-deep/95 shadow-lg transition-colors duration-200 ${
        discardFlash ? 'border-red-400' : 'border-solace-blue-sky/40 hover:border-solace-blue-sky/70'
      }`}
    >
      <Handle type="target" position={Position.Left} id="in" className="!bg-solace-blue-sky" />

      <div className="flex items-center gap-1.5 px-2.5 pt-2">
        <StatusDot status={node.status} />
        {isQueue ? (
          <QueueIcon className="h-3 w-3 shrink-0 text-solace-blue-sky" />
        ) : (
          <SubscribeIcon className="h-3 w-3 shrink-0 text-solace-blue-sky" />
        )}
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

      <Tooltip label={collapsedLabel} className="block px-2.5">
        <span className="block truncate font-mono text-[10px] text-white/50">{collapsedLabel}</span>
      </Tooltip>

      <div className="mt-1 flex items-center justify-between px-2.5 pb-2">
        <button
          className="flex h-5 w-5 items-center justify-center rounded bg-solace-blue-sky/90 text-[10px] leading-none text-solace-blue-dark transition-colors hover:bg-solace-blue-sky"
          title={isRunning ? 'Pause' : 'Run'}
          onClick={() => (isRunning ? pauseNode(node.id) : runNode(node.id))}
        >
          {isRunning ? '❚❚' : '▶'}
        </button>
        <span className="font-mono text-[10px] text-white/50">recv {node.messagesReceived}</span>
      </div>

      {!isQueue && discardCount !== null && discardCount > 0 && (
        <p className="-mt-1 px-2.5 pb-1.5 font-mono text-[10px] text-red-400">discarded {discardCount}</p>
      )}

      {expanded && (
        <div className="border-t border-white/10 px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-solace-blue-sky">Consumer</span>
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

              {draft.mode === 'direct' ? (
                <div>
                  <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Topic Filter</label>
                  <input
                    className={`${inputClass} font-mono text-[11px]`}
                    value={draft.topicFilter}
                    onChange={(e) => setDraft((d) => (d.mode === 'direct' ? { ...d, topicFilter: e.target.value } : d))}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Queue Name</label>
                    <input className={`${inputClass} font-mono text-[11px]`} value={draft.queueName} disabled />
                  </div>

                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Queue Max Spool (MB)</label>
                    <input className={inputClass} value={draft.queueMaxSpoolMb ?? 1} disabled />
                    <p className="mt-0.5 text-[10px] text-white/30">
                      Queue name and spool size are fixed at creation - remove and re-add the consumer to change them.
                    </p>
                  </div>

                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Subscriptions</label>
                    <div className="flex flex-col gap-1">
                      {(draft.queueSubscriptions ?? []).map((s, i) => (
                        <div key={i} className="flex gap-1">
                          <input
                            className={`${inputClass} font-mono text-[11px]`}
                            value={s}
                            onChange={(e) => updateDraftSubscription(i, e.target.value)}
                          />
                          {(draft.queueSubscriptions?.length ?? 0) > 1 && (
                            <button className="shrink-0 text-white/40 hover:text-red-400" title="Remove subscription" onClick={() => removeDraftSubscription(i)}>
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button className="mt-1 text-[10px] text-solace-blue-sky hover:text-white" onClick={addDraftSubscription}>
                      + Add subscription
                    </button>
                  </div>

                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-white/40">Ack Mode</label>
                    <select
                      className={inputClass}
                      value={draft.ackMode ?? 'auto'}
                      onChange={(e) => setDraft((d) => (d.mode === 'queue' ? { ...d, ackMode: e.target.value as 'auto' | 'client' } : d))}
                    >
                      <option value="auto">Auto</option>
                      <option value="client">Client (explicit ack)</option>
                    </select>
                  </div>
                </>
              )}

              {saveError && (
                <p className="truncate text-[10px] text-red-400" title={saveError}>
                  {saveError}
                </p>
              )}

              <div className="flex gap-1.5">
                <button
                  className="flex-1 rounded bg-solace-blue-sky/90 py-1 text-[11px] font-medium text-solace-blue-dark transition-colors hover:bg-solace-blue-sky disabled:opacity-50"
                  onClick={saveEditing}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  className="flex-1 rounded bg-white/10 py-1 text-[11px] text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {isQueue ? (
                <div className="mt-1.5 space-y-1 font-mono text-[11px] text-white/60">
                  <p>ack: {node.config.ackMode ?? 'auto'}</p>
                  {(node.config.queueSubscriptions ?? []).map((s) => (
                    <p key={s} className="truncate text-white/50" title={s}>
                      ↳ {s}
                    </p>
                  ))}
                  <p className="text-white/40">queue depth/discards shown on its own node</p>
                </div>
              ) : (
                <div className="mt-1.5 space-y-1 font-mono text-[11px] text-white/60">
                  <p className="truncate" title={node.config.topicFilter}>
                    filter: {node.config.topicFilter}
                  </p>
                  <p className={discardCount && discardCount > 0 ? 'text-red-400' : 'text-white/50'}>
                    broker-discarded: {discardCount ?? '—'}
                  </p>
                </div>
              )}

              {node.error && (
                <p className="mt-1.5 truncate text-[10px] text-red-400" title={node.error}>
                  {node.error}
                </p>
              )}

              <div className="mt-2 flex gap-1.5">
                <button
                  className="flex-1 rounded bg-solace-blue-sky/90 py-1 text-[11px] font-medium text-solace-blue-dark transition-colors hover:bg-solace-blue-sky disabled:opacity-40"
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
        title="Remove consumer?"
        body={
          isQueue
            ? `This disconnects the session and deletes its queue (${node.config.queueName}) and client-username (${node.clientUsername}).`
            : `This disconnects the session and deletes its broker client-username (${node.clientUsername}).`
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          removeNode(node.id);
        }}
      />
    </div>
  );
}

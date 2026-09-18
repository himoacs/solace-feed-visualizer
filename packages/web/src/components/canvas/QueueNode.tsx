import { useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ConsumerNode } from '@feed-viz/shared';
import { useBroker } from '../../context/BrokerContext';
import { getQueueStats } from '../../lib/sempApi';
import { Tooltip } from '../Tooltip';
import { QueueIcon } from './icons';

// A heuristic visual cap (not the real MB spool quota, which we can't cleanly
// translate to "messages" without knowing average message size) - good enough
// to show "getting fuller." The REAL ground truth is the discard counter
// below, which takes over (solid red, pulsing) once the broker actually
// starts rejecting/discarding for real.
//
// Confirmed live: at a few hundred msg/s, a queue that a consumer is
// genuinely keeping up with still naturally oscillates in the low hundreds
// from one 1s poll to the next (production arrives in batches faster than
// the browser's event loop drains them, then catches up) - real, honest
// numbers, not a bug. A cap of 50 made that normal churn read as solid-full
// orange; this is high enough that only a genuinely deepening backlog climbs
// into the alarming range.
const FILL_VISUAL_CAP = 500;

export function QueueNode({ data }: NodeProps & { data: { consumerNode: ConsumerNode } }) {
  const { broker } = useBroker();
  const queueName = data.consumerNode.config.queueName;
  const [depth, setDepth] = useState<number | null>(null);
  const [fullDiscards, setFullDiscards] = useState(0);
  const [justDiscarded, setJustDiscarded] = useState(false);
  const prevDiscardsRef = useRef(0);
  // A short rolling average, not the raw last sample - a healthy, actively-
  // draining queue still naturally bounces between production bursts and
  // drain catch-up from one 1s poll to the next, and showing that raw noise
  // made a fine queue look like it was randomly slamming full and empty.
  const recentDepthsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!queueName) return;
    let cancelled = false;
    const poll = async () => {
      const stats = await getQueueStats(broker, queueName);
      if (cancelled || !stats) return;
      const history = recentDepthsRef.current;
      history.push(stats.liveMsgCount);
      if (history.length > 3) history.shift();
      setDepth(Math.round(history.reduce((a, b) => a + b, 0) / history.length));
      if (stats.maxMsgSpoolUsageExceededDiscardedMsgCount > prevDiscardsRef.current) {
        setJustDiscarded(true);
        setTimeout(() => setJustDiscarded(false), 700);
      }
      prevDiscardsRef.current = stats.maxMsgSpoolUsageExceededDiscardedMsgCount;
      setFullDiscards(stats.maxMsgSpoolUsageExceededDiscardedMsgCount);
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [broker, queueName]);

  const fillFraction = depth !== null ? Math.min(depth / FILL_VISUAL_CAP, 1) : 0;
  const isFull = fullDiscards > 0;
  const fillColor = isFull
    ? 'bg-red-500'
    : fillFraction > 0.75
      ? 'bg-solace-orange'
      : fillFraction > 0.4
        ? 'bg-solace-blue-sky/80'
        : 'bg-solace-blue-sky/40';

  return (
    <div
      className={`flex w-28 flex-col items-center gap-1 rounded-xl border bg-solace-blue-deep/95 p-1.5 shadow-lg transition-colors duration-200 ${
        isFull || justDiscarded ? 'border-red-400' : 'border-white/15 hover:border-white/30'
      }`}
    >
      <Handle type="target" position={Position.Left} id="in" className="!bg-solace-blue-sky" />
      <Handle type="source" position={Position.Right} id="out" className="!bg-solace-blue-sky" />

      {/* A horizontal cylinder, not a vertical bar - fills left (broker/in
          side) to right (consumer/out side), matching the handles above, the
          way a real queue's backlog sits between the two. */}
      <Tooltip label={`${depth ?? 0} queued`} className="block w-full">
        <div className="relative h-7 w-full overflow-hidden rounded-full border border-white/20 bg-black/30">
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-500 ${fillColor}`}
            style={{ width: `${fillFraction * 100}%` }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/15 via-transparent to-black/20" />
          <div className="pointer-events-none absolute inset-y-0 left-1.5 w-px bg-white/10" />
          <div className="pointer-events-none absolute inset-y-0 right-1.5 w-px bg-white/10" />
        </div>
      </Tooltip>

      <Tooltip label={queueName ?? ''} className="flex max-w-full items-center gap-1">
        <QueueIcon className="h-2.5 w-2.5 shrink-0 text-solace-blue-sky" />
        <span className="truncate font-mono text-[9px] text-white/50">{queueName}</span>
      </Tooltip>
      <span className="font-mono text-[10px] text-white/70">{depth ?? '—'}</span>
      {fullDiscards > 0 && <span className="font-mono text-[9px] text-red-400">full ×{fullDiscards}</span>}
    </div>
  );
}

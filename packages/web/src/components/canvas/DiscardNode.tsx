import { useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useCanvas } from '../../context/CanvasContext';
import { useBroker } from '../../context/BrokerContext';
import { getClientStats } from '../../lib/sempApi';

/**
 * A permanent canvas fixture, not per-publisher - messages that match no live
 * subscription anywhere animate here (see CanvasContext.tsx's publish-time
 * matching). The count shown is the real broker-reported sum of
 * `noSubscriptionMatchRxDiscardedMsgCount` across this app's own publishers,
 * not a client-side tally - the particle animation is the immediate visual,
 * this number is the ground truth.
 */
export function DiscardNode({ data }: NodeProps & { data: { sunburstOpen: boolean } }) {
  const { nodes } = useCanvas();
  const { broker } = useBroker();
  const [total, setTotal] = useState(0);
  const [pulse, setPulse] = useState(false);
  const prevRef = useRef(0);

  const publisherIds = nodes.filter((n) => n.kind === 'publisher').map((n) => n.id);
  const publisherIdsKey = publisherIds.join(',');

  useEffect(() => {
    if (publisherIds.length === 0) {
      setTotal(0);
      prevRef.current = 0;
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const results = await Promise.all(publisherIds.map((id) => getClientStats(broker, id)));
      if (cancelled) return;
      const sum = results.reduce((acc, r) => acc + (r?.noSubscriptionMatchRxDiscardedMsgCount ?? 0), 0);
      if (sum > prevRef.current) {
        setPulse(true);
        setTimeout(() => setPulse(false), 500);
      }
      prevRef.current = sum;
      setTotal(sum);
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broker, publisherIdsKey]);

  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed bg-black/40 transition-colors duration-200 ${
        pulse ? 'border-red-400' : 'border-white/20 hover:border-white/35'
      }`}
      title={
        data.sunburstOpen
          ? `Discarded: ${total} - Topic Explorer is subscribed to > right now, so it matches everything and nothing routes here until it's closed.`
          : `Discarded: ${total} - messages published to a topic nobody is subscribed to`
      }
    >
      <Handle type="target" position={Position.Top} id="in" className="!bg-white/30" />
      <span className="font-mono text-[10px] text-white/80">{total}</span>
    </div>
  );
}

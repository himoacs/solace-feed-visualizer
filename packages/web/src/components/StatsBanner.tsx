import { useEffect, useState } from 'react';
import { useBroker } from '../context/BrokerContext';
import { useVertical } from '../context/VerticalContext';
import { getConnectionCount, getVpnStats } from '../lib/sempApi';

// Deliberately lean - three numbers that show the demo is alive, not a
// dashboard. Discard/queue detail lives on the nodes that are actually about
// them (PublisherNodeView, ConsumerNodeView, QueueNode, DiscardNode).
export function StatsBanner() {
  const { broker, status } = useBroker();
  const { vertical, setVertical, verticals } = useVertical();
  const [rxRate, setRxRate] = useState<number | null>(null);
  const [txRate, setTxRate] = useState<number | null>(null);
  const [connections, setConnections] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'connected') {
      setRxRate(null);
      setTxRate(null);
      setConnections(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const [vpnStats, connCount] = await Promise.all([getVpnStats(broker), getConnectionCount(broker)]);
      if (cancelled) return;
      if (vpnStats) {
        setRxRate(vpnStats.rxMsgRate);
        setTxRate(vpnStats.txMsgRate);
      }
      if (connCount !== null) setConnections(connCount);
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [broker, status]);

  return (
    <div className="relative flex h-12 shrink-0 items-center gap-6 border-b border-sc-border bg-white px-6 text-[13px] text-sc-text">
      <span className="flex items-center gap-1.5">
        <span className="text-sc-muted">Ingress</span>
        <span className="font-semibold text-sc-text">{rxRate !== null ? `${rxRate.toFixed(0)} msg/s` : '—'}</span>
      </span>
      <span className="h-4 w-px bg-sc-chip" />
      <span className="flex items-center gap-1.5">
        <span className="text-sc-muted">Egress</span>
        <span className="font-semibold text-sc-text">{txRate !== null ? `${txRate.toFixed(0)} msg/s` : '—'}</span>
      </span>
      <span className="h-4 w-px bg-sc-chip" />
      <span className="flex items-center gap-1.5">
        <span className="text-sc-muted">Connections</span>
        <span className="font-semibold">{connections ?? '—'}</span>
      </span>

      <label className="ml-auto flex items-center gap-1.5">
        <span className="text-sc-muted">Vertical</span>
        <select
          className="rounded border border-sc-border bg-white px-2 py-1 text-[13px] text-sc-text focus:border-sc-action focus:outline-none"
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
        >
          {verticals.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

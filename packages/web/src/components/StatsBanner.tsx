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
    <div className="relative flex h-11 shrink-0 items-center gap-6 border-b border-white/10 bg-solace-blue-dark px-4 font-mono text-xs text-white/70">
      <div className="absolute inset-x-0 bottom-0 h-px bg-solace-gradient opacity-20" />
      <span className="flex items-center gap-1.5">
        <span className="uppercase tracking-wide text-white/40">Ingress</span>
        <span className="text-solace-green">{rxRate !== null ? `${rxRate.toFixed(0)} msg/s` : '—'}</span>
      </span>
      <span className="h-4 w-px bg-white/10" />
      <span className="flex items-center gap-1.5">
        <span className="uppercase tracking-wide text-white/40">Egress</span>
        <span className="text-solace-blue-sky">{txRate !== null ? `${txRate.toFixed(0)} msg/s` : '—'}</span>
      </span>
      <span className="h-4 w-px bg-white/10" />
      <span className="flex items-center gap-1.5">
        <span className="uppercase tracking-wide text-white/40">Connections</span>
        <span>{connections ?? '—'}</span>
      </span>

      <label className="ml-auto flex items-center gap-1.5">
        <span className="uppercase tracking-wide text-white/40">Vertical</span>
        <select
          className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-white focus:border-solace-green focus:outline-none"
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

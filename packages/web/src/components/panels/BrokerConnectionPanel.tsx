import { useState } from 'react';
import type { BrokerConnection } from '@feed-viz/shared';
import { useBroker } from '../../context/BrokerContext';
import { PanelShell, FieldLabel, inputClass } from './PanelShell';

export function BrokerConnectionPanel({ onClose }: { onClose: () => void }) {
  const { broker, setBroker, status, error, testConnection } = useBroker();
  const [form, setForm] = useState<BrokerConnection>(broker);

  const update = <K extends keyof BrokerConnection>(key: K, value: BrokerConnection[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    setBroker(form);
  };

  return (
    <PanelShell title="Broker Connection" onClose={onClose}>
      <p className="text-xs text-white/50">
        Defaults point at a local Solace broker. Testing the connection also creates the
        Message VPN below (and a dedicated client-profile with guaranteed messaging enabled,
        since the broker's own "default" profile disallows it) if they don't exist yet, so this
        app's objects stay isolated from anything else running there. Override to connect
        elsewhere.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Host</FieldLabel>
          <input className={inputClass} value={form.host} onChange={(e) => update('host', e.target.value)} />
        </div>
        <div>
          <FieldLabel>SEMP Port</FieldLabel>
          <input
            className={inputClass}
            type="number"
            value={form.sempPort}
            onChange={(e) => update('sempPort', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Messaging Port (WS)</FieldLabel>
          <input
            className={inputClass}
            type="number"
            value={form.messagingPort}
            onChange={(e) => update('messagingPort', Number(e.target.value))}
          />
        </div>
        <div>
          <FieldLabel>Message VPN</FieldLabel>
          <input className={inputClass} value={form.vpnName} onChange={(e) => update('vpnName', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>SEMP Username</FieldLabel>
          <input
            className={inputClass}
            value={form.adminUsername}
            onChange={(e) => update('adminUsername', e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>SEMP Password</FieldLabel>
          <input
            className={inputClass}
            type="password"
            value={form.adminPassword}
            onChange={(e) => update('adminPassword', e.target.value)}
          />
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          className="flex-1 rounded-md bg-solace-green py-1.5 text-sm font-medium text-solace-blue-dark hover:brightness-110"
          onClick={save}
        >
          Save
        </button>
        <button
          className="flex-1 rounded-md bg-white/10 py-1.5 text-sm text-white hover:bg-white/20"
          onClick={testConnection}
        >
          Test Connection
        </button>
      </div>

      {status === 'connected' && <p className="text-xs text-solace-green">Connected to broker.</p>}
      {status === 'error' && <p className="text-xs text-red-400">{error}</p>}

      <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-white/50">
        <p className="mb-1 font-semibold text-white/70">Local broker quick-start</p>
        <pre className="whitespace-pre-wrap font-mono text-[10px] leading-4">
{`docker run -d --name feed-viz-broker \\
  --shm-size=1g \\
  -p 18080:8080 -p 18008:8008 \\
  -e username_admin_globalaccesslevel=admin \\
  -e username_admin_password=admin \\
  solace/solace-pubsub-standard`}
        </pre>
        <p className="mt-1 text-[10px] text-white/40">
          Host ports avoid Solace's own well-known defaults (8080/8008/55555) so this doesn't
          collide with another broker or dev tool already running on your machine. The raw SMF
          port isn't needed - this app only talks to the broker over SEMP and WebSocket
          messaging.
        </p>
      </div>
    </PanelShell>
  );
}

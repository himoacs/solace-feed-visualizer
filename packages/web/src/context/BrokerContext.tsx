import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BrokerConnection } from '@feed-viz/shared';
import { DEFAULT_BROKER_CONNECTION } from '@feed-viz/shared';
import { ensureClientProfileExists, ensureVpnExists, testBrokerConnection } from '../lib/sempApi';

const STORAGE_KEY = 'feed-viz-broker-connection';

export type BrokerStatus = 'unknown' | 'testing' | 'connected' | 'error';

interface BrokerContextValue {
  broker: BrokerConnection;
  setBroker: (broker: BrokerConnection) => void;
  status: BrokerStatus;
  error: string | null;
  testConnection: () => Promise<void>;
}

const BrokerContext = createContext<BrokerContextValue | null>(null);

function loadStoredBroker(): BrokerConnection {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_BROKER_CONNECTION, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return DEFAULT_BROKER_CONNECTION;
}

export function BrokerProvider({ children }: { children: ReactNode }) {
  const [broker, setBrokerState] = useState<BrokerConnection>(loadStoredBroker);
  const [status, setStatus] = useState<BrokerStatus>('unknown');
  const [error, setError] = useState<string | null>(null);

  const runTest = useCallback(async (target: BrokerConnection) => {
    setStatus('testing');
    setError(null);
    try {
      await testBrokerConnection(target);
      await ensureVpnExists(target);
      await ensureClientProfileExists(target);
      setStatus('connected');
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }, []);

  const setBroker = useCallback(
    (next: BrokerConnection) => {
      setBrokerState(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      // Re-test immediately against the NEW settings rather than leaving
      // `status` stale at "unknown" - previously Save reset status without
      // re-testing, so a working, already-connected broker would show as
      // "Not tested" (and anything gating on `status === 'connected'`, like
      // the Sunburst panel's monitor session, would refuse to start) even
      // though nothing about the actual connection had changed.
      runTest(next);
    },
    [runTest]
  );

  const testConnection = useCallback(() => runTest(broker), [runTest, broker]);

  // Try once on first mount so the nav can show a status without the user
  // having to open the panel first.
  useEffect(() => {
    runTest(broker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BrokerContext.Provider value={{ broker, setBroker, status, error, testConnection }}>
      {children}
    </BrokerContext.Provider>
  );
}

export function useBroker(): BrokerContextValue {
  const ctx = useContext(BrokerContext);
  if (!ctx) throw new Error('useBroker must be used within BrokerProvider');
  return ctx;
}

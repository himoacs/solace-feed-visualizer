import { useState } from 'react';
import { useBroker } from '../context/BrokerContext';
import { useCanvas } from '../context/CanvasContext';

/** One-click recovery after a page reload wiped the in-memory canvas. */
export function RestoreSessionBanner() {
  const { savedSession, restoreSavedSession, dismissSavedSession } = useCanvas();
  const { status } = useBroker();
  const [error, setError] = useState<string | null>(null);

  if (!savedSession) return null;

  const count = savedSession.nodes.length;
  const savedAt = new Date(savedSession.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const connected = status === 'connected';

  const restore = async () => {
    setError(null);
    try {
      await restoreSavedSession();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="absolute right-4 top-4 z-30 w-72 rounded-lg border border-solace-green/40 bg-solace-blue-deep/95 p-3 text-sm text-white shadow-xl">
      <p className="font-medium">Restore your previous canvas?</p>
      <p className="mt-0.5 text-xs text-white/60">
        {count} {count === 1 ? 'node' : 'nodes'}, last saved {savedAt}
      </p>
      {!connected && <p className="mt-1 text-[11px] text-solace-orange">Connect to the broker first to restore.</p>}
      {error && <p className="mt-1 break-words text-[11px] text-red-400">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          className="flex-1 rounded-md bg-solace-green py-1.5 text-xs font-medium text-solace-blue-dark hover:brightness-110 disabled:opacity-40"
          onClick={restore}
          disabled={!connected}
        >
          Restore
        </button>
        <button className="flex-1 rounded-md py-1.5 text-xs text-white/70 hover:bg-white/5" onClick={dismissSavedSession}>
          Start fresh
        </button>
      </div>
    </div>
  );
}

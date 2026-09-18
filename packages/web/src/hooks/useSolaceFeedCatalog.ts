import { useCallback, useEffect, useState } from 'react';
import { fetchFeedIndex, fetchFeedDetail, type SolaceFeedSummary, type SolaceFeedDetail } from '../lib/solaceFeeds';

export type FeedLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Fetches the live feed catalog once per mount (cheap after the first time
 * - see solaceFeeds.ts's two-tier cache). Call `reload(true)` to bypass the
 * cache (a manual "Refresh" action after a transient failure). */
export function useFeedIndex() {
  const [status, setStatus] = useState<FeedLoadStatus>('idle');
  const [feeds, setFeeds] = useState<SolaceFeedSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((force = false) => {
    let cancelled = false;
    setStatus('loading');
    fetchFeedIndex({ force }).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        setFeeds(result.data);
        setStatus('ready');
        setError(null);
      } else {
        setStatus('error');
        setError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(false), [load]);

  return { status, feeds, error, reload: () => load(true) };
}

/** Fetches one feed's topic rules only once it's actually picked (so opening
 * the panel costs one request - the index - not N). `feedName` of `null`
 * resets to idle without fetching anything. */
export function useFeedDetail(feedName: string | null) {
  const [status, setStatus] = useState<FeedLoadStatus>('idle');
  const [detail, setDetail] = useState<SolaceFeedDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!feedName) {
      setStatus('idle');
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    fetchFeedDetail(feedName).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        setDetail(result.data);
        setStatus('ready');
        setError(null);
      } else {
        setStatus('error');
        setError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [feedName]);

  return { status, detail, error };
}

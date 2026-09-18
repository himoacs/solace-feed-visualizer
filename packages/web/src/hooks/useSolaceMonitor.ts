import { useCallback, useEffect, useRef, useState } from 'react';
import solace from 'solclientjs';
import type { BrokerConnection } from '@feed-viz/shared';
import { buildTopicTree, createEmptyTopicNode, createEmptyTopicStats, type TopicMapEntry, type TopicNode, type TopicStats } from '../lib/topicNode';

// Ported from Solace Lens's useSolaceConnection.ts - a dedicated, broker-wide
// read-only session (default subscription ">") independent of whatever
// publisher/consumer nodes are wired up on the canvas, so the Sunburst
// reflects real traffic on the VPN as a whole.

try {
  const factoryProps = new solace.SolclientFactoryProperties();
  factoryProps.profile = solace.SolclientFactoryProfiles.version10;
  solace.SolclientFactory.init(factoryProps);
} catch {
  // Factory already initialized
}

export type MonitorConnectionState = 'disconnected' | 'connecting' | 'connected' | 'paused' | 'error';

interface UseSolaceMonitorOptions {
  broker: BrokerConnection;
  username: string;
  password: string;
  topicFilter?: string;
  /** Connects when true, disconnects when false - drives the session off the panel's own open/closed state. */
  enabled: boolean;
}

interface UseSolaceMonitorReturn {
  state: MonitorConnectionState;
  stats: TopicStats;
  topicTree: TopicNode;
  reset: () => void;
  pause: () => void;
  resume: () => void;
  error: string | null;
}

const MAX_TRACKED_TOPICS = 2000;

export function useSolaceMonitor({ broker, username, password, topicFilter = '>', enabled }: UseSolaceMonitorOptions): UseSolaceMonitorReturn {
  const [state, setState] = useState<MonitorConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TopicStats>(createEmptyTopicStats);
  const [topicTree, setTopicTree] = useState<TopicNode>(createEmptyTopicNode);

  const sessionRef = useRef<solace.Session | null>(null);
  const topicMapRef = useRef<Map<string, TopicMapEntry>>(new Map());
  const messageCountRef = useRef(0);
  const bytesCountRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topicCapReachedRef = useRef(false);
  const isPausedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const updateStats = useCallback(() => {
    const now = Date.now();
    const elapsed = startTimeRef.current ? (now - startTimeRef.current) / 1000 : 0;
    setStats({
      totalMessages: messageCountRef.current,
      totalBytes: bytesCountRef.current,
      uniqueTopics: topicMapRef.current.size,
      messageRate: elapsed > 0 ? messageCountRef.current / elapsed : 0,
      startTime: startTimeRef.current,
      topicCapReached: topicCapReachedRef.current,
    });
    setTopicTree(buildTopicTree(topicMapRef.current));
  }, []);

  const handleMessage = useCallback((message: solace.Message) => {
    if (isPausedRef.current) return;

    const topic = message.getDestination()?.getName() || 'unknown';
    const size = message.getBinaryAttachment()?.length || 0;
    const now = Date.now();

    const existing = topicMapRef.current.get(topic);
    if (existing) {
      existing.count++;
      existing.bytes += size;
      existing.lastArrivalMs = now;
    } else if (topicMapRef.current.size < MAX_TRACKED_TOPICS) {
      topicMapRef.current.set(topic, { count: 1, bytes: size, lastArrivalMs: now });
    } else if (!topicCapReachedRef.current) {
      topicCapReachedRef.current = true;
    }

    messageCountRef.current++;
    bytesCountRef.current += size;
  }, []);

  const connect = useCallback(() => {
    if (sessionRef.current) return;
    setState('connecting');
    setError(null);

    try {
      const url = `${broker.messagingProtocol}://${broker.host}:${broker.messagingPort}`;
      const session = solace.SolclientFactory.createSession({
        url,
        vpnName: broker.vpnName,
        userName: username,
        password,
        connectRetries: 3,
        reconnectRetries: 3,
        reconnectRetryWaitInMsecs: 1000,
        publisherProperties: { enabled: false },
      });

      session.on(solace.SessionEventCode.UP_NOTICE, () => {
        setState('connected');
        startTimeRef.current = Date.now();
        try {
          session.subscribe(solace.SolclientFactory.createTopicDestination(topicFilter), true, '', 10000);
        } catch {
          setError('Failed to subscribe to topics');
        }
        updateIntervalRef.current = setInterval(updateStats, 500);
      });

      session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (event: solace.SessionEvent) => {
        sessionRef.current = null;
        setState('error');
        setError(`Connection failed: ${event.infoStr}`);
      });

      session.on(solace.SessionEventCode.DISCONNECTED, () => {
        setState('disconnected');
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }
      });

      session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, (event: solace.SessionEvent) => {
        setError(`Subscription error: ${event.infoStr}`);
      });

      session.on(solace.SessionEventCode.MESSAGE, (message: solace.Message) => {
        handleMessage(message);
      });

      sessionRef.current = session;
      session.connect();
    } catch (err) {
      setState('error');
      setError(`Failed to create session: ${(err as Error).message}`);
    }
  }, [broker, username, password, topicFilter, handleMessage, updateStats]);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.disconnect();
      } catch {
        // already gone
      }
      sessionRef.current = null;
    }
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
    isPausedRef.current = false;
    setState('disconnected');
  }, []);

  const reset = useCallback(() => {
    topicMapRef.current.clear();
    messageCountRef.current = 0;
    bytesCountRef.current = 0;
    topicCapReachedRef.current = false;
    startTimeRef.current = stateRef.current === 'connected' || stateRef.current === 'paused' ? Date.now() : null;
    setStats(createEmptyTopicStats());
    setTopicTree(createEmptyTopicNode());
  }, []);

  const pause = useCallback(() => {
    if (stateRef.current !== 'connected') return;
    isPausedRef.current = true;
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    isPausedRef.current = false;
    setState('connected');
    updateIntervalRef.current = setInterval(updateStats, 500);
  }, [updateStats]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, broker, username, password, topicFilter]);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        try {
          sessionRef.current.disconnect();
        } catch {
          // ignore
        }
      }
      if (updateIntervalRef.current) clearInterval(updateIntervalRef.current);
    };
  }, []);

  return { state, stats, topicTree, reset, pause, resume, error };
}

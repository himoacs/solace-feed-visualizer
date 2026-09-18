import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppNode, ConsumerConfig, PublisherConfig } from '@feed-viz/shared';
import { useBroker } from './BrokerContext';
import { useTaxonomy } from './TaxonomyContext';
import {
  addQueueSubscription,
  createClientUsername,
  createQueue,
  deleteClientUsername,
  deleteQueue,
  deleteQueueSubscription,
} from '../lib/sempApi';
import { expandTopicTemplate } from '../lib/topicTaxonomy';
import { messagingEngine, type EngineNodeStatus } from '../lib/messagingEngine';
import { messageFlowBus, type FlowEvent } from '../lib/messageFlowBus';
import { anySubscriptionMatches, topicMatch } from '../lib/topicMatch';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function randomPassword(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

interface CanvasContextValue {
  nodes: AppNode[];
  addPublisher: (config: PublisherConfig, position: { x: number; y: number }, name?: string) => Promise<void>;
  addConsumer: (config: ConsumerConfig, position: { x: number; y: number }, name?: string) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  editPublisher: (id: string, config: PublisherConfig) => void;
  editConsumer: (id: string, config: ConsumerConfig) => Promise<void>;
  renameNode: (id: string, name: string) => void;
  setRate: (id: string, ratePerSecond: number) => void;
  runNode: (id: string) => void;
  pauseNode: (id: string) => void;
  stopNode: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const { broker } = useBroker();
  const { variables: taxonomyVariables } = useTaxonomy();
  const [nodes, setNodes] = useState<AppNode[]>([]);
  // Client credentials aren't part of AppNode (never exported/serialized) -
  // kept in a side map so Run/Pause/Stop can reconnect without re-provisioning.
  const credentialsRef = useRef<Map<string, { username: string; password: string }>>(new Map());
  // Mirrors `nodes` for the message-flow listener below, which subscribes
  // once (empty deps) and would otherwise close over a stale node list.
  const nodesRef = useRef<AppNode[]>(nodes);
  nodesRef.current = nodes;

  // Real-time "would any live subscription actually receive this?" check,
  // done client-side since we already own the full subscription list and
  // don't need to wait for a SEMP poll to react per message. A queue's
  // subscription stays live regardless of whether its own consumer is
  // paused/stopped (only removing the node tears the queue down) - matching
  // real Solace behavior (the queue keeps spooling either way). A direct
  // subscription only counts while actually subscribed (status === 'running'
  // - unsubscribe-on-pause was already the M3 fix). No match anywhere -> the
  // message is genuinely discarded by the broker (no-subscription-match).
  useEffect(() => {
    return messageFlowBus.subscribe((event: FlowEvent) => {
      if (event.kind !== 'publish') return;
      const currentNodes = nodesRef.current;

      const matchingQueueConsumers = currentNodes.filter(
        (n) => n.kind === 'consumer' && n.config.mode === 'queue' && anySubscriptionMatches(n.config.queueSubscriptions ?? [], event.topic)
      );
      for (const qc of matchingQueueConsumers) {
        messageFlowBus.emit({ kind: 'queue-arrival', nodeId: qc.id, topic: event.topic });
      }

      const hasRunningDirectMatch = currentNodes.some(
        (n) => n.kind === 'consumer' && n.config.mode === 'direct' && n.status === 'running' && topicMatch(n.config.topicFilter, event.topic)
      );

      if (!hasRunningDirectMatch && matchingQueueConsumers.length === 0) {
        messageFlowBus.emit({ kind: 'discarded', topic: event.topic });
      }
    });
  }, []);

  const patchNode = useCallback((id: string, patch: Partial<AppNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? ({ ...n, ...patch } as AppNode) : n)));
  }, []);

  const engineStatusToNodeStatus = (status: EngineNodeStatus) => {
    switch (status) {
      case 'connecting':
        return 'connecting' as const;
      case 'running':
        return 'running' as const;
      case 'paused':
        return 'paused' as const;
      case 'stopped':
        return 'idle' as const;
      case 'error':
        return 'error' as const;
    }
  };

  const startEngineFor = useCallback(
    (node: AppNode) => {
      const creds = credentialsRef.current.get(node.id);
      if (!creds) return;
      const handlers = {
        onStatusChange: (status: EngineNodeStatus, error?: string) =>
          patchNode(node.id, { status: engineStatusToNodeStatus(status), error }),
        onStats: (stats: { sent: number; received: number; nacked: number }) =>
          patchNode(node.id, { messagesSent: stats.sent, messagesReceived: stats.received, messagesNacked: stats.nacked }),
      };

      if (node.kind === 'publisher') {
        // 100 used to silently truncate presets with several independent
        // (non-chained) high-cardinality variables - e.g. Trade Order's real
        // combination count is ~2,250, Payment Origination's ~3,600 - well
        // above 100, causing most of the variety to never actually get
        // published. 5000 comfortably covers every current preset's full
        // product with headroom for future ones.
        const expandedTopics = expandTopicTemplate(node.config.topicTemplate, taxonomyVariables, { maxTopics: 5000 });
        messagingEngine.startPublisher(
          node.id,
          { broker, username: creds.username, password: creds.password },
          node.config,
          expandedTopics,
          handlers
        );
      } else {
        messagingEngine.startConsumer(node.id, { broker, username: creds.username, password: creds.password }, node.config, handlers);
      }
    },
    [broker, patchNode, taxonomyVariables]
  );

  const provisionAndStart = useCallback(
    async (base: Omit<AppNode, 'clientUsername'>, prefix: 'pub' | 'sub') => {
      const username = `feedviz-${prefix}-${randomSuffix()}`;
      const password = randomPassword();

      const node = { ...base, clientUsername: username } as AppNode;
      setNodes((prev) => [...prev, node]);
      patchNode(node.id, { status: 'provisioning' });

      try {
        await createClientUsername(broker, username, password);

        if (node.kind === 'consumer' && node.config.mode === 'queue' && node.config.queueName) {
          try {
            await createQueue(broker, node.config.queueName, node.config.queueMaxSpoolMb ?? 1);
            for (const topic of node.config.queueSubscriptions ?? []) {
              await addQueueSubscription(broker, node.config.queueName, topic);
            }
          } catch (queueErr) {
            // Don't leave an orphaned client-username behind if queue setup fails.
            await deleteClientUsername(broker, username).catch(() => {});
            throw queueErr;
          }
        }

        credentialsRef.current.set(node.id, { username, password });
        startEngineFor(node);
      } catch (err) {
        patchNode(node.id, { status: 'error', error: (err as Error).message });
      }
    },
    [broker, patchNode, startEngineFor]
  );

  const addPublisher = useCallback(
    async (config: PublisherConfig, position: { x: number; y: number }, name?: string) => {
      const id = crypto.randomUUID();
      await provisionAndStart(
        {
          id,
          kind: 'publisher',
          name: name?.trim() || `Publisher ${nodes.length + 1}`,
          status: 'provisioning',
          position,
          messagesSent: 0,
          messagesReceived: 0,
          messagesNacked: 0,
          config,
        } as Omit<AppNode, 'clientUsername'>,
        'pub'
      );
    },
    [nodes.length, provisionAndStart]
  );

  const addConsumer = useCallback(
    async (config: ConsumerConfig, position: { x: number; y: number }, name?: string) => {
      const id = crypto.randomUUID();
      await provisionAndStart(
        {
          id,
          kind: 'consumer',
          name: name?.trim() || `Consumer ${nodes.length + 1}`,
          status: 'provisioning',
          position,
          messagesSent: 0,
          messagesReceived: 0,
          messagesNacked: 0,
          config,
        } as Omit<AppNode, 'clientUsername'>,
        'sub'
      );
    },
    [nodes.length, provisionAndStart]
  );

  const removeNode = useCallback(
    async (id: string) => {
      messagingEngine.stop(id);
      const node = nodes.find((n) => n.id === id);
      credentialsRef.current.delete(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      if (node) {
        if (node.kind === 'consumer' && node.config.mode === 'queue' && node.config.queueName) {
          try {
            await deleteQueue(broker, node.config.queueName);
          } catch (err) {
            console.error('Failed to delete queue on cleanup:', err);
          }
        }
        try {
          await deleteClientUsername(broker, node.clientUsername);
        } catch (err) {
          console.error('Failed to delete client-username on cleanup:', err);
        }
      }
    },
    [broker, nodes]
  );

  const editPublisher = useCallback(
    (id: string, config: PublisherConfig) => {
      // Every publisher field is read fresh off the stored config at send
      // time (see messagingEngine.publishOne) - no broker call needed, a
      // publisher's topic is per-message, not a subscription.
      const expandedTopics = expandTopicTemplate(config.topicTemplate, taxonomyVariables, { maxTopics: 5000 });
      messagingEngine.updatePublisher(id, config, expandedTopics);
      setNodes((prev) => prev.map((n) => (n.id === id && n.kind === 'publisher' ? { ...n, config } : n)));
    },
    [taxonomyVariables]
  );

  const editConsumer = useCallback(
    async (id: string, config: ConsumerConfig) => {
      const node = nodes.find((n) => n.id === id);
      if (!node || node.kind !== 'consumer') return;
      const oldConfig = node.config;

      if (config.mode === 'direct') {
        messagingEngine.updateConsumerTopicFilter(id, config.topicFilter);
      } else if (config.mode === 'queue' && config.queueName) {
        // Subscriptions live on the broker's queue object, independent of
        // the consumer's own run/pause state (M6's own finding) - diff and
        // apply directly via SEMP, no messagingEngine involvement.
        const oldSubs = new Set(oldConfig.mode === 'queue' ? oldConfig.queueSubscriptions ?? [] : []);
        const newSubs = new Set(config.queueSubscriptions ?? []);
        for (const topic of newSubs) {
          if (!oldSubs.has(topic)) await addQueueSubscription(broker, config.queueName, topic);
        }
        for (const topic of oldSubs) {
          if (!newSubs.has(topic)) await deleteQueueSubscription(broker, config.queueName, topic);
        }
        if (oldConfig.mode === 'queue' && oldConfig.ackMode !== config.ackMode) {
          messagingEngine.updateAckMode(id, config.ackMode ?? 'auto');
        }
      }

      setNodes((prev) => prev.map((n) => (n.id === id && n.kind === 'consumer' ? { ...n, config } : n)));
    },
    [broker, nodes]
  );

  const renameNode = useCallback((id: string, name: string) => {
    // Purely a local/UI identity - never provisioned on the broker, so no
    // SEMP call or engine involvement, unlike editPublisher/editConsumer.
    const trimmed = name.trim();
    if (!trimmed) return;
    patchNode(id, { name: trimmed });
  }, [patchNode]);

  const setRate = useCallback((id: string, ratePerSecond: number) => {
    messagingEngine.setRate(id, ratePerSecond);
    setNodes((prev) =>
      prev.map((n) => (n.id === id && n.kind === 'publisher' ? { ...n, config: { ...n.config, ratePerSecond } } : n))
    );
  }, []);

  const runNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      if (node.status === 'paused') {
        messagingEngine.resume(id);
      } else {
        startEngineFor(node);
      }
    },
    [nodes, startEngineFor]
  );

  const pauseNode = useCallback((id: string) => {
    messagingEngine.pause(id);
  }, []);

  const stopNode = useCallback((id: string) => {
    messagingEngine.stop(id);
    patchNode(id, { status: 'idle' });
  }, [patchNode]);

  const updatePosition = useCallback((id: string, position: { x: number; y: number }) => {
    patchNode(id, { position });
  }, [patchNode]);

  return (
    <CanvasContext.Provider
      value={{
        nodes,
        addPublisher,
        addConsumer,
        removeNode,
        editPublisher,
        editConsumer,
        renameNode,
        setRate,
        runNode,
        pauseNode,
        stopNode,
        updatePosition,
      }}
    >
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvas(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used within CanvasProvider');
  return ctx;
}

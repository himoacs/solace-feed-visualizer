import solace from 'solclientjs';
import type { BrokerConnection, ConsumerConfig, DeliveryMode, PublisherConfig } from '@feed-viz/shared';
import { getNextTopic, getRandomTopic } from './topicTaxonomy';
import { messageFlowBus } from './messageFlowBus';

try {
  const factoryProps = new solace.SolclientFactoryProperties();
  factoryProps.profile = solace.SolclientFactoryProfiles.version10;
  solace.SolclientFactory.init(factoryProps);
} catch {
  // Factory already initialized (e.g. React StrictMode double-invoke)
}

export type EngineNodeStatus = 'connecting' | 'running' | 'paused' | 'stopped' | 'error';

export interface EngineHandlers {
  onStatusChange: (status: EngineNodeStatus, error?: string) => void;
  onStats: (stats: { sent: number; received: number; nacked: number }) => void;
}

export interface SessionCredentials {
  broker: BrokerConnection;
  username: string;
  password: string;
}

interface EngineEntry {
  kind: 'publisher' | 'consumer';
  session: solace.Session | null;
  messageConsumer: solace.MessageConsumer | null;
  publishInterval: ReturnType<typeof setInterval> | null;
  statsInterval: ReturnType<typeof setInterval> | null;
  isPaused: boolean;
  sent: number;
  received: number;
  /** Only ever incremented for a Persistent-QoS publisher - a Direct publish
   * has no ack/nack channel at all, so it can never be NACKed (confirmed
   * against Solace's docs - see plan). */
  nacked: number;
  handlers: EngineHandlers;
  publisherConfig?: PublisherConfig;
  expandedTopics: string[];
  topicIndex: number;
  consumerConfig?: ConsumerConfig;
}

function generatePayload(sizeBytes: number, seq: number): Uint8Array {
  const base = JSON.stringify({ seq, ts: Date.now() });
  const padded = base.length < sizeBytes ? base + ' '.repeat(sizeBytes - base.length) : base;
  return new TextEncoder().encode(padded);
}

function toDeliveryMode(mode: DeliveryMode): solace.MessageDeliveryModeType {
  return mode === 'persistent' ? solace.MessageDeliveryModeType.PERSISTENT : solace.MessageDeliveryModeType.DIRECT;
}

class MessagingEngine {
  private entries = new Map<string, EngineEntry>();

  private sessionUrl(broker: BrokerConnection): string {
    return `${broker.messagingProtocol}://${broker.host}:${broker.messagingPort}`;
  }

  private ensureStatsInterval(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry || entry.statsInterval) return;
    entry.statsInterval = setInterval(() => {
      entry.handlers.onStats({ sent: entry.sent, received: entry.received, nacked: entry.nacked });
    }, 400);
  }

  private teardownIntervals(entry: EngineEntry) {
    if (entry.publishInterval) clearInterval(entry.publishInterval);
    if (entry.statsInterval) clearInterval(entry.statsInterval);
    entry.publishInterval = null;
    entry.statsInterval = null;
  }

  startPublisher(
    nodeId: string,
    creds: SessionCredentials,
    config: PublisherConfig,
    expandedTopics: string[],
    handlers: EngineHandlers
  ) {
    this.stop(nodeId);
    const entry: EngineEntry = {
      kind: 'publisher',
      session: null,
      messageConsumer: null,
      publishInterval: null,
      statsInterval: null,
      isPaused: false,
      sent: 0,
      received: 0,
      nacked: 0,
      handlers,
      publisherConfig: config,
      expandedTopics: expandedTopics.length > 0 ? expandedTopics : [config.topicTemplate],
      topicIndex: 0,
    };
    this.entries.set(nodeId, entry);
    handlers.onStatusChange('connecting');

    const session = solace.SolclientFactory.createSession({
      url: this.sessionUrl(creds.broker),
      vpnName: creds.broker.vpnName,
      userName: creds.username,
      password: creds.password,
      connectRetries: 3,
      reconnectRetries: 3,
      reconnectRetryWaitInMsecs: 1000,
      // A stable, known clientName (rather than the broker's own generated
      // one) lets the UI poll this exact client's SEMP stats later.
      clientName: nodeId,
    });
    entry.session = session;

    session.on(solace.SessionEventCode.UP_NOTICE, () => {
      handlers.onStatusChange('running');
      this.ensureStatsInterval(nodeId);
      this.startPublishInterval(nodeId);
    });
    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (event: solace.SessionEvent) => {
      handlers.onStatusChange('error', event.infoStr || 'Connection failed');
    });
    session.on(solace.SessionEventCode.DISCONNECTED, () => {
      handlers.onStatusChange('stopped');
    });
    // Only ever fires for Persistent/Non-Persistent (Guaranteed) sends - a
    // Direct publish has no ack/nack channel, so this is harmless to always
    // register rather than gating on the current QoS (which can change if
    // the node's config is edited later).
    session.on(solace.SessionEventCode.REJECTED_MESSAGE_ERROR, () => {
      entry.nacked++;
      messageFlowBus.emit({ kind: 'nacked', nodeId });
    });

    session.connect();
  }

  private pickTopic(entry: EngineEntry): string {
    const topics = entry.expandedTopics;
    if (topics.length <= 1) return topics[0] ?? '';
    switch (entry.publisherConfig?.topicMode) {
      case 'random':
        return getRandomTopic(topics);
      case 'round-robin': {
        const result = getNextTopic(topics, entry.topicIndex);
        entry.topicIndex = result.nextIndex;
        return result.topic;
      }
      default:
        return topics[0];
    }
  }

  private startPublishInterval(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry || !entry.session || !entry.publisherConfig) return;
    if (entry.publishInterval) clearInterval(entry.publishInterval);

    const config = entry.publisherConfig;
    const rate = Math.max(config.ratePerSecond, 0.01);

    // Browsers won't reliably fire setInterval faster than ~4ms - a naive
    // "one message per tick" scheme silently caps out around 250msg/s no
    // matter what the slider says (confirmed live: 500 configured measured
    // as ~250 actual). Below TICK_FLOOR_MS, tick at the floor instead and
    // send a batch of messages per tick sized to hit the real target rate.
    const TICK_FLOOR_MS = 20;
    const naturalIntervalMs = 1000 / rate;
    const tickMs = Math.max(naturalIntervalMs, TICK_FLOOR_MS);
    const messagesPerTick = Math.max(1, Math.round(rate / (1000 / tickMs)));

    const publishOne = () => {
      if (!entry.session) return;
      const topic = this.pickTopic(entry);
      const message = solace.SolclientFactory.createMessage();
      message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
      message.setBinaryAttachment(generatePayload(config.messageSizeBytes, entry.sent));
      message.setDeliveryMode(toDeliveryMode(config.deliveryMode));
      entry.session.send(message);
      entry.sent++;
      messageFlowBus.emit({ kind: 'publish', nodeId, topic });
    };

    entry.publishInterval = setInterval(() => {
      if (entry.isPaused || !entry.session) return;
      try {
        for (let i = 0; i < messagesPerTick; i++) publishOne();
      } catch (err) {
        // A full guaranteed-message window is expected backpressure once a
        // Persistent publisher's own queue is full and slow to drain (the
        // exact scenario this app's demo deliberately induces to show
        // NACKs) - not a real error worth logging on every tick, unlike
        // anything else that can throw here.
        if (!(err instanceof Error && err.message.includes('Guaranteed Message Window Closed'))) {
          console.error('[messagingEngine] publish error', err);
        }
      }
    }, tickMs);
  }

  startConsumer(nodeId: string, creds: SessionCredentials, config: ConsumerConfig, handlers: EngineHandlers) {
    this.stop(nodeId);
    const entry: EngineEntry = {
      kind: 'consumer',
      session: null,
      messageConsumer: null,
      publishInterval: null,
      statsInterval: null,
      isPaused: false,
      sent: 0,
      received: 0,
      nacked: 0,
      handlers,
      expandedTopics: [],
      topicIndex: 0,
      consumerConfig: config,
    };
    this.entries.set(nodeId, entry);
    handlers.onStatusChange('connecting');

    const session = solace.SolclientFactory.createSession({
      url: this.sessionUrl(creds.broker),
      vpnName: creds.broker.vpnName,
      userName: creds.username,
      password: creds.password,
      connectRetries: 3,
      reconnectRetries: 3,
      reconnectRetryWaitInMsecs: 1000,
      clientName: nodeId,
    });
    entry.session = session;

    session.on(solace.SessionEventCode.UP_NOTICE, () => {
      this.ensureStatsInterval(nodeId);
      this.bindConsumer(nodeId);
    });
    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (event: solace.SessionEvent) => {
      handlers.onStatusChange('error', event.infoStr || 'Connection failed');
    });
    session.on(solace.SessionEventCode.DISCONNECTED, () => {
      handlers.onStatusChange('stopped');
    });
    session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, (event: solace.SessionEvent) => {
      handlers.onStatusChange('error', event.infoStr || 'Subscription error');
    });
    session.on(solace.SessionEventCode.MESSAGE, (message: solace.Message) => {
      if (entry.consumerConfig?.mode === 'queue') return;
      entry.received++;
      messageFlowBus.emit({ kind: 'deliver', nodeId, topic: message.getDestination()?.getName() ?? '' });
    });

    session.connect();
  }

  /**
   * Subscribes (direct) or binds a fresh MessageConsumer (queue) - the broker
   * only stops delivering once this is torn down, which is exactly what
   * unbindConsumer/pause does. Called on initial connect AND on resume after
   * a pause, so pausing a consumer has a real effect instead of just
   * silencing the local counter while the broker keeps pushing messages.
   */
  private bindConsumer(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry || !entry.session || !entry.consumerConfig) return;
    const { session, consumerConfig: config, handlers } = entry;

    if (config.mode === 'queue' && config.queueName) {
      handlers.onStatusChange('connecting');
      try {
        const mcProps = new solace.MessageConsumerProperties();
        mcProps.queueDescriptor = new solace.QueueDescriptor({ name: config.queueName, type: solace.QueueType.QUEUE });
        mcProps.acknowledgeMode =
          config.ackMode === 'client'
            ? solace.MessageConsumerAcknowledgeMode.CLIENT
            : solace.MessageConsumerAcknowledgeMode.AUTO;

        const consumer = session.createMessageConsumer(mcProps);
        entry.messageConsumer = consumer;

        consumer.on(solace.MessageConsumerEventName.UP, () => {
          handlers.onStatusChange('running');
        });
        consumer.on(solace.MessageConsumerEventName.CONNECT_FAILED_ERROR, (err: unknown) => {
          handlers.onStatusChange('error', (err as Error)?.message ?? 'Queue bind failed');
        });
        consumer.on(solace.MessageConsumerEventName.MESSAGE, (message: solace.Message) => {
          entry.received++;
          messageFlowBus.emit({ kind: 'deliver', nodeId, topic: message.getDestination()?.getName() ?? '' });
          if (config.ackMode === 'client') {
            try {
              message.acknowledge();
            } catch {
              // Consumer already down
            }
          }
        });

        consumer.connect();
      } catch (err) {
        handlers.onStatusChange('error', (err as Error).message);
      }
    } else {
      handlers.onStatusChange('running');
      try {
        session.subscribe(solace.SolclientFactory.createTopicDestination(config.topicFilter), true, '', 10000);
      } catch (err) {
        handlers.onStatusChange('error', (err as Error).message);
      }
    }
  }

  /**
   * The inverse of bindConsumer: actually stops the broker from delivering
   * to this client (unsubscribe for direct, disconnect the flow for queue)
   * rather than just muting the local receive counter.
   */
  private unbindConsumer(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry || !entry.session || !entry.consumerConfig) return;
    const { session, consumerConfig: config } = entry;

    if (config.mode === 'queue') {
      try {
        entry.messageConsumer?.disconnect();
      } catch (err) {
        console.error('[messagingEngine] queue unbind error', err);
      }
      entry.messageConsumer = null;
    } else {
      try {
        session.unsubscribe(solace.SolclientFactory.createTopicDestination(config.topicFilter), true, '', 10000);
      } catch (err) {
        console.error('[messagingEngine] unsubscribe error', err);
      }
    }
  }

  /** Live rate change without a reconnect - just restarts the publish interval. */
  setRate(nodeId: string, ratePerSecond: number) {
    const entry = this.entries.get(nodeId);
    if (!entry || entry.kind !== 'publisher' || !entry.publisherConfig) return;
    entry.publisherConfig = { ...entry.publisherConfig, ratePerSecond };
    this.startPublishInterval(nodeId);
  }

  /** Live full-config edit (topic template/mode, QoS, message size) - every
   * one of these is only read fresh out of `publisherConfig` at send time
   * (see publishOne), so like setRate this is just swapping the stored
   * config and rebuilding the publish interval's closure over it. No broker
   * call at all - a publisher's topic is per-message, not a subscription. */
  updatePublisher(nodeId: string, config: PublisherConfig, expandedTopics: string[]) {
    const entry = this.entries.get(nodeId);
    if (!entry || entry.kind !== 'publisher') return;
    entry.publisherConfig = config;
    entry.expandedTopics = expandedTopics.length > 0 ? expandedTopics : [config.topicTemplate];
    this.startPublishInterval(nodeId);
  }

  pause(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    entry.isPaused = true;
    entry.handlers.onStatusChange('paused');
    // Publishers just stop on the next interval tick (isPaused guard). For a
    // consumer, actually unsubscribe/unbind so the broker really stops
    // delivering - a direct-subscription message published while "paused"
    // is gone for good (no persistence), and a queue keeps building up,
    // matching real Solace behavior instead of a cosmetic pause.
    if (entry.kind === 'consumer') this.unbindConsumer(nodeId);
  }

  resume(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    entry.isPaused = false;
    if (entry.kind === 'consumer') {
      this.bindConsumer(nodeId);
    } else {
      entry.handlers.onStatusChange('running');
    }
  }

  /** Live topic-filter edit for a direct-subscribe consumer. If a session is
   * currently bound, the broker has to actually be told - unsubscribe the
   * old filter and subscribe the new one (the same two calls
   * bindConsumer/unbindConsumer already use). If idle/paused, just store it
   * for the next bind. */
  updateConsumerTopicFilter(nodeId: string, topicFilter: string) {
    const entry = this.entries.get(nodeId);
    if (!entry || entry.kind !== 'consumer' || !entry.consumerConfig || entry.consumerConfig.mode !== 'direct') return;
    const oldFilter = entry.consumerConfig.topicFilter;
    entry.consumerConfig = { ...entry.consumerConfig, topicFilter };
    if (entry.session && !entry.isPaused && oldFilter !== topicFilter) {
      try {
        entry.session.unsubscribe(solace.SolclientFactory.createTopicDestination(oldFilter), true, '', 10000);
      } catch (err) {
        console.error('[messagingEngine] unsubscribe (edit) error', err);
      }
      try {
        entry.session.subscribe(solace.SolclientFactory.createTopicDestination(topicFilter), true, '', 10000);
      } catch (err) {
        console.error('[messagingEngine] subscribe (edit) error', err);
      }
    }
  }

  /** Ack mode is fixed on solclientjs's MessageConsumerProperties at bind
   * time, so changing it needs a rebind rather than a live tweak - the same
   * unbind+bind pair pause()/resume() already use, just back-to-back so the
   * new consumer flow picks up the new mode immediately. */
  updateAckMode(nodeId: string, ackMode: 'auto' | 'client') {
    const entry = this.entries.get(nodeId);
    if (!entry || entry.kind !== 'consumer' || !entry.consumerConfig || entry.consumerConfig.mode !== 'queue') return;
    entry.consumerConfig = { ...entry.consumerConfig, ackMode };
    if (entry.session && !entry.isPaused) {
      this.unbindConsumer(nodeId);
      this.bindConsumer(nodeId);
    }
  }

  stop(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    this.teardownIntervals(entry);
    try {
      entry.messageConsumer?.disconnect();
    } catch (err) {
      console.error('[messagingEngine] consumer disconnect error', err);
    }
    try {
      entry.session?.disconnect();
    } catch (err) {
      console.error('[messagingEngine] disconnect error', err);
    }
    this.entries.delete(nodeId);
  }
}

export const messagingEngine = new MessagingEngine();

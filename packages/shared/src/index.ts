// Shared types between @feed-viz/web and @feed-viz/server.

export interface BrokerConnection {
  /** SEMP management protocol */
  protocol: 'http' | 'https';
  host: string;
  sempPort: number;
  /** Browser messaging transport - solclientjs connects over ws(s) */
  messagingProtocol: 'ws' | 'wss';
  messagingPort: number;
  vpnName: string;
  /** SEMP admin credentials, used only by the backend proxy */
  adminUsername: string;
  adminPassword: string;
}

export const DEFAULT_BROKER_CONNECTION: BrokerConnection = {
  protocol: 'http',
  host: 'localhost',
  // Host-side ports deliberately avoid Solace's/anyone's well-known defaults
  // (8080, 8008, 55555) - those are exactly the ones already claimed by any
  // other broker or dev tool on a workshop laptop, container-internal ports
  // are unaffected, only the host mapping in the quick-start below changes.
  sempPort: 18080,
  messagingProtocol: 'ws',
  messagingPort: 18008,
  // A dedicated VPN, not the broker's shared "default" - keeps every object
  // this app provisions (client-usernames, later queues) isolated from
  // whatever else is running on the same broker.
  vpnName: 'MessageFlowVisualizer',
  adminUsername: 'admin',
  adminPassword: 'admin',
};

export type DeliveryMode = 'direct' | 'persistent';

export type NodeStatus = 'idle' | 'provisioning' | 'connecting' | 'running' | 'paused' | 'error';

export type TopicMode = 'single' | 'round-robin' | 'random';

export interface PublisherConfig {
  /** May contain {variable} placeholders resolved against the topic taxonomy. */
  topicTemplate: string;
  /** Only matters when the template expands to more than one concrete topic. */
  topicMode: TopicMode;
  deliveryMode: DeliveryMode;
  ratePerSecond: number;
  messageSizeBytes: number;
}

export interface ConsumerConfig {
  mode: 'direct' | 'queue';
  /** Topic filter for direct subscription, e.g. "orders/*" or "orders/>" */
  topicFilter: string;
  /** Queue-bound fields, only used when mode === 'queue'. */
  queueName?: string;
  queueSubscriptions?: string[];
  ackMode?: 'auto' | 'client';
  /** Queue spool quota in MB - kept small by default (1) so a live demo can
   * actually fill it and trigger real discard/NACK behavior. */
  queueMaxSpoolMb?: number;
}

// --- Topic Taxonomy: reusable {variable} definitions for topic templates ---

export interface TaxonomyDependency {
  /** The variable this one depends on. */
  variable: string;
  /** For each value of the parent variable, the allowed values of this one. */
  valueMap: Record<string, string[]>;
}

export interface TopicTaxonomyVariable {
  name: string;
  description: string;
  values: string[];
  isCustom: boolean;
  dependsOn?: TaxonomyDependency;
}

export interface AppNodeBase {
  id: string;
  name: string;
  /** Client username provisioned on the broker for this node's session */
  clientUsername: string;
  status: NodeStatus;
  error?: string;
  position: { x: number; y: number };
  messagesSent: number;
  messagesReceived: number;
  /** Only meaningful for a Persistent-QoS publisher - see messagingEngine.ts. */
  messagesNacked: number;
}

export interface PublisherNode extends AppNodeBase {
  kind: 'publisher';
  config: PublisherConfig;
}

export interface ConsumerNode extends AppNodeBase {
  kind: 'consumer';
  config: ConsumerConfig;
}

export type AppNode = PublisherNode | ConsumerNode;

// --- SEMP proxy contract (stateless: broker connection is passed per-call) ---

export type SempApiType = 'config' | 'monitor' | 'action';

export interface SempProxyRequest {
  brokerConn: Pick<BrokerConnection, 'protocol' | 'host' | 'sempPort' | 'adminUsername' | 'adminPassword'>;
  /** Path relative to /SEMP/v2/{apiType}, e.g. "/about/api" or "/msgVpns/default/clientUsernames" */
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  apiType?: SempApiType;
  body?: unknown;
}

export interface SempProxyResponse<T = unknown> {
  data: T;
}

export interface SempProxyErrorBody {
  error: string;
  sempCode?: number;
  sempDescription?: string;
}

import type { BrokerConnection, SempApiType, SempProxyErrorBody } from '@feed-viz/shared';

export class SempApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public sempCode?: number
  ) {
    super(message);
    this.name = 'SempApiError';
  }
}

function toBrokerConnPayload(broker: BrokerConnection) {
  return {
    protocol: broker.protocol,
    host: broker.host,
    sempPort: broker.sempPort,
    adminUsername: broker.adminUsername,
    adminPassword: broker.adminPassword,
  };
}

interface SempCallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  apiType?: SempApiType;
  body?: unknown;
}

async function sempFetch(broker: BrokerConnection, path: string, opts: SempCallOptions = {}): Promise<any> {
  const res = await fetch('/api/semp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brokerConn: toBrokerConnPayload(broker),
      path,
      method: opts.method ?? 'GET',
      apiType: opts.apiType ?? 'config',
      body: opts.body,
    }),
  });

  const json = await res.json().catch(() => undefined);

  if (!res.ok) {
    const err = json as SempProxyErrorBody | undefined;
    throw new SempApiError(err?.error ?? `SEMP request failed (${res.status})`, res.status, err?.sempCode);
  }

  return json;
}

export async function sempCall<T>(broker: BrokerConnection, path: string, opts: SempCallOptions = {}): Promise<T> {
  const json = await sempFetch(broker, path, opts);
  return (json?.data ?? json) as T;
}

/** Like sempCall, but also returns the response's `meta` (e.g. `meta.count` from a paginated collection). */
export async function sempCallWithMeta<T>(
  broker: BrokerConnection,
  path: string,
  opts: SempCallOptions = {}
): Promise<{ data: T; meta?: { count?: number } }> {
  const json = await sempFetch(broker, path, opts);
  return { data: json?.data as T, meta: json?.meta };
}

export function vpnPath(broker: BrokerConnection, suffix: string): string {
  return `/msgVpns/${encodeURIComponent(broker.vpnName)}${suffix}`;
}

export async function testBrokerConnection(broker: BrokerConnection): Promise<void> {
  await sempCall(broker, '/about/api', { apiType: 'config' });
}

/**
 * Creates the app's dedicated Message VPN if it isn't already there, so this
 * app's client-usernames/queues stay isolated from anything else on a shared
 * broker rather than piling into "default". Safe to call every time a
 * connection is (re)tested.
 */
export async function ensureVpnExists(broker: BrokerConnection): Promise<void> {
  let exists = true;
  try {
    await sempCall(broker, `/msgVpns/${encodeURIComponent(broker.vpnName)}`, { apiType: 'config' });
  } catch {
    exists = false;
  }

  if (!exists) {
    try {
      await sempCall(broker, '/msgVpns', {
        method: 'POST',
        body: { msgVpnName: broker.vpnName, enabled: true, maxMsgSpoolUsage: 1500 },
      });
    } catch (err) {
      // Ignore a benign create race (e.g. two "Test Connection" clicks) -
      // anything else should surface to the user.
      if (!/already exists/i.test((err as Error).message)) throw err;
    }
  }

  // Some brokers' VPN-creation defaults (or a template applied at the broker
  // level) inherit "radius" for basic auth, which fails every client-username
  // login with no RADIUS server configured - force plain username/password
  // auth against the broker's internal client-username database instead.
  // Idempotent, so safe to (re)apply whether the VPN was just created or
  // already existed.
  await sempCall(broker, `/msgVpns/${encodeURIComponent(broker.vpnName)}`, {
    method: 'PATCH',
    body: { authenticationBasicType: 'internal' },
  });
}

/**
 * The broker's built-in "default" client-profile ships with guaranteed
 * messaging (send/receive/endpoint-create) all disabled - confirmed live
 * ("Consumer is not supported by the broker for this client" from
 * solclientjs the moment a queue-bound consumer tries to bind). This app's
 * own profile turns those on so queue consumers and persistent publishers
 * both work; the ACL profile stays "default" (already permissive enough).
 */
export const FEEDVIZ_CLIENT_PROFILE = 'feedviz-profile';

export async function ensureClientProfileExists(broker: BrokerConnection): Promise<void> {
  const body = {
    clientProfileName: FEEDVIZ_CLIENT_PROFILE,
    allowGuaranteedMsgSendEnabled: true,
    allowGuaranteedMsgReceiveEnabled: true,
    allowGuaranteedEndpointCreateEnabled: true,
  };
  try {
    await sempCall(broker, vpnPath(broker, '/clientProfiles'), { method: 'POST', body });
  } catch (err) {
    if (/already exists/i.test((err as Error).message)) {
      // Idempotent: make sure an existing profile (from a prior run) still has these on.
      await sempCall(broker, vpnPath(broker, `/clientProfiles/${encodeURIComponent(FEEDVIZ_CLIENT_PROFILE)}`), {
        method: 'PATCH',
        body,
      });
    } else {
      throw err;
    }
  }
}

export async function createClientUsername(broker: BrokerConnection, username: string, password: string): Promise<void> {
  await sempCall(broker, vpnPath(broker, '/clientUsernames'), {
    method: 'POST',
    body: {
      clientUsername: username,
      password,
      clientProfileName: FEEDVIZ_CLIENT_PROFILE,
      // The broker's built-in ACL profile "default" is already permissive
      // enough for this app's own pub/sub - no need for a dedicated one.
      aclProfileName: 'default',
      enabled: true,
    },
  });
}

export async function deleteClientUsername(broker: BrokerConnection, username: string): Promise<void> {
  await sempCall(broker, vpnPath(broker, `/clientUsernames/${encodeURIComponent(username)}`), {
    method: 'DELETE',
  });
}

/**
 * One well-known, low-privilege client-username for the Sunburst panel's
 * broker-wide read-only monitor session (subscribes "&gt;", never publishes).
 * A fixed password is fine here - it's VPN-scoped, direct-subscribe-only, and
 * never leaves this broker's own isolated VPN.
 */
export const MONITOR_CLIENT_USERNAME = 'feedviz-sunburst-monitor';
const MONITOR_CLIENT_PASSWORD = 'feedviz-monitor-readonly';

export async function ensureMonitorClientExists(broker: BrokerConnection): Promise<void> {
  try {
    await createClientUsername(broker, MONITOR_CLIENT_USERNAME, MONITOR_CLIENT_PASSWORD);
  } catch (err) {
    if (!/already exists/i.test((err as Error).message)) throw err;
  }
}

export function getMonitorClientPassword(): string {
  return MONITOR_CLIENT_PASSWORD;
}

export async function createQueue(broker: BrokerConnection, queueName: string, maxMsgSpoolUsageMb = 1): Promise<void> {
  await sempCall(broker, vpnPath(broker, '/queues'), {
    method: 'POST',
    body: {
      queueName,
      accessType: 'exclusive',
      permission: 'consume',
      ingressEnabled: true,
      egressEnabled: true,
      // Small by default (1MB) so a live demo can actually fill the queue and
      // trigger real discard/NACK behavior - the broker's own default (200MB)
      // needs ~1.6M small messages to ever reach, which no demo can reach live.
      maxMsgSpoolUsage: maxMsgSpoolUsageMb,
    },
  });
}

export async function addQueueSubscription(broker: BrokerConnection, queueName: string, subscriptionTopic: string): Promise<void> {
  await sempCall(broker, vpnPath(broker, `/queues/${encodeURIComponent(queueName)}/subscriptions`), {
    method: 'POST',
    body: { subscriptionTopic },
  });
}

/** A queue's subscriptions stay live independent of its consumer's run/pause state - editing
 * them is a pure SEMP-level change, no messagingEngine/session involvement needed. */
export async function deleteQueueSubscription(broker: BrokerConnection, queueName: string, subscriptionTopic: string): Promise<void> {
  await sempCall(broker, vpnPath(broker, `/queues/${encodeURIComponent(queueName)}/subscriptions/${encodeURIComponent(subscriptionTopic)}`), {
    method: 'DELETE',
  });
}

/** Deleting the queue implicitly removes its subscriptions - no separate cleanup needed. */
export async function deleteQueue(broker: BrokerConnection, queueName: string): Promise<void> {
  await sempCall(broker, vpnPath(broker, `/queues/${encodeURIComponent(queueName)}`), {
    method: 'DELETE',
  });
}

export interface QueueMonitorStats {
  /** Real LIVE queue depth - how many messages are sitting in the queue right
   * now. Confirmed live against the broker: the queue object's own
   * `spooledMsgCount` field looks like a depth but isn't - it's a lifetime
   * cumulative total that only ever grows, even with an actively-draining
   * consumer, so it can't show "how full is it right now." The real live
   * count is the `msgs` sub-collection's `meta.count` (the same
   * page-size-independent trick getConnectionCount uses). */
  liveMsgCount: number;
  /** Messages discarded because the queue was over its spool quota - the real
   * signal for "this queue is full." Distinct from whether the sender got a
   * NACK for it (see PublisherNode.messagesNacked / messagingEngine.ts). */
  maxMsgSpoolUsageExceededDiscardedMsgCount: number;
}

/** Live queue depth + discard stats, for the queue node's fill/discard display. Returns null if the queue can't be read (e.g. not provisioned yet). */
export async function getQueueStats(broker: BrokerConnection, queueName: string): Promise<QueueMonitorStats | null> {
  try {
    const [queueData, msgsPage] = await Promise.all([
      sempCall<{ maxMsgSpoolUsageExceededDiscardedMsgCount?: number }>(
        broker,
        vpnPath(broker, `/queues/${encodeURIComponent(queueName)}`),
        { apiType: 'monitor' }
      ),
      sempCallWithMeta(broker, vpnPath(broker, `/queues/${encodeURIComponent(queueName)}/msgs?count=1&select=msgId`), {
        apiType: 'monitor',
      }),
    ]);
    return {
      liveMsgCount: msgsPage.meta?.count ?? 0,
      maxMsgSpoolUsageExceededDiscardedMsgCount: queueData.maxMsgSpoolUsageExceededDiscardedMsgCount ?? 0,
    };
  } catch {
    return null;
  }
}

export interface ClientStats {
  /** Messages the broker tried to deliver to this client but discarded - the
   * real signal for "this direct consumer can't keep up with the rate." */
  txDiscardedMsgCount: number;
  /** Messages this client published that matched no subscription anywhere on
   * the VPN - the real signal for "nothing is downstream of this publisher." */
  noSubscriptionMatchRxDiscardedMsgCount: number;
}

/**
 * Real broker-reported stats for one client (identified by the clientName the
 * app sets explicitly at session-connect time - see messagingEngine.ts).
 * Used on both publishers (no-subscriber discards) and consumers (egress
 * discards). Returns null while the session isn't up yet.
 */
export async function getClientStats(broker: BrokerConnection, clientName: string): Promise<ClientStats | null> {
  try {
    const data = await sempCall<{ txDiscardedMsgCount?: number; noSubscriptionMatchRxDiscardedMsgCount?: number }>(
      broker,
      vpnPath(broker, `/clients/${encodeURIComponent(clientName)}`),
      { apiType: 'monitor' }
    );
    return {
      txDiscardedMsgCount: data.txDiscardedMsgCount ?? 0,
      noSubscriptionMatchRxDiscardedMsgCount: data.noSubscriptionMatchRxDiscardedMsgCount ?? 0,
    };
  } catch {
    return null;
  }
}

export interface VpnRateStats {
  rxMsgRate: number;
  txMsgRate: number;
}

/** Instantaneous (not the slow-EMA `average*`) VPN-wide ingress/egress rate, for the activity banner. */
export async function getVpnStats(broker: BrokerConnection): Promise<VpnRateStats | null> {
  try {
    const data = await sempCall<{ rate?: { rxMsgRate?: number; txMsgRate?: number } }>(
      broker,
      `/msgVpns/${encodeURIComponent(broker.vpnName)}`,
      { apiType: 'monitor' }
    );
    return { rxMsgRate: data.rate?.rxMsgRate ?? 0, txMsgRate: data.rate?.txMsgRate ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Live connection count via the page-size-independent `meta.count` trick -
 * `count=1` fetches a single row purely to read the total match count.
 */
export async function getConnectionCount(broker: BrokerConnection): Promise<number | null> {
  try {
    const { meta } = await sempCallWithMeta(broker, vpnPath(broker, '/clients?count=1&select=clientName'), {
      apiType: 'monitor',
    });
    return meta?.count ?? null;
  } catch {
    return null;
  }
}

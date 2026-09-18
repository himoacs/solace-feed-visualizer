// Live client for Solace's community Event Feeds catalog
// (https://feeds.solace.dev/, backed by github.com/solacecommunity/solace-event-feeds).
//
// Only ever fetches from raw.githubusercontent.com, NEVER api.github.com -
// the latter's 60 req/hour unauthenticated rate limit is a real risk for a
// room full of workshop attendees behind one NAT/wifi, and it isn't needed
// anyway: the catalog's own index file already lists every feed's folder
// name up front. Do not add an api.github.com call here (e.g. to "discover"
// a feed folder's files) - it isn't necessary and reintroduces that risk.
const BASE_URL = 'https://raw.githubusercontent.com/solacecommunity/solace-event-feeds/main';
const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h - long enough to survive a reload mid-workshop, short enough to pick up new/changed feeds on a normal new day.

export interface SolaceFeedSummary {
  name: string;
  description: string;
  img?: string;
  type?: string;
  contributor?: string;
  github?: string;
  domain: string;
  tags?: string;
  lastUpdated?: string;
}

export interface FeedRuleValueSpec {
  schema?: { type?: string };
  rule?: {
    name?: string;
    type?: string;
    group?: string;
    rule?: string;
    casing?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    minimum?: number;
    maximum?: number;
    fractionDigits?: number;
    enum?: unknown[];
    start?: number;
    change?: number;
    [key: string]: unknown;
  };
}

export interface SolaceFeedRule {
  topic: string;
  topicParameters?: Record<string, FeedRuleValueSpec>;
  eventName?: string;
  eventVersion?: string;
  messageName?: string;
  hasPayload?: boolean;
}

export interface SolaceFeedDetail extends SolaceFeedSummary {
  rules: SolaceFeedRule[];
}

export type FeedFetchResult<T> = { status: 'ok'; data: T } | { status: 'error'; message: string };

// --- two-tier cache: in-memory for the session, localStorage across reloads ---

let memoryIndexCache: SolaceFeedSummary[] | null = null;
const memoryDetailCache = new Map<string, SolaceFeedDetail>();

interface CacheEnvelope<T> {
  data: T;
  ts: number;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (Date.now() - envelope.ts > CACHE_TTL_MS) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() } satisfies CacheEnvelope<T>));
  } catch {
    // localStorage full/unavailable - the in-memory cache still works for this session.
  }
}

// Distinguishes "the file genuinely doesn't exist for this feed" (a 404,
// treated as empty data, not an error - some feeds may just lack a rules
// file) from a real network/parse failure (which should surface as an
// error so the UI can show a retry option instead of silently going empty).
async function fetchJson(url: string): Promise<{ ok: true; data: unknown } | { ok: false; notFound: true } | { ok: false; notFound: false; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return { ok: false, notFound: true };
    if (!res.ok) return { ok: false, notFound: false, message: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (err) {
    const message = err instanceof DOMException && err.name === 'AbortError' ? 'Timed out' : (err as Error).message || 'Network error';
    return { ok: false, notFound: false, message };
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseFeedSummary(entry: unknown): SolaceFeedSummary | null {
  if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.domain !== 'string') return null;
  return {
    name: entry.name,
    description: typeof entry.description === 'string' ? entry.description : '',
    img: typeof entry.img === 'string' ? entry.img : undefined,
    type: typeof entry.type === 'string' ? entry.type : undefined,
    contributor: typeof entry.contributor === 'string' ? entry.contributor : undefined,
    github: typeof entry.github === 'string' ? entry.github : undefined,
    domain: entry.domain,
    tags: typeof entry.tags === 'string' ? entry.tags : undefined,
    lastUpdated: typeof entry.lastUpdated === 'string' ? entry.lastUpdated : undefined,
  };
}

function parseFeedRule(entry: unknown): SolaceFeedRule | null {
  if (!isRecord(entry) || typeof entry.topic !== 'string') return null;
  return {
    topic: entry.topic,
    topicParameters: isRecord(entry.topicParameters) ? (entry.topicParameters as Record<string, FeedRuleValueSpec>) : undefined,
    eventName: typeof entry.eventName === 'string' ? entry.eventName : undefined,
    eventVersion: typeof entry.eventVersion === 'string' ? entry.eventVersion : undefined,
    messageName: typeof entry.messageName === 'string' ? entry.messageName : undefined,
    hasPayload: typeof entry.hasPayload === 'boolean' ? entry.hasPayload : undefined,
  };
}

const INDEX_CACHE_KEY = 'feed-viz-solace-feeds-index';
const detailCacheKey = (feedName: string) => `feed-viz-solace-feed-detail:${feedName}`;

export async function fetchFeedIndex(opts: { force?: boolean } = {}): Promise<FeedFetchResult<SolaceFeedSummary[]>> {
  if (!opts.force) {
    if (memoryIndexCache) return { status: 'ok', data: memoryIndexCache };
    const cached = readCache<SolaceFeedSummary[]>(INDEX_CACHE_KEY);
    if (cached) {
      memoryIndexCache = cached;
      return { status: 'ok', data: cached };
    }
  }

  const result = await fetchJson(`${BASE_URL}/EVENT_FEEDS.json`);
  if (!result.ok) {
    return { status: 'error', message: result.notFound ? 'Feed catalog not found' : result.message };
  }
  if (!Array.isArray(result.data)) {
    return { status: 'error', message: 'Unexpected feed catalog format' };
  }
  const feeds = result.data.map(parseFeedSummary).filter((f): f is SolaceFeedSummary => f !== null);
  memoryIndexCache = feeds;
  writeCache(INDEX_CACHE_KEY, feeds);
  return { status: 'ok', data: feeds };
}

export async function fetchFeedDetail(feedName: string, opts: { force?: boolean } = {}): Promise<FeedFetchResult<SolaceFeedDetail>> {
  if (!opts.force) {
    const memo = memoryDetailCache.get(feedName);
    if (memo) return { status: 'ok', data: memo };
    const cached = readCache<SolaceFeedDetail>(detailCacheKey(feedName));
    if (cached) {
      memoryDetailCache.set(feedName, cached);
      return { status: 'ok', data: cached };
    }
  }

  // The rules file needs the feed's own summary metadata (domain, etc.) to
  // fill out SolaceFeedDetail - the index is very likely already cached from
  // populating the feed picker, so this is normally a cache hit, not a
  // second network round trip.
  const indexResult = await fetchFeedIndex();
  const summary = indexResult.status === 'ok' ? indexResult.data.find((f) => f.name === feedName) : undefined;

  const rulesResult = await fetchJson(`${BASE_URL}/${encodeURIComponent(feedName)}/feedrules.json`);
  let rules: SolaceFeedRule[] = [];
  if (rulesResult.ok) {
    rules = Array.isArray(rulesResult.data) ? rulesResult.data.map(parseFeedRule).filter((r): r is SolaceFeedRule => r !== null) : [];
  } else if (!rulesResult.notFound) {
    // A genuine network/parse failure - only treat as a hard error when we
    // also don't even have the feed's basic summary to fall back on.
    if (!summary) return { status: 'error', message: rulesResult.message };
  }
  // rulesResult.notFound (or a non-fatal failure with a summary in hand)
  // falls through to an empty rules list, not an error - some feeds may
  // simply lack a rules file.

  const detail: SolaceFeedDetail = {
    name: feedName,
    description: summary?.description ?? '',
    domain: summary?.domain ?? 'Community',
    img: summary?.img,
    type: summary?.type,
    contributor: summary?.contributor,
    github: summary?.github,
    tags: summary?.tags,
    lastUpdated: summary?.lastUpdated,
    rules,
  };
  memoryDetailCache.set(feedName, detail);
  writeCache(detailCacheKey(feedName), detail);
  return { status: 'ok', data: detail };
}

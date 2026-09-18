import type { TopicTaxonomyVariable } from '@feed-viz/shared';
import type { TopicPreset } from './topicPresets';
import type { SolaceFeedDetail, SolaceFeedRule, FeedRuleValueSpec } from './solaceFeeds';

export const COMMUNITY_FEEDS_THEME = 'Community Feeds (Live)';

const SAMPLE_COUNT = 6;

/** "Barista Station" -> "baristaStation" - used as a namespace prefix, not
 * shown to the user, so it just needs to be a valid identifier. */
function toIdentifier(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'feed';
  return parts.map((p, i) => (i === 0 ? p[0].toLowerCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1))).join('');
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = LOWER.toUpperCase();
const ALPHANUMERIC = LOWER + UPPER + '0123456789';

function randomFrom(pool: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += pool[Math.floor(Math.random() * pool.length)];
  return out;
}

/** Turns one topic parameter's `feedrules.json` rule metadata into a small,
 * fixed sample set - the same "curated sample set" approach the app's own
 * built-in presets already use (see topicPresets.ts's ORDER_IDS etc.), not a
 * live per-message generator (the publish engine only ever expands a topic
 * template once, at add/edit time - see expandTopicTemplate's callers in
 * CanvasContext.tsx). Falls back to generic placeholders for any rule shape
 * this doesn't recognize, rather than throwing - this is scraping a
 * community-maintained, unversioned data source. */
export function generateSampleValues(spec: FeedRuleValueSpec, count = SAMPLE_COUNT): string[] {
  const rule = spec.rule;
  if (!rule || !rule.rule) return Array.from({ length: count }, (_, i) => `value-${i + 1}`);

  switch (rule.rule) {
    case 'enum': {
      const values = Array.isArray(rule.enum) ? rule.enum.map((v) => String(v)) : [];
      return values.length > 0 ? values : Array.from({ length: count }, (_, i) => `value-${i + 1}`);
    }
    case 'countUp': {
      const start = typeof rule.start === 'number' ? rule.start : 1;
      const step = typeof rule.change === 'number' ? rule.change : 1;
      return Array.from({ length: count }, (_, i) => String(start + i * step));
    }
    case 'alpha':
    case 'alphanumeric': {
      const min = typeof rule.minLength === 'number' ? rule.minLength : 6;
      const max = typeof rule.maxLength === 'number' && rule.maxLength >= min ? rule.maxLength : min;
      const pool = rule.rule === 'alphanumeric' ? ALPHANUMERIC : rule.casing === 'upper' ? UPPER : rule.casing === 'lower' ? LOWER : LOWER + UPPER;
      return Array.from({ length: count }, () => randomFrom(pool, min === max ? min : min + Math.floor(Math.random() * (max - min + 1))));
    }
    case 'float':
    case 'number': {
      const min = typeof rule.minimum === 'number' ? rule.minimum : typeof rule.min === 'number' ? rule.min : 0;
      const max = typeof rule.maximum === 'number' ? rule.maximum : typeof rule.max === 'number' ? rule.max : min + 100;
      const digits = typeof rule.fractionDigits === 'number' ? rule.fractionDigits : 0;
      return Array.from({ length: count }, () => (min + Math.random() * (max - min)).toFixed(digits));
    }
    default:
      return Array.from({ length: count }, (_, i) => `value-${i + 1}`);
  }
}

/** Builds a real `TopicPreset` from one feed + one of its topic rules -
 * `feedrules.json`'s `topic` (with `{param}` placeholders) + `topicParameters`
 * is already isomorphic to a preset's `topicTemplate` + `variables`, so
 * every existing helper (`presetWildcardSubscription`, `presetQueueNameBase`)
 * and both panels' existing preset-apply code paths work on the result
 * completely unchanged.
 *
 * Parameter names are renamed to be feed-scoped (`{orderId}` ->
 * `{cf_baristaStation_orderId}`) in both the template and the emitted
 * variable - unlike the built-in presets (which deliberately *share*
 * variables across use cases on purpose), independent feed contributors
 * commonly reuse generic parameter names, and without namespacing, picking
 * two different feeds that both happen to use e.g. `{orderId}` would
 * silently clobber each other's sample values in the global taxonomy. */
export function feedRuleToPreset(feed: SolaceFeedDetail, rule: SolaceFeedRule): TopicPreset {
  const feedSlug = toIdentifier(feed.name);
  const paramNames = Object.keys(rule.topicParameters ?? {});

  let topicTemplate = rule.topic;
  for (const original of paramNames) {
    topicTemplate = topicTemplate.split(`{${original}}`).join(`{cf_${feedSlug}_${original}}`);
  }

  const variables: TopicTaxonomyVariable[] = paramNames.map((original) => ({
    name: `cf_${feedSlug}_${original}`,
    description: `${feed.name} - ${original}`,
    values: generateSampleValues(rule.topicParameters![original]),
    isCustom: false,
  }));

  const useCase = rule.eventName ?? rule.topic;
  return {
    id: `community-${feedSlug}-${useCase.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    theme: COMMUNITY_FEEDS_THEME,
    domain: feed.domain,
    useCase,
    description: rule.eventName ? `${feed.name}: ${rule.eventName}` : feed.name,
    topicTemplate,
    variables,
  };
}

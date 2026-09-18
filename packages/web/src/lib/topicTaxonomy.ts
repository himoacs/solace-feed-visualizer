import type { TopicTaxonomyVariable } from '@feed-viz/shared';

const VARIABLE_PATTERN = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function extractVariables(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    names.add(match[1]);
  }
  return [...names];
}

/** Dependencies before their parents, so a variable's valueMap can be resolved in order. */
function topologicalSortVariables(names: string[], taxonomies: TopicTaxonomyVariable[]): string[] {
  const byName = new Map(taxonomies.map((t) => [t.name, t]));
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    const parent = byName.get(name)?.dependsOn?.variable;
    if (parent && names.includes(parent)) visit(parent);
    ordered.push(name);
  };

  names.forEach(visit);
  return ordered;
}

interface ExpandOptions {
  maxTopics?: number;
}

// A hard ceiling on the INTERMEDIATE cartesian product while it's being
// built, well above any realistic preset's true combination count (the
// largest today, Payment Origination, is ~3,600) - only guards against a
// truly pathological case (a presenter-added custom variable with hundreds
// of values). It's not the normal cap; `maxTopics` (below) is.
const INTERMEDIATE_SAFETY_CEILING = 20000;

/**
 * Expands a `{var}` template into every concrete topic implied by the given
 * taxonomy variables, honoring value-dependencies (a variable whose allowed
 * values depend on a sibling's chosen value). Capped at maxTopics so a
 * template with many high-cardinality variables can't blow up the UI.
 */
export function expandTopicTemplate(
  template: string,
  taxonomies: TopicTaxonomyVariable[],
  options: ExpandOptions = {}
): string[] {
  const maxTopics = options.maxTopics ?? 200;
  const names = extractVariables(template);
  if (names.length === 0) return [template];

  const byName = new Map(taxonomies.map((t) => [t.name, t]));
  const order = topologicalSortVariables(names, taxonomies);

  let combos: Record<string, string>[] = [{}];
  for (const name of order) {
    const variable = byName.get(name);
    if (!variable) continue; // unknown variable - left as a literal placeholder

    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      let values = variable.values;
      const dep = variable.dependsOn;
      if (dep && combo[dep.variable] !== undefined) {
        values = dep.valueMap[combo[dep.variable]] ?? [];
      }
      for (const value of values) {
        next.push({ ...combo, [name]: value });
      }
    }
    // Only trim against the generous safety ceiling here, NOT `maxTopics` -
    // capping every intermediate step at the final `maxTopics` used to
    // starve whichever variables came later in the template: once the
    // running combo count crossed the cap partway through a step, entire
    // earlier-variable combinations got dropped before later variables
    // (e.g. {orderId} in the trade-order preset) ever got a chance to vary
    // for them at all, so most published topics ended up reusing only the
    // first handful of values for every variable after that point. Real
    // truncation (if the FINAL product still exceeds maxTopics) happens
    // once, below, after every variable has had a fair chance to expand.
    combos = next.length > INTERMEDIATE_SAFETY_CEILING ? next.slice(0, INTERMEDIATE_SAFETY_CEILING) : next;
  }

  const topics = combos.slice(0, maxTopics).map((combo) =>
    template.replace(VARIABLE_PATTERN, (_, name: string) => combo[name] ?? `{${name}}`)
  );

  return topics.length > 0 ? topics : [template];
}

export function getNextTopic(topics: string[], currentIndex: number): { topic: string; nextIndex: number } {
  if (topics.length === 0) return { topic: '', nextIndex: 0 };
  const index = currentIndex % topics.length;
  return { topic: topics[index], nextIndex: index + 1 };
}

export function getRandomTopic(topics: string[]): string {
  return topics[Math.floor(Math.random() * topics.length)];
}

// Ported from Solace Lens's "market data" example (packages/api/src/db/index.ts's
// defaultTaxonomies) - a two-level dependency chain: ticker depends on exchange,
// exchange depends on country. Sample topic: marketdata/v1/{country}/{exchange}/{ticker}
export const DEFAULT_TAXONOMY_VARIABLES: TopicTaxonomyVariable[] = [
  {
    name: 'country',
    description: 'Market data: country of the exchange',
    values: ['us', 'uk', 'sg', 'jp', 'hk'],
    isCustom: false,
  },
  {
    name: 'exchange',
    description: 'Stock exchanges',
    values: ['nyse', 'nasdaq', 'lse', 'tse', 'hkex', 'sgx'],
    isCustom: false,
    dependsOn: {
      variable: 'country',
      valueMap: {
        us: ['nyse', 'nasdaq'],
        uk: ['lse'],
        jp: ['tse'],
        hk: ['hkex'],
        sg: ['sgx'],
      },
    },
  },
  {
    name: 'ticker',
    description: 'Stock tickers',
    values: ['ibm', 'aapl', 'msft', 'goog', 'amzn', 'meta', 'tsla', 'nvda'],
    isCustom: false,
    dependsOn: {
      variable: 'exchange',
      valueMap: {
        nyse: ['jpm', 'ko', 'wmt', 'ibm', 'dis'],
        nasdaq: ['aapl', 'msft', 'nvda', 'amzn', 'tsla'],
        lse: ['barc', 'vod', 'shel', 'lloy', 'gsk'],
        tse: ['7203', '9984', '6758', '8306', '7974'],
        hkex: ['700', '5', '941', '388', '1299'],
        sgx: ['D05', 'O39', 'U11', 'Z74', 'S68'],
      },
    },
  },
];

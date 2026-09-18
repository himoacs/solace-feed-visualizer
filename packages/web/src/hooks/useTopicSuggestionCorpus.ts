import { useMemo } from 'react';
import { useCanvas } from '../context/CanvasContext';
import { useTaxonomy } from '../context/TaxonomyContext';
import { expandTopicTemplate, DEFAULT_TAXONOMY_VARIABLES } from '../lib/topicTaxonomy';
import { TOPIC_PRESETS } from '../lib/topicPresets';

const PER_SOURCE_CAP = 40;
const TOTAL_CAP = 500;

/** Picks up to `cap` entries evenly spread across the full list, instead of
 * just the first `cap` - `expandTopicTemplate` generates combinations in
 * nested-loop order (outermost variable varies slowest), so a plain prefix
 * slice of a large product is heavily biased toward the first value of
 * every early variable (e.g. every sample would share the same
 * `orderEventType` and `assetClass`). Striding through the full list instead
 * gives a sample that actually spans the taxonomy's variety. */
function sampleEvenly<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const stride = items.length / cap;
  const sampled: T[] = [];
  for (let i = 0; i < cap; i++) sampled.push(items[Math.floor(i * stride)]);
  return sampled;
}

/**
 * A pool of concrete example topics (no `{var}` placeholders left) a consumer
 * might want to subscribe to - drawn from two sources: every LIVE publisher's
 * topic template expanded against the CURRENT taxonomy variables (so it
 * reflects what that publisher is actually configured to send right now),
 * and every built-in preset expanded against its own bundled variables (so
 * the full known taxonomy is suggestible even before a publisher using it
 * exists). Recomputed only when publishers or taxonomy variables change, not
 * per keystroke - the live filtering in TopicSuggestInput is cheap string
 * matching over this already-built array.
 */
export function useTopicSuggestionCorpus(): string[] {
  const { nodes } = useCanvas();
  const { variables } = useTaxonomy();

  return useMemo(() => {
    const seen = new Set<string>();

    const addSampled = (template: string, taxonomies: typeof variables) => {
      // A deliberately huge maxTopics (expandTopicTemplate's own internal
      // safety ceiling still applies above that) - the full, unbiased
      // product is computed first, then sampled evenly below, rather than
      // letting expandTopicTemplate's own cap take just the first N in
      // nested-loop order (which the default 200 would still do here).
      const full = expandTopicTemplate(template, taxonomies, { maxTopics: 100000 });
      for (const topic of sampleEvenly(full, PER_SOURCE_CAP)) seen.add(topic);
    };

    for (const node of nodes) {
      if (node.kind === 'publisher') addSampled(node.config.topicTemplate, variables);
    }
    for (const preset of TOPIC_PRESETS) {
      addSampled(preset.topicTemplate, [...DEFAULT_TAXONOMY_VARIABLES, ...preset.variables]);
    }

    return [...seen].slice(0, TOTAL_CAP);
  }, [nodes, variables]);
}

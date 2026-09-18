import type { AppNode, ConsumerConfig, PublisherConfig, TopicTaxonomyVariable } from '@feed-viz/shared';

// Deliberately excludes BrokerConnection (that would mean shipping SEMP
// credentials in a file meant to be shared/saved) and every runtime-only
// AppNode field (status, clientUsername, message counters) - those get
// freshly assigned when a scenario is re-provisioned on import, exactly as
// if the user had clicked "Add to Canvas" themselves for each node.

export interface ScenarioPublisherNode {
  kind: 'publisher';
  name: string;
  position: { x: number; y: number };
  config: PublisherConfig;
}

export interface ScenarioConsumerNode {
  kind: 'consumer';
  name: string;
  position: { x: number; y: number };
  config: ConsumerConfig;
}

export type ScenarioNode = ScenarioPublisherNode | ScenarioConsumerNode;

export interface ScenarioFile {
  version: 1;
  savedAt: string;
  taxonomy: TopicTaxonomyVariable[];
  nodes: ScenarioNode[];
}

function toScenarioNode(n: AppNode): ScenarioNode {
  // Branched explicitly (rather than a single object-literal map) so
  // TypeScript keeps `kind` and `config` correlated - a mapped literal loses
  // that and widens `config` back to the full union.
  return n.kind === 'publisher'
    ? { kind: 'publisher', name: n.name, position: n.position, config: n.config }
    : { kind: 'consumer', name: n.name, position: n.position, config: n.config };
}

export function buildScenarioFile(taxonomy: TopicTaxonomyVariable[], nodes: AppNode[]): ScenarioFile {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    taxonomy,
    nodes: nodes.map(toScenarioNode),
  };
}

export function downloadScenarioFile(scenario: ScenarioFile): void {
  const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = scenario.savedAt.replace(/[:.]/g, '-');
  a.download = `feed-visualizer-scenario-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export class ScenarioParseError extends Error {}

export function parseScenarioFile(text: string): ScenarioFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScenarioParseError('Not valid JSON');
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as ScenarioFile).nodes) ||
    !Array.isArray((data as ScenarioFile).taxonomy)
  ) {
    throw new ScenarioParseError("Doesn't look like a Feed Visualizer scenario file");
  }
  return data as ScenarioFile;
}

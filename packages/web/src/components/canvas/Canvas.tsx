import { useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import { useCanvas } from '../../context/CanvasContext';
import { BROKER_POSITION } from '../../lib/canvasLayout';
import { BrokerNode } from './BrokerNode';
import { PublisherNodeView } from './PublisherNodeView';
import { ConsumerNodeView } from './ConsumerNodeView';
import { QueueNode } from './QueueNode';
import { DiscardNode } from './DiscardNode';
import { FlowParticles } from './FlowParticles';

const nodeTypes = {
  broker: BrokerNode,
  publisher: PublisherNodeView,
  consumer: ConsumerNodeView,
  queue: QueueNode,
  discard: DiscardNode,
};

const BROKER_NODE: Node = {
  id: 'broker',
  type: 'broker',
  position: BROKER_POSITION,
  draggable: true,
  data: {},
};

const DISCARD_NODE_ID = 'discard-sink';
// Center (360, 480) - same column as the broker (center (360, 360)) for a
// straight vertical particle path, one full grid cell (120) below it so it
// also lands on a grid intersection, not an arbitrary offset.
const DEFAULT_DISCARD_POSITION = { x: BROKER_POSITION.x + 12, y: BROKER_POSITION.y + 132 };

function queueNodeId(consumerNodeId: string): string {
  return `queue-${consumerNodeId}`;
}

// The Sunburst split panel is a real flex sibling (see App.tsx), not an
// overlay, so the canvas container genuinely shrinks when it opens. React
// Flow's own ResizeObserver keeps rendering correct either way, but the
// diagram itself doesn't recenter on its own - re-run fitView so the broker/
// nodes visibly re-fit the new width instead of drifting toward (or under)
// the panel's edge.
export function Canvas({ sunburstOpen, onOpenBrokerConnection }: { sunburstOpen: boolean; onOpenBrokerConnection: () => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner sunburstOpen={sunburstOpen} onOpenBrokerConnection={onOpenBrokerConnection} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ sunburstOpen, onOpenBrokerConnection }: { sunburstOpen: boolean; onOpenBrokerConnection: () => void }) {
  const { fitView } = useReactFlow();
  const { nodes: appNodes } = useCanvas();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([BROKER_NODE]);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>([]);
  // Read inside the debounced fitView calls below instead of rfNodes
  // directly, so those calls always see the latest node list without
  // re-subscribing their effects on every node change.
  const rfNodesRef = useRef<Node[]>(rfNodes);
  rfNodesRef.current = rfNodes;

  // The discard sink is a permanent fixture, not part of the diagram the
  // user is actually building - fitting the view around it too pulls the
  // centroid down (it always sits below the broker), which visibly pushes
  // the broker up and off-center especially in the empty starting state
  // where it's the only other node. Fit around everything BUT the sink so
  // the broker (and whatever real nodes exist) stay properly centered.
  const fitViewToRealNodes = () => {
    const nodes = rfNodesRef.current.filter((n) => n.id !== DISCARD_NODE_ID).map((n) => ({ id: n.id }));
    fitView({ nodes, duration: 400, padding: 0.2 });
  };

  useEffect(() => {
    setRfNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      const brokerNode = byId.get('broker') ?? BROKER_NODE;
      const next: Node[] = [
        brokerNode,
        {
          id: DISCARD_NODE_ID,
          type: 'discard',
          position: byId.get(DISCARD_NODE_ID)?.position ?? DEFAULT_DISCARD_POSITION,
          draggable: true,
          data: { sunburstOpen },
        },
      ];

      for (const appNode of appNodes) {
        const existing = byId.get(appNode.id);
        const isQueueConsumer = appNode.kind === 'consumer' && appNode.config.mode === 'queue';

        if (isQueueConsumer) {
          const qId = queueNodeId(appNode.id);
          const existingQueue = byId.get(qId);
          const midpoint = {
            x: (brokerNode.position.x + appNode.position.x) / 2,
            y: (brokerNode.position.y + appNode.position.y) / 2,
          };
          next.push({
            id: qId,
            type: 'queue',
            position: existingQueue?.position ?? midpoint,
            draggable: true,
            data: { consumerNode: appNode },
          });
        }

        next.push({
          id: appNode.id,
          type: appNode.kind,
          position: existing?.position ?? appNode.position,
          data: { appNode },
          draggable: true,
        });
      }
      return next;
    });

    setRfEdges(
      appNodes.map((appNode) => {
        if (appNode.kind === 'publisher') {
          return {
            id: `e-${appNode.id}`,
            source: appNode.id,
            sourceHandle: 'out',
            target: 'broker',
            targetHandle: 'in',
            animated: appNode.status === 'running',
            style: { stroke: '#00C895' },
          };
        }
        if (appNode.config.mode === 'queue') {
          const qId = queueNodeId(appNode.id);
          // Two hops for a queue-bound consumer: broker->queue (spooling,
          // fires on every matching publish regardless of consumer state)
          // and queue->consumer (actual drain, fires on real delivery) -
          // represented here as ONE edge broker->consumer routed visually
          // through the queue node's position isn't accurate enough, so this
          // is genuinely two edges.
          return [
            {
              id: `e-${appNode.id}-in`,
              source: 'broker',
              sourceHandle: 'out',
              target: qId,
              targetHandle: 'in',
              animated: appNode.status === 'running',
              style: { stroke: '#C2F7FF' },
            },
            {
              id: `e-${appNode.id}-out`,
              source: qId,
              sourceHandle: 'out',
              target: appNode.id,
              targetHandle: 'in',
              animated: appNode.status === 'running',
              style: { stroke: '#C2F7FF' },
            },
          ];
        }
        return {
          id: `e-${appNode.id}`,
          source: 'broker',
          sourceHandle: 'out',
          target: appNode.id,
          targetHandle: 'in',
          animated: appNode.status === 'running',
          style: { stroke: '#C2F7FF' },
        };
      }).flat()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appNodes, sunburstOpen]);

  // Re-fit whenever a node is added or removed (more nodes need more room,
  // and previously-visible ones shouldn't end up crowded off-screen). Keyed
  // on node count, not the node list itself, so dragging a node around
  // doesn't fight the user by re-fitting on every position change.
  const nodeCount = rfNodes.length;
  useEffect(() => {
    const timer = setTimeout(fitViewToRealNodes, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount, fitView]);

  // Re-fit whenever the canvas's own container box actually changes size -
  // the Sunburst panel toggling open/closed AND its drag-to-resize handle
  // both change this container's width, so a single ResizeObserver (rather
  // than threading sunburstOpen and a separately-lifted panel width through
  // props) correctly covers both. Debounced so a fast drag or the panel's
  // own open/close transition only triggers one fitView once things settle,
  // not one per intermediate frame.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(fitViewToRealNodes, 150);
    });
    observer.observe(el);
    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitView]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        // Double-clicking blank canvas normally zooms in (react-flow's
        // default) - that same pane-level dblclick-to-zoom gesture also
        // swallows the event before it ever reaches onNodeDoubleClick, so
        // it has to be turned off for the broker node's double-click-to-
        // open-Broker-Connection below to fire at all.
        zoomOnDoubleClick={false}
        onNodeDoubleClick={(_event, node) => {
          if (node.id === 'broker') onOpenBrokerConnection();
        }}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background id="dots" color="#ffffff10" gap={24} />
        {/* A coarser ruler-line grid on top of the dot texture, for lining
            nodes up while dragging - stacking multiple Background components
            (each needs its own id) is the supported way to combine variants. */}
        <Background id="ruler" variant={BackgroundVariant.Lines} color="#ffffff0d" gap={120} lineWidth={1} />
        <Controls className="!border !border-white/10 !bg-solace-blue-deep" />
        <FlowParticles />
      </ReactFlow>
    </div>
  );
}

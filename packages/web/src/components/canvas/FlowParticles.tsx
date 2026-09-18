import { useEffect, useRef } from 'react';
import { useStoreApi } from '@xyflow/react';
import { messageFlowBus, type FlowEvent } from '../../lib/messageFlowBus';
import { topicColor } from '../../lib/topicColor';

// Matches the actual rendered sizes (BrokerNode's h-16 w-16, PublisherNodeView/
// ConsumerNodeView's w-40 with the Handle sitting in the fixed-height header
// row, QueueNode's w-28 cylinder card, DiscardNode's h-10 w-10 circle) closely
// enough that a particle visibly rides the same edge the arrow is drawn on -
// exact pixel-perfect handle tracking isn't worth the extra internal-API
// dependency.
const BROKER_SIZE = 64;
const APP_NODE_WIDTH = 160;
const APP_NODE_HANDLE_Y = 18;
const QUEUE_NODE_CENTER = { x: 56, y: 38 }; // single anchor point, not side-specific
const DISCARD_NODE_CENTER = { x: 20, y: 20 };

const MAX_PARTICLES = 400;
const PARTICLE_DURATION_MS = 650;
const NACK_DURATION_MS = 900;

interface Particle {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
  duration: number;
  color: string;
  kind: 'normal' | 'nack';
}

function queueNodeId(consumerNodeId: string): string {
  return `queue-${consumerNodeId}`;
}

export function FlowParticles() {
  const store = useStoreApi();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);

  const anchorFor = (nodeId: string, side: 'in' | 'out' | 'bottom'): { x: number; y: number } | null => {
    const node = store.getState().nodeLookup.get(nodeId);
    if (!node) return null;
    const { x, y } = node.position;
    if (node.type === 'broker') {
      if (side === 'in') return { x, y: y + BROKER_SIZE / 2 };
      // Discards leave from the broker's bottom, not its right side - the
      // right side is already the "out" edge toward direct/queue consumers,
      // and routing discards through the same point made the two paths cross
      // and look tangled.
      if (side === 'bottom') return { x: x + BROKER_SIZE / 2, y: y + BROKER_SIZE };
      return { x: x + BROKER_SIZE, y: y + BROKER_SIZE / 2 };
    }
    if (node.type === 'queue') {
      return { x: x + QUEUE_NODE_CENTER.x, y: y + QUEUE_NODE_CENTER.y };
    }
    if (node.type === 'discard') {
      return { x: x + DISCARD_NODE_CENTER.x, y: y + DISCARD_NODE_CENTER.y };
    }
    return side === 'out' ? { x: x + APP_NODE_WIDTH, y: y + APP_NODE_HANDLE_Y } : { x, y: y + APP_NODE_HANDLE_Y };
  };

  const spawn = (from: { x: number; y: number } | null, to: { x: number; y: number } | null, color: string, kind: 'normal' | 'nack' = 'normal') => {
    if (!from || !to) return;
    const particles = particlesRef.current;
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      start: performance.now(),
      duration: kind === 'nack' ? NACK_DURATION_MS : PARTICLE_DURATION_MS,
      color,
      kind,
    });
  };

  useEffect(() => {
    return messageFlowBus.subscribe((event: FlowEvent) => {
      switch (event.kind) {
        case 'publish':
          spawn(anchorFor(event.nodeId, 'out'), anchorFor('broker', 'in'), topicColor(event.topic));
          break;
        case 'deliver': {
          const hasQueue = store.getState().nodeLookup.has(queueNodeId(event.nodeId));
          spawn(
            anchorFor(hasQueue ? queueNodeId(event.nodeId) : 'broker', 'out'),
            anchorFor(event.nodeId, 'in'),
            topicColor(event.topic)
          );
          break;
        }
        case 'queue-arrival':
          spawn(anchorFor('broker', 'out'), anchorFor(queueNodeId(event.nodeId), 'in'), topicColor(event.topic));
          break;
        case 'discarded':
          // A discard is a discard regardless of topic - deliberately not
          // topic-colored, so it always reads as distinct from a normal send.
          spawn(anchorFor('broker', 'bottom'), anchorFor('discard-sink', 'in'), 'hsl(0, 70%, 55%)');
          break;
        case 'nacked':
          spawn(anchorFor(event.nodeId, 'out'), anchorFor('broker', 'in'), '#ef4444', 'nack');
          break;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf: number;

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const [vx, vy, zoom] = store.getState().transform;
        const now = performance.now();
        const alive: Particle[] = [];

        for (const p of particlesRef.current) {
          const t = (now - p.start) / p.duration;
          if (t >= 1) continue;
          alive.push(p);

          if (p.kind === 'nack') {
            // Travels only partway then bursts (an expanding, fading ring) in
            // place instead of completing the hop - visually distinct from a
            // normal successful send, no per-topic color needed (a nack is a nack).
            const reachFraction = 0.35;
            const travelT = Math.min(t / 0.4, 1);
            const flowX = p.fromX + (p.toX - p.fromX) * reachFraction * travelT;
            const flowY = p.fromY + (p.toY - p.fromY) * reachFraction * travelT;
            const screenX = flowX * zoom + vx;
            const screenY = flowY * zoom + vy;
            const burstT = Math.max(0, (t - 0.4) / 0.6);
            const radius = (3.5 + burstT * 10) * Math.min(zoom, 1.3);

            ctx.beginPath();
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = Math.max(0, 1 - burstT);
            ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            const flowX = p.fromX + (p.toX - p.fromX) * t;
            const flowY = p.fromY + (p.toY - p.fromY) * t;
            const screenX = flowX * zoom + vx;
            const screenY = flowY * zoom + vy;
            const fadeIn = Math.min(t / 0.1, 1);
            const fadeOut = t > 0.8 ? (1 - t) / 0.2 : 1;

            ctx.beginPath();
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.min(fadeIn, fadeOut);
            ctx.arc(screenX, screenY, 3.5 * Math.min(zoom, 1.3), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        particlesRef.current = alive;
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

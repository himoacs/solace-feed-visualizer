import type { NodeStatus } from '@feed-viz/shared';

const STATUS_COLOR: Record<NodeStatus, string> = {
  idle: 'bg-white/30',
  provisioning: 'bg-solace-orange animate-pulse',
  connecting: 'bg-solace-orange animate-pulse',
  running: 'bg-solace-green',
  paused: 'bg-solace-blue-sky',
  error: 'bg-red-500',
};

export function StatusDot({ status }: { status: NodeStatus }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLOR[status]}`} />;
}

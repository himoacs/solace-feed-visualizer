import { Handle, Position } from '@xyflow/react';
import solaceIcon from '../../assets/solace-icon.svg';

export function BrokerNode() {
  return (
    <div className="relative flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-full border-2 border-sc-nav bg-white shadow-[0_1px_3px_rgba(12,45,74,0.18)]">
      <Handle type="target" position={Position.Left} id="in" className="!bg-sc-select" />
      <Handle type="source" position={Position.Right} id="out" className="!bg-sc-select" />
      <img src={solaceIcon} alt="" className="h-6 w-6 rounded" />
      <span className="text-[7px] font-medium uppercase tracking-wide text-sc-muted">Broker</span>
    </div>
  );
}

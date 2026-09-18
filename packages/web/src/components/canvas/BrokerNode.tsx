import { Handle, Position } from '@xyflow/react';
import solaceIcon from '../../assets/solace-icon.svg';

export function BrokerNode() {
  return (
    <div className="relative flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-full border-2 border-solace-green bg-solace-gradient-deep shadow-[0_0_20px_rgba(0,200,149,0.25)]">
      <Handle type="target" position={Position.Left} id="in" className="!bg-solace-green" />
      <Handle type="source" position={Position.Right} id="out" className="!bg-solace-green" />
      <img src={solaceIcon} alt="" className="h-6 w-6 rounded shadow-md" />
      <span className="text-[7px] uppercase tracking-wide text-solace-green">Broker</span>
    </div>
  );
}

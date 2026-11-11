import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

type SetNode = Node<{ label: string }, 'setSlot'>
export function SetSlotNode({ data, isConnectable }: NodeProps<SetNode>) {
  return <div className="switch-node"><Handle type="target" position={Position.Left}/><strong>{data.label}</strong><div className="switch-node-outputs">{[{ id: 'next', label: 'Далее' }, { id: 'error', label: 'Ошибка' }].map(output => <div className="switch-node-output" key={output.id}><span>{output.label}</span><Handle type="source" position={Position.Right} id={output.id} isConnectable={isConnectable}/></div>)}</div></div>
}

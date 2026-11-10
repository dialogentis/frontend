import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

export type AskFlowNode = Node<{ label: string }, 'askSlot'>
const outputs = [{ id: 'success', label: 'Получено' }, { id: 'invalid', label: 'Неверное значение' }, { id: 'exhausted', label: 'Попытки закончились' }]

export function AskNode({ data, isConnectable }: NodeProps<AskFlowNode>) {
  return <div className="switch-node"><Handle type="target" position={Position.Left}/><strong>{data.label}</strong><div className="switch-node-outputs">{outputs.map(output => <div className="switch-node-output" key={output.id}><span>{output.label}</span><Handle type="source" position={Position.Right} id={output.id} isConnectable={isConnectable}/></div>)}</div></div>
}

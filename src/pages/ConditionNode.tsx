import { useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

type ConditionNodeType = Node<{ label: string; branches: { id: string; label: string }[] }, 'condition'>
export function ConditionNode({ id, data, isConnectable }: NodeProps<ConditionNodeType>) {
  const update = useUpdateNodeInternals()
  const handles = data.branches.map(branch => branch.id).join(',')
  useEffect(() => { update(id) }, [id, handles, update])
  return <div className="switch-node"><Handle type="target" position={Position.Left}/><strong>{data.label}</strong><div className="switch-node-outputs">{[...data.branches, { id: 'else', label: 'Иначе' }].map(branch => <div className="switch-node-output" key={branch.id}><span>{branch.label}</span><Handle type="source" position={Position.Right} id={branch.id} isConnectable={isConnectable}/></div>)}</div></div>
}

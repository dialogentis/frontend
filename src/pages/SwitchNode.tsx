import { useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

type SwitchData = { label: string; intents: { id: string; name: string; enabled: boolean }[] }
export type SwitchFlowNode = Node<SwitchData, 'intentSwitch'>

export function SwitchNode({ id, data, isConnectable }: NodeProps<SwitchFlowNode>) {
  const update = useUpdateNodeInternals()
  useEffect(() => { update(id) }, [id, data.intents, update])
  return <div className="switch-node"><Handle type="target" position={Position.Left}/><strong>{data.label}</strong><div className="switch-node-outputs">{data.intents.map(intent => <div className="switch-node-output" key={intent.id}><span>{intent.name}{!intent.enabled && ' · отключено'}</span><Handle type="source" position={Position.Right} id={intent.id} isConnectable={isConnectable && intent.enabled}/></div>)}<div className="switch-node-output"><span>Не распознано</span><Handle type="source" position={Position.Right} id="fallback" isConnectable={isConnectable}/></div></div></div>
}

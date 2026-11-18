import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { useEffect } from 'react'

export function handoffOutputs(mode: unknown) {
  const error = { id: 'error', label: 'Ошибка передачи' }
  return mode === 'transfer' ? [error] : [{ id: 'returned', label: 'Возврат' }, error]
}

export function HandoffNode({ id, data, isConnectable }: NodeProps<Node<{ label: string; transfer: boolean }, 'handoff'>>) {
  const update = useUpdateNodeInternals()
  useEffect(() => { update(id) }, [id, data.transfer, update])
  return <div className="switch-node">
    <Handle type="target" position={Position.Left}/>
    <strong>{data.label}</strong>
    <div className="switch-node-outputs">{handoffOutputs(data.transfer ? 'transfer' : 'call').map(output =>
      <div className="switch-node-output" key={output.id}>
        <span>{output.label}</span><Handle type="source" position={Position.Right} id={output.id} isConnectable={isConnectable}/>
      </div>)}</div>
  </div>
}

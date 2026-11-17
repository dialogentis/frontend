import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

export const httpOutputs = [
  { id: 'success', label: 'Успешно' },
  { id: 'http_error', label: 'Ошибка запроса' },
  { id: 'timeout', label: 'Время истекло' },
  { id: 'invalid_response', label: 'Некорректный ответ' },
  { id: 'unknown_result', label: 'Результат неизвестен' },
] as const

export function HttpActionNode({ data, isConnectable }: NodeProps<Node<{ label: string }, 'httpAction'>>) {
  return <div className="switch-node"><Handle type="target" position={Position.Left}/><strong>{data.label}</strong><div className="switch-node-outputs">{httpOutputs.map(output => <div className="switch-node-output" key={output.id}><span>{output.label}</span><Handle type="source" position={Position.Right} id={output.id} isConnectable={isConnectable}/></div>)}</div></div>
}

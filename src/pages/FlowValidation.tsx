import { useState, type ReactNode } from 'react'
import { api, check } from '../api'
import type { components } from '../api/schema'

type Flow = components['schemas']['Flow']
type FlowNode = components['schemas']['FlowNode']
type Result = components['schemas']['FlowValidationView']
type Issue = components['schemas']['ValidationIssue']

export function FlowValidation({ orgId, agentId, revision, enabled, flow, names, onSelect, onSlots, children }: { orgId: string; agentId: string; revision: number; enabled: boolean; flow: Flow; names: Record<FlowNode['type'], string>; onSelect: (id: string) => void; onSlots: () => void; children: ReactNode }) {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const checkFlow = async () => {
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/draft/flow/validate', { params: { path: { org_id: orgId, agent_id: agentId } }, body: { revision }, signal: AbortSignal.timeout(10_000) })
      check(response.response, response.error)
      if (!response.data) throw new Error('Некорректный ответ сервера')
      setResult(response.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось проверить сценарий') }
    finally { setBusy(false) }
  }
  const fresh = result && enabled && result.revision === revision ? result : null
  const target = (issue: Issue) => {
    const [, collection, index] = issue.path
    if (typeof index !== 'number') return null
    if (collection === 'nodes') return flow.nodes[index] || null
    if (collection === 'edges') {
      const edge = flow.edges[index]
      return edge ? flow.nodes.find(node => node.id === edge.source) || flow.nodes.find(node => node.id === edge.target) || null : null
    }
    return null
  }
  return <section className="flow-validation" aria-label="Проверка сценария">
    <div className="draft-flow-navigation">{children}
      <button type="button" className="button button-quiet" disabled={!enabled || busy} onClick={() => void checkFlow()}>{busy ? 'Проверка…' : 'Проверить сценарий'}</button>
      {!enabled && <span className="field-help">Дождитесь сохранения изменений.</span>}
    </div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {result && !fresh && <p className="field-help">Сценарий изменился. Повторите проверку после сохранения.</p>}
    {fresh && <div className="flow-validation-result"><p role="status"><strong>{fresh.errors.length ? `Ошибок: ${fresh.errors.length}` : 'Ошибок в проверенных элементах нет'} · Предупреждений: {fresh.warnings.length}{fresh.truncated ? '+' : ''}</strong></p><p className="field-help">Проверены связи, начало, доступность блоков, тексты ответов и часть циклов. Остальные настройки и готовность к публикации пока не проверены.</p>{fresh.truncated && <p className="field-help">Показана только часть результатов.</p>}{(['errors', 'warnings'] as const).map(kind => fresh[kind].length > 0 && <div key={kind}><h3>{kind === 'errors' ? 'Ошибки' : 'Предупреждения'}</h3><ul>{fresh[kind].map((issue, index) => { const node = target(issue); return <li key={`${kind}-${index}`}><span>{issue.message}</span>{node && <button type="button" className="button button-text" onClick={() => onSelect(node.id)}>Открыть блок {names[node.type]}</button>}{issue.path[0] === 'slots' && <button type="button" className="button button-text" onClick={onSlots}>Открыть параметры</button>}</li> })}</ul></div>)}</div>}
  </section>
}

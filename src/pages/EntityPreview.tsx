import { useEffect, useRef, useState } from 'react'
import { api, check } from '../api'
import type { components } from '../api/schema'

type Preview = components['schemas']['Preview']

export function EntityPreview({ orgId, agentId, entityId, revision, enabled }: { orgId: string; agentId: string; entityId: string; revision: number; enabled: boolean }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => { if (!enabled) { request.current?.abort(); setResult(null); setError(''); setBusy(false) } }, [enabled])
  useEffect(() => { request.current?.abort(); setResult(null); setError(''); setBusy(false) }, [revision, entityId])
  useEffect(() => () => request.current?.abort(), [])
  const run = async () => {
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/draft/entities/{entity_id}/preview', { params: { path: { org_id: orgId, agent_id: agentId, entity_id: entityId } }, body: { revision, text }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
      check(response.response, response.error)
      if (!response.data) throw new Error('Некорректный ответ сервера')
      if (!controller.signal.aborted) setResult(response.data)
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Не удалось проверить сущность') }
    finally { if (request.current === controller) setBusy(false) }
  }
  return <section className="entity-preview"><h4>Проверить на примере</h4><label className="field-label">Текст для проверки<textarea name="entity_preview_text" rows={3} maxLength={4000} value={text} onChange={event => { const value = event.target.value; if (Array.from(value).length <= 2000) { request.current?.abort(); setText(value); setResult(null); setError(''); setBusy(false) } }}/></label><button type="button" className="button button-quiet" disabled={!enabled || !text || busy} onClick={() => void run()}>{busy ? 'Проверка…' : 'Проверить сущность'}</button>{!enabled && <p className="field-help">Дождитесь сохранения или войдите с правами редактора.</p>}{error && <p role="alert" className="auth-error">{error}</p>}{result && <div role="status" className="entity-preview-results">{result.matches.length ? result.matches.map((match, index) => <p key={index}><strong>{match.text}</strong> · {match.error ? 'Не удалось преобразовать значение' : typeof match.value === 'boolean' ? (match.value ? 'да' : 'нет') : String(match.value)}</p>) : <p>Совпадений не найдено.</p>}{result.truncated && <p className="field-help">Показаны первые 100 совпадений.</p>}</div>}</section>
}

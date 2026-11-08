import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api, check } from '../api'
import type { components } from '../api/schema'

type Draft = components['schemas']['DraftView']
type Config = components['schemas']['DraftConfig']
type Intent = components['schemas']['Intent']
type Example = components['schemas']['Example']

function phraseCount(count: number): string {
  const mod10 = count % 10, mod100 = count % 100
  return `${count} ${mod100 >= 11 && mod100 <= 14 ? 'фраз' : mod10 === 1 ? 'фраза' : mod10 >= 2 && mod10 <= 4 ? 'фразы' : 'фраз'}`
}

export function containsReference(value: unknown, target: string): boolean {
  if (typeof value === 'string') return value === target
  if (Array.isArray(value)) return value.some(item => containsReference(item, target))
  if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) => key === target || containsReference(item, target))
  return false
}

export function IntentPanel({ orgId, agentId, draft, editable, update }: { orgId: string; agentId: string; draft: Draft; editable: boolean; update: (mutate: (config: Config) => Config) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const dataset = useQuery({ queryKey: ['dataset', orgId, agentId], queryFn: async () => {
    const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/draft/dataset', { params: { path: { org_id: orgId, agent_id: agentId } } }); check(result.response, result.error)
    if (!result.data) throw new Error('Некорректный ответ сервера')
    return result.data
  }, staleTime: 0 })
  useEffect(() => { if (dataset.data?.revision === draft.revision) setVerified(true) }, [dataset.data, draft.revision])
  if (!verified && dataset.isLoading) return <p role="status">Загрузка намерений…</p>
  if (!verified && dataset.isError) return <div className="data-state"><h2>Не удалось открыть данные агента</h2><p>Повторите попытку или обратитесь к администратору пространства.</p><button className="button button-quiet" onClick={() => dataset.refetch()}>Повторить</button></div>
  if (!verified) return <div className="data-state"><h2>Черновик изменился</h2><p>Обновите страницу после сохранения локальных изменений.</p><button className="button button-quiet" onClick={() => dataset.refetch()}>Повторить</button></div>
  const intents = draft.config.intents as unknown as Intent[]
  const examples = draft.config.examples as unknown as Example[]
  const counts = new Map<string, number>()
  for (const example of examples) if (example.intent_id) counts.set(example.intent_id, (counts.get(example.intent_id) || 0) + 1)
  const current = intents.find(intent => intent.id === selected)
  const invalidCode = current ? !/^[a-z][a-z0-9_]{1,63}$/.test(current.code) || intents.some(intent => intent.id !== current.id && intent.code === current.code) : false
  const updateIntent = (id: string, patch: Partial<Intent>) => { setError(''); update(config => ({ ...config, intents: (config.intents as unknown as Intent[]).map(intent => intent.id === id ? { ...intent, ...patch } : intent) })) }
  const add = () => {
    const id = crypto.randomUUID()
    const item: Intent = { id, code: `intent_${id.replaceAll('-', '').slice(0, 12)}`, name: 'Новое намерение', description: '', enabled: true }
    update(config => ({ ...config, intents: [...config.intents, item] })); setSelected(id); setError('')
  }
  const remove = (intent: Intent) => {
    const used = examples.filter(example => example.intent_id === intent.id).length
    if (used || containsReference(draft.config.flow, intent.id)) { setError('Намерение используется в примерах или сценарии. Сначала удалите связанные элементы.'); return }
    if (!window.confirm(`Удалить намерение «${intent.name}»?`)) return
    update(config => ({ ...config, intents: (config.intents as unknown as Intent[]).filter(item => item.id !== intent.id) })); setSelected(null); setError('')
  }
  return <div className="intent-panel"><div className="section-heading"><div><h2>Намерения</h2><p>Определите, какие запросы должен различать агент.</p></div>{editable && <button className="button button-primary" disabled={intents.length >= 100} onClick={add}><Plus size={16}/>Добавить намерение</button>}</div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {!intents.length ? <div className="data-state"><h2>Намерений пока нет</h2><p>Добавьте первое намерение, чтобы начать подготовку фраз.</p></div> : <div className="intent-layout"><div className="intent-list" aria-label="Список намерений">{intents.map(intent => <button type="button" key={intent.id} aria-pressed={selected === intent.id} onClick={() => { setSelected(intent.id); setError('') }}><strong>{intent.name}</strong><span>{intent.code} · {phraseCount(counts.get(intent.id) || 0)}</span></button>)}</div><div className="intent-detail">{current ? <><h3>Настройки намерения</h3><label className="field-label">Название<input name="intent_name" maxLength={120} aria-invalid={!current.name.trim()} disabled={!editable} value={current.name} onChange={event => updateIntent(current.id, { name: event.target.value })}/>{!current.name.trim() && <span className="field-help error-text">Укажите название намерения.</span>}</label><label className="field-label">Код<input name="intent_code" maxLength={64} aria-invalid={invalidCode} disabled={!editable} value={current.code} onChange={event => updateIntent(current.id, { code: event.target.value })}/><span className={`field-help ${invalidCode ? 'error-text' : ''}`}>{invalidCode ? 'Укажите уникальный код из 2–64 символов, начиная с латинской буквы.' : 'Латинские буквы, цифры и знак подчёркивания.'}</span></label><label className="field-label">Описание<textarea name="intent_description" maxLength={2000} rows={4} disabled={!editable} value={current.description || ''} onChange={event => updateIntent(current.id, { description: event.target.value })}/></label><label className="intent-enabled"><input type="checkbox" checked={current.enabled !== false} disabled={!editable} onChange={event => updateIntent(current.id, { enabled: event.target.checked })}/>Учитывать при обучении</label>{editable && <button className="button danger-button" onClick={() => remove(current)}><Trash2 size={15}/>Удалить намерение</button>}</> : <p className="muted">Выберите намерение, чтобы настроить его.</p>}</div></div>}
  </div>
}

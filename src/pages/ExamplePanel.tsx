import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api, check } from '../api'
import type { components } from '../api/schema'
import { codePointOffset } from '../textOffsets'

type Draft = components['schemas']['DraftView']
type Config = components['schemas']['DraftConfig']
type Example = components['schemas']['Example']
type Entity = components['schemas']['Entity']
type Intent = components['schemas']['Intent']

export function ExamplePanel({ orgId, agentId, draft, editable, update }: { orgId: string; agentId: string; draft: Draft; editable: boolean; update: (mutate: (config: Config) => Config) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [entityId, setEntityId] = useState('')
  const [search, setSearch] = useState('')
  const [split, setSplit] = useState<'all' | 'train' | 'test'>('all')
  const [intentFilter, setIntentFilter] = useState('all')
  const [limit, setLimit] = useState(50)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const selection = useRef<{ start: number; end: number } | null>(null)
  const dataset = useQuery({ queryKey: ['dataset', orgId, agentId], queryFn: async () => {
    const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/draft/dataset', { params: { path: { org_id: orgId, agent_id: agentId } } }); check(result.response, result.error)
    if (!result.data) throw new Error('Некорректный ответ сервера')
    return result.data
  }, staleTime: 0 })
  useEffect(() => { if (dataset.data?.revision === draft.revision) setVerified(true) }, [dataset.data, draft.revision])
  if (!verified && dataset.isFetching) return <p role="status">Загрузка примеров…</p>
  if (!verified && dataset.isError) return <div className="data-state"><h2>Не удалось открыть данные агента</h2><p>Повторите попытку или обратитесь к администратору пространства.</p><button className="button button-quiet" onClick={() => dataset.refetch()}>Повторить</button></div>
  if (!verified) return <div className="data-state"><h2>Черновик изменился</h2><p>Обновите страницу после сохранения локальных изменений.</p><button className="button button-quiet" onClick={() => dataset.refetch()}>Повторить</button></div>
  const examples = draft.config.examples as unknown as Example[]
  const intents = draft.config.intents as unknown as Intent[]
  const entities = draft.config.entities as unknown as Entity[]
  const current = examples.find(example => example.id === selected)
  const filtered = examples.filter(example => (split === 'all' || example.split === split) && (intentFilter === 'all' || (intentFilter === 'unknown' ? example.expected_fallback : example.intent_id === intentFilter)) && example.text.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')))
  const patch = (id: string, changes: Partial<Example>) => { setError(''); update(config => ({ ...config, examples: (config.examples as unknown as Example[]).map(example => example.id === id ? { ...example, ...changes } : example) })) }
  const add = () => {
    const intent = intents[0]
    const example: Example = { id: crypto.randomUUID(), text: '', intent_id: intent?.id || null, expected_fallback: !intent, split: intent ? 'train' : 'test', spans: [] }
    update(config => ({ ...config, examples: [...config.examples, example] })); setSelected(example.id); setSplit('all'); setIntentFilter('all'); setSearch(''); setLimit(50); setError(''); selection.current = null
  }
  const remove = (example: Example) => {
    if (!window.confirm('Удалить этот пример?')) return
    update(config => ({ ...config, examples: (config.examples as unknown as Example[]).filter(item => item.id !== example.id) })); setSelected(null); setError(''); selection.current = null
  }
  const changeText = (example: Example, value: string) => {
    if (Array.from(value).length > 2000) { setError('Фраза не должна превышать 2000 символов.'); return }
    selection.current = null
    patch(example.id, { text: value })
  }
  const annotate = () => {
    if (!current || !selection.current || !entityId) { setError('Выделите текст и выберите сущность.'); return }
    const start = codePointOffset(current.text, selection.current.start), end = codePointOffset(current.text, selection.current.end)
    if (start === null || end === null || start >= end) { setError('Выделите целые символы в тексте фразы.'); return }
    const spans = current.spans || []
    if (spans.some(span => start < span.end && end > span.start)) { setError('Выделение пересекается с другой сущностью.'); return }
    const text = Array.from(current.text).slice(start, end).join('')
    patch(current.id, { spans: [...spans, { entity_id: entityId, start, end, text }] }); selection.current = null
  }
  return <div className="intent-panel"><div className="section-heading"><div><h2>Примеры фраз</h2><p>Подготовьте отдельные фразы для обучения и проверки.</p></div>{editable && <button className="button button-primary" disabled={examples.length >= 13000} onClick={add}><Plus size={16}/>Добавить пример</button>}</div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <div className="example-filters"><label className="field-label">Поиск<input aria-label="Поиск примеров" value={search} onChange={event => { setSearch(event.target.value); setLimit(50) }}/></label><label className="field-label">Набор<select value={split} onChange={event => { setSplit(event.target.value as typeof split); setLimit(50) }}><option value="all">Все</option><option value="train">Обучение</option><option value="test">Проверка</option></select></label><label className="field-label">Намерение<select value={intentFilter} onChange={event => { setIntentFilter(event.target.value); setLimit(50) }}><option value="all">Все</option><option value="unknown">Неизвестный запрос</option>{intents.map(intent => <option key={intent.id} value={intent.id}>{intent.name}</option>)}</select></label></div>
    {!filtered.length ? <div className="data-state"><h2>{examples.length ? 'Примеры не найдены' : 'Примеров пока нет'}</h2><p>{examples.length ? 'Измените поиск или фильтры.' : 'Добавьте фразу для обучения или проверки.'}</p></div> : <div className="intent-layout"><div className="intent-list" aria-label="Список примеров">{filtered.slice(0, limit).map(example => <button type="button" key={example.id} aria-pressed={selected === example.id} onClick={() => { setSelected(example.id); setError(''); selection.current = null }}><strong>{example.text || 'Новая фраза'}</strong><span>{example.split === 'train' ? 'Обучение' : 'Проверка'} · {example.expected_fallback ? 'Неизвестный запрос' : intents.find(intent => intent.id === example.intent_id)?.name || 'Намерение недоступно'}</span></button>)}{filtered.length > limit && <button type="button" onClick={() => setLimit(limit + 50)}>Показать ещё</button>}</div><div className="intent-detail">{current ? <><h3>Пример фразы</h3><label className="field-label">Текст<textarea name="example_text" rows={4} maxLength={4000} disabled={!editable} readOnly={!!current.spans?.length} value={current.text} onSelect={event => { selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd } }} onChange={event => changeText(current, event.target.value)}/><span className="field-help">{current.spans?.length ? 'Чтобы изменить текст, сначала удалите разметку.' : 'Не более 2000 символов. Выделите текст, чтобы разметить сущность.'}</span></label><label className="field-label">Намерение<select name="example_intent" disabled={!editable} value={current.expected_fallback ? 'unknown' : current.intent_id || ''} onChange={event => { const value = event.target.value; patch(current.id, value === 'unknown' ? { intent_id: null, expected_fallback: true, split: 'test' } : { intent_id: value, expected_fallback: false }) }}><option value="" disabled>Выберите намерение</option><option value="unknown">Неизвестный запрос</option>{intents.map(intent => <option key={intent.id} value={intent.id}>{intent.name}</option>)}</select></label><label className="field-label">Набор<select name="example_split" disabled={!editable} value={current.split} onChange={event => patch(current.id, { split: event.target.value as 'train' | 'test' })}><option value="train" disabled={current.expected_fallback}>Обучение</option><option value="test">Проверка</option></select></label><div className="example-annotations"><h4>Разметка сущностей</h4>{(current.spans || []).map((span, index) => <div className="example-annotation" key={`${span.start}-${span.end}-${span.entity_id}`}><span><strong>{entities.find(entity => entity.id === span.entity_id)?.name || 'Сущность недоступна'}</strong> · {Array.from(current.text).slice(span.start, span.end).join('')}</span>{editable && <button type="button" className="button icon-button" aria-label={`Удалить разметку ${index + 1}`} onClick={() => patch(current.id, { spans: (current.spans || []).filter((_, i) => i !== index) })}><Trash2 size={15}/></button>}</div>)}{editable && <><label className="field-label">Сущность<select name="annotation_entity" value={entityId} onChange={event => setEntityId(event.target.value)}><option value="">Выберите сущность</option>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><button type="button" className="button button-quiet" onClick={annotate} disabled={!entities.length}>Разметить выделение</button></>}</div>{editable && <button className="button danger-button" onClick={() => remove(current)}><Trash2 size={15}/>Удалить пример</button>}</> : <p className="muted">Выберите пример, чтобы настроить его.</p>}</div></div>}
  </div>
}

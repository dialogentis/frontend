import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api, check } from '../api'
import type { components } from '../api/schema'
import { containsReference } from './IntentPanel'
import { EntityPreview } from './EntityPreview'

type Draft = components['schemas']['DraftView']
type Config = components['schemas']['DraftConfig']
type Entity = components['schemas']['Entity']
type DictionaryValue = components['schemas']['DictionaryValue']
const methods: Record<Entity['method'], string> = { learned: 'По разметке', dictionary: 'Словарь', regex: 'Регулярное выражение' }
const valueTypes: Record<Entity['value_type'], string> = { string: 'Строка', integer: 'Целое число', number: 'Число', boolean: 'Да / нет', date: 'Дата' }

export function EntityPanel({ orgId, agentId, draft, editable, previewEnabled, update }: { orgId: string; agentId: string; draft: Draft; editable: boolean; previewEnabled: boolean; update: (mutate: (config: Config) => Config) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const dataset = useQuery({ queryKey: ['dataset', orgId, agentId], queryFn: async () => {
    const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/draft/dataset', { params: { path: { org_id: orgId, agent_id: agentId } } }); check(result.response, result.error)
    if (!result.data) throw new Error('Некорректный ответ сервера')
    return result.data
  }, staleTime: 0 })
  useEffect(() => { if (dataset.data?.revision === draft.revision) setVerified(true) }, [dataset.data, draft.revision])
  if (!verified && dataset.isLoading) return <p role="status">Загрузка сущностей…</p>
  if (!verified && dataset.isError) return <div className="data-state"><h2>Не удалось открыть данные агента</h2><p>Повторите попытку или обратитесь к администратору пространства.</p><button className="button button-quiet" onClick={() => dataset.refetch()}>Повторить</button></div>
  if (!verified) return <div className="data-state"><h2>Черновик изменился</h2><p>Обновите страницу после сохранения локальных изменений.</p><button className="button button-quiet" onClick={() => dataset.refetch()}>Повторить</button></div>
  const entities = draft.config.entities as unknown as Entity[]
  const current = entities.find(entity => entity.id === selected)
  const invalidCode = current ? !/^[a-z][a-z0-9_]{1,63}$/.test(current.code) || entities.some(entity => entity.id !== current.id && entity.code === current.code) : false
  const patch = (id: string, changes: Partial<Entity>) => { setError(''); update(config => ({ ...config, entities: (config.entities as unknown as Entity[]).map(entity => entity.id === id ? { ...entity, ...changes } : entity) })) }
  const add = () => {
    const id = crypto.randomUUID()
    const entity: Entity = { id, code: `entity_${id.replaceAll('-', '').slice(0, 12)}`, name: 'Новая сущность', value_type: 'string', method: 'learned', group: 0, dictionary: [] }
    update(config => ({ ...config, entities: [...config.entities, entity] })); setSelected(id); setError('')
  }
  const remove = (entity: Entity) => {
    if (containsReference(draft.config.examples, entity.id) || containsReference(draft.config.flow, entity.id) || containsReference(draft.config.slots, entity.id)) { setError('Сущность используется в примерах, параметрах или сценарии. Сначала удалите связанные элементы.'); return }
    if (!window.confirm(`Удалить сущность «${entity.name}»?`)) return
    update(config => ({ ...config, entities: (config.entities as unknown as Entity[]).filter(item => item.id !== entity.id) })); setSelected(null); setError('')
  }
  const setDictionary = (values: DictionaryValue[]) => { if (current) patch(current.id, { dictionary: values }) }
  return <div className="intent-panel"><div className="section-heading"><div><h2>Сущности</h2><p>Настройте данные, которые агент должен извлекать из фраз.</p></div>{editable && <button className="button button-primary" onClick={add}><Plus size={16}/>Добавить сущность</button>}</div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {!entities.length ? <div className="data-state"><h2>Сущностей пока нет</h2><p>Добавьте сущность, чтобы выделять данные в сообщениях.</p></div> : <div className="intent-layout"><div className="intent-list" aria-label="Список сущностей">{entities.map(entity => <button type="button" key={entity.id} aria-pressed={selected === entity.id} onClick={() => { setSelected(entity.id); setError('') }}><strong>{entity.name}</strong><span>{entity.code} · {methods[entity.method]}</span></button>)}</div><div className="intent-detail">{current ? <><h3>Настройки сущности</h3><label className="field-label">Название<input name="entity_name" maxLength={120} aria-invalid={!current.name.trim()} disabled={!editable} value={current.name} onChange={event => patch(current.id, { name: event.target.value })}/></label><label className="field-label">Код<input name="entity_code" maxLength={64} aria-invalid={invalidCode} disabled={!editable} value={current.code} onChange={event => patch(current.id, { code: event.target.value })}/><span className={`field-help ${invalidCode ? 'error-text' : ''}`}>{invalidCode ? 'Укажите уникальный код из 2–64 символов, начиная с латинской буквы.' : 'Латинские буквы, цифры и знак подчёркивания.'}</span></label><label className="field-label">Тип значения<select name="entity_value_type" disabled={!editable} value={current.value_type} onChange={event => patch(current.id, { value_type: event.target.value as Entity['value_type'] })}>{Object.entries(valueTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Способ извлечения<select name="entity_method" disabled={!editable} value={current.method} onChange={event => { const method = event.target.value as Entity['method']; patch(current.id, method === 'regex' && !current.pattern ? { method, pattern: '.+' } : { method }) }}>{Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {current.method === 'regex' && <><label className="field-label">Шаблон<input name="entity_pattern" maxLength={2048} disabled={!editable} value={current.pattern || ''} onChange={event => patch(current.id, { pattern: event.target.value })}/><span className="field-help">Поддерживается безопасный синтаксис RE2.</span></label><label className="field-label">Группа извлечения<input name="entity_group" disabled={!editable} value={String(current.group ?? 0)} onChange={event => { const value = event.target.value; patch(current.id, { group: /^\d+$/.test(value) ? Number(value) : value }) }}/><span className="field-help">Номер группы или её имя; 0 означает всё совпадение.</span></label></>}
      {current.method === 'dictionary' && <div className="entity-dictionary"><h4>Значения словаря</h4>{(current.dictionary || []).map((entry, index) => <div className="entity-dictionary-entry" key={index}><label className="field-label">Значение<input aria-label={`Значение ${index + 1}`} maxLength={2000} disabled={!editable} value={entry.value} onChange={event => setDictionary((current.dictionary || []).map((item, i) => i === index ? { ...item, value: event.target.value } : item))}/></label>{(entry.synonyms || []).map((synonym, synonymIndex) => <div className="entity-synonym" key={synonymIndex}><label className="field-label">Синоним<input aria-label={`Синоним ${index + 1}.${synonymIndex + 1}`} disabled={!editable} value={synonym} onChange={event => setDictionary((current.dictionary || []).map((item, i) => i === index ? { ...item, synonyms: (item.synonyms || []).map((s, j) => j === synonymIndex ? event.target.value : s) } : item))}/></label>{editable && <button type="button" className="button icon-button" aria-label={`Удалить синоним ${index + 1}.${synonymIndex + 1}`} onClick={() => setDictionary((current.dictionary || []).map((item, i) => i === index ? { ...item, synonyms: (item.synonyms || []).filter((_, j) => j !== synonymIndex) } : item))}><Trash2 size={15}/></button>}</div>)}{editable && <div className="row-actions"><button type="button" className="button button-quiet" onClick={() => setDictionary((current.dictionary || []).map((item, i) => i === index ? { ...item, synonyms: [...(item.synonyms || []), `Синоним ${crypto.randomUUID().slice(0, 8)}`] } : item))}>Добавить синоним</button><button type="button" className="button button-quiet" onClick={() => setDictionary((current.dictionary || []).filter((_, i) => i !== index))}>Удалить значение</button></div>}</div>)}{editable && <button type="button" className="button button-quiet" onClick={() => setDictionary([...(current.dictionary || []), { value: `Значение ${crypto.randomUUID().slice(0, 8)}`, synonyms: [] }])}>Добавить значение</button>}</div>}
      {(current.method === 'dictionary' || current.method === 'regex') && <EntityPreview key={current.id} orgId={orgId} agentId={agentId} entityId={current.id} revision={draft.revision} enabled={previewEnabled}/>} {editable && <button className="button danger-button" onClick={() => remove(current)}><Trash2 size={15}/>Удалить сущность</button>}</> : <p className="muted">Выберите сущность, чтобы настроить её.</p>}</div></div>}
  </div>
}

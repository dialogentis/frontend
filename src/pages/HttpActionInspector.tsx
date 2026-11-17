import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, check } from '../api'
import type { components } from '../api/schema'
import type { SlotSummary } from './AskInspector'
import { httpOutputs } from './HttpActionNode'

type Flow = components['schemas']['Flow']
type FlowNode = components['schemas']['FlowNode']
type JsonValue = components['schemas']['JsonValue']
type MappingKey = 'query' | 'body' | 'response_mapping'

function mappings(value: JsonValue | undefined): Record<string, string> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {}
}

function Mapping({ title, value, slots, fields, editable, onChange }: { title: string; value: Record<string, string>; slots: SlotSummary[]; fields?: string[]; editable: boolean; onChange: (next: Record<string, string>) => void }) {
  const [name, setName] = useState('')
  const [slot, setSlot] = useState('')
  const valid = name.trim() === name && name.length > 0 && name.length <= 128 && !/[\u0000-\u001f\u007f]/.test(name) && !!slot && !Object.hasOwn(value, name) && (!fields || !Object.values(value).includes(slot))
  return <div className="http-mapping"><h3>{title}</h3>{Object.entries(value).map(([key, id]) => <div className="http-mapping-row" key={key}><span><code>{key}</code> → {slots.find(item => item.id === id)?.name || slots.find(item => item.id === id)?.code || 'Параметр не найден'}</span>{editable && <button type="button" className="button button-text" aria-label={`Удалить ${key} из ${title}`} onClick={() => { const next = { ...value }; delete next[key]; onChange(next) }}>Удалить</button>}</div>)}{editable && <><label className="field-label">{fields ? 'Поле ответа' : 'Имя поля'}{fields ? <select value={name} onChange={event => setName(event.target.value)}><option value="">Выберите поле</option>{fields.filter(field => !Object.hasOwn(value, field)).map(field => <option key={field} value={field}>{field}</option>)}</select> : <input value={name} maxLength={128} onChange={event => setName(event.target.value)}/>}</label><label className="field-label">Параметр<select value={slot} onChange={event => setSlot(event.target.value)}><option value="">Выберите параметр</option>{slots.map(item => <option value={item.id} key={item.id} disabled={!!fields && Object.values(value).includes(item.id)}>{item.name || item.code} · {item.code}</option>)}</select></label><button type="button" className="button button-quiet" disabled={!valid || Object.keys(value).length >= 100} onClick={() => { if (valid) { onChange({ ...value, [name]: slot }); setName(''); setSlot('') } }}>Добавить</button></>}</div>
}

export function HttpActionInspector({ orgId, node, flow, slots, names, editable, onConfig, onTarget }: { orgId: string; node: FlowNode; flow: Flow; slots: SlotSummary[]; names: Record<FlowNode['type'], string>; editable: boolean; onConfig: (patch: Record<string, JsonValue>) => void; onTarget: (handle: string, target: string) => void }) {
  const integrationId = typeof node.config.integration_id === 'string' ? node.config.integration_id : ''
  const [mockText, setMockText] = useState(() => JSON.stringify(node.config.mock_response ?? {}, null, 2))
  const [mockError, setMockError] = useState('')
  const [mockDirty, setMockDirty] = useState(false)
  const integrations = useInfiniteQuery({
    queryKey: ['integrations', orgId], initialPageParam: '', retry: false,
    queryFn: async ({ pageParam, signal }) => { const result = await api.GET('/api/v1/organizations/{org_id}/integrations', { params: { path: { org_id: orgId }, query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } }, signal }); check(result.response, result.error); if (!result.data) throw new Error('Некорректный ответ сервера'); return result.data },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const items = integrations.data?.pages.flatMap(page => page.items) || []
  const integration = items.find(item => item.id === integrationId)
  const method = typeof node.config.method === 'string' ? node.config.method : 'GET'
  const outcome = typeof node.config.mock_outcome === 'string' ? node.config.mock_outcome : 'success'
  const targets = flow.nodes.filter(item => item.type !== 'start')
  const saveMock = () => {
    try {
      const value: unknown = JSON.parse(mockText)
      const finite = (item: unknown): boolean => typeof item === 'number' ? Number.isFinite(item) : Array.isArray(item) ? item.every(finite) : !!item && typeof item === 'object' ? Object.values(item).every(finite) : true
      if (!finite(value)) throw new Error()
      if (new TextEncoder().encode(JSON.stringify(value)).length > 256 * 1024) throw new Error()
      onConfig({ mock_response: value as JsonValue }); setMockError(''); setMockDirty(false)
    } catch { setMockError('Укажите корректный JSON размером не более 256 КиБ.') }
  }
  return <div className="ask-inspector">
    <label className="field-label">Интеграция<select name="http_integration" value={integrationId} disabled={!editable || integrations.isPending} onChange={event => onConfig({ integration_id: event.target.value || null })}><option value="">Выберите интеграцию</option>{integrationId && !integration && <option value={integrationId}>Интеграция не загружена или недоступна</option>}{items.map(item => <option key={item.id} value={item.id}>{item.name}{item.enabled ? '' : ' · отключена'}</option>)}</select></label>
    {integrations.isError && <p role="alert">Не удалось загрузить интеграции. <button type="button" className="button button-text" onClick={() => void integrations.refetch()}>Повторить</button></p>}
    {integrations.hasNextPage && <button type="button" className="button button-quiet" disabled={integrations.isFetchingNextPage} onClick={() => void integrations.fetchNextPage()}>Загрузить ещё интеграции</button>}
    {!items.length && !integrations.isPending && !integrations.isError && <p className="field-help">Интеграций пока нет. <Link to={`/app/o/${orgId}/integrations`}>Настроить интеграцию</Link></p>}
    {integration && <p className="field-help">Разрешённые пути: {integration.paths.join(', ')}. {integration.enabled ? '' : 'Интеграция отключена.'}</p>}
    <label className="field-label">Метод<select name="http_method" value={method} disabled={!editable} onChange={event => onConfig({ method: event.target.value })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(item => <option value={item} key={item}>{item}{integration && !integration.methods.includes(item as typeof integration.methods[number]) ? ' · не разрешён' : ''}</option>)}</select></label>
    <label className="field-label">Относительный путь<input name="http_path" value={typeof node.config.path === 'string' ? node.config.path : ''} maxLength={1024} placeholder="/orders" disabled={!editable} onChange={event => onConfig({ path: event.target.value })}/><span className="field-help">Путь должен входить в разрешённый список интеграции.</span></label>
    {(['query', 'body', 'response_mapping'] as MappingKey[]).map(key => <Mapping key={`${node.id}-${key}`} title={{ query: 'Параметры query', body: 'Поля тела запроса', response_mapping: 'Поля ответа' }[key]} value={mappings(node.config[key])} fields={key === 'response_mapping' ? integration?.response_fields || [] : undefined} slots={slots} editable={editable} onChange={value => onConfig({ [key]: value })}/>)}
    <label className="field-label">Исход в тестовом чате<select value={outcome} disabled={!editable} onChange={event => onConfig({ mock_outcome: event.target.value })}>{httpOutputs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    {outcome === 'success' && <div><label className="field-label">Тестовый JSON-ответ<textarea name="http_mock_response" rows={6} value={mockText} disabled={!editable} onChange={event => { setMockText(event.target.value); setMockError(''); setMockDirty(true) }}/><span className="field-help">В тестовом чате используются только разрешённые поля ответа.</span></label>{editable && <button type="button" className="button button-quiet" onClick={saveMock}>Применить ответ</button>}{mockDirty && <p className="field-help">Ответ ещё не применён.</p>}{mockError && <p role="alert">{mockError}</p>}</div>}
    <div className="ask-outputs"><h3>Переходы</h3>{httpOutputs.map(output => { const selected = flow.edges.find(edge => edge.source === node.id && edge.source_handle === output.id)?.target || ''; return <label key={output.id} className="field-label">{output.label}<select aria-label={`Переход: ${output.label}`} value={selected} disabled={!editable} onChange={event => onTarget(output.id, event.target.value)}><option value="">Не подключён</option>{selected && !targets.some(target => target.id === selected) && <option value={selected}>Блок не найден</option>}{targets.map((target, index) => <option value={target.id} key={target.id}>{names[target.type]} · {index + 1}</option>)}</select></label> })}</div>
  </div>
}

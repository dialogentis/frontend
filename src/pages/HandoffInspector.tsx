import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, check } from '../api'
import type { components } from '../api/schema'
import type { SlotSummary } from './AskInspector'
import { handoffOutputs } from './HandoffNode'

type Flow = components['schemas']['Flow']
type FlowNode = components['schemas']['FlowNode']
type Json = components['schemas']['JsonValue']
type Parameter = SlotSummary & { sensitive?: boolean }
type Edit = (patch: Record<string, Json>) => void

const slotLabel = (slot: Parameter) => slot.name || slot.code
const object = (value: Json | undefined): Record<string, string> => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {}

function Mapping({ title, mapping, from, to, editable, onChange }: {
  title: string; mapping: Record<string, string>; from: Parameter[]; to: Parameter[]
  editable: boolean; onChange: (value: Record<string, string>) => void
}) {
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const input = from.find(slot => slot.id === source)
  const options = input ? to.filter(slot =>
    (slot.value_type ?? 'string') === (input.value_type ?? 'string')
    && (!input.sensitive || slot.sensitive) && !Object.values(mapping).includes(slot.id)
  ) : []
  return <div className="ask-outputs">
    <h3>{title}</h3>
    {Object.entries(mapping).map(([left, right]) => {
      const fromSlot = from.find(slot => slot.id === left)
      const toSlot = to.find(slot => slot.id === right)
      return <div className="http-mapping-row" key={left}>
        <span>{fromSlot ? slotLabel(fromSlot) : 'Неизвестный параметр'} → {toSlot ? slotLabel(toSlot) : 'Неизвестный параметр'}</span>
        {editable && <button type="button" className="button button-text" aria-label={`Удалить соответствие ${fromSlot ? slotLabel(fromSlot) : left}`} onClick={() => {
          const next = { ...mapping }; delete next[left]; onChange(next)
        }}>Удалить</button>}
      </div>
    })}
    {editable && <fieldset>
      <label className="field-label">Откуда<select value={source} onChange={event => { setSource(event.target.value); setDestination('') }}>
        <option value="">Выберите параметр</option>
        {from.filter(slot => !Object.hasOwn(mapping, slot.id)).map(slot => <option key={slot.id} value={slot.id}>{slotLabel(slot)}</option>)}
      </select></label>
      <label className="field-label">Куда<select value={destination} disabled={!source} onChange={event => setDestination(event.target.value)}>
        <option value="">Выберите совместимый параметр</option>
        {options.map(slot => <option key={slot.id} value={slot.id}>{slotLabel(slot)}</option>)}
      </select></label>
      <button type="button" className="button button-quiet" disabled={!input || !options.some(slot => slot.id === destination) || Object.keys(mapping).length >= 100}
        onClick={() => { onChange({ ...mapping, [source]: destination }); setSource(''); setDestination('') }}>Добавить соответствие</button>
    </fieldset>}
  </div>
}

export function ReturnInspector({ node, slots, editable, onConfig }: { node: FlowNode; slots: Parameter[]; editable: boolean; onConfig: Edit }) {
  const selected = Array.isArray(node.config.slot_ids) ? node.config.slot_ids : []
  return <fieldset className="ask-inspector">
    <legend>Параметры для возврата</legend>
    <p className="field-help">Вызывающий агент получит только выбранные параметры, для которых у него настроено соответствие.</p>
    {slots.map(slot => <label key={slot.id}><input type="checkbox" checked={selected.includes(slot.id)}
      disabled={!editable || (selected.length >= 100 && !selected.includes(slot.id))}
      onChange={event => onConfig({ slot_ids: event.target.checked ? [...selected, slot.id] : selected.filter(id => id !== slot.id) })}/>{slotLabel(slot)}</label>)}
    {!slots.length && <p className="field-help">У агента пока нет параметров.</p>}
  </fieldset>
}

export function HandoffInspector({ orgId, agentId, node, flow, slots, names, editable, onConfig, onTarget }: {
  orgId: string; agentId: string; node: FlowNode; flow: Flow; slots: Parameter[]
  names: Record<FlowNode['type'], string>; editable: boolean; onConfig: Edit
  onTarget: (handle: string, target: string) => void
}) {
  const targetAgent = typeof node.config.target_agent_id === 'string' ? node.config.target_agent_id : ''
  const targetVersion = typeof node.config.target_version_id === 'string' ? node.config.target_version_id : ''
  const mode = node.config.mode === 'transfer' ? 'transfer' : 'call'
  const agents = useInfiniteQuery({
    queryKey: ['handoff-agents', orgId], initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents', {
        params: { path: { org_id: orgId }, query: { limit: 50, cursor: pageParam || undefined, status: 'active' } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const path = { org_id: orgId, agent_id: targetAgent }
  const versions = useInfiniteQuery({
    queryKey: ['handoff-versions', orgId, targetAgent], enabled: !!targetAgent, initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/versions', {
        params: { path, query: { limit: 50, cursor: pageParam || undefined } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
    getNextPageParam: page => page.next_cursor ? Number(page.next_cursor) : undefined,
  })
  const remote = useQuery({
    queryKey: ['handoff-slots', orgId, targetAgent, targetVersion], enabled: !!targetAgent && !!targetVersion,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/versions/{version_id}/handoff-slots', {
        params: { path: { ...path, version_id: targetVersion } }, signal,
      })
      check(result.response, result.error)
      return result.data ?? []
    },
  })
  const availableAgents = agents.data?.pages.flatMap(page => page.items).filter(agent => agent.id !== agentId) ?? []
  const ready = versions.data?.pages.flatMap(page => page.items).filter(version => version.status === 'ready') ?? []
  return <div className="ask-inspector">
    <label className="field-label">Режим<select name="handoff_mode" value={mode} disabled={!editable} onChange={event => onConfig({
      mode: event.target.value, ...(event.target.value === 'transfer' ? { return_mapping: {} } : {}),
    })}><option value="call">Вызвать с возвратом</option><option value="transfer">Передать без возврата</option></select></label>
    <label className="field-label">Агент<select name="handoff_agent" value={targetAgent} disabled={!editable || agents.isPending}
      onChange={event => onConfig({ target_agent_id: event.target.value || null, target_version_id: null, input_mapping: {}, return_mapping: {} })}>
      <option value="">Выберите агента</option>
      {targetAgent && !availableAgents.some(agent => agent.id === targetAgent) && <option value={targetAgent}>Агент не загружен или недоступен</option>}
      {availableAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
    </select></label>
    {agents.hasNextPage && <button type="button" className="button button-quiet" disabled={agents.isFetchingNextPage} onClick={() => void agents.fetchNextPage()}>Загрузить ещё агентов</button>}
    <label className="field-label">Готовая версия<select name="handoff_version" value={targetVersion} disabled={!editable || !targetAgent || versions.isPending}
      onChange={event => onConfig({ target_version_id: event.target.value || null, input_mapping: {}, return_mapping: {} })}>
      <option value="">{versions.isSuccess && !ready.length ? 'Нет готовых версий' : 'Выберите версию'}</option>
      {targetVersion && !ready.some(version => version.id === targetVersion) && <option value={targetVersion}>Закреплённая версия</option>}
      {ready.map(version => <option key={version.id} value={version.id}>Версия {version.number}</option>)}
    </select></label>
    {versions.hasNextPage && <button type="button" className="button button-quiet" disabled={versions.isFetchingNextPage} onClick={() => void versions.fetchNextPage()}>Загрузить ещё версии</button>}
    {(agents.isError || versions.isError || remote.isError) && <p role="alert">Не удалось загрузить данные целевого агента.</p>}
    <label><input type="checkbox" checked={node.config.forward_current_message === true} disabled={!editable}
      onChange={event => onConfig({ forward_current_message: event.target.checked })}/>Передать текущее сообщение</label>
    <label><input name="handoff_include_history" type="checkbox" checked={node.config.include_history === true}
      disabled={!editable} onChange={event => onConfig({ include_history: event.target.checked })}/>
      Передать сохранённую историю
    </label>
    <p className="field-help">До 20 последних реплик при включённом сохранении текста в пространстве.</p>
    {targetVersion && remote.isPending && <p role="status">Загрузка параметров версии…</p>}
    {remote.data && <Mapping key={`input:${targetVersion}`} title="Передача параметров" mapping={object(node.config.input_mapping)}
      from={slots} to={remote.data} editable={editable} onChange={value => onConfig({ input_mapping: value })}/>}
    {mode === 'call' && remote.data && <Mapping key={`return:${targetVersion}`} title="Возврат параметров" mapping={object(node.config.return_mapping)}
      from={remote.data} to={slots} editable={editable} onChange={value => onConfig({ return_mapping: value })}/>}
    <div className="ask-outputs"><h3>Переходы</h3>{handoffOutputs(mode).map(output => {
      const selected = flow.edges.find(edge => edge.source === node.id && edge.source_handle === output.id)?.target ?? ''
      return <label key={output.id} className="field-label">{output.label}<select value={selected} disabled={!editable} onChange={event => onTarget(output.id, event.target.value)}>
        <option value="">Не подключён</option>
        {flow.nodes.map((item, index) => item.type !== 'start' && <option value={item.id} key={item.id}>{names[item.type]} · {index + 1}</option>)}
      </select></label>
    })}</div>
  </div>
}

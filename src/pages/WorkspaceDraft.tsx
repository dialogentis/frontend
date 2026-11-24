import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, MiniMap, Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useNodesState, useReactFlow } from '@xyflow/react'
import type { Connection, Node, OnDelete, OnNodesChange } from '@xyflow/react'
import { api, ApiError, check, getCsrf } from '../api'
import type { components } from '../api/schema'
import { withoutSecrets } from '../sanitize'
import { IntentPanel } from './IntentPanel'
import { EntityPanel } from './EntityPanel'
import { ExamplePanel } from './ExamplePanel'
import { ExportPanel } from './ExportPanel'
import { ImportPanel } from './ImportPanel'
import { TrainingPanel, defaultNluSettings, defaultQualitySettings } from './TrainingPanel'
import { AgentApiKeys } from './AgentApiKeys'
import { WidgetChannels } from './WidgetChannels'
import { FlowValidation } from './FlowValidation'
import { FlowHistory } from './FlowHistory'
import type { HistoryDirection } from './FlowHistory'
import { SwitchNode } from './SwitchNode'
import { SwitchInspector } from './SwitchInspector'
import { SlotPanel } from './SlotPanel'
import { AskNode } from './AskNode'
import { SetSlotNode } from './SetSlotNode'
import { HttpActionNode, httpOutputs } from './HttpActionNode'
import { HttpActionInspector } from './HttpActionInspector'
import { HandoffNode, handoffOutputs } from './HandoffNode'
import { HandoffInspector, ReturnInspector } from './HandoffInspector'
import { ConditionNode } from './ConditionNode'
import { ConditionInspector, conditionBranches } from './ConditionInspector'
import { SetSlotInspector } from './SetSlotInspector'
import { AskInspector } from './AskInspector'
import type { SlotSummary } from './AskInspector'

type Draft = components['schemas']['DraftView']
type Config = components['schemas']['DraftConfig']
type Grant = components['schemas']['LeaseGrant']
type Role = components['schemas']['OrganizationView']['role']
type FlowNode = components['schemas']['FlowNode']
type Intent = components['schemas']['Intent']
type SaveState = 'saved' | 'dirty' | 'saving' | 'offline' | 'lost' | 'conflict'
const names: Record<FlowNode['type'], string> = { start: 'Начало', switch_intent: 'Распознать намерение', fallback: 'Неизвестный запрос', end: 'Завершение', say: 'Ответ', ask_slot: 'Сбор параметра', set_slot: 'Значение параметра', condition: 'Условие', http_action: 'HTTP-запрос', handoff: 'Другой агент', return: 'Возврат' }
const credential = (lease: Grant) => ({ 'X-Edit-Lease': lease.lease_token, 'X-Edit-Fence': lease.fencing_counter })
const canonical = (value: unknown): string => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const nodeTypes = { intentSwitch: SwitchNode, askSlot: AskNode, setSlot: SetSlotNode, condition: ConditionNode, httpAction: HttpActionNode, handoff: HandoffNode }
const multipleHandles = new Set<FlowNode['type']>(['switch_intent', 'ask_slot', 'set_slot', 'condition', 'http_action', 'handoff'])
const edgeLabels: Record<string, string> = { next: 'Далее', fallback: 'Не распознано', success: 'Успешно', error: 'Ошибка', returned: 'Возврат', else: 'Иначе' }
const sections = [
  ['flow', 'Сценарий'], ['intents', 'Намерения'], ['entities', 'Сущности'], ['slots', 'Параметры'],
  ['examples', 'Примеры'], ['training', 'Обучение'], ['channels', 'Каналы'],
] as const

function ScenarioOverview() {
  const initialized = useNodesInitialized()
  return initialized ? <MiniMap ariaLabel="Миникарта сценария" pannable zoomable nodeColor="var(--color-muted)" maskColor="var(--color-paper-3)"/> : null
}

function FitScenario() {
  const initialized = useNodesInitialized()
  const { fitView, viewportInitialized } = useReactFlow()
  const fitted = useRef(false)
  useEffect(() => {
    if (!initialized || !viewportInitialized || fitted.current) return
    fitted.current = true
    void fitView()
  }, [initialized, viewportInitialized, fitView])
  return null
}

export function WorkspaceDraft({ orgId, agentId, userId, role, onDirtyChange }: { orgId: string; agentId: string; userId: string; role: Role; onDirtyChange: (dirty: boolean) => void }) {
  const path = { org_id: orgId, agent_id: agentId }
  const agentPath = `/app/o/${orgId}/agents/${agentId}`
  const navigate = useNavigate()
  const { section: requestedSection } = useParams()
  const managesChannels = role === 'owner' || role === 'admin'
  const tabs = managesChannels ? sections : sections.slice(0, -1)
  const section = tabs.find(([name]) => name === requestedSection)?.[0] || (requestedSection === 'versions' ? 'training' : 'flow')
  const setSection = (next: typeof section) => navigate(`${agentPath}/${next}`)
  const cache = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [lease, setLease] = useState<Grant | null>(null)
  const [state, setState] = useState<SaveState>('saved')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1024)
  const [changes, setChanges] = useState(0)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const flowNodes = draft?.config.flow.nodes
  const flowEdges = draft?.config.flow.edges
  const edges = useMemo(() => {
    if (!flowNodes || !flowEdges) return []
    const handles = new Set(flowNodes.filter(node => multipleHandles.has(node.type)).map(node => node.id))
    return flowEdges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: handles.has(edge.source) ? edge.source_handle : undefined,
      label: handles.has(edge.source) ? '' : edgeLabels[edge.source_handle] || '',
    }))
  }, [flowNodes, flowEdges])
  const nodeOptions = useMemo(() => flowNodes?.map((node, index) => (
    <option key={node.id} value={node.id}>{names[node.type]} {index + 1}</option>
  )), [flowNodes])
  const draftRef = useRef<Draft | null>(null)
  const leaseRef = useRef<Grant | null>(null)
  const changesRef = useRef(0)
  const savingRef = useRef(false)
  const importingRef = useRef(false)
  const mounted = useRef(false)
  const inspectorRef = useRef<HTMLElement | null>(null)
  const flowHistory = useRef(new FlowHistory())
  const uncertain = useRef<{ config: Config; revision: number; generation: number } | null>(null)
  const dirty = state !== 'saved' || importing
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false) }, [dirty, onDirtyChange])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname
    && (importing || (nextLocation.pathname !== agentPath && !nextLocation.pathname.startsWith(`${agentPath}/`))))
  const agent = useQuery({ queryKey: ['agent', orgId, agentId], queryFn: async () => { const r = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}', { params: { path } }); check(r.response, r.error); if (!r.data) throw new Error('Некорректный ответ сервера'); return r.data } })
  const initial = useQuery({ queryKey: ['draft', orgId, agentId], staleTime: 0, refetchOnWindowFocus: false, queryFn: async () => { const r = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/draft', { params: { path } }); check(r.response, r.error); if (!r.data) throw new Error('Некорректный ответ сервера'); return r.data } })
  useEffect(() => { if (initial.data && (!draftRef.current || (!leaseRef.current && state === 'saved'))) { draftRef.current = initial.data; setDraft(initial.data) } }, [initial.data])
  useEffect(() => { if (draft) { const intents = (draft.config.intents as unknown as Intent[]).map(intent => ({ id: intent.id, name: intent.name, enabled: intent.enabled !== false })); setNodes(previous => { const selectedIds = new Set(previous.filter(node => node.selected).map(node => node.id)); return draft.config.flow.nodes.map(node => ({ id: node.id, selected: selectedIds.has(node.id), position: node.position, sourcePosition: Position.Right, targetPosition: Position.Left, data: node.type === 'switch_intent' ? { label: names[node.type], intents } : node.type === 'condition' ? { label: names[node.type], branches: conditionBranches(node.config.branches).map((branch, index) => ({ id: branch.id, label: `Ветвь ${index + 1}` })) } : node.type === 'handoff' ? { label: names[node.type], transfer: node.config.mode === 'transfer' } : { label: names[node.type] }, type: node.type === 'switch_intent' ? 'intentSwitch' : node.type === 'ask_slot' ? 'askSlot' : node.type === 'set_slot' ? 'setSlot' : node.type === 'condition' ? 'condition' : node.type === 'http_action' ? 'httpAction' : node.type === 'start' ? 'input' : node.type === 'handoff' ? 'handoff' : node.type === 'end' || node.type === 'return' ? 'output' : 'default' })) }) } }, [draft?.config.flow.nodes, draft?.config.intents, setNodes])
  useEffect(() => { if (blocker.state === 'blocked') window.confirm('Есть несохранённые изменения. Покинуть страницу?') ? blocker.proceed() : blocker.reset() }, [blocker])
  useEffect(() => { const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload) }, [dirty])
  useEffect(() => { const resize = () => setNarrow(window.innerWidth < 1024); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])
  useEffect(() => {
    mounted.current = true
    const releaseOnClose = () => {
      const current = leaseRef.current, csrf = getCsrf()
      if (current && csrf) void fetch(`/api/v1/organizations/${orgId}/agents/${agentId}/edit-lease`, { method: 'DELETE', keepalive: true, headers: { ...credential(current), 'X-Edit-Fence': String(current.fencing_counter), 'X-CSRF-Token': csrf } }).catch(() => {})
    }
    window.addEventListener('pagehide', releaseOnClose)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', releaseOnClose)
      const current = leaseRef.current
      if (current) void api.DELETE('/api/v1/organizations/{org_id}/agents/{agent_id}/edit-lease', { params: { path: { org_id: orgId, agent_id: agentId }, header: credential(current) } })
    }
  }, [orgId, agentId])
  const lose = useCallback((message: string) => { leaseRef.current = null; flowHistory.current.clear(); setLease(null); setState(previous => previous === 'saved' ? 'saved' : 'lost'); setError(message) }, [])
  useEffect(() => {
    if (!lease) return
    let renewing = false
    const timer = window.setInterval(async () => {
      const current = leaseRef.current
      if (!current) return
      if (Date.now() >= Date.parse(current.expires_at)) { lose('Срок блокировки истёк. Локальные изменения можно экспортировать.'); return }
      if (renewing || Date.parse(current.expires_at) - Date.now() > 60_000) return
      renewing = true
      try {
        const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/edit-lease/renew', { params: { path: { org_id: orgId, agent_id: agentId }, header: credential(current) }, signal: AbortSignal.timeout(10_000) }); check(result.response, result.error)
        if (result.data && leaseRef.current?.lease_token === current.lease_token) { leaseRef.current = result.data; setLease(result.data) }
      } catch (e) { if (e instanceof ApiError && [403, 404, 423].includes(e.status)) lose('Блокировка утрачена или доступ изменился. Локальные изменения можно экспортировать.'); else setError('Нет связи с сервером. Сохраняйте страницу открытой и проверьте подключение.') }
      finally { renewing = false }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [lease?.lease_token, orgId, agentId, lose])
  const edit = (mutate: (config: Config) => Config) => {
    if (!draftRef.current || !leaseRef.current || importingRef.current || state === 'conflict') return
    const previous = draftRef.current.config
    const config = mutate(previous)
    if (config === previous) return
    if (config.slots !== previous.slots || config.intents !== previous.intents || config.entities !== previous.entities) {
      flowHistory.current.clear()
    } else if (config.flow !== previous.flow) {
      flowHistory.current.record(previous.flow)
    }
    applyConfig(config)
  }
  const applyConfig = (config: Config) => {
    if (!draftRef.current) return
    const next = { ...draftRef.current, config }
    draftRef.current = next; changesRef.current += 1; setChanges(changesRef.current); setDraft(next); setState(previous => previous === 'saving' || (previous === 'offline' && uncertain.current) ? previous : 'dirty'); if (!uncertain.current) setError('')
  }
  const save = useCallback(async () => {
    const current = draftRef.current, currentLease = leaseRef.current
    if (!current || !currentLease || savingRef.current || uncertain.current) return
    savingRef.current = true; setState('saving')
    const snapshot = structuredClone(current.config), generation = changesRef.current, revision = current.revision
    try {
      if (new TextEncoder().encode(JSON.stringify({ schema_version: 1, config: snapshot })).length > 10 * 1024 * 1024) throw new ApiError(413, 'Черновик превышает 10 МиБ. Уменьшите набор данных.')
      const result = await api.PUT('/api/v1/organizations/{org_id}/agents/{agent_id}/draft', { params: { path: { org_id: orgId, agent_id: agentId }, header: { ...credential(currentLease), 'If-Match': `"rev-${revision}"` } }, body: { schema_version: 1, config: snapshot }, signal: AbortSignal.timeout(20_000) }); check(result.response, result.error)
      if (!result.data || !draftRef.current) throw new Error('Некорректный ответ сервера')
      cache.setQueryData(['draft', orgId, agentId], result.data)
      draftRef.current = { ...draftRef.current, revision: result.data.revision }; setDraft(draftRef.current)
      setState(changesRef.current === generation ? 'saved' : leaseRef.current ? 'dirty' : 'lost')
    } catch (e) {
      if (!leaseRef.current) { setState('lost'); setError('Блокировка утрачена. Локальные изменения можно экспортировать.') }
      else if (e instanceof ApiError && [403, 404, 423].includes(e.status)) lose('Блокировка утрачена или доступ изменился. Локальные изменения можно экспортировать.')
      else if (e instanceof ApiError && e.status === 412) { setState('conflict'); setError('Черновик изменился на сервере. Экспортируйте локальные изменения перед обновлением.') }
      else if (e instanceof ApiError && e.status >= 400 && e.status < 500) { setState('offline'); setError(e.details.map(detail => typeof detail.message === 'string' ? detail.message : '').filter(Boolean).slice(0, 3).join(' ') || e.message) }
      else { uncertain.current = { config: snapshot, revision, generation }; setState('offline'); setError('Сохранение не подтверждено. Проверьте соединение и повторите проверку.') }
    } finally { savingRef.current = false }
  }, [orgId, agentId, lose, cache])
  useEffect(() => { if (state !== 'dirty' || !lease || savingRef.current) return; const timer = window.setTimeout(() => void save(), 1500); return () => window.clearTimeout(timer) }, [changes, state, lease, save])
  const begin = async () => {
    setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/edit-lease', { params: { path }, body: { tab_id: crypto.randomUUID() } }); check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      const grant = result.data
      if (!mounted.current) { void api.DELETE('/api/v1/organizations/{org_id}/agents/{agent_id}/edit-lease', { params: { path, header: credential(grant) } }); return }
      leaseRef.current = grant
      const fresh = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/draft', { params: { path } }); check(fresh.response, fresh.error)
      if (!fresh.data) throw new Error('Некорректный ответ сервера')
      cache.setQueryData(['draft', orgId, agentId], fresh.data)
      flowHistory.current.clear()
      draftRef.current = fresh.data; setDraft(fresh.data); setLease(grant); setState('saved')
    } catch (e) {
      const current = leaseRef.current
      if (current) { leaseRef.current = null; void api.DELETE('/api/v1/organizations/{org_id}/agents/{agent_id}/edit-lease', { params: { path, header: credential(current) } }) }
      setError(e instanceof Error ? e.message : 'Не удалось начать редактирование')
    } finally { setBusy(false) }
  }
  const retry = async () => {
    setBusy(true); setError('')
    try {
      const pending = uncertain.current
      if (pending) {
        const fresh = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/draft', { params: { path } }); check(fresh.response, fresh.error)
        if (!fresh.data || !draftRef.current) throw new Error('Некорректный ответ сервера')
        cache.setQueryData(['draft', orgId, agentId], fresh.data)
        if (fresh.data.revision === pending.revision + 1 && canonical(fresh.data.config) === canonical(pending.config)) {
          draftRef.current = { ...draftRef.current, revision: fresh.data.revision }; setDraft(draftRef.current); uncertain.current = null
          setState(changesRef.current === pending.generation ? 'saved' : 'dirty')
        } else if (fresh.data.revision === pending.revision) { uncertain.current = null; setState('dirty') }
        else { setState('conflict'); setError('Черновик изменился на сервере. Экспортируйте локальные изменения перед обновлением.') }
      } else setState('dirty')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось проверить сохранение') }
    finally { setBusy(false) }
  }
  const download = () => {
    if (!draftRef.current) return
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema_version: 1, config: withoutSecrets(draftRef.current.config) }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'dialogentis-draft.json'; link.click(); URL.revokeObjectURL(url)
  }
  if (initial.isError || agent.isError) return <div className="data-state"><h1>Не удалось загрузить агента</h1><Link to={`/app/o/${orgId}`}>К агентам</Link></div>
  if (initial.isPending || agent.isPending || !draft) return <p role="status">Загрузка агента…</p>
  const current = draft.config.flow.nodes.find(node => node.id === selected)
  const intents = draft.config.intents as unknown as Intent[]
  const editable = !!lease && !importing && !['lost', 'conflict'].includes(state)
  const graphEditable = editable && !narrow
  const restoreFlow = (direction: HistoryDirection) => {
    const config = draftRef.current?.config
    const currentLease = leaseRef.current
    if (!graphEditable || !config || !currentLease || Date.now() >= Date.parse(currentLease.expires_at)) return
    const flow = flowHistory.current.restore(direction, config.flow)
    if (flow) applyConfig({ ...config, flow })
  }
  const handleHistoryKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!graphEditable || event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable]')) return
    const key = event.key.toLowerCase()
    if (key !== 'z' && key !== 'y') return
    event.preventDefault()
    restoreFlow(key === 'y' || event.shiftKey ? 'redo' : 'undo')
  }
  const selectNode = (id: string | null) => {
    setSelected(id)
    setNodes(items => items.map(item => ({ ...item, selected: item.id === id })))
  }
  const applyNodeChanges: OnNodesChange = changes => {
    onNodesChange(changes)
    if (!graphEditable) return
    const positions = new Map<string, Node['position']>()
    for (const change of changes) {
      if (change.type === 'position' && !change.dragging && change.position) positions.set(change.id, change.position)
    }
    if (!positions.size) return
    edit(config => {
      let moved = false
      const nodes = config.flow.nodes.map(node => {
        const position = positions.get(node.id)
        if (!position || (position.x === node.position.x && position.y === node.position.y)) return node
        moved = true
        return { ...node, position }
      })
      return moved ? { ...config, flow: { ...config.flow, nodes } } : config
    })
  }
  const onDelete: OnDelete = ({ nodes: removedNodes, edges: removedEdges }) => {
    const removed = new Set(removedNodes.map(node => node.id))
    const edges = new Set(removedEdges.map(edge => edge.id))
    edit(config => ({ ...config, flow: {
      ...config.flow,
      nodes: config.flow.nodes.filter(node => !removed.has(node.id)),
      edges: config.flow.edges.filter(edge => !edges.has(edge.id) && !removed.has(edge.source) && !removed.has(edge.target)),
    } }))
  }
  const connect = (connection: Connection) => { if (!connection.source || !connection.target) return; edit(config => { const source = config.flow.nodes.find(node => node.id === connection.source); const target = config.flow.nodes.find(node => node.id === connection.target); const handle = source?.type === 'switch_intent' || source?.type === 'ask_slot' || source?.type === 'set_slot' || source?.type === 'condition' || source?.type === 'http_action' || source?.type === 'handoff' ? connection.sourceHandle : 'next'; const validIntent = (config.intents as unknown as Intent[]).some(intent => intent.id === handle && intent.enabled !== false); if (!source || !target || !handle || target.type === 'start' || !['start', 'say', 'switch_intent', 'ask_slot', 'set_slot', 'condition', 'http_action', 'handoff'].includes(source.type) || (source.type === 'switch_intent' && handle !== 'fallback' && !validIntent) || (source.type === 'ask_slot' && !['success', 'invalid', 'exhausted'].includes(handle)) || (source.type === 'set_slot' && !['next', 'error'].includes(handle)) || (source.type === 'http_action' && !httpOutputs.some(output => output.id === handle)) || (source.type === 'handoff' && !handoffOutputs(source.config.mode).some(output => output.id === handle)) || (source.type === 'condition' && handle !== 'else' && !conditionBranches(source.config.branches).some(branch => branch.id === handle)) || config.flow.edges.length >= 600 || config.flow.edges.some(edge => edge.source === source.id && edge.source_handle === handle)) return config; return { ...config, flow: { ...config.flow, edges: [...config.flow.edges, { id: crypto.randomUUID(), source: connection.source!, target: connection.target!, source_handle: handle }] } } }) }
  const setBranch = (sourceId: string, handle: string, targetId: string) => edit(config => {
    const old = config.flow.edges.find(edge => edge.source === sourceId && edge.source_handle === handle)
    if (old?.target === targetId || (!old && !targetId) || (!old && targetId && config.flow.edges.length >= 600)) return config
    if (targetId && !config.flow.nodes.some(node => node.id === targetId && node.type !== 'start')) return config
    const remaining = config.flow.edges.filter(edge => edge.id !== old?.id)
    return { ...config, flow: { ...config.flow, edges: targetId ? [...remaining, { id: old?.id || crypto.randomUUID(), source: sourceId, source_handle: handle, target: targetId }] : remaining } }
  })
  const updateHandoff = (id: string, patch: FlowNode['config']) => edit(config => ({
    ...config, flow: { ...config.flow,
      nodes: config.flow.nodes.map(node => node.id === id ? { ...node, config: { ...node.config, ...patch } } : node),
      edges: patch.mode === 'transfer' ? config.flow.edges.filter(edge => edge.source !== id || edge.source_handle !== 'returned') : config.flow.edges,
    },
  }))
  const add = (type: 'say' | 'end' | 'ask_slot' | 'set_slot' | 'condition' | 'http_action' | 'handoff' | 'return') => edit(config => config.flow.nodes.length >= 300 ? config : ({ ...config, flow: { ...config.flow, nodes: [...config.flow.nodes, { id: crypto.randomUUID(), type, config: type === 'say' ? { text: '' } : type === 'ask_slot' ? { slot_id: null, prompt: '', entity_id: null, max_attempts: 3, checks: [] } : type === 'set_slot' ? { slot_id: null, operation: 'set', source: 'constant', source_slot_id: null, value: null } : type === 'condition' ? { branches: [] } : type === 'http_action' ? { integration_id: null, method: 'GET', path: '', query: {}, body: {}, response_mapping: {}, mock_outcome: 'success', mock_response: {} } : {}, position: { x: 200, y: 200 + config.flow.nodes.length * 30 } }] } }))
  return <div className="workspace-draft">
    <div className="page-heading">
      <div>
        <Link to={`/app/o/${orgId}`}>← К агентам</Link>
        <h1>{agent.data?.name}</h1>
        <div className="draft-meta">
          <span>Версия черновика {draft.revision}</span>
          <span role="status">{importing ? 'Применение импорта…' : state === 'lost' ? 'Блокировка утрачена' : state === 'conflict' ? 'Конфликт версий' : lease ? ({ saved: 'Сохранено', dirty: 'Есть несохранённые изменения', saving: 'Сохранение…', offline: 'Сохранение не подтверждено', lost: 'Блокировка утрачена', conflict: 'Конфликт версий' }[state]) : draft.lease ? `Редактирует ${draft.lease.holder_name}` : 'Режим просмотра'}</span>
        </div>
      </div>
      <div className="draft-actions">
        {!lease && role !== 'viewer' && !dirty && !(narrow && section === 'flow') && <button className="button button-primary" disabled={busy} onClick={() => void begin()}>Начать редактирование</button>}
        {role !== 'viewer' && <ExportPanel key={`${orgId}:${agentId}`} orgId={orgId} agentId={agentId} enabled={!dirty}/>}
        {role !== 'viewer' && dirty && <button className="button button-quiet" onClick={download}>Сохранить локальную копию</button>}
      </div>
    </div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {state === 'offline' && lease && <button className="button button-quiet draft-save-retry" disabled={busy} onClick={() => void retry()}>Проверить сохранение</button>}
    <div className="filter-tabs draft-sections" role="tablist" aria-label="Раздел агента">
      {tabs.map(([name, label], index) => <button type="button" role="tab" key={name} id={`agent-tab-${name}`}
        aria-controls="agent-section" aria-selected={section === name} tabIndex={section === name ? 0 : -1}
        disabled={importing} onClick={() => setSection(name)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
          if (next === null) return
          event.preventDefault()
          const tab = tabs[next][0]
          document.getElementById(`agent-tab-${tab}`)?.focus()
          setSection(tab)
        }}>{label}</button>)}
    </div>
    <div id="agent-section" role="tabpanel" aria-labelledby={`agent-tab-${section}`}>
    {narrow && section === 'flow' && <p className="field-help draft-mobile-note">Редактирование графа доступно на компьютере. Данные агента можно изменить на других вкладках.</p>}
    {section === 'channels' ? managesChannels && <div className="agent-channels" key={agentId}>
      <WidgetChannels orgId={orgId} agentId={agentId} archived={agent.data?.status === 'archived'} published={!!agent.data?.current_release_id}/>
      <AgentApiKeys orgId={orgId} agentId={agentId} archived={agent.data?.status === 'archived'}/>
    </div> : section === 'training' ? <TrainingPanel orgId={orgId} agentId={agentId} agent={agent.data} userId={userId} role={role} revision={draft.revision} enabled={state === 'saved' && !importing} archived={agent.data?.status === 'archived'} settings={draft.config.nlu_settings || defaultNluSettings} quality={draft.config.quality_settings || defaultQualitySettings} editable={editable} onSettingsChange={settings => edit(config => ({ ...config, nlu_settings: settings }))} onQualityChange={settings => edit(config => ({ ...config, quality_settings: settings }))}/> : section === 'intents' ? <IntentPanel key={lease?.lease_token || 'readonly'} orgId={orgId} agentId={agentId} draft={draft} editable={editable} update={edit}/> : section === 'entities' ? <EntityPanel key={lease?.lease_token || 'readonly'} orgId={orgId} agentId={agentId} draft={draft} editable={editable} previewEnabled={role !== 'viewer' && state === 'saved'} update={edit}/> : section === 'slots' ? <SlotPanel key={lease?.lease_token || 'readonly'} draft={draft} editable={editable} update={edit}/> : section === 'examples' ? <>{role !== 'viewer' && <ImportPanel key={`${orgId}:${agentId}`} orgId={orgId} agentId={agentId} revision={draft.revision} lease={lease} enabled={state === 'saved' && !importing} onApplying={value => { importingRef.current = value; setImporting(value) }} onImported={value => { flowHistory.current.clear(); draftRef.current = value; setDraft(value); setState('saved'); uncertain.current = null; cache.setQueryData(['draft', orgId, agentId], value); void cache.invalidateQueries({ queryKey: ['dataset', orgId, agentId] }) }} onUncertain={() => { setState('conflict'); setError('Применение импорта не подтверждено. Сохраните локальную копию и обновите страницу.') }}/>}<ExamplePanel key={lease?.lease_token || 'readonly'} orgId={orgId} agentId={agentId} draft={draft} editable={editable} update={edit}/></> : <div onKeyDown={handleHistoryKeys}><div className="draft-toolbar">{graphEditable && <><button className="button button-quiet" onClick={() => add('say')}>Добавить ответ</button><button className="button button-quiet" onClick={() => add('end')}>Добавить завершение</button><button className="button button-quiet" onClick={() => add('ask_slot')}>Добавить сбор параметра</button><button className="button button-quiet" onClick={() => add('set_slot')}>Добавить присваивание</button><button className="button button-quiet" onClick={() => add('condition')}>Добавить условие</button><button className="button button-quiet" onClick={() => add('http_action')}>Добавить HTTP-запрос</button><button className="button button-quiet" onClick={() => add('handoff')}>Другой агент</button><button className="button button-quiet" onClick={() => add('return')}>Возврат</button></>}</div>
    <FlowValidation orgId={orgId} agentId={agentId} revision={draft.revision} enabled={state === 'saved' && !importing} flow={draft.config.flow} names={names} onSlots={() => setSection('slots')} onSelect={id => { selectNode(id); inspectorRef.current?.focus() }}>
      <label className="field-label draft-node-picker">Блок сценария
        <select value={current?.id || ''} onChange={event => selectNode(event.target.value || null)}>
          <option value="">Выберите блок</option>
          {nodeOptions}
        </select>
      </label>
      {graphEditable && <div className="draft-flow-history" role="group" aria-label="История изменений сценария">
        <button type="button" className="button button-quiet" disabled={!flowHistory.current.canUndo} onClick={() => restoreFlow('undo')}>Отменить изменение</button>
        <button type="button" className="button button-quiet" disabled={!flowHistory.current.canRedo} onClick={() => restoreFlow('redo')}>Повторить изменение</button>
      </div>}
    </FlowValidation>
    <ReactFlowProvider><div className="draft-editor"><div className="draft-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={graphEditable} nodesConnectable={graphEditable} elementsSelectable deleteKeyCode={graphEditable ? ['Backspace', 'Delete'] : null} onNodesChange={applyNodeChanges} onNodeClick={(_, node) => setSelected(node.id)} onConnect={connect} onBeforeDelete={async ({ nodes: removed }) => !removed.some(node => draft.config.flow.nodes.some(item => item.id === node.id && item.type === 'start'))} onDelete={onDelete}>
      <FitScenario/>
      <Background/>
      <Controls/>
    </ReactFlow></div><aside ref={inspectorRef} tabIndex={-1} aria-label="Настройки блока" className="draft-inspector">{!narrow && <div className="draft-overview"><ScenarioOverview/></div>}{current ? <><h2>{names[current.type]}</h2><p className="field-help">{current.id}</p>{current.type === 'switch_intent' && <SwitchInspector node={current} flow={draft.config.flow} intents={intents} names={names} editable={graphEditable} onChange={(handle, target) => setBranch(current.id, handle, target)}/>} {current.type === 'ask_slot' && <AskInspector node={current} flow={draft.config.flow} slots={draft.config.slots as unknown as SlotSummary[]} entities={draft.config.entities as unknown as components['schemas']['Entity'][]} names={names} editable={graphEditable} onConfig={patch => edit(config => ({ ...config, flow: { ...config.flow, nodes: config.flow.nodes.map(node => node.id === current.id ? { ...node, config: { ...node.config, ...patch } } : node) } }))} onTarget={(handle, target) => setBranch(current.id, handle, target)}/>} {current.type === 'set_slot' && <SetSlotInspector node={current} flow={draft.config.flow} slots={draft.config.slots as unknown as SlotSummary[]} names={names} editable={graphEditable} onConfig={patch => edit(config => ({ ...config, flow: { ...config.flow, nodes: config.flow.nodes.map(node => node.id === current.id ? { ...node, config: { ...node.config, ...patch } } : node) } }))} onTarget={(handle, target) => setBranch(current.id, handle, target)}/>} {current.type === 'http_action' && <HttpActionInspector key={current.id} orgId={orgId} node={current} flow={draft.config.flow} slots={draft.config.slots as unknown as SlotSummary[]} names={names} editable={graphEditable} onConfig={patch => edit(config => ({ ...config, flow: { ...config.flow, nodes: config.flow.nodes.map(node => node.id === current.id ? { ...node, config: { ...node.config, ...patch } } : node) } }))} onTarget={(handle, target) => setBranch(current.id, handle, target)}/>} {current.type === 'handoff' && <HandoffInspector key={current.id} orgId={orgId} agentId={agentId} node={current} flow={draft.config.flow} slots={draft.config.slots as unknown as SlotSummary[]} names={names} editable={graphEditable} onConfig={patch => updateHandoff(current.id, patch)} onTarget={(handle, target) => setBranch(current.id, handle, target)}/>} {current.type === 'return' && <ReturnInspector node={current} slots={draft.config.slots as unknown as SlotSummary[]} editable={graphEditable} onConfig={patch => updateHandoff(current.id, patch)}/>} {current.type === 'condition' && <ConditionInspector node={current} flow={draft.config.flow} slots={draft.config.slots as unknown as SlotSummary[]} names={names} editable={graphEditable} onBranches={branches => edit(config => ({ ...config, flow: { ...config.flow, nodes: config.flow.nodes.map(node => node.id === current.id ? { ...node, config: { ...node.config, branches } } : node), edges: config.flow.edges.filter(edge => edge.source !== current.id || edge.source_handle === 'else' || branches.some(branch => branch.id === edge.source_handle)) } }))} onTarget={(handle, target) => setBranch(current.id, handle, target)}/>} {['say', 'fallback', 'end'].includes(current.type) && <label className="field-label">{current.type === 'end' ? 'Текст завершения' : 'Текст ответа'}<textarea name="draft_node_text" rows={5} maxLength={4000} disabled={!graphEditable} value={typeof current.config.text === 'string' ? current.config.text : ''} onChange={event => { const text = event.target.value; edit(config => ({ ...config, flow: { ...config.flow, nodes: config.flow.nodes.map(node => node.id === current.id ? { ...node, config: { ...node.config, text } } : node) } })) }}/><span className="field-help">Параметр в тексте: <code>{'{{client_name}}'}</code>.</span></label>}{current.type === 'fallback' && <label className="field-label">Пример допустимого запроса<input name="fallback_example" maxLength={500} disabled={!graphEditable} value={typeof current.config.example === 'string' ? current.config.example : ''} onChange={event => { const example = event.target.value; edit(config => ({ ...config, flow: { ...config.flow, nodes: config.flow.nodes.map(node => node.id === current.id ? { ...node, config: { ...node.config, example } } : node) } })) }}/><span className="field-help">Агент предложит пример после нескольких неудачных попыток.</span></label>}</> : <p className="muted">Выберите блок на схеме.</p>}</aside></div></ReactFlowProvider></div>}
    </div>
  </div>
}

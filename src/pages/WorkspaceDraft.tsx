import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, Position, ReactFlow, useNodesState } from '@xyflow/react'
import type { Connection, Node, OnNodeDrag } from '@xyflow/react'
import { api, ApiError, check, getCsrf } from '../api'
import type { components } from '../api/schema'
import { withoutSecrets } from '../sanitize'
import { IntentPanel } from './IntentPanel'
import { EntityPanel } from './EntityPanel'
import { ExamplePanel } from './ExamplePanel'
import { ExportPanel } from './ExportPanel'
import { ImportPanel } from './ImportPanel'
import { TrainingPanel, defaultNluSettings, defaultQualitySettings } from './TrainingPanel'
import { FlowValidation } from './FlowValidation'
import { SwitchNode } from './SwitchNode'
import { SwitchInspector } from './SwitchInspector'

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
const nodeTypes = { intentSwitch: SwitchNode }

export function WorkspaceDraft({ orgId, agentId, userId, role, onDirtyChange }: { orgId: string; agentId: string; userId: string; role: Role; onDirtyChange: (dirty: boolean) => void }) {
  const path = { org_id: orgId, agent_id: agentId }
  const cache = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [lease, setLease] = useState<Grant | null>(null)
  const [state, setState] = useState<SaveState>('saved')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [section, setSection] = useState<'flow' | 'intents' | 'entities' | 'examples' | 'training'>('flow')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 960)
  const [changes, setChanges] = useState(0)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const draftRef = useRef<Draft | null>(null)
  const leaseRef = useRef<Grant | null>(null)
  const changesRef = useRef(0)
  const savingRef = useRef(false)
  const importingRef = useRef(false)
  const mounted = useRef(false)
  const inspectorRef = useRef<HTMLElement | null>(null)
  const uncertain = useRef<{ config: Config; revision: number; generation: number } | null>(null)
  const dirty = state !== 'saved' || importing
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false) }, [dirty, onDirtyChange])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  const agent = useQuery({ queryKey: ['agent', orgId, agentId], queryFn: async () => { const r = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}', { params: { path } }); check(r.response, r.error); if (!r.data) throw new Error('Некорректный ответ сервера'); return r.data } })
  const initial = useQuery({ queryKey: ['draft', orgId, agentId], staleTime: 0, refetchOnWindowFocus: false, queryFn: async () => { const r = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/draft', { params: { path } }); check(r.response, r.error); if (!r.data) throw new Error('Некорректный ответ сервера'); return r.data } })
  useEffect(() => { if (initial.data && (!draftRef.current || (!leaseRef.current && state === 'saved'))) { draftRef.current = initial.data; setDraft(initial.data) } }, [initial.data])
  useEffect(() => { if (draft) { const intents = (draft.config.intents as unknown as Intent[]).map(intent => ({ id: intent.id, name: intent.name, enabled: intent.enabled !== false })); setNodes(draft.config.flow.nodes.map(node => ({ id: node.id, position: node.position, sourcePosition: Position.Right, targetPosition: Position.Left, data: node.type === 'switch_intent' ? { label: names[node.type], intents } : { label: names[node.type] }, type: node.type === 'switch_intent' ? 'intentSwitch' : node.type === 'start' ? 'input' : node.type === 'end' ? 'output' : 'default' }))) } }, [draft?.config.flow.nodes, draft?.config.intents, setNodes])
  useEffect(() => { if (blocker.state === 'blocked') window.confirm('Есть несохранённые изменения. Покинуть страницу?') ? blocker.proceed() : blocker.reset() }, [blocker])
  useEffect(() => { const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload) }, [dirty])
  useEffect(() => { const resize = () => setNarrow(window.innerWidth <= 960); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])
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
  const lose = useCallback((message: string) => { leaseRef.current = null; setLease(null); setState(previous => previous === 'saved' ? 'saved' : 'lost'); setError(message) }, [])
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
    if (!draftRef.current || !leaseRef.current || narrow || importingRef.current) return
    const config = mutate(draftRef.current.config)
    if (config === draftRef.current.config) return
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
  const editable = !!lease && !narrow && !importing && !['lost', 'conflict'].includes(state)
  const edgeLabels: Record<string, string> = { next: 'Далее', fallback: 'Не распознано', success: 'Успешно', error: 'Ошибка', returned: 'Возврат', else: 'Иначе' }
  const edges = draft.config.flow.edges.map(edge => { const isSwitch = draft.config.flow.nodes.find(node => node.id === edge.source)?.type === 'switch_intent'; return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: isSwitch ? edge.source_handle : undefined, label: isSwitch ? '' : edgeLabels[edge.source_handle] || '' } })
  const onDragStop: OnNodeDrag = (_, node) => edit(config => ({ ...config, flow: { ...config.flow, nodes: config.flow.nodes.map(item => item.id === node.id ? { ...item, position: node.position } : item) } }))
  const connect = (connection: Connection) => { if (!connection.source || !connection.target) return; edit(config => { const source = config.flow.nodes.find(node => node.id === connection.source); const target = config.flow.nodes.find(node => node.id === connection.target); const handle = source?.type === 'switch_intent' ? connection.sourceHandle : 'next'; const validIntent = (config.intents as unknown as Intent[]).some(intent => intent.id === handle && intent.enabled !== false); if (!source || !target || !handle || target.type === 'start' || !['start', 'say', 'switch_intent'].includes(source.type) || (source.type === 'switch_intent' && handle !== 'fallback' && !validIntent) || config.flow.edges.length >= 600 || config.flow.edges.some(edge => edge.source === source.id && edge.source_handle === handle)) return config; return { ...config, flow: { ...config.flow, edges: [...config.flow.edges, { id: crypto.randomUUID(), source: connection.source!, target: connection.target!, source_handle: handle }] } } }) }
  const setBranch = (sourceId: string, handle: string, targetId: string) => edit(config => {
    const old = config.flow.edges.find(edge => edge.source === sourceId && edge.source_handle === handle)
    if (old?.target === targetId || (!old && !targetId) || (!old && targetId && config.flow.edges.length >= 600)) return config
    if (targetId && !config.flow.nodes.some(node => node.id === targetId && node.type !== 'start')) return config
    const remaining = config.flow.edges.filter(edge => edge.id !== old?.id)
    return { ...config, flow: { ...config.flow, edges: targetId ? [...remaining, { id: old?.id || crypto.randomUUID(), source: sourceId, source_handle: handle, target: targetId }] : remaining } }
  })
  const add = (type: 'say' | 'end') => edit(config => config.flow.nodes.length >= 300 ? config : ({ ...config, flow: { ...config.flow, nodes: [...config.flow.nodes, { id: crypto.randomUUID(), type, config: type === 'say' ? { text: '' } : {}, position: { x: 200, y: 200 + config.flow.nodes.length * 30 } }] } }))
  return <div className="workspace-draft">
    <div className="page-heading"><div><Link to={`/app/o/${orgId}`}>← К агентам</Link><h1>{agent.data?.name}</h1><p>Версия черновика {draft.revision}</p></div><div className="draft-actions">{!lease && role !== 'viewer' && !dirty && !narrow && <button className="button button-primary" disabled={busy} onClick={() => void begin()}>Начать редактирование</button>}{role !== 'viewer' && <ExportPanel key={`${orgId}:${agentId}`} orgId={orgId} agentId={agentId} enabled={!dirty}/>} {role !== 'viewer' && dirty && <button className="button button-quiet" onClick={download}>Сохранить локальную копию</button>}</div></div>
    <p role="status" className="field-help">{importing ? 'Применение импорта…' : state === 'lost' ? 'Блокировка утрачена' : state === 'conflict' ? 'Конфликт версий' : lease ? ({ saved: 'Сохранено', dirty: 'Есть несохранённые изменения', saving: 'Сохранение…', offline: 'Сохранение не подтверждено', lost: 'Блокировка утрачена', conflict: 'Конфликт версий' }[state]) : draft.lease ? `Редактирует ${draft.lease.holder_name}` : 'Режим просмотра'}</p>
    {narrow && <p className="field-help">Редактирование сценария доступно на компьютере.</p>}{error && <p role="alert" className="auth-error">{error}</p>}{state === 'offline' && lease && <button className="button button-quiet" disabled={busy} onClick={() => void retry()}>Проверить сохранение</button>}
    <div className="filter-tabs draft-sections" role="tablist" aria-label="Раздел агента"><button type="button" role="tab" disabled={importing} aria-selected={section === 'flow'} onClick={() => setSection('flow')}>Сценарий</button><button type="button" role="tab" disabled={importing} aria-selected={section === 'intents'} onClick={() => setSection('intents')}>Намерения</button><button type="button" role="tab" disabled={importing} aria-selected={section === 'entities'} onClick={() => setSection('entities')}>Сущности</button><button type="button" role="tab" disabled={importing} aria-selected={section === 'examples'} onClick={() => setSection('examples')}>Примеры</button><button type="button" role="tab" disabled={importing} aria-selected={section === 'training'} onClick={() => setSection('training')}>Обучение</button></div>
    {section === 'training' ? <TrainingPanel orgId={orgId} agentId={agentId} userId={userId} role={role} revision={draft.revision} enabled={state === 'saved' && !importing} archived={agent.data?.status === 'archived'} settings={draft.config.nlu_settings || defaultNluSettings} quality={draft.config.quality_settings || defaultQualitySettings} editable={editable} onSettingsChange={settings => edit(config => ({ ...config, nlu_settings: settings }))} onQualityChange={settings => edit(config => ({ ...config, quality_settings: settings }))}/> : section === 'intents' ? <IntentPanel key={lease?.lease_token || 'readonly'} orgId={orgId} agentId={agentId} draft={draft} editable={editable} update={edit}/> : section === 'entities' ? <EntityPanel key={lease?.lease_token || 'readonly'} orgId={orgId} agentId={agentId} draft={draft} editable={editable} previewEnabled={role !== 'viewer' && state === 'saved'} update={edit}/> : section === 'examples' ? <>{role !== 'viewer' && <ImportPanel key={`${orgId}:${agentId}`} orgId={orgId} agentId={agentId} revision={draft.revision} lease={narrow ? null : lease} enabled={state === 'saved' && !importing} onApplying={value => { importingRef.current = value; setImporting(value) }} onImported={value => { draftRef.current = value; setDraft(value); setState('saved'); uncertain.current = null; cache.setQueryData(['draft', orgId, agentId], value); void cache.invalidateQueries({ queryKey: ['dataset', orgId, agentId] }) }} onUncertain={() => { setState('conflict'); setError('Применение импорта не подтверждено. Сохраните локальную копию и обновите страницу.') }}/>}<ExamplePanel key={lease?.lease_token || 'readonly'} orgId={orgId} agentId={agentId} draft={draft} editable={editable} update={edit}/></> : <><div className="draft-toolbar">{editable && <><button className="button button-quiet" onClick={() => add('say')}>Добавить ответ</button><button className="button button-quiet" onClick={() => add('end')}>Добавить завершение</button></>}<span className="field-help">Выберите блок на схеме.</span></div>
    <FlowValidation orgId={orgId} agentId={agentId} revision={draft.revision} enabled={state === 'saved' && !importing} flow={draft.config.flow} names={names} onSelect={id => { setSelected(id); setNodes(items => items.map(item => ({ ...item, selected: item.id === id }))); inspectorRef.current?.focus() }}/>
    <div className="draft-editor"><div className="draft-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={editable} nodesConnectable={editable} elementsSelectable deleteKeyCode={editable ? ['Backspace', 'Delete'] : null} onNodesChange={onNodesChange} onNodeClick={(_, node) => setSelected(node.id)} onNodeDragStop={onDragStop} onConnect={connect} onBeforeDelete={async ({ nodes: removed }) => !removed.some(node => draft.config.flow.nodes.some(item => item.id === node.id && item.type === 'start'))} onNodesDelete={removed => edit(config => { const ids = new Set(removed.map(node => node.id)); return { ...config, flow: { ...config.flow, nodes: config.flow.nodes.filter(node => !ids.has(node.id)), edges: config.flow.edges.filter(edge => !ids.has(edge.source) && !ids.has(edge.target)) } } })} onEdgesDelete={removed => edit(config => { const ids = new Set(removed.map(edge => edge.id)); return { ...config, flow: { ...config.flow, edges: config.flow.edges.filter(edge => !ids.has(edge.id)) } } })} fitView><Background/><Controls/></ReactFlow></div><aside ref={inspectorRef} tabIndex={-1} aria-label="Настройки блока" className="draft-inspector">{current ? <><h2>{names[current.type]}</h2><p className="field-help">{current.id}</p>{current.type === 'switch_intent' && <SwitchInspector node={current} flow={draft.config.flow} intents={intents} names={names} editable={editable} onChange={(handle, target) => setBranch(current.id, handle, target)}/>} {['say', 'fallback'].includes(current.type) && <label className="field-label">Текст ответа<textarea name="draft_node_text" rows={5} maxLength={4000} disabled={!editable} value={typeof current.config.text === 'string' ? current.config.text : ''} onChange={event => { const text = event.target.value; edit(config => ({ ...config, flow: { ...config.flow, nodes: config.flow.nodes.map(node => node.id === current.id ? { ...node, config: { ...node.config, text } } : node) } })) }}/></label>}</> : <p className="muted">Выберите блок на схеме.</p>}</aside></div></>}
  </div>
}

import { useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Archive, Boxes, Copy, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { api, check } from '../api'
import type { components } from '../api/schema'

type Role = components['schemas']['OrganizationView']['role']
type Agent = components['schemas']['AgentView']

export function WorkspaceAgents({ orgId, role }: { orgId: string; role: Role }) {
  const cache = useQueryClient()
  const canEdit = role !== 'viewer'
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Agent | null>(null)
  const [copying, setCopying] = useState<Agent | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [filter, setFilter] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const agents = useInfiniteQuery({
    queryKey: ['agents', orgId, filter, search.trim()],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents', { params: { path: { org_id: orgId }, query: { limit: 50, cursor: pageParam, status: filter, q: search.trim() || undefined } } })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const items = agents.data?.pages.flatMap(page => page.items) || []
  const reset = () => { setCreating(false); setEditing(null); setCopying(null); setName(''); setSlug(''); setDescription(''); setError('') }
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action(); await cache.invalidateQueries({ queryKey: ['agents', orgId] }); reset() }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос') }
    finally { setBusy(false) }
  }
  const submit = () => run(async () => {
    if (editing) {
      const result = await api.PATCH('/api/v1/organizations/{org_id}/agents/{agent_id}', { params: { path: { org_id: orgId, agent_id: editing.id }, header: { 'if-match': `"rev-${editing.revision}"` } }, body: { name: name.trim(), description } })
      check(result.response, result.error)
    } else if (copying) {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/copy', { params: { path: { org_id: orgId, agent_id: copying.id } }, body: { name: name.trim(), slug } })
      check(result.response, result.error)
    } else {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents', { params: { path: { org_id: orgId } }, body: { name: name.trim(), slug, description } })
      check(result.response, result.error)
    }
  })
  return <div className="workspace-agents">
    <div className="page-heading"><div><h1>Агенты</h1><p>Создавайте диалоги для ваших пользователей.</p></div>{canEdit && <button className="button button-primary" onClick={() => { reset(); setCreating(true) }}><Plus size={16}/>Создать агента</button>}</div>
    {(creating || editing || copying) && <form className="inline-create" onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="inline-create-header"><h2>{editing ? 'Настройки агента' : copying ? 'Копировать агента' : 'Новый агент'}</h2><button type="button" className="button icon-button" aria-label="Закрыть форму" onClick={reset}><X size={16}/></button></div>
      <div className="inline-create-fields"><label className="field-label">Название<input name="agent_name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} autoFocus/></label>{!editing && <label className="field-label">Адрес агента<input name="agent_slug" required pattern="[a-z][a-z0-9-]{1,63}" value={slug} onChange={e => setSlug(e.target.value)} placeholder="support-agent"/><span className="field-help">Латинские буквы, цифры и дефис</span></label>}{!copying && <label className="field-label">Описание<input name="agent_description" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)}/></label>}<button className="button button-primary" disabled={busy}>{editing ? 'Сохранить' : copying ? 'Копировать' : 'Создать'}</button></div>
    </form>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    <div className="list-toolbar"><div className="filter-tabs" role="tablist" aria-label="Статус агентов"><button type="button" role="tab" aria-selected={filter === 'active'} onClick={() => setFilter('active')}>Активные</button><button type="button" role="tab" aria-selected={filter === 'archived'} onClick={() => setFilter('archived')}>Архив</button></div><label className="field-label"><input aria-label="Найти агента" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти агента…"/></label></div>
    {agents.isLoading ? <p role="status">Загрузка агентов…</p> : agents.isError ? <div className="data-state"><h2>Не удалось загрузить агентов</h2><button className="button button-quiet" onClick={() => agents.refetch()}>Повторить</button></div> : !items.length ? <div className="data-state"><Boxes size={28}/><h2>{search ? 'Агент не найден' : filter === 'archived' ? 'В архиве пока нет агентов' : 'Здесь пока нет агентов'}</h2><p>{search ? 'Попробуйте другое название.' : 'Начните с создания агента.'}</p></div> : <div className="organization-list">{items.map(agent => <div className="organization-row" key={agent.id}><span className="agent-letter">{agent.name[0]}</span><div><strong><Link to={`/app/o/${orgId}/agents/${agent.id}`}>{agent.name}</Link></strong><p>{agent.description || 'Без описания'} · {agent.slug}</p></div><span className="muted">{agent.status === 'archived' ? 'В архиве' : 'Черновик'}</span>{canEdit && <div className="row-actions"><button className="button icon-button" aria-label={`Изменить ${agent.name}`} disabled={busy} onClick={() => { reset(); setEditing(agent); setName(agent.name); setDescription(agent.description) }}><Pencil size={16}/></button><button className="button icon-button" aria-label={`Копировать ${agent.name}`} disabled={busy} onClick={() => { reset(); setCopying(agent); setName(`${Array.from(agent.name).slice(0, 110).join('')} (копия)`) }}><Copy size={16}/></button><button className="button icon-button" aria-label={`${agent.status === 'archived' ? 'Восстановить' : 'В архив'} ${agent.name}`} disabled={busy} onClick={() => void run(async () => { const path = { org_id: orgId, agent_id: agent.id }; const result = agent.status === 'archived' ? await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/restore', { params: { path } }) : await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/archive', { params: { path } }); check(result.response, result.error) })}>{agent.status === 'archived' ? <RotateCcw size={16}/> : <Archive size={16}/>}</button></div>}</div>)}</div>}
    {agents.hasNextPage && <button className="button button-quiet" disabled={agents.isFetchingNextPage} onClick={() => agents.fetchNextPage()}>{agents.isFetchingNextPage ? 'Загрузка…' : 'Загрузить ещё'}</button>}
  </div>
}

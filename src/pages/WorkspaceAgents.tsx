import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker } from 'react-router-dom'
import { Archive, Boxes, Copy, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { api, check } from '../api'
import type { components } from '../api/schema'

type Role = components['schemas']['OrganizationView']['role']
type Agent = components['schemas']['AgentView']
type Fields = { name: string; slug: string; description: string }
type Form = { mode: 'create'; agent?: never } | { mode: 'edit' | 'copy'; agent: Agent }
type Decision = { kind: 'discard'; proceed: () => void; stay?: () => void } | { kind: 'archive'; agent: Agent }
const emptyFields: Fields = { name: '', slug: '', description: '' }
const fieldsOf = (form: Form | null): Fields => {
  if (form?.mode === 'edit') return { name: form.agent.name, slug: form.agent.slug, description: form.agent.description }
  if (form?.mode === 'copy') return { ...emptyFields, name: `${Array.from(form.agent.name).slice(0, 110).join('')} (копия)` }
  return emptyFields
}

export function WorkspaceAgents({ orgId, role }: { orgId: string; role: Role }) {
  const cache = useQueryClient()
  const canEdit = role !== 'viewer'
  const [form, setForm] = useState<Form | null>(null)
  const [fields, setFields] = useState<Fields>(emptyFields)
  const [filter, setFilter] = useState<'active' | 'archived'>('active')
  const [publication, setPublication] = useState('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ message: string; restore?: Agent } | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const listingForm = useRef<HTMLFormElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const initial = fieldsOf(form)
  const dirty = form !== null && (fields.name !== initial.name || fields.slug !== initial.slug || fields.description !== initial.description)
  const wasDirty = useRef(dirty)
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    wasDirty.current && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => { wasDirty.current = dirty }, [dirty])
  useEffect(() => {
    if (blocker.state === 'blocked') setDecision({ kind: 'discard', proceed: blocker.proceed, stay: blocker.reset })
  }, [blocker])
  useEffect(() => {
    if (decision && !dialog.current?.open) dialog.current?.showModal()
  }, [decision])

  const agents = useInfiniteQuery({
    queryKey: ['agents', orgId, filter, publication, search.trim()],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents', {
        params: { path: { org_id: orgId }, query: {
          limit: 50, cursor: pageParam, status: filter,
          published: publication === 'all' ? undefined : publication === 'published',
          q: search.trim() || undefined,
        } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const items = agents.data?.pages.flatMap(page => page.items) || []

  const update = (patch: Partial<Fields>) => setFields(current => ({ ...current, ...patch }))
  const closeForm = () => {
    setForm(null); setFields(emptyFields); setError('')
    wasDirty.current = false
    const trigger = origin.current
    requestAnimationFrame(() => { if (!listingForm.current) trigger?.focus() })
  }
  const guard = (proceed: () => void) => {
    if (dirty) setDecision({ kind: 'discard', proceed })
    else proceed()
  }
  const open = (next: Form, trigger: HTMLElement) => guard(() => {
    origin.current = trigger
    setForm(next)
    setFields(fieldsOf(next))
    setError('')
  })
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice(null)
    try {
      await action()
      await cache.invalidateQueries({ queryKey: ['agents', orgId] })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос')
      return false
    } finally { setBusy(false) }
  }

  const save = async (then?: () => void, stay?: () => void) => {
    if (!form || busy || !listingForm.current?.reportValidity()) { stay?.(); return }
    const { slug, description } = fields
    const name = fields.name.trim()
    if (!name) { setError('Введите название агента.'); stay?.(); return }
    const succeeded = await run(async () => {
      if (form.mode === 'edit') {
        const result = await api.PATCH('/api/v1/organizations/{org_id}/agents/{agent_id}', {
          params: { path: { org_id: orgId, agent_id: form.agent.id }, header: { 'if-match': `"rev-${form.agent.revision}"` } },
          body: { name, description },
        })
        check(result.response, result.error)
      } else if (form.mode === 'copy') {
        const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/copy', {
          params: { path: { org_id: orgId, agent_id: form.agent.id } }, body: { name, slug },
        })
        check(result.response, result.error)
      } else {
        const result = await api.POST('/api/v1/organizations/{org_id}/agents', {
          params: { path: { org_id: orgId } }, body: { name, slug, description },
        })
        check(result.response, result.error)
      }
    })
    if (succeeded) {
      closeForm()
      then?.()
    } else stay?.()
  }

  const changeArchive = async (agent: Agent, restore = agent.status === 'archived') => {
    const succeeded = await run(async () => {
      const path = { org_id: orgId, agent_id: agent.id }
      const result = restore
        ? await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/restore', { params: { path } })
        : await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/archive', { params: { path } })
      check(result.response, result.error)
    })
    if (succeeded) {
      if (form?.agent?.id === agent.id) closeForm()
      setNotice(restore
        ? { message: `«${agent.name}» восстановлен.` }
        : { message: `«${agent.name}» перемещён в архив.`, restore: agent })
    }
  }
  const archive = (agent: Agent) => guard(() => {
    if (agent.status !== 'archived' && agent.current_release_id) setDecision({ kind: 'archive', agent })
    else void changeArchive(agent)
  })
  const closeDialog = () => { dialog.current?.close(); setDecision(null) }
  const stay = () => {
    if (decision?.kind === 'discard') decision.stay?.()
    closeDialog()
  }
  const resetFilters = () => { setPublication('all'); setSearch('') }

  return <div className="workspace-agents">
    <div className="page-heading">
      <div><h1>Агенты</h1><p>Создавайте диалоги для ваших пользователей.</p></div>
      {canEdit && <button className="button button-primary" disabled={busy}
        onClick={event => open({ mode: 'create' }, event.currentTarget)}><Plus size={16}/>Создать агента</button>}
    </div>
    {form && <form key={form.mode + (form.agent?.id ?? '')} ref={listingForm} className="inline-create"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault()
          guard(closeForm)
        }
      }} onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="inline-create-header">
        <h2>{form.mode === 'edit' ? 'Настройки агента' : form.mode === 'copy' ? 'Копировать агента' : 'Новый агент'}</h2>
        <button type="button" className="button icon-button" aria-label="Закрыть форму" disabled={busy}
          onClick={() => guard(closeForm)}><X size={16}/></button>
      </div>
      <div className="inline-create-fields">
        <label className="field-label">Название<input name="agent_name" required maxLength={120}
          value={fields.name} onChange={event => update({ name: event.target.value })} autoFocus/></label>
        {form.mode !== 'edit' && <label className="field-label">Адрес агента<input name="agent_slug" required
          pattern={String.raw`[a-z][a-z0-9\-]{1,63}`} value={fields.slug} placeholder="support-agent"
          aria-describedby="agent-slug-help"
          onInvalid={event => {
            if (event.currentTarget.validity.patternMismatch) {
              event.currentTarget.setCustomValidity('Начните с латинской буквы. Используйте от 2 до 64 строчных букв, цифр и дефисов.')
            }
          }}
          onChange={event => { event.currentTarget.setCustomValidity(''); update({ slug: event.target.value }) }}/>
          <span className="field-help" id="agent-slug-help">Строчные латинские буквы, цифры и дефис</span>
        </label>}
        {form.mode !== 'copy' && <label className="field-label">Описание<input name="agent_description" maxLength={2000}
          value={fields.description} onChange={event => update({ description: event.target.value })}/></label>}
        <button className="button button-primary" disabled={busy}>
          {form.mode === 'edit' ? 'Сохранить' : form.mode === 'copy' ? 'Копировать' : 'Создать'}
        </button>
      </div>
    </form>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {notice && <p role="status" className="inline-note">{notice.message}
      {notice.restore && <button type="button" className="button button-text" disabled={busy}
        onClick={() => { const agent = notice.restore; if (agent) guard(() => void changeArchive(agent, true)) }}>Восстановить</button>}
    </p>}
    <div className="list-toolbar">
      <div className="filter-tabs" role="group" aria-label="Статус агентов">
        <button type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Активные</button>
        <button type="button" aria-pressed={filter === 'archived'} onClick={() => setFilter('archived')}>Архив</button>
      </div>
      <label className="field-label"><select aria-label="Наличие публикации" value={publication}
        onChange={event => setPublication(event.target.value)}>
        <option value="all">Все публикации</option><option value="published">Опубликованные</option><option value="unpublished">Без публикации</option>
      </select></label>
      <label className="field-label"><input aria-label="Найти агента" maxLength={120} value={search}
        onChange={event => setSearch(event.target.value)} placeholder="Найти агента…"/></label>
    </div>
    {agents.isLoading ? <p role="status">Загрузка агентов…</p> : agents.isError
      ? <div className="data-state"><h2>Не удалось загрузить агентов</h2><button className="button button-quiet"
        onClick={() => void agents.refetch()}>Повторить</button></div>
      : !items.length ? <div className="data-state"><Boxes size={28}/>
        {search.trim() || publication !== 'all' ? <><h2>Агент не найден</h2><button className="button button-quiet"
          onClick={resetFilters}>Сбросить фильтры</button></>
          : filter === 'archived' ? <><h2>В архиве пока нет агентов</h2><button className="button button-quiet"
            onClick={() => setFilter('active')}>К активным агентам</button></>
            : <><h2>Здесь пока нет агентов</h2><p>{canEdit ? 'Начните с создания агента.' : 'Агенты появятся, когда их добавит редактор пространства.'}</p></>}
      </div> : <div className="organization-list">{items.map(agent => <div className="organization-row agent-row" key={agent.id}>
        <Link className="agent-row-link" to={`/app/o/${orgId}/agents/${agent.id}`}
          aria-labelledby={`agent-name-${agent.id}`} aria-describedby={`agent-details-${agent.id} agent-status-${agent.id}`}>
          <span className="agent-letter" aria-hidden="true">{agent.name[0]}</span>
          <div className="agent-row-copy"><strong id={`agent-name-${agent.id}`}>{agent.name}</strong><p id={`agent-details-${agent.id}`}>{agent.description || 'Без описания'} <span className="agent-row-slug">{agent.slug}</span></p></div>
          <span className="muted" id={`agent-status-${agent.id}`}>{agent.status === 'archived' ? 'В архиве' : agent.current_release_id ? 'Опубликован' : 'Черновик'}</span>
        </Link>
        {canEdit && <AgentActions agent={agent} busy={busy} open={open} archive={archive}/>}
      </div>)}</div>}
    {agents.hasNextPage && <button className="button button-quiet" disabled={agents.isFetchingNextPage}
      onClick={() => void agents.fetchNextPage()}>{agents.isFetchingNextPage ? 'Загрузка…' : 'Загрузить ещё'}</button>}
    <dialog ref={dialog} className="standard-dialog" aria-labelledby="agent-action-title"
      onCancel={event => { event.preventDefault(); stay() }}>
      {decision?.kind === 'discard' && <>
        <h2 id="agent-action-title">Есть несохранённые изменения</h2>
        <p>Сохраните или отбросьте правки, прежде чем продолжить.</p>
        <div className="dialog-actions">
          <button type="button" className="button button-quiet" autoFocus onClick={stay}>Остаться</button>
          <button type="button" className="button button-quiet" onClick={() => { closeDialog(); closeForm(); decision.proceed() }}>Отбросить изменения</button>
          <button type="button" className="button button-primary" onClick={() => { closeDialog(); void save(decision.proceed, decision.stay) }}>Сохранить и продолжить</button>
        </div>
      </>}
      {decision?.kind === 'archive' && <>
        <h2 id="agent-action-title">Переместить в архив?</h2>
        <p>Новые диалоги с агентом «{decision.agent.name}» перестанут запускаться. Уже начатые продолжатся.</p>
        <div className="dialog-actions">
          <button type="button" className="button button-quiet" autoFocus onClick={stay}>Отмена</button>
          <button type="button" className="button button-primary" onClick={() => { closeDialog(); void changeArchive(decision.agent) }}>Переместить в архив</button>
        </div>
      </>}
    </dialog>
  </div>
}

function AgentActions({ agent, busy, open, archive }: {
  agent: Agent; busy: boolean; open: (form: Form, trigger: HTMLElement) => void; archive: (agent: Agent) => void
}) {
  const archived = agent.status === 'archived'
  const actions = [
    { title: 'Изменить название и описание', label: `Изменить ${agent.name}`, Icon: Pencil, action: (trigger: HTMLElement) => open({ mode: 'edit', agent }, trigger) },
    { title: 'Копировать агента', label: `Копировать ${agent.name}`, Icon: Copy, action: (trigger: HTMLElement) => open({ mode: 'copy', agent }, trigger) },
    { title: archived ? 'Восстановить агента' : 'В архив', label: `${archived ? 'Восстановить' : 'В архив'} ${agent.name}`, Icon: archived ? RotateCcw : Archive, action: () => archive(agent) },
  ]
  function choose(event: MouseEvent<HTMLButtonElement>, action: (trigger: HTMLElement) => void) {
    const details = event.currentTarget.closest('details')
    const trigger = details?.querySelector('summary') ?? event.currentTarget
    if (details) { details.open = false; trigger.focus() }
    action(trigger)
  }
  return <div className="agent-actions">
    <div className="row-actions agent-icon-actions">{actions.map(({ title, label, Icon, action }) =>
      <AgentIconAction key={label} title={title} label={label} disabled={busy} onClick={event => choose(event, action)}>
        <Icon size={16} aria-hidden="true"/>
      </AgentIconAction>
    )}</div>
    <details className="agent-action-menu" name="agent-actions" onKeyDown={event => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return
      event.preventDefault()
      event.currentTarget.open = false
      event.currentTarget.querySelector('summary')?.focus()
    }}>
      <summary className="button button-quiet" aria-label={`Действия с агентом ${agent.name}`}>Действия</summary>
      <div className="agent-action-menu-items">{actions.map(({ title, label, action }) =>
        <button key={label} type="button" className="button button-quiet" disabled={busy} onClick={event => choose(event, action)}>{title}</button>
      )}</div>
    </details>
  </div>
}

function AgentIconAction({ title, label, disabled, onClick, children }: {
  title: string; label: string; disabled: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; children: ReactNode
}) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const show = !dismissed && (hover || focus)
  useEffect(() => {
    if (!show) return
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setDismissed(true) }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [show])
  return <span className="agent-icon-action"
    onPointerEnter={() => { setHover(true); setDismissed(false) }} onPointerLeave={() => setHover(false)}>
    <button type="button" className="button icon-button" aria-label={label} disabled={disabled} onClick={onClick}
      onFocus={event => { setFocus(event.currentTarget.matches(':focus-visible')); setDismissed(false) }}
      onBlur={() => setFocus(false)}>{children}</button>
    {show && <span className="agent-action-hint" aria-hidden="true">{title}</span>}
  </span>
}

import { useState, type FormEvent } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'

type Integration = components['schemas']['IntegrationView']
type Method = components['schemas']['IntegrationInput']['methods'][number]
type Role = components['schemas']['OrganizationView']['role']
const methods: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean)

export function Integrations({ orgId, role }: { orgId: string; role: Role }) {
  const cache = useQueryClient()
  const editable = role === 'owner' || role === 'admin'
  const [editing, setEditing] = useState<Integration | 'new' | null>(null)
  const [rotation, setRotation] = useState<Integration | null>(null)
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const integrations = useInfiniteQuery({
    queryKey: ['integrations', orgId], initialPageParam: '', retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/integrations', { params: { path: { org_id: orgId }, query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } }, signal })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const refresh = () => cache.invalidateQueries({ queryKey: ['integrations', orgId] })
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await work(); await refresh() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось выполнить действие. Попробуйте ещё раз.'); await refresh() }
    finally { setBusy(false) }
  }
  const toggle = (item: Integration) => run(async () => {
    const result = await api.PATCH('/api/v1/organizations/{org_id}/integrations/{integration_id}', { params: { path: { org_id: orgId, integration_id: item.id }, header: { 'If-Match': `"rev-${item.revision}"` } }, body: { enabled: !item.enabled } })
    check(result.response, result.error)
  })
  const remove = (item: Integration) => {
    if (!window.confirm(`Удалить интеграцию «${item.name}»?`)) return
    void run(async () => { const result = await api.DELETE('/api/v1/organizations/{org_id}/integrations/{integration_id}', { params: { path: { org_id: orgId, integration_id: item.id }, header: { 'If-Match': `"rev-${item.revision}"` } } }); check(result.response, result.error) })
  }
  const rotate = (event: FormEvent) => {
    event.preventDefault()
    if (!rotation || !secret) return
    void run(async () => {
      const result = await api.POST('/api/v1/organizations/{org_id}/integrations/{integration_id}/rotate-secret', { params: { path: { org_id: orgId, integration_id: rotation.id }, header: { 'If-Match': `"rev-${rotation.revision}"` } }, body: { secret } })
      check(result.response, result.error); setSecret(''); setRotation(null)
    })
  }
  return <section><div className="section-heading"><div><h1>Интеграции</h1><p>Подключения к внешним HTTPS-сервисам.</p></div>{editable && <button className="button button-primary" disabled={busy} onClick={() => { setError(''); setRotation(null); setEditing('new') }}>Добавить интеграцию</button>}</div>
    <p className="field-help">Вызовы интеграций из сценариев пока не подключены.</p>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {editing && <IntegrationForm key={editing === 'new' ? 'new' : editing.id} orgId={orgId} initial={editing === 'new' ? null : editing} busy={busy} onCancel={() => setEditing(null)} onSave={work => void run(async () => { await work(); setEditing(null) })}/>}
    {rotation && <form className="integration-form" onSubmit={rotate}><h2>Новый секрет: {rotation.name}</h2><label className="field-label">Секрет<input type="password" autoComplete="new-password" value={secret} onChange={event => setSecret(event.target.value)} required/></label><div className="row-actions"><button className="button button-primary" disabled={busy || !secret}>Обновить секрет</button><button type="button" className="button button-quiet" onClick={() => { setSecret(''); setRotation(null) }}>Отмена</button></div></form>}
    {integrations.isPending ? <p role="status">Загрузка интеграций…</p> : integrations.isError ? <div className="data-state"><h2>Не удалось загрузить интеграции</h2><button className="button button-quiet" onClick={() => void integrations.refetch()}>Повторить</button></div> : <div className="organization-list">{integrations.data.pages.flatMap(page => page.items).map(item => <article className="integration-row" key={item.id}><div><h2>{item.name}</h2><p>{item.base_url}</p><small>{item.methods.join(', ')} · {item.enabled ? 'Включена' : 'Отключена'} · {item.has_secret ? 'Секрет задан' : 'Без секрета'}</small></div>{editable && <div className="row-actions"><button className="button button-quiet" disabled={busy} onClick={() => { setRotation(null); setEditing(item) }}>Изменить</button><button className="button button-quiet" disabled={busy} onClick={() => { setSecret(''); setEditing(null); setRotation(item) }}>Сменить секрет</button><button className="button button-quiet" disabled={busy} onClick={() => void toggle(item)}>{item.enabled ? 'Отключить' : 'Включить'}</button><button className="button button-quiet" disabled={busy} onClick={() => remove(item)}>Удалить</button></div>}</article>)}{!integrations.data.pages.some(page => page.items.length) && <div className="data-state"><h2>Интеграций пока нет</h2><p>Добавьте подключение к внешнему сервису.</p></div>}{integrations.hasNextPage && <button className="button button-quiet" disabled={integrations.isFetchingNextPage} onClick={() => void integrations.fetchNextPage()}>Показать ещё</button>}</div>}
  </section>
}

function IntegrationForm({ orgId, initial, busy, onCancel, onSave }: { orgId: string; initial: Integration | null; busy: boolean; onCancel: () => void; onSave: (work: () => Promise<void>) => void }) {
  const [name, setName] = useState(initial?.name || '')
  const [base, setBase] = useState(initial?.base_url || '')
  const [selected, setSelected] = useState<Method[]>(methods.filter(method => initial?.methods.includes(method) || (!initial && method === 'GET')))
  const [paths, setPaths] = useState(initial?.paths.join('\n') || '')
  const [fields, setFields] = useState(initial?.response_fields.join('\n') || '')
  const [idempotency, setIdempotency] = useState(initial?.supports_idempotency ?? false)
  const [secret, setSecret] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const data = { name: name.trim(), base_url: base.trim(), methods: selected, paths: lines(paths), response_fields: lines(fields), enabled: initial?.enabled ?? true, supports_idempotency: idempotency }
    onSave(async () => {
      if (initial) {
        const result = await api.PATCH('/api/v1/organizations/{org_id}/integrations/{integration_id}', { params: { path: { org_id: orgId, integration_id: initial.id }, header: { 'If-Match': `"rev-${initial.revision}"` } }, body: data }); check(result.response, result.error)
      } else {
        const result = await api.POST('/api/v1/organizations/{org_id}/integrations', { params: { path: { org_id: orgId } }, body: { ...data, secret: secret || null } }); check(result.response, result.error)
      }
      setSecret('')
    })
  }
  return <form className="integration-form" onSubmit={submit}><h2>{initial ? 'Изменить интеграцию' : 'Новая интеграция'}</h2>
    <label className="field-label">Название<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required/></label>
    <label className="field-label">Базовый HTTPS-адрес<input type="url" value={base} onChange={event => setBase(event.target.value)} placeholder="https://api.example.com" required/></label>
    <fieldset><legend>Разрешённые методы</legend><div className="integration-methods">{methods.map(method => <label key={method}><input type="checkbox" checked={selected.includes(method)} onChange={event => setSelected(current => event.target.checked ? [...current, method] : current.filter(item => item !== method))}/>{method}</label>)}</div></fieldset>
    <label className="field-label">Разрешённые пути<textarea value={paths} onChange={event => setPaths(event.target.value)} placeholder={'/orders/\n/status'} required/><span className="field-help">Каждый путь с новой строки, начиная с /.</span></label>
    <label className="field-label">Разрешённые поля ответа<textarea value={fields} onChange={event => setFields(event.target.value)} placeholder={'status\norder_id'}/><span className="field-help">Каждое поле с новой строки.</span></label>
    <label><input type="checkbox" checked={idempotency} onChange={event => setIdempotency(event.target.checked)}/> Сервис поддерживает Idempotency-Key</label>
    {!initial && <label className="field-label">Секрет<input type="password" autoComplete="new-password" value={secret} onChange={event => setSecret(event.target.value)}/><span className="field-help">После сохранения значение нельзя посмотреть.</span></label>}
    <div className="row-actions"><button className="button button-primary" disabled={busy || !name.trim() || !selected.length || !lines(paths).length}>Сохранить</button><button type="button" className="button button-quiet" disabled={busy} onClick={onCancel}>Отмена</button></div>
  </form>
}

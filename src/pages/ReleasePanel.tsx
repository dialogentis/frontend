import { useState, type FormEvent } from 'react'
import { type InfiniteData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'

type Agent = components['schemas']['AgentView']
type AgentPage = components['schemas']['CursorPage_AgentView_']
type Version = components['schemas']['VersionView']
type Release = components['schemas']['ReleaseView']
type Path = { org_id: string; agent_id: string }
const fullDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const message = (error: unknown) => error instanceof ApiError
  ? error.details.map(detail => detail.message).filter(item => typeof item === 'string').slice(0, 3).join(' ') || error.message
  : 'Операция не подтверждена. Проверьте текущую публикацию.'

export function ReleasePanel({ agent, version, versions, canPublish, saved }: {
  agent: Agent; version: Version | undefined; versions: Version[]
  canPublish: boolean; saved: boolean
}) {
  const cache = useQueryClient()
  const path = { org_id: agent.organization_id, agent_id: agent.id }
  const key = ['agent-releases', path.org_id, path.agent_id]
  const [rollback, setRollback] = useState<Release | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const history = useInfiniteQuery({
    queryKey: key,
    initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/releases', {
        params: { path, query: { limit: 25, cursor: pageParam || undefined } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const items = history.data?.pages.flatMap(page => page.items) ?? []
  const current = items.find(item => item.id === agent.current_release_id)
  const versionName = (id: string) => {
    const item = versions.find(candidate => candidate.id === id)
    return item ? `Версия ${item.number}` : `Версия ${id.slice(0, 8)}`
  }
  const run = async (operation: () => Promise<string>, success: string) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const releaseId = await operation()
      cache.setQueriesData<InfiniteData<AgentPage>>({ queryKey: ['agents', path.org_id] }, data => data && ({
        ...data,
        pages: data.pages.map(page => ({
          ...page,
          items: page.items.map(item => item.id === agent.id ? { ...item, current_release_id: releaseId } : item),
        })),
      }))
      setNotice(success); setRollback(null); setReason('')
    }
    catch (error) { setError(message(error)) }
    finally {
      await Promise.all([
        cache.invalidateQueries({ queryKey: key }),
        cache.invalidateQueries({ queryKey: ['agent', path.org_id, path.agent_id] }),
        cache.invalidateQueries({ queryKey: ['agents', path.org_id] }),
      ])
      setBusy(false)
    }
  }
  const header = { 'If-Match': `"rev-${agent.revision}"` }
  const allowed = canPublish && agent.status === 'active' && saved && !busy
  return <section className="release-panel" aria-label="Публикации">
    <div className="section-heading"><div>
      <h3>Публикации</h3>
      <p>{current ? `Опубликована: ${versionName(current.root_version_id)}` : agent.current_release_id ? 'Есть активная публикация' : 'Пока нет опубликованной версии'}</p>
    </div></div>
    {canPublish && !saved && <p className="field-help">Дождитесь сохранения черновика.</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {notice && <p role="status" className="inline-note">{notice}</p>}
    {canPublish && version?.status === 'ready' && current?.root_version_id !== version.id &&
      <PublishVersion key={version.id} path={path} version={version} enabled={allowed}
        publish={(acknowledgement, reason) => run(async () => {
          const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/releases', {
            params: { path, header },
            body: { version_id: version.id, warning_acknowledgement: acknowledgement, reason },
            signal: AbortSignal.timeout(30_000),
          })
          check(result.response, result.error)
          if (!result.data) throw new Error('Некорректный ответ сервера')
          return result.data.id
        }, `Версия ${version.number} опубликована.`)}/>}
    {history.isPending && <p role="status">Загрузка публикаций…</p>}
    {history.isError && <p role="alert">Не удалось загрузить историю. <button type="button" className="button button-text" onClick={() => void history.refetch()}>Повторить</button></p>}
    {!!items.length && <ul className="release-list">{items.map(item => <li key={item.id} className="release-row">
      <div>
        <strong>{versionName(item.root_version_id)}{item.id === agent.current_release_id ? ' · текущая публикация' : ''}</strong>
        <p className="field-help">{fullDate.format(new Date(item.created_at))} · закреплено версий: {item.dependency_manifest.length}</p>
        {item.reason && <p>{item.reason}</p>}
      </div>
      {canPublish && item.id !== agent.current_release_id && <button type="button" className="button button-quiet" disabled={!allowed} onClick={() => { setRollback(item); setReason(''); setError('') }}>Откатить</button>}
    </li>)}</ul>}
    {history.hasNextPage && <button type="button" className="button button-quiet" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>Показать ещё публикации</button>}
    {rollback && <form className="release-form" onSubmit={(event: FormEvent) => {
      event.preventDefault()
      if (!allowed || !reason.trim()) return
      void run(async () => {
        const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/rollback', {
          params: { path, header }, body: { release_id: rollback.id, reason: reason.trim() },
          signal: AbortSignal.timeout(15_000),
        })
        check(result.response, result.error)
        if (!result.data) throw new Error('Некорректный ответ сервера')
        return result.data.current_release_id
      }, `Возвращена публикация «${versionName(rollback.root_version_id)}».`)
    }}>
      <p>Вернуть публикацию «{versionName(rollback.root_version_id)}» для новых диалогов?</p>
      <label className="field-label">Причина отката<textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></label>
      <div className="row-actions">
        <button className="button button-primary" disabled={!allowed || !reason.trim()}>Подтвердить откат</button>
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => setRollback(null)}>Отмена</button>
      </div>
    </form>}
  </section>
}

function PublishVersion({ path, version, enabled, publish }: {
  path: Path; version: Version; enabled: boolean
  publish: (acknowledgement: boolean, reason: string | null) => Promise<void>
}) {
  const [ack, setAck] = useState(false)
  const [reason, setReason] = useState('')
  const readiness = useQuery({
    queryKey: ['release-check', path.org_id, path.agent_id, version.id],
    enabled: false,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/versions/{version_id}/release-check', {
        params: { path: { ...path, version_id: version.id } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
  })
  const warnings = readiness.data?.warnings ?? []
  return <div className="release-form">
    <button type="button" className="button button-quiet" disabled={!enabled || readiness.isFetching} onClick={() => {
      setAck(false); void readiness.refetch()
    }}>{readiness.isFetching ? 'Проверяем…' : 'Проверить публикацию'}</button>
    {readiness.isError && <p role="alert">{message(readiness.error)}</p>}
    {readiness.isSuccess && <>
      {!!readiness.data.errors?.length && <ul className="release-issues">{readiness.data.errors.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
      {!readiness.data.errors?.length && <form onSubmit={event => {
        event.preventDefault()
        if (enabled && (!warnings.length || (ack && reason.trim()))) void publish(ack, reason.trim() || null)
      }}>
        {!!warnings.length && <>
          <ul className="release-issues">{warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul>
          <label><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)}/>Подтверждаю предупреждения о качестве</label>
          <label className="field-label">Причина публикации<textarea maxLength={500} required value={reason} onChange={event => setReason(event.target.value)}/></label>
        </>}
        <button className="button button-primary" disabled={!enabled || readiness.isFetching || (!!warnings.length && (!ack || !reason.trim()))}>Опубликовать версию {version.number}</button>
      </form>}
    </>}
  </div>
}

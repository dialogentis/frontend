import { useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Layers3 } from 'lucide-react'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'
import { ExportPanel } from './ExportPanel'
import { TestChat } from './TestChat'
import { ReleasePanel } from './ReleasePanel'

type Version = components['schemas']['VersionView']
type Role = components['schemas']['OrganizationView']['role']
type Pending = { revision: number; key: string }
const labels: Record<Version['status'], string> = { building: 'Подготовка', ready: 'Готова', failed: 'Ошибка', cancelled: 'Отменено', obsolete: 'Устарела' }
const stages: Record<NonNullable<Version['stage']>, string> = { validation: 'Проверка сценария', packaging: 'Сохранение снимка' }
const failures: Record<string, string> = {
  worker_lost: 'Подготовка прервана. Запустите её снова.',
  timeout: 'Время подготовки истекло.',
  artifact_quota_exceeded: 'Недостаточно места для сохранения версии.',
  artifact_storage_unavailable: 'Хранилище версий временно недоступно.',
}
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function VersionsPanel({ orgId, agentId, agent, userId, role, revision, enabled, archived }: { agent?: components['schemas']['AgentView']; orgId: string; agentId: string; userId: string; role: Role; revision: number; enabled: boolean; archived: boolean }) {
  const cache = useQueryClient()
  const path = { org_id: orgId, agent_id: agentId }
  const pendingKey = `dialogentis:training:${userId}:${orgId}:${agentId}`
  const [pending, setPending] = useState<Pending | null>(() => { try { const value = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); return value && typeof value.key === 'string' && Number.isInteger(value.revision) ? value : null } catch { return null } })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const versions = useInfiniteQuery({
    queryKey: ['agent-versions', orgId, agentId], initialPageParam: 0, retry: false,
    queryFn: async ({ pageParam, signal }) => { const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/versions', { params: { path, query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } }, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }); check(result.response, result.error); if (!result.data) throw new Error('Некорректный ответ сервера'); return result.data },
    getNextPageParam: page => page.next_cursor ? Number(page.next_cursor) : undefined,
    refetchInterval: query => document.hidden || !query.state.data?.pages.some(page => page.items.some(item => item.status === 'building')) ? false : 3000,
    refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  })
  const items = versions.data?.pages.flatMap(page => page.items) || []
  const selected = items.find(item => item.id === selectedId) || items.find(item => item.status !== 'obsolete') || items[0]
  const refresh = () => cache.invalidateQueries({ queryKey: ['agent-versions', orgId, agentId] })
  const start = async () => {
    const request = pending || { revision, key: crypto.randomUUID() }
    sessionStorage.setItem(pendingKey, JSON.stringify(request)); setPending(request); setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/versions', { params: { path, header: { 'Idempotency-Key': request.key } }, body: { source_revision: request.revision }, signal: AbortSignal.timeout(30_000) }); check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      sessionStorage.removeItem(pendingKey); setPending(null); setSelectedId(result.data.version_id); void refresh()
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) { sessionStorage.removeItem(pendingKey); setPending(null) }
      setError(e instanceof ApiError ? e.details.map(item => typeof item.message === 'string' ? item.message : '').filter(Boolean).slice(0, 3).join(' ') || e.message : 'Запуск не подтверждён. Повторите проверку запуска.'); void refresh()
    } finally { setBusy(false) }
  }
  const cancel = async (version: Version) => {
    setBusy(true); setError('')
    try { const result = await api.POST('/api/v1/organizations/{org_id}/jobs/{job_id}/cancel', { params: { path: { org_id: orgId, job_id: version.job_id } }, signal: AbortSignal.timeout(10_000) }); check(result.response, result.error); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отменить подготовку'); void refresh() }
    finally { setBusy(false) }
  }
  const canManage = role !== 'viewer'
  const active = items.some(item => item.status === 'building')
  const canCancel = selected && (role === 'owner' || role === 'admin' || (role === 'editor' && selected.created_by === userId))
  return <section className="training-page">
    <div className="section-heading"><div><h2>Версии агента</h2><p>Версия закрепляет сценарий, намерения и языковую модель.</p></div>{canManage && <button type="button" className="button button-primary" disabled={busy || (!pending && (!enabled || archived || active || versions.isPending || versions.isError))} onClick={() => void start()}><Layers3 size={16}/>{pending ? 'Проверить запуск' : 'Подготовить версию'}</button>}</div>
    {pending && <p className="field-help">Запуск версии черновика {pending.revision} не подтверждён. Повторная проверка не создаст второе задание.</p>}
    {!enabled && !pending && canManage && <p className="field-help">Дождитесь сохранения изменений перед подготовкой версии.</p>}
    {archived && canManage && <p className="field-help">Восстановите агента из архива, чтобы подготовить версию.</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {versions.isPending ? <p role="status">Загрузка версий…</p> : versions.isError ? <div className="data-state"><h3>Не удалось загрузить версии</h3><button type="button" className="button button-quiet" onClick={() => void versions.refetch()}>Повторить</button></div> : !items.length ? <div className="data-state"><h3>Версий пока нет</h3><p>Опишите намерения и свяжите их с ветками сценария.</p></div> : <div className="training-workspace">
      <div className="training-version-list" aria-label="Версии агента">{items.map(item => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}><strong>Версия {item.number}</strong><span>{labels[item.status]} · черновик {item.source_revision}</span><small>{date(item.created_at)}</small></button>)}{versions.hasNextPage && <button type="button" disabled={versions.isFetchingNextPage} onClick={() => void versions.fetchNextPage()}>Показать ещё</button>}</div>
      {selected && <div className="training-detail"><div className="section-heading"><div><h3>Версия {selected.number}</h3><p>{labels[selected.status]} · черновик {selected.source_revision} · {date(selected.created_at)}</p></div>
        {canManage && <div className="draft-actions">
          <ExportPanel key={selected.id} orgId={orgId} agentId={agentId} version={selected} enabled/>
          {selected.status === 'building' && canCancel && <button type="button" className="button button-quiet" disabled={busy || selected.cancel_requested} onClick={() => void cancel(selected)}>{selected.cancel_requested ? 'Отмена…' : 'Отменить'}</button>}
        </div>}
      </div>
        {selected.status === 'building' && <p role="status">{selected.cancel_requested ? 'Отменяем подготовку…' : selected.job_status === 'queued' ? 'Ожидает очереди' : selected.stage ? stages[selected.stage] : 'Подготовка версии…'}</p>}
        {selected.status === 'failed' && <p role="alert" className="auth-error">{failures[selected.error_code || ''] || 'Не удалось подготовить версию. Проверьте данные и повторите попытку.'}</p>}
        {selected.status === 'cancelled' && <p>Подготовка отменена.</p>}
        {selected.status === 'obsolete' && <p className="field-help">Эта версия собрана для прежнего движка. Для тестового чата и публикации подготовьте новую версию из черновика.</p>}
        {selected.llm_model && <p className="field-help">Языковая модель · {selected.llm_model}</p>}
        {!!selected.dataset_warnings.length && <details><summary>Предупреждения данных: {selected.dataset_warnings.length}{selected.warnings_truncated ? '+' : ''}</summary>{selected.dataset_warnings.map((item, index) => <p className="field-help" key={`${item.code}-${index}`}>{item.message}</p>)}</details>}
        {agent && <ReleasePanel agent={agent} version={selected} versions={items} canPublish={role === 'owner' || role === 'admin'} saved={enabled}/>}
        {selected.status === 'ready' && <TestChat key={`${orgId}:${agentId}:${selected.id}`} orgId={orgId} agentId={agentId} versionId={selected.id} canRunLive={role === 'owner' || role === 'admin'}/>}
      </div>}
    </div>}
  </section>
}

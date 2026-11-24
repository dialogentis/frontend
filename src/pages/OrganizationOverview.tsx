import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ListTodo } from 'lucide-react'
import { api, check } from '../api'
import type { components } from '../api/schema'
import { AuditRows } from './OrganizationAudit'
import { analyticsPeriod } from './analyticsPeriod'

const statuses = { active: 'Активные', failed: 'С ошибкой', succeeded: 'Завершённые', cancelled: 'Отменённые', all: 'Все состояния' } as const
type JobFilter = keyof typeof statuses
const kinds: Record<string, string> = {
  'agent.training': 'Подготовка версии агента', 'dataset.import': 'Импорт данных', 'dataset.export': 'Экспорт агента',
  'history.export': 'Выгрузка истории', 'history.deletion': 'Удаление истории', 'organization.deletion': 'Удаление пространства',
}
const phases = { dispatch_wait: 'Ожидает отправки в RabbitMQ', worker_wait: 'Ожидает рабочий процесс', retry_wait: 'Запланирована повторная попытка' }
const jobStatuses = { queued: 'В очереди', running: 'В работе', failed: 'Ошибка', succeeded: 'Завершено', cancelled: 'Отменено' }
const workers = { listening: 'Подключён', absent: 'Нет подключений', unknown: 'Состояние недоступно' }
const time = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' })
const number = new Intl.NumberFormat('ru')

export function OrganizationOverview({ orgId, canAudit }: { orgId: string; canAudit: boolean }) {
  const [params, setParams] = useSearchParams()
  const [days, setDays] = useState(7)
  const selected = params.get('jobs')
  const filter = selected && Object.hasOwn(statuses, selected) ? selected as JobFilter : 'active'
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const period = analyticsPeriod(days, zone)
  const path = { org_id: orgId }
  const root = `/app/o/${orgId}`
  const jobs = useInfiniteQuery({
    queryKey: ['workspace-queue', orgId, filter], initialPageParam: '', refetchInterval: 15_000,
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/jobs/queue', {
        params: { path, query: { status: filter === 'all' ? undefined : filter, cursor: pageParam || undefined } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Очередь недоступна')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const analytics = useQuery({
    queryKey: ['analytics-summary', orgId, period], refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/analytics/summary', {
        params: { path, query: period }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Отчёт недоступен')
      return result.data
    },
  })
  const audit = useQuery({
    queryKey: ['overview-audit', orgId], enabled: canAudit,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/audit', {
        params: { path, query: { limit: 5 } }, signal,
      })
      check(result.response, result.error)
      return result.data?.items ?? []
    },
  })
  const queue = jobs.data?.pages[0]
  const items = jobs.data?.pages.flatMap(page => page.items) ?? []
  const count = (value: number | undefined) => value === undefined ? '—' : number.format(value)
  const selectQueue = (status: JobFilter) => setParams({ jobs: status })
  return <section className="workspace-overview">
    <div className="page-heading"><div><h1>Обзор</h1>
      <p>{analytics.data ? `Обновлено ${time.format(new Date(analytics.data.as_of))} · ${zone}` : zone}</p></div>
      <label className="field-label">Период диалогов<select name="overview_period" value={days}
        onChange={event => setDays(Number(event.target.value))}>
        <option value={1}>Сегодня</option><option value={7}>Последние 7 дней</option><option value={30}>Последние 30 дней</option>
      </select></label>
    </div>
    <div className="overview-register">
      <div><Link to={root}>Активные агенты</Link><strong>{count(queue?.active_agents)}</strong></div>
      <div><Link to="?jobs=active#overview-queue">Задания в работе и в очереди</Link>
        <strong>{count(queue && queue.queued + queue.running)}</strong></div>
      <div><Link to="?jobs=failed#overview-queue">Задания с ошибкой</Link><strong>{count(queue?.failed)}</strong></div>
      <div><Link to={`${root}/analytics?from=${period.from}&to=${period.to}`}>Диалоги на рабочих каналах</Link>
        <strong data-overview="dialogues">{count(analytics.data?.dialogues)}</strong></div>
    </div>
    {analytics.isError && <p role="alert">Сводка диалогов недоступна. <button type="button" className="button button-quiet"
      onClick={() => void analytics.refetch()}>Повторить</button></p>}
    <section id="overview-queue">
      <div className="section-heading"><h2>Очередь заданий</h2>
        <label className="field-label">Состояние<select name="overview_job_status" value={filter}
          onChange={event => selectQueue(event.target.value as JobFilter)}>
          {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
      {queue && <dl className="overview-broker" aria-label="Состояние очередей">
        <div><dt>RabbitMQ</dt><dd>{queue.broker.status === 'available' ? 'Доступен' : 'Недоступен'}</dd></div>
        <div><dt>Рабочий процесс заданий</dt><dd>{workers[queue.broker.normal_worker]}</dd></div>
        <div><dt>Подготовка версий</dt><dd>{workers[queue.broker.training_worker]}</dd></div>
      </dl>}
      {queue?.broker.status === 'unavailable' && <p role="status">Задания сохраняются и ждут подключения RabbitMQ.</p>}
      {jobs.isPending && <p role="status">Загрузка заданий…</p>}
      {jobs.isError && <p role="alert">Не удалось загрузить очередь. <button type="button" className="button button-quiet"
        onClick={() => void jobs.refetch()}>Повторить</button></p>}
      {jobs.isSuccess && !items.length && <p className="field-help">Заданий с выбранным состоянием нет.</p>}
      <ol className="audit-list overview-jobs">{items.map(item => <JobRow key={item.job_id} item={item}/>)}</ol>
      {jobs.hasNextPage && <button type="button" className="button button-quiet" disabled={jobs.isFetchingNextPage}
        onClick={() => void jobs.fetchNextPage()}>Показать ещё</button>}
    </section>
    {canAudit && <section className="overview-audit">
      <div className="section-heading"><h2>Последние действия</h2><Link to={`${root}/audit`}>Открыть журнал</Link></div>
      {audit.isPending && <p role="status">Загрузка действий…</p>}
      {audit.isError && <p role="alert">Не удалось загрузить действия. <button type="button" className="button button-quiet"
        onClick={() => void audit.refetch()}>Повторить</button></p>}
      {audit.isSuccess && (audit.data.length ? <AuditRows items={audit.data}/> : <p className="field-help">Действий пока нет.</p>)}
    </section>}
  </section>
}

function JobRow({ item }: { item: components['schemas']['WorkspaceJob'] }) {
  const state = item.cancel_requested && item.status === 'running' ? 'Запрошена отмена'
    : item.phase ? phases[item.phase] : jobStatuses[item.status]
  return <li className="event-row">
    <ListTodo size={18} aria-hidden="true"/>
    <div><strong>{kinds[item.kind] ?? item.kind}</strong>
      <p>{state}{item.retry_at ? ` · ${time.format(new Date(item.retry_at))}` : ''}</p>
      {item.status === 'failed' && item.error_code && <p>Код ошибки <code>{item.error_code}</code></p>}
    </div>
    <time dateTime={item.created_at}>{time.format(new Date(item.created_at))}</time>
  </li>
}

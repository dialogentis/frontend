import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { api, check } from '../api'
import type { components, paths } from '../api/schema'
import { analyticsPeriod, utcDay } from './analyticsPeriod'

type Report = components['schemas']['AnalyticsView']
type Filters = NonNullable<paths['/api/v1/organizations/{org_id}/analytics']['get']['parameters']['query']>
const number = new Intl.NumberFormat('ru')
const percentage = new Intl.NumberFormat('ru', { style: 'percent', maximumFractionDigits: 1 })
const shortDay = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const channelOptions = {
  production: 'Рабочие каналы', api: 'Внешний API', widget: 'Виджет', test: 'Тестовый чат', all: 'Все каналы',
}

export function OrganizationAnalytics({ orgId }: { orgId: string }) {
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const [params] = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => {
    const period = analyticsPeriod(7, localZone)
    const from = params.get('from')
    const to = params.get('to')
    return { ...period, from: from || period.from, to: to || period.to,
      channel: 'production', intent_scope: 'root' }
  })
  const start = filters.from || ''
  const end = filters.to || ''
  const span = utcDay(end).getTime() - utcDay(start).getTime()
  const valid = span >= 0 && span < 90 * 86_400_000
  const path = { org_id: orgId }
  const agents = useQuery({
    queryKey: ['history-agents', orgId],
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents', {
        params: { path, query: { limit: 100 } }, signal,
      })
      check(result.response, result.error)
      return result.data?.items ?? []
    },
  })
  const report = useQuery({
    queryKey: ['analytics', orgId, filters], enabled: valid, refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/analytics', {
        params: { path, query: filters }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Отчёт недоступен')
      return result.data
    },
  })
  const zones = [...new Set(['UTC', localZone, ...(Intl.supportedValuesOf?.('timeZone') || [])])]
  const updated = report.data && new Intl.DateTimeFormat('ru', {
    timeZone: report.data.time_zone, dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(report.data.as_of))
  return <section className="workspace-analytics">
    <div className="page-heading"><div><h1>Аналитика</h1>
      <p>{updated ? `Обновлено ${updated} · ${report.data?.time_zone}` : 'Диалоги, намерения и время ответа.'}</p>
    </div></div>
    <div className="history-filters analytics-filters">
      <label className="field-label">С<input type="date" value={start}
        onChange={event => setFilters(current => ({ ...current, from: event.target.value }))}/></label>
      <label className="field-label">По<input type="date" value={end}
        onChange={event => setFilters(current => ({ ...current, to: event.target.value }))}/></label>
      <label className="field-label">Часовой пояс<select value={filters.time_zone}
        onChange={event => setFilters(current => ({ ...current, time_zone: event.target.value }))}>
        {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
      </select></label>
      <label className="field-label">Канал<select name="analytics_channel" value={filters.channel}
        onChange={event => setFilters(current => ({ ...current, channel: event.target.value as Filters['channel'] }))}>
        {Object.entries(channelOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="field-label">Агент<select value={filters.agent_id ?? ''}
        onChange={event => setFilters(current => ({ ...current, agent_id: event.target.value || undefined }))}>
        <option value="">Все агенты</option>{agents.data?.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
      </select></label>
      <label className="field-label">Намерения по<select value={filters.intent_scope}
        onChange={event => setFilters(current => ({ ...current, intent_scope: event.target.value as Filters['intent_scope'] }))}>
        <option value="root">Начальному агенту</option><option value="active">Исполняющему агенту</option>
      </select></label>
    </div>
    {agents.isError && <p role="alert">Список агентов недоступен. <button type="button" className="button button-text"
      onClick={() => void agents.refetch()}>Повторить</button></p>}
    {!valid ? <p role="alert">Укажите период от 1 до 90 дней.</p> : report.isError ?
      <p role="alert">Не удалось загрузить отчёт. <button type="button" className="button button-quiet"
        onClick={() => void report.refetch()}>Повторить</button></p> :
      !report.data ? <p role="status">Загрузка аналитики…</p> :
        <AnalyticsResults report={report.data}/>}
  </section>
}

function AnalyticsResults({ report }: { report: Report }) {
  const maximum = Math.max(1, ...report.series.flatMap(point => [point.dialogues, point.messages]))
  const formattedRate = (rate: Report['errors']) => rate.value === null ? '—' : percentage.format(rate.value)
  const latency = (ms: number | null) => ms === null ? '—' : `${number.format(ms)} мс`
  return <>
    <div className="analytics-register">
      <div><span>Диалоги</span><strong data-metric="dialogues">{number.format(report.dialogues)}</strong></div>
      <div><span>Сообщения</span><strong data-metric="messages">{number.format(report.messages)}</strong></div>
      <div><span>Нераспознанные запросы</span><strong>{formattedRate(report.fallback)}</strong>
        <span>{report.fallback.total ? `${number.format(report.fallback.count)} из ${number.format(report.fallback.total)}` : 'Нет распознаваний'}</span></div>
      <div><span>Технические ошибки</span><strong>{formattedRate(report.errors)}</strong>
        <span>{report.errors.total ? `${number.format(report.errors.count)} из ${number.format(report.errors.total)}` : 'Нет завершённых ходов'}</span></div>
    </div>
    <div className="analytics-panels">
      <section><div className="section-heading"><h2>Диалоги и сообщения по дням</h2></div>
        {report.series.length ? <>
          <p className="analytics-legend"><span>Диалоги</span><span>Сообщения</span></p>
          <div className="analytics-chart-scroll"><ol className="analytics-chart">
            {report.series.map(point => {
              const day = shortDay.format(utcDay(point.day))
              const description = `${day}. Диалоги: ${number.format(point.dialogues)}. Сообщения: ${number.format(point.messages)}.`
              return <li key={point.day} title={description}>
                <span className="visually-hidden">{description}</span>
                <div aria-hidden="true"><i style={{ height: `${point.dialogues / maximum * 100}%` }}/>
                  <i style={{ height: `${point.messages / maximum * 100}%` }}/></div>
                <small aria-hidden="true">{day}</small>
              </li>
            })}
          </ol></div>
        </> : <div className="data-state"><Activity size={24}/><p>За этот период наблюдений нет.</p></div>}
      </section>
      <section><div className="section-heading"><h2>Время ответа</h2></div>
        <table className="analytics-latency">
          <thead><tr><th scope="col">Измерение</th><th scope="col">p50</th><th scope="col">p95</th></tr></thead>
          <tbody>{([
            ['Полное', report.latency], ['Внутри платформы', report.internal_latency],
            ['Внешние HTTP-вызовы', report.external_http_latency],
          ] as const).map(([name, value]) => <tr key={name}>
            <th scope="row">{name}</th><td>{latency(value.p50_ms)}</td><td>{latency(value.p95_ms)}</td>
          </tr>)}</tbody>
        </table>
        <p className="field-help">{report.latency.samples
          ? `${number.format(report.latency.samples)} измерений. Перцентили округлены до верхней границы интервала.`
          : 'Измерений за период нет.'}</p>
      </section>
    </div>
    <section className="analytics-intents"><div className="section-heading"><h2>Частые намерения</h2></div>
      {report.intents.length ? <div className="intent-bars">{report.intents.map(item => {
        const label = item.intent_name ?? item.intent_id.slice(0, 8)
        return <div className="intent-bar-row" key={`${item.agent_id}:${item.intent_id}`}>
          <span>{label}<small className="muted"> · {item.agent_name ?? item.agent_id.slice(0, 8)}</small></span>
          <progress max={report.intents[0].count} value={item.count} aria-label={`${label}: ${item.count}`}/>
          <span>{number.format(item.count)}</span>
        </div>
      })}</div> : <p className="field-help">Распознанных намерений за период нет.</p>}
    </section>
  </>
}

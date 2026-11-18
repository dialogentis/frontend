import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'

type Filters = components['schemas']['HistoryFilters']
type Format = components['schemas']['HistoryFormat']
const active = (status: string | undefined) => !status || status === 'queued' || status === 'running'
const errors: Record<string, string> = {
  history_export_too_large: 'Сузьте период или выберите агент, чтобы уменьшить размер файла.',
  history_export_access_changed: 'Права на выгрузку изменились.',
  history_export_settings_changed: 'Настройки хранения изменились. Подготовьте файл снова.',
  artifact_quota_exceeded: 'Недостаточно места для временного файла.',
}

export function HistoryExportPanel({ orgId, filters, valid, revision }: {
  orgId: string; filters: Filters; valid: boolean; revision: number
}) {
  const path = { org_id: orgId }
  const key = `dialogentis:history-export:${orgId}`
  const [jobId, setJobId] = useState(() => {
    try { return sessionStorage.getItem(key) } catch { return null }
  })
  const [format, setFormat] = useState<Format>('json')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  const job = useQuery({
    queryKey: ['history-export', orgId, jobId, revision], enabled: !!jobId, staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/history/exports/{export_id}', {
        params: { path: { ...path, export_id: jobId! } },
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Задание недоступно')
      return result.data
    },
    retry: false,
    refetchInterval: query => !query.state.error && active(query.state.data?.status) ? 1500 : false,
    refetchOnWindowFocus: 'always',
  })
  const deadline = job.data?.download_until
  useEffect(() => {
    if (!deadline) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Date.parse(deadline) - Date.now() + 25))
    return () => window.clearTimeout(timer)
  }, [deadline])
  const preparing = !!jobId && !job.isError && active(job.data?.status)
  const create = async () => {
    if (!valid || busy || preparing) return
    setBusy(true)
    setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/history/exports', {
        params: { path }, body: { format, filters }, signal: AbortSignal.timeout(10_000),
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Запуск выгрузки не подтверждён')
      setNow(Date.now())
      setJobId(result.data.job_id)
      try { sessionStorage.setItem(key, result.data.job_id) } catch { /* optional persistence */ }
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Не удалось запустить выгрузку.')
    } finally { setBusy(false) }
  }
  const available = deadline && Date.parse(deadline) > now && !job.isError
  return <details className="export-menu history-export" onToggle={event => {
    if (event.currentTarget.open && jobId) void job.refetch()
  }}>
    <summary className="button button-quiet"><Download size={16}/>Экспорт истории</summary>
    <div className="export-popover">
      <p className="field-help">Выгрузка использует выбранные фильтры агента, канала, состояния и дат.</p>
      <label className="field-label">Формат выгрузки
        <select value={format} disabled={busy || preparing} onChange={event => setFormat(event.target.value as Format)}>
          <option value="json">JSON</option><option value="csv">CSV</option>
        </select>
      </label>
      <button type="button" className="button button-primary" disabled={!valid || busy || preparing}
        onClick={() => void create()}>Подготовить выгрузку</button>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {job.isError && <p role="alert">Не удалось проверить выгрузку. <button type="button" className="button button-text"
        onClick={() => void job.refetch()}>Повторить</button></p>}
      {preparing && <p role="status">Подготавливаем файл…</p>}
      {!job.isError && job.data?.status === 'failed' && <p role="status">
        {errors[job.data.error_code ?? ''] ?? 'Не удалось подготовить файл.'}
      </p>}
      {!job.isError && job.data?.status === 'succeeded' && (available ? <div className="history-export-ready">
        <a className="button button-quiet" href={`/api/v1/organizations/${orgId}/history/exports/${jobId}/download`}>
          <Download size={16}/>Скачать {job.data.format.toUpperCase()}
        </a>
        <p className="field-help">Доступен до {new Date(deadline).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}.</p>
      </div> : <p role="status">Скачивание недоступно. Подготовьте файл снова.</p>)}
    </div>
  </details>
}

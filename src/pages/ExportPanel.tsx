import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'

type ExportJob = components['schemas']['ExportJob']
const terminal = new Set<ExportJob['status']>(['succeeded', 'failed', 'cancelled'])
const errors: Record<string, string> = { invalid_export_configuration: 'Проверьте данные и настройки сценария перед экспортом.', artifact_quota_exceeded: 'Недостаточно места для временного файла.', export_expired: 'Срок подготовки файла истёк. Запустите экспорт ещё раз.' }

export function ExportPanel({ orgId, agentId, enabled }: { orgId: string; agentId: string; enabled: boolean }) {
  const cache = useQueryClient()
  const key = `dialogentis:export:${orgId}:${agentId}`
  const [jobId, setJobId] = useState(() => sessionStorage.getItem(key))
  const [format, setFormat] = useState<'json' | 'csv'>('json')
  const [started, setStarted] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const job = useQuery({
    queryKey: ['export-job', orgId, jobId], enabled: !!jobId, retry: false,
    queryFn: async ({ signal }) => { const result = await api.GET('/api/v1/organizations/{org_id}/jobs/{job_id}', { params: { path: { org_id: orgId, job_id: jobId! } }, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }); check(result.response, result.error); if (!result.data || !('export_id' in result.data)) throw new Error('Некорректный ответ сервера'); return result.data },
    refetchInterval: query => document.hidden || (query.state.error instanceof ApiError && [403, 404].includes(query.state.error.status)) || (query.state.data && terminal.has(query.state.data.status)) ? false : Date.now() - started < 30_000 ? 2000 : 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (!job.data?.download_until) return
    const delay = Date.parse(job.data.download_until) - Date.now()
    if (delay <= 0) { setNow(Date.now()); return }
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 50)
    return () => window.clearTimeout(timer)
  }, [job.data?.download_until])
  const active = !!jobId && (!job.data || !terminal.has(job.data.status))
  const clear = () => { sessionStorage.removeItem(key); setJobId(null); setError('') }
  const create = async () => {
    setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/exports', { params: { path: { org_id: orgId, agent_id: agentId } }, body: { format, source: 'draft' }, signal: AbortSignal.timeout(10_000) }); check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      sessionStorage.setItem(key, result.data.job_id); setStarted(Date.now()); setJobId(result.data.job_id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось запустить экспорт') }
    finally { setBusy(false) }
  }
  const cancel = async () => {
    if (!jobId) return
    setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/jobs/{job_id}/cancel', { params: { path: { org_id: orgId, job_id: jobId } }, signal: AbortSignal.timeout(10_000) }); check(result.response, result.error)
      if (result.data && 'export_id' in result.data) cache.setQueryData(['export-job', orgId, jobId], result.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отменить экспорт'); void job.refetch() }
    finally { setBusy(false) }
  }
  const available = job.data?.status === 'succeeded' && !!job.data.download_until && Date.parse(job.data.download_until) > now
  return <details className="export-menu"><summary className="button button-quiet"><Download size={16}/>Экспорт</summary><div className="export-popover"><h3>Экспорт черновика</h3><p className="field-help">В файл попадёт сохранённая версия агента.</p><label className="field-label">Формат<select aria-label="Формат экспорта" value={format} disabled={busy || active} onChange={event => setFormat(event.target.value as 'json' | 'csv')}><option value="json">JSON · конфигурация</option><option value="csv">CSV · примеры фраз</option></select></label><button type="button" className="button button-primary" disabled={!enabled || busy || active} onClick={() => void create()}>Подготовить файл</button>{!enabled && <p className="field-help">Дождитесь сохранения изменений.</p>}{error && <p role="alert" className="auth-error">{error}</p>}{job.isError && <div role="alert" className="auth-error">Не удалось проверить задание. <button type="button" className="button button-text" onClick={() => void job.refetch()}>Повторить</button><button type="button" className="button button-text" onClick={clear}>Закрыть задание</button></div>}{jobId && !job.isError && <div className="export-status" role="status">{!job.data ? <p>Проверяем задание…</p> : <><p>Версия {job.data.revision} · {job.data.format.toUpperCase()}</p>{job.data.status === 'queued' && <p>Ожидает обработки</p>}{job.data.status === 'running' && <p>{job.data.cancel_requested ? 'Отмена…' : 'Подготовка файла…'}</p>}{job.data.status === 'cancelled' && <p>Экспорт отменён</p>}{job.data.status === 'failed' && <p>{errors[job.data.error_code || ''] || 'Не удалось подготовить файл. Попробуйте ещё раз.'}</p>}{available && <><a className="button button-quiet" href={`/api/v1/organizations/${orgId}/exports/${job.data.export_id}/download`}><Download size={15}/>Скачать файл</a><p className="field-help">Доступен до {new Date(job.data.download_until!).toLocaleString('ru-RU')} по местному времени.</p></>}{job.data.status === 'succeeded' && !available && <p>Срок скачивания истёк. Подготовьте файл снова.</p>}{active && <button type="button" className="button button-text" disabled={busy || job.data.cancel_requested} onClick={() => void cancel()}>Отменить</button>}</>}</div>}</div></details>
}

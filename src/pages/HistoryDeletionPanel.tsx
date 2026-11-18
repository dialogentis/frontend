import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { api, check } from '../api'
import type { components } from '../api/schema'

type Filters = components['schemas']['HistoryFilters']
type Deletion = components['schemas']['HistoryDeletionView']
const active = (job?: Deletion) => !job || job.status === 'queued' || job.status === 'running'
const confirmation = 'УДАЛИТЬ'

export function HistoryDeletionPanel({ orgId, filters, scope, blocked }: {
  orgId: string; filters: Filters; scope: string; blocked: string
}) {
  const cache = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const key = `dialogentis:history-deletion:${orgId}`
  const [jobId, setJobId] = useState(() => {
    try { return sessionStorage.getItem(key) } catch { return null }
  })
  const [request, setRequest] = useState<{ filters: Filters; scope: string; key: string }>()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const job = useQuery({
    queryKey: ['history-deletion', orgId, jobId], enabled: !!jobId, staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/history/deletions/{deletion_id}', {
        params: { path: { org_id: orgId, deletion_id: jobId! } },
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Задание недоступно')
      return result.data
    },
    refetchInterval: query => !query.state.error && active(query.state.data) ? 1500 : false,
  })
  const status = job.data?.status
  useEffect(() => {
    if (status !== 'succeeded') return
    void cache.invalidateQueries({ predicate: ({ queryKey: [type, id] }) => id === orgId &&
      ['history-dialogues', 'history-dialogue', 'history-messages', 'history-trace', 'history-export',
        'organization-settings'].some(key => key === type) })
  }, [cache, orgId, jobId, status])

  const open = () => {
    if (!error) setRequest({ filters, scope, key: crypto.randomUUID() })
    setTyped('')
    dialog.current?.showModal()
  }
  const create = async () => {
    if (!request || busy || typed !== confirmation) return
    setBusy(true)
    setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/history/deletions', {
        params: { path: { org_id: orgId }, header: { 'Idempotency-Key': request.key } },
        body: { confirmation: 'delete', filters: request.filters },
        signal: AbortSignal.timeout(10_000),
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Запуск удаления не подтверждён')
      const id = result.data.job_id
      cache.setQueryData(['history-deletion', orgId, id], result.data)
      setJobId(id)
      try { sessionStorage.setItem(key, id) } catch { /* optional persistence */ }
      dialog.current?.close()
    } catch {
      setError('Не удалось подтвердить запуск. Повторите запрос с теми же фильтрами.')
    } finally { setBusy(false) }
  }
  const pending = !!jobId && active(job.data)
  return <div className="history-deletion">
    <button type="button" className="button danger-button" disabled={(!error && !!blocked) || pending || job.isError}
      aria-describedby={blocked ? 'history-deletion-blocked' : undefined} onClick={open}>
      <Trash2 size={16}/>{error ? 'Проверить запуск удаления' : 'Удалить историю'}
    </button>
    {blocked && <p id="history-deletion-blocked" className="field-help">{blocked}</p>}
    {job.isError ? <p role="alert">Не удалось проверить статус удаления. <button type="button" className="button button-text"
      onClick={() => void job.refetch()}>Повторить</button></p> :
      pending ? <p role="status">Удаление истории…{job.data && ` Выбрано диалогов: ${job.data.selected_dialogues}.`}</p> :
        status === 'succeeded' ? <p role="status">
          История удалена. Диалогов: {job.data?.deleted_dialogues}, ходов: {job.data?.deleted_turns}.
        </p> : (status === 'failed' || status === 'cancelled') && <p role="status">
          {job.data?.error_code === 'history_deletion_access_changed' ? 'Права на удаление изменились.' : 'Удаление не выполнено.'}
        </p>}
    <dialog ref={dialog} className="standard-dialog history-deletion-dialog" aria-labelledby="history-deletion-title"
      onCancel={event => { if (busy) event.preventDefault() }}>
      <form onSubmit={event => { event.preventDefault(); void create() }}>
        <h2 id="history-deletion-title">Удалить историю диалогов?</h2>
        <p><strong>{request?.scope}</strong></p>
        <p>Сообщения и трассировка будут удалены без возможности восстановления. Ранее подготовленные выгрузки станут недоступны для скачивания. Активные диалоги продолжат работу.</p>
        <label className="field-label">Введите {confirmation} для подтверждения
          <input name="confirm_history_deletion" value={typed} disabled={busy} autoComplete="off"
            onChange={event => setTyped(event.target.value)}/>
        </label>
        {error && <p role="alert" className="auth-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => dialog.current?.close()}>Закрыть</button>
          <button type="submit" className="button danger-button" disabled={busy || typed !== confirmation}>Подтвердить удаление</button>
        </div>
      </form>
    </dialog>
  </div>
}

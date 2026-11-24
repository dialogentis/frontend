import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, check } from '../api'
import { AuthFrame } from './Auth'

export function DeletionPanel({ orgId, name }: { orgId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const cache = useQueryClient()
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || confirmation !== name) return
    setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/deletion', { params: { path: { org_id: orgId } }, body: { password, confirmation_name: confirmation } })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      cache.removeQueries({ predicate: q => q.queryKey[0] !== 'session' && q.queryKey[0] !== 'organizations' })
      navigate(`/app/deletions/${result.data.job_id}`, { replace: true })
      void cache.invalidateQueries({ queryKey: ['organizations'] })
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось начать удаление') }
    finally { setBusy(false) }
  }
  return <section className="organization-deletion">
    <h2>Удаление пространства</h2>
    <button type="button" className="button button-quiet danger-button" aria-haspopup="dialog"
      onClick={() => dialog.current?.showModal()}>Удалить пространство</button>
    <dialog ref={dialog} className="standard-dialog" aria-labelledby="organization-deletion-title"
      aria-describedby="organization-deletion-warning"
      onCancel={event => { if (busy) event.preventDefault() }}
      onClose={() => { setConfirmation(''); setPassword(''); setError('') }}>
      <h2 id="organization-deletion-title">Удалить пространство?</h2>
      <p id="organization-deletion-warning">Все агенты и данные этого пространства будут удалены. Аккаунты участников и другие пространства сохранятся. Восстановить пространство через интерфейс нельзя.</p>
      <p>Введите название «{name}» и пароль владельца.</p>
      <form className="organization-deletion-form" onSubmit={submit}>
        <label className="field-label">Название пространства<input value={confirmation} onChange={e => setConfirmation(e.target.value)} required autoComplete="off"/></label>
        <label className="field-label">Ваш пароль<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={12} maxLength={128} autoComplete="current-password"/></label>
        {error && <p role="alert" className="auth-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-quiet" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Отмена</button>
          <button type="submit" className="button button-quiet danger-button" disabled={busy || confirmation !== name || !password}>Подтвердить удаление</button>
        </div>
      </form>
    </dialog>
  </section>
}

export function DeletionStatusPage() {
  const { jobId = '' } = useParams()
  const cache = useQueryClient()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery({ queryKey: ['deletion', jobId], queryFn: async () => {
    const result = await api.GET('/api/v1/deletions/{job_id}', { params: { path: { job_id: jobId } } }); check(result.response, result.error)
    if (!result.data) throw new Error('Некорректный ответ сервера')
    return result.data
  }, refetchInterval: q => q.state.data && ['succeeded', 'failed', 'cancelled'].includes(q.state.data.status) ? false : 2000 })
  const retry = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/deletions/{job_id}/retry', { params: { path: { job_id: jobId } }, body: { password } }); check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      cache.setQueryData(['deletion', jobId], result.data); setPassword('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось повторить удаление') }
    finally { setBusy(false) }
  }
  return <AuthFrame><h1>{query.data?.status === 'succeeded' ? 'Пространство удалено' : query.data?.status === 'failed' ? 'Не удалось удалить пространство' : query.data?.status === 'cancelled' ? 'Удаление остановлено' : 'Удаление пространства'}</h1>
    {query.isError ? <><p className="auth-error" role="alert">Не удалось получить состояние удаления.</p><button className="button button-quiet" onClick={() => query.refetch()}>Повторить</button></> : query.data?.status === 'succeeded' ? <p className="auth-intro">Данные пространства удалены. Аккаунты участников и другие пространства сохранены.</p> : query.data?.status === 'failed' ? <><p className="auth-intro">Удаление остановилось. Введите пароль, чтобы повторить попытку.</p><form onSubmit={retry}><label className="field-label">Ваш пароль<input type="password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"/></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="button button-primary" disabled={busy}>Повторить удаление</button></form></> : query.data?.status === 'cancelled' ? <p className="auth-error" role="alert">Удаление остановлено. Обратитесь к администратору платформы.</p> : <p className="auth-intro" role="status">Данные удаляются. Можно вернуться на эту страницу позже.</p>}
    <p className="auth-secondary"><Link className="auth-link" to="/app/organizations">К рабочим пространствам</Link></p>
  </AuthFrame>
}

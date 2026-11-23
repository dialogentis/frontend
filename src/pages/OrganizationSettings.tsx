import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'

type Organization = components['schemas']['OrganizationView']

export function OrganizationSettings({ orgId }: { orgId: string }) {
  const [saved, setSaved] = useState(false)
  const settings = useQuery({
    queryKey: ['organization-settings', orgId], retry: false,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}', { params: { path: { org_id: orgId } }, signal })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
  })
  if (settings.isPending) return <p role="status">Загрузка настроек…</p>
  if (settings.isError) return <div className="data-state"><h1>Не удалось загрузить настройки</h1><button className="button button-quiet" onClick={() => void settings.refetch()}>Повторить</button></div>
  return <SettingsForm key={`${orgId}:${settings.data.settings_revision}`} initial={settings.data} reload={() => settings.refetch()} saved={saved} onSaved={() => setSaved(true)} onEdited={() => setSaved(false)}/>
}

function SettingsForm({ initial, reload, saved, onSaved, onEdited }: { initial: Organization; reload: () => unknown; saved: boolean; onSaved: () => void; onEdited: () => void }) {
  const cache = useQueryClient()
  const [name, setName] = useState(initial.name)
  const [days, setDays] = useState(initial.history_retention_days)
  const [store, setStore] = useState(initial.store_message_text)
  const [purge, setPurge] = useState(initial.store_message_text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirmation = useRef<HTMLDialogElement>(null)
  const editable = initial.role === 'owner' || initial.role === 'admin'
  const removeText = !store && purge
  const shortenRetention = days < initial.history_retention_days

  const save = async () => {
    if (!editable || busy) return
    setBusy(true); setError('')
    try {
      const result = await api.PATCH('/api/v1/organizations/{org_id}', {
        params: { path: { org_id: initial.id }, header: { 'If-Match': `"rev-${initial.settings_revision}"` } },
        body: { name: name.trim(), history_retention_days: days, store_message_text: store, purge_existing_text: removeText },
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      onSaved()
      cache.setQueryData(['organization-settings', initial.id], result.data)
      cache.removeQueries({ predicate: query =>
        query.queryKey[1] === initial.id && String(query.queryKey[0]).startsWith('history-'),
      })
      await cache.invalidateQueries({ queryKey: ['organizations'] })
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось сохранить настройки.') }
    finally { setBusy(false) }
  }

  return <section className="settings-workspace"><div className="page-heading"><div><h1>Настройки пространства</h1><p>Название и хранение данных диалогов.</p></div></div>
    <form onSubmit={event => {
      event.preventDefault()
      if (removeText || shortenRetention) confirmation.current?.showModal()
      else void save()
    }} className="organization-settings-form">
      <label className="field-label">Название<input value={name} maxLength={120} disabled={!editable || busy} onChange={event => { setName(event.target.value); onEdited() }} required/></label>
      <label className="field-label">Срок хранения текста, дней<input type="number" min={1} max={30} step={1} value={days} disabled={!editable || busy} onChange={event => { setDays(Number(event.target.value)); onEdited() }} required/><span className="field-help">От 1 до 30 дней. При сокращении срока данные за более ранний период удаляются.</span></label>
      <label className="settings-checkbox"><input type="checkbox" checked={store} disabled={!editable || busy} onChange={event => { if (!event.target.checked) setPurge(true); setStore(event.target.checked); onEdited() }}/>Сохранять текст сообщений</label>
      <p className="field-help">При отключении текст не сохраняется для последующего просмотра. Параметры, необходимые для продолжения активного диалога, временно хранятся в защищённом виде.</p>
      {!store && editable && <label className="settings-checkbox"><input type="checkbox" checked={purge} disabled={busy} onChange={event => { setPurge(event.target.checked); onEdited() }}/>Удалить ранее сохранённый текст</label>}
      <p className="field-help">Настройки действуют для тестового чата, виджета и внешнего API.</p>
      {error && <div role="alert" className="auth-error">{error} <button type="button" className="button button-text" onClick={() => void reload()}>Обновить настройки</button></div>}
      {saved && !error && <p role="status">Настройки сохранены.</p>}
      {editable && <button className="button button-primary" disabled={busy || !name.trim() || !Number.isInteger(days) || days < 1 || days > 30}>{busy ? 'Сохранение…' : 'Сохранить'}</button>}
    </form>
    <dialog ref={confirmation} className="standard-dialog" aria-labelledby="history-settings-confirmation">
      <h2 id="history-settings-confirmation">Сохранить настройки и удалить данные?</h2>
      {removeText && <p>Текст уже сохранённых сообщений будет удалён. Чтобы сохранить его, вернитесь и снимите отметку «Удалить ранее сохранённый текст».</p>}
      {shortenRetention && <p>Данные старше {days} дн. будут удалены по новому сроку хранения.</p>}
      <div className="dialog-actions agent-dialog-actions">
        <button type="button" className="button button-quiet" autoFocus onClick={() => confirmation.current?.close()}>Вернуться к настройкам</button>
        <button type="button" className="button button-primary" onClick={() => { confirmation.current?.close(); void save() }}>Подтвердить удаление данных</button>
      </div>
    </dialog>
  </section>
}

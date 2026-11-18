import { useState, type FormEvent } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'

type Key = components['schemas']['ApiKeyView']
const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const date = (value: string) => dateFormat.format(new Date(value))

export function AgentApiKeys({ orgId, agentId, archived }: {
  orgId: string; agentId: string; archived: boolean
}) {
  const path = { org_id: orgId, agent_id: agentId }
  const queryKey = ['agent-api-keys', orgId, agentId]
  const cache = useQueryClient()
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState('')
  const [secret, setSecret] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [revoking, setRevoking] = useState<Key | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const keys = useInfiniteQuery({
    queryKey,
    initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/api-keys', {
        params: { path, query: { limit: 25, cursor: pageParam || undefined } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const items = keys.data?.pages.flatMap(page => page.items) ?? []
  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await operation() }
    catch (error) {
      setError(error instanceof ApiError ? error.message : 'Сервер не подтвердил операцию. Проверьте список ключей.')
    } finally {
      await cache.invalidateQueries({ queryKey })
      setBusy(false)
    }
  }
  const create = (event: FormEvent) => {
    event.preventDefault()
    if (busy || archived || secret || !name.trim()) return
    void run(async () => {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/api-keys', {
        params: { path }, body: { name: name.trim(), ...(expiry && { expires_at: new Date(expiry).toISOString() }) },
        signal: AbortSignal.timeout(15_000),
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      setSecret(result.data.secret)
      setCopyStatus('')
      setName('')
      setExpiry('')
    })
  }
  const revoke = (key: Key) => void run(async () => {
    const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/api-keys/{key_id}/revoke', {
      params: { path: { ...path, key_id: key.id } }, signal: AbortSignal.timeout(15_000),
    })
    check(result.response, result.error)
    setRevoking(null)
    setNotice(`Ключ «${key.name}» отозван.`)
  })
  return <section className="agent-api-keys" aria-labelledby="agent-api-keys-heading">
    <div className="section-heading"><div><h2 id="agent-api-keys-heading">Ключи внешнего API</h2>
      <p>Каждый ключ даёт доступ к диалогам только этого агента.</p></div></div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {notice && <p role="status" className="inline-note">{notice}</p>}
    {archived && <p className="field-help">Чтобы выпустить новый ключ, восстановите агента из архива.</p>}
    {secret ? <div className="api-key-secret">
      <label className="field-label">Новый ключ доступа
        <input name="issued_api_key" value={secret} readOnly spellCheck={false} autoComplete="off" onFocus={event => event.target.select()}/>
      </label>
      <p className="field-help">Сохраните ключ сейчас. После закрытия его нельзя будет просмотреть.</p>
      <div className="row-actions">
        <button className="button button-primary" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(secret); setCopyStatus('Ключ скопирован.') }
          catch { setCopyStatus('Выделите и скопируйте ключ вручную.') }
        }}>Скопировать ключ</button>
        <button className="button button-quiet" type="button" onClick={() => { setSecret(''); setNotice('Ключ создан.') }}>Закрыть</button>
      </div>
      {copyStatus && <p role="status" className="field-help">{copyStatus}</p>}
    </div> : !archived && <form className="api-key-form" onSubmit={create}>
      <label className="field-label">Название ключа
        <input name="api_key_name" value={name} onChange={event => setName(event.target.value)} maxLength={120} required/>
      </label>
      <label className="field-label">Действует до
        <input name="api_key_expiry" type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)}/>
        <span className="field-help">По умолчанию 90 дней, максимум 365.</span>
      </label>
      <button className="button button-primary" disabled={busy || !name.trim()}>Создать ключ</button>
    </form>}
    {keys.isPending && <p role="status">Загрузка ключей…</p>}
    {keys.isError && <p role="alert">Не удалось загрузить список ключей. <button className="button button-text" onClick={() => void keys.refetch()}>Повторить</button></p>}
    {keys.isSuccess && !items.length && <p className="field-help">У агента пока нет ключей.</p>}
    {!!items.length && <ul className="api-key-list">{items.map(key => {
      const expired = Date.parse(key.expires_at) <= Date.now()
      return <li className="api-key-row" key={key.id}>
        <div><strong>{key.name}</strong> <code>{key.prefix}…</code>
          <p className="field-help">{key.revoked_at ? `Отозван ${date(key.revoked_at)}` : expired ? `Истёк ${date(key.expires_at)}` : `Действует до ${date(key.expires_at)}`}</p>
          {key.last_used_at && <p className="field-help">Последнее использование {date(key.last_used_at)}</p>}
        </div>
        {!key.revoked_at && !expired && <div className="row-actions">
          {revoking?.id === key.id ? <>
            <button className="button danger-button" disabled={busy} onClick={() => revoke(key)}>Подтвердить отзыв</button>
            <button className="button button-quiet" disabled={busy} onClick={() => setRevoking(null)}>Отмена</button>
          </> : <button className="button button-quiet" disabled={busy} onClick={() => setRevoking(key)}>Отозвать ключ</button>}
        </div>}
      </li>
    })}</ul>}
    {keys.hasNextPage && <button className="button button-quiet" disabled={keys.isFetchingNextPage} onClick={() => void keys.fetchNextPage()}>Показать ещё ключи</button>}
  </section>
}

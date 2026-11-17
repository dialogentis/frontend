import { useState, type FormEvent } from 'react'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'

type Chat = components['schemas']['StartedChat']
type Event = components['schemas']['EventView']
type Message = { id: string; role: 'user' | 'agent'; text: string }
type Pending = { id: string; key: string; text: string; revision: number }

export function TestChat({ orgId, agentId, versionId }: { orgId: string; agentId: string; versionId: string }) {
  const [chat, setChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [trace, setTrace] = useState<Event[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setBusy(true); setError(''); setChat(null); setMessages([]); setTrace([]); setPending(null); setText('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/test-conversations', {
        params: { path: { org_id: orgId, agent_id: agentId } }, body: { version_id: versionId, http_mode: 'mock' }, signal: AbortSignal.timeout(35_000),
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      setChat(result.data); setTrace(result.data.trace)
      setMessages(result.data.messages.map(text => ({ id: crypto.randomUUID(), role: 'agent', text })))
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось начать диалог. Попробуйте ещё раз.') }
    finally { setBusy(false) }
  }

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!chat || busy || (!pending && !text.trim())) return
    const request = pending || { id: crypto.randomUUID(), key: crypto.randomUUID(), text, revision: chat.revision }
    if (!pending) { setPending(request); setMessages(items => [...items, { id: request.id, role: 'user', text: request.text }]); setText('') }
    setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/test-conversations/{conversation_id}/messages', {
        params: { path: { org_id: orgId, conversation_id: chat.conversation_id }, header: { 'X-Conversation-Token': chat.conversation_token, 'Idempotency-Key': request.key } },
        body: { client_message_id: request.id, revision: request.revision, text: request.text }, signal: AbortSignal.timeout(35_000),
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      setChat({ ...chat, ...result.data }); setTrace(result.data.trace); setPending(null)
      if (result.data.replayed && !result.data.replay_available) setError('Ответ уже обработан, но восстановить его невозможно: хранение текста отключено.')
      else setMessages(items => [...items, ...result.data!.messages.map(text => ({ id: crypto.randomUUID(), role: 'agent' as const, text }))])
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Ответ не получен. Повторите запрос с тем же сообщением.') }
    finally { setBusy(false) }
  }

  return <section className="test-chat" aria-label="Тестовый чат">
    <div className="section-heading"><div><h4>Тестовый чат</h4><p className="field-help">Диалог использует выбранную версию агента.</p></div><button type="button" className="button button-quiet" disabled={busy} onClick={() => void start()}>{chat ? 'Начать заново' : 'Начать диалог'}</button></div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {chat && <><div className="test-chat-messages" role="log" aria-label="Сообщения диалога">{messages.map(message => <div key={message.id} className={`test-chat-message test-chat-message-${message.role}`}><small>{message.role === 'user' ? 'Вы' : 'Агент'}</small><p>{message.text}</p></div>)}{busy && <p role="status" className="field-help">Обрабатываем сообщение…</p>}</div>
      {chat.status === 'waiting_input' ? <form className="test-chat-form" onSubmit={event => void send(event)}><label htmlFor="test-chat-text">Сообщение агенту</label><div><input id="test-chat-text" value={text} maxLength={2000} disabled={busy || !!pending} onChange={event => setText(event.target.value)} placeholder="Введите сообщение"/><button className="button button-primary" disabled={busy || (!pending && !text.trim())}>{pending ? 'Повторить' : 'Отправить'}</button></div></form> : <p className="field-help">{chat.status === 'completed' ? 'Диалог завершён.' : 'Диалог завершился с ошибкой.'}</p>}
      {!!trace.length && <details className="test-chat-trace"><summary>Путь последнего хода</summary><ol>{trace.map((event, index) => <li key={`${event.node_id}-${index}`}><code>{event.node_type}</code> · {event.event}{event.output ? ` · ${event.output}` : ''}</li>)}</ol></details>}
    </>}
  </section>
}

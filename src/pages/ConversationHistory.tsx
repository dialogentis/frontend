import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ChevronRight, Search, X } from 'lucide-react'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'
import { HistoryExportPanel } from './HistoryExportPanel'
import { HistoryDeletionPanel } from './HistoryDeletionPanel'

type Dialogue = components['schemas']['ConversationView']
const channels: Record<Dialogue['channel_type'], string> = { test: 'Тестовый чат', api: 'Внешний API', widget: 'Виджет' }
const statuses: Record<Dialogue['status'], string> = {
  waiting_input: 'Ожидает сообщения', completed: 'Завершён', failed: 'Ошибка', expired: 'Истёк',
}
const labels: Record<string, string> = {
  transition: 'Переход', fallback: 'Запрос не распознан', wait: 'Ожидание ввода', complete: 'Завершение',
  error: 'Ошибка', handoff: 'Передача агенту', returned: 'Возврат', slot_set: 'Присваивание',
  slot_filled: 'Параметр получен', fallback_limit: 'Лимит попыток',
  handoff_history: 'Передана история', handoff_history_truncated: 'Передана часть истории',
}
const date = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (value: string) => date.format(new Date(value))
const fromDate = (value: string, through = false) => {
  if (!value) return undefined
  const result = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(result.getTime())) return undefined
  if (through) result.setDate(result.getDate() + 1)
  return result.toISOString()
}

export function ConversationHistory({ orgId }: { orgId: string }) {
  const [params, setParams] = useSearchParams()
  const [channel, setChannel] = useState<Dialogue['channel_type'] | ''>('')
  const [status, setStatus] = useState<Dialogue['status'] | ''>('')
  const [agent, setAgent] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [phrase, setPhrase] = useState('')
  const [submitted, setSubmitted] = useState('')
  const selected = params.get('dialogue')
  const selectedTrigger = useRef<HTMLButtonElement | null>(null)
  const path = { org_id: orgId }
  const settings = useQuery({
    queryKey: ['organization-settings', orgId], staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}', { params: { path }, signal })
      check(result.response, result.error)
      if (!result.data) throw new Error('Не удалось загрузить настройки')
      return result.data
    },
  })
  const canSearch = settings.data?.store_message_text === true
  const canManageHistory = settings.data?.role === 'owner' || settings.data?.role === 'admin'
  const filters = {
    agent_id: agent || undefined, channel_type: channel || undefined, status: status || undefined,
    from: fromDate(start), to: fromDate(end, true),
  }
  const validPeriod = !start || !end || start <= end
  const text = canSearch ? submitted : ''
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
  const dialogues = useInfiniteQuery({
    queryKey: ['history-dialogues', orgId, agent, channel, status, start, end, text],
    initialPageParam: '',
    gcTime: text ? 0 : undefined,
    enabled: validPeriod,
    queryFn: async ({ signal, pageParam }) => {
      const page = { limit: 25, cursor: pageParam || undefined }
      const result = text
        ? await api.POST('/api/v1/organizations/{org_id}/conversations/search', {
          params: { path }, body: { text, filters, ...page }, signal,
        })
        : await api.GET('/api/v1/organizations/{org_id}/conversations', {
          params: { path, query: { ...filters, ...page } }, signal,
        })
      check(result.response, result.error)
      if (!result.data) throw new Error('Не удалось получить диалоги')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const items = dialogues.data?.pages.flatMap(page => page.items) ?? []
  const name = (id: string) => agents.data?.find(item => item.id === id)?.name ?? id.slice(0, 8)
  const deletionScope = [agent && name(agent), channel && channels[channel], status && statuses[status],
    start && `с ${new Date(`${start}T00:00:00`).toLocaleDateString('ru')}`,
    end && `по ${new Date(`${end}T00:00:00`).toLocaleDateString('ru')}`].filter(Boolean).join(' · ')
  return <section className="workspace-history">
    <div className="page-heading"><div><h1>Диалоги</h1><p>История тестовых и опубликованных агентов</p></div>
      {canManageHistory && settings.data && <div className="history-actions">
        <HistoryExportPanel orgId={orgId} filters={filters} valid={validPeriod} revision={settings.data.settings_revision}/>
        <HistoryDeletionPanel orgId={orgId} filters={filters} scope={deletionScope || 'Вся история пространства'}
          blocked={text ? 'Для удаления истории сбросьте поиск по тексту.' : !validPeriod ? 'Исправьте даты для удаления.' : ''}/>
      </div>}
    </div>
    <div className="history-filters">
      <label className="field-label">Агент<select value={agent} onChange={event => setAgent(event.target.value)}>
        <option value="">Все агенты</option>{agents.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label className="field-label">Канал<select value={channel} onChange={event => setChannel(event.target.value as typeof channel)}>
        <option value="">Все каналы</option>{Object.entries(channels).map(([key, caption]) => <option value={key} key={key}>{caption}</option>)}
      </select></label>
      <label className="field-label">Состояние<select value={status} onChange={event => setStatus(event.target.value as typeof status)}>
        <option value="">Все состояния</option>{Object.entries(statuses).map(([key, caption]) => <option value={key} key={key}>{caption}</option>)}
      </select></label>
      <label className="field-label">С<input type="date" value={start} onChange={event => setStart(event.target.value)}/></label>
      <label className="field-label">По<input type="date" value={end} onChange={event => setEnd(event.target.value)}/></label>
    </div>
    {canSearch && <form className="history-search" onSubmit={event => {
      event.preventDefault()
      const value = phrase.trim()
      if (value.length < 2 || value.length > 120) return
      setSubmitted(value)
      setParams({})
    }}>
      <label className="field-label">Текст сообщения
        <input name="history_search" type="search" value={phrase} minLength={2} maxLength={120}
          onChange={event => setPhrase(event.target.value)} autoComplete="off" />
      </label>
      <button type="submit" className="button button-primary" disabled={phrase.trim().length < 2}><Search size={16}/>Найти</button>
      {!!submitted && <button type="button" className="button button-quiet"
        onClick={() => { setSubmitted(''); setPhrase(''); setParams({}) }}>Сбросить поиск</button>}
    </form>}
    {settings.data?.store_message_text === false && <p className="field-help">Поиск доступен при включённом сохранении текста.</p>}
    {start && end && start > end ? <p role="alert">Дата начала должна быть раньше даты окончания.</p> :
      <div className={selected ? 'history-content history-content-open' : 'history-content'}>
        <div>
          {dialogues.isPending && <p role="status">Загрузка диалогов…</p>}
          {dialogues.isError && <Retry message={dialogues.error instanceof ApiError
            ? dialogues.error.message : 'Не удалось загрузить диалоги.'} retry={() => void dialogues.refetch()}/>}
          {dialogues.isSuccess && !items.length && <p className="field-help">
            {text && dialogues.hasNextPage ? 'В просмотренной части истории совпадений пока нет.' : 'Диалоги по этим фильтрам не найдены.'}
          </p>}
          <ul className="history-list">{items.map(item => <li key={item.id}>
            <button type="button" className="history-list-item" aria-pressed={item.id === selected}
              onClick={event => { selectedTrigger.current = event.currentTarget; setParams({ dialogue: item.id }) }}>
              <span><strong>{name(item.agent_id)}</strong><small>{channels[item.channel_type]} · {formatDate(item.created_at)}</small></span>
              <span>{statuses[item.status]}</span><ChevronRight size={16}/>
            </button>
          </li>)}</ul>
          {dialogues.hasNextPage && <button type="button" className="button button-quiet" disabled={dialogues.isFetchingNextPage}
            onClick={() => void dialogues.fetchNextPage()}>{text ? 'Продолжить поиск' : 'Показать ещё диалоги'}</button>}
        </div>
        {selected && <DialogueDetail key={selected} orgId={orgId} id={selected}
          name={name} close={() => {
            setParams({})
            requestAnimationFrame(() => selectedTrigger.current?.focus())
          }}/>}
      </div>}
  </section>
}

function Retry({ message, retry }: { message: string; retry: () => void }) {
  return <p role="alert">{message} <button type="button" className="button button-quiet" onClick={retry}>Повторить</button></p>
}

function DialogueDetail({ orgId, id, name, close }: { orgId: string; id: string; name: (id: string) => string; close: () => void }) {
  const path = { org_id: orgId, conversation_id: id }
  const [trace, setTrace] = useState(false)
  const pane = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!matchMedia('(max-width: 820px)').matches) return
    heading.current?.focus({ preventScroll: true })
    pane.current?.scrollIntoView({ block: 'start' })
  }, [id])
  const detail = useQuery({
    queryKey: ['history-dialogue', orgId, id],
    staleTime: 0, gcTime: 0,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/conversations/{conversation_id}', { params: { path }, signal })
      check(result.response, result.error)
      if (!result.data) throw new Error('Диалог недоступен')
      return result.data
    },
  })
  const messages = useInfiniteQuery({
    queryKey: ['history-messages', orgId, id], initialPageParam: null as number | null,
    staleTime: 0, gcTime: 0,
    enabled: !trace && detail.data?.store_message_text === true,
    queryFn: async ({ signal, pageParam }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/conversations/{conversation_id}/messages', {
        params: { path, query: { cursor: pageParam ?? undefined } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Сообщения недоступны')
      return result.data
    },
    getNextPageParam: page => page.next_cursor == null ? undefined : Number(page.next_cursor),
  })
  const events = useInfiniteQuery({
    queryKey: ['history-trace', orgId, id], initialPageParam: null as number | null, enabled: trace && detail.isSuccess,
    queryFn: async ({ signal, pageParam }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/conversations/{conversation_id}/trace', {
        params: { path, query: { cursor: pageParam ?? undefined } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Трассировка недоступна')
      return result.data
    },
    getNextPageParam: page => page.next_cursor == null ? undefined : Number(page.next_cursor),
  })
  const row = detail.isSuccess ? detail.data : undefined
  const messageItems = messages.data?.pages.flatMap(page => page.items) ?? []
  const eventItems = events.data?.pages.flatMap(page => page.items) ?? []
  return <aside ref={pane} className="history-pane" aria-label="Диалог">
    <div className="section-heading"><div><h2 ref={heading} tabIndex={-1}>{row ? name(row.agent_id) : 'Диалог'}</h2>
      {row && <p>{channels[row.channel_type]} · {statuses[row.status]}</p>}</div>
      <button type="button" className="button icon-button" aria-label="Закрыть диалог" onClick={close}><X size={18}/></button>
    </div>
    {detail.isPending && <p role="status">Загрузка диалога…</p>}
    {detail.isError && <Retry message="Диалог недоступен." retry={() => void detail.refetch()}/>}
    {row && <>
      <p className="field-help">Версия <code>{row.version_id.slice(0, 8)}</code> · <Link to={`/app/o/${orgId}/agents/${row.agent_id}`}>Открыть агента</Link></p>
      <div className="filter-tabs">
        <button type="button" aria-pressed={!trace} onClick={() => setTrace(false)}>Сообщения</button>
        <button type="button" aria-pressed={trace} onClick={() => setTrace(true)}>Трассировка</button>
      </div>
      {trace ? <>
        {events.isPending && <p role="status">Загрузка событий…</p>}
        {events.isError && <Retry message="Не удалось загрузить события." retry={() => void events.refetch()}/>}
        {events.isSuccess && !eventItems.length && <p className="field-help">Событий пока нет.</p>}
        {eventItems.map(turn => <details className="history-turn" key={turn.turn_id} open>
          <summary>{turn.sequence ? `Ход ${turn.sequence}` : 'Начало диалога'} · {formatDate(turn.created_at)}</summary>
          {turn.error_code && <p className="field-help">Код ошибки <code>{turn.error_code}</code></p>}
          <ol>{turn.trace.map((event, index) => <li key={index}>
            <strong>{labels[event.event] ?? event.event}</strong> · <code>{event.node_type}</code>
            {['handoff_history', 'handoff_history_truncated'].includes(event.event) && /^\d{1,2}$/.test(event.output ?? '') &&
              <small>Реплик в контексте: {event.output}</small>}
            <small>{event.version_id ? `Версия ${event.version_id.slice(0, 8)} · ` : ''}Блок {event.node_id.slice(0, 8)}</small>
          </li>)}</ol>
        </details>)}
        {events.hasNextPage && <button type="button" className="button button-quiet" disabled={events.isFetchingNextPage}
          onClick={() => void events.fetchNextPage()}>Ещё события</button>}
      </> : row.store_message_text ? <>
        {messages.isPending && <p role="status">Загрузка сообщений…</p>}
        {messages.isError && <Retry message="Не удалось загрузить сообщения." retry={() => void messages.refetch()}/>}
        {messages.isSuccess && !messageItems.length && <p className="field-help">Сохранённых сообщений нет.</p>}
        {messageItems.flatMap(turn => turn.messages.map((message, index) =>
          <article className={`history-message ${message.role === 'agent' ? 'history-message-bot' : ''}`} key={`${turn.turn_id}:${index}`}>
            <small>{message.role === 'agent' ? 'Агент' : 'Пользователь'} · {formatDate(turn.created_at)}</small>
            <p>{message.text}</p>
          </article>))}
        {messages.hasNextPage && <button type="button" className="button button-quiet" disabled={messages.isFetchingNextPage}
          onClick={() => void messages.fetchNextPage()}>Ещё сообщения</button>}
      </> : <p className="field-help">Сохранение текста отключено в настройках пространства. Ход сценария доступен в трассировке.</p>}
    </>}
  </aside>
}

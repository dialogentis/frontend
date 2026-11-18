import { useState, type CSSProperties, type FormEvent } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'

type Widget = components['schemas']['WidgetView']
type WidgetInput = components['schemas']['WidgetInput']
type Position = components['schemas']['WidgetPosition']
type Editor = Widget | 'new' | null

export function WidgetChannels({ orgId, agentId, archived, published }: {
  orgId: string; agentId: string; archived: boolean; published: boolean
}) {
  const path = { org_id: orgId, agent_id: agentId }
  const queryKey = ['widget-channels', orgId, agentId]
  const cache = useQueryClient()
  const [editor, setEditor] = useState<Editor>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const channels = useInfiniteQuery({
    queryKey,
    initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/widget-channels', {
        params: { path, query: { limit: 25, cursor: pageParam || undefined } }, signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const items = channels.data?.pages.flatMap(page => page.items) ?? []
  const run = async (operation: () => Promise<void>, success: string) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
      setEditor(null)
      setNotice(success)
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Сервер не подтвердил операцию. Проверьте список виджетов.')
    } finally {
      await cache.invalidateQueries({ queryKey })
      setBusy(false)
    }
  }
  const change = (widget: Widget, fields: components['schemas']['WidgetPatch']) => api.PATCH(
    '/api/v1/organizations/{org_id}/agents/{agent_id}/widget-channels/{channel_id}',
    { params: { path: { ...path, channel_id: widget.id }, header: { 'If-Match': `"rev-${widget.revision}"` } },
      body: fields, signal: AbortSignal.timeout(15_000) },
  )
  const selectEditor = (next: Editor) => {
    setError('')
    setNotice('')
    setEditor(next)
  }
  return <section className="widget-channels" aria-labelledby="widget-channels-heading">
    <div className="section-heading">
      <div>
        <h2 id="widget-channels-heading">Чат для сайта</h2>
        <p>Настройте виджет и укажите сайты, на которых он доступен.</p>
      </div>
      {!editor && !archived && <button type="button" className="button button-primary" disabled={busy}
        onClick={() => selectEditor('new')}>Добавить виджет</button>}
    </div>
    {!published && !archived && <p className="field-help">Для общения в виджете нужна опубликованная версия агента.</p>}
    {archived && <p className="field-help">Архивный агент недоступен для новых диалогов.</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {notice && <p role="status" className="inline-note">{notice}</p>}
    {editor && <WidgetForm key={editor === 'new' ? 'new' : editor.id}
      widget={editor === 'new' ? null : editor} busy={busy} cancel={() => selectEditor(null)}
      save={fields => void run(async () => {
        const result = editor === 'new'
          ? await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/widget-channels', {
            params: { path }, body: fields, signal: AbortSignal.timeout(15_000),
          })
          : await change(editor, fields)
        check(result.response, result.error)
      }, editor === 'new' ? 'Виджет создан.' : 'Настройки виджета сохранены.')}/>}
    {channels.isPending && <p role="status">Загрузка виджетов…</p>}
    {channels.isError && <p role="alert">Не удалось загрузить виджеты. <button type="button" className="button button-text"
      onClick={() => void channels.refetch()}>Повторить</button></p>}
    {channels.isSuccess && !items.length && !editor && <p className="field-help">У агента пока нет виджетов.</p>}
    {!!items.length && <ul className="widget-channel-list">{items.map(widget => <li className="widget-channel-row" key={widget.id}>
      <div className="widget-channel-meta">
        <span className="widget-channel-swatch" aria-hidden="true" style={{ background: widget.accent_color }}/>
        <div><strong>{widget.name}</strong> · <span>{widget.enabled ? 'Включён' : 'Отключён'}</span>
          <p className="field-help">{widget.allowed_origins.join(', ')}</p>
        </div>
      </div>
      <div className="row-actions">
        <button type="button" className="button button-quiet" disabled={busy || !!editor}
          onClick={() => selectEditor(widget)}>Настроить виджет</button>
        <button type="button" className="button button-quiet" disabled={busy || !!editor || (archived && !widget.enabled)}
          onClick={() => void run(async () => {
            const result = widget.enabled
              ? await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/widget-channels/{channel_id}/disable', {
                params: { path: { ...path, channel_id: widget.id } }, signal: AbortSignal.timeout(15_000),
              })
              : await change(widget, { enabled: true })
            check(result.response, result.error)
          }, widget.enabled ? 'Виджет отключён.' : 'Виджет включён.')}>{widget.enabled ? 'Отключить виджет' : 'Включить виджет'}</button>
      </div>
    </li>)}</ul>}
    {channels.hasNextPage && <button type="button" className="button button-quiet" disabled={channels.isFetchingNextPage}
      onClick={() => void channels.fetchNextPage()}>Показать ещё виджеты</button>}
  </section>
}

function WidgetForm({ widget, busy, save, cancel }: {
  widget: Widget | null; busy: boolean; save: (input: WidgetInput) => void; cancel: () => void
}) {
  const [name, setName] = useState(widget?.name ?? '')
  const [sites, setSites] = useState(widget?.allowed_origins.join('\n') ?? '')
  const [welcome, setWelcome] = useState(widget?.welcome_text ?? '')
  const [color, setColor] = useState(widget?.accent_color ?? '#da694e')
  const [position, setPosition] = useState<Position>(widget?.position ?? 'bottom-right')
  const origins = sites.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!busy && name.trim() && origins.length && origins.length <= 20) {
      save({
        name: name.trim(), allowed_origins: origins, welcome_text: welcome, accent_color: color,
        position, enabled: widget?.enabled ?? true,
      })
    }
  }
  return <div className="widget-settings-layout">
    <form className="widget-settings-form" onSubmit={submit}>
      <label className="field-label">Название виджета
        <input name="widget_name" value={name} maxLength={120} required onChange={event => setName(event.target.value)}/>
      </label>
      <label className="field-label">Разрешённые сайты
        <textarea name="widget_origins" value={sites} rows={3} required placeholder="https://shop.example.com"
          onChange={event => setSites(event.target.value)}/>
        <span className="field-help">По одному HTTPS-адресу без пути на строку. До 20 адресов.</span>
      </label>
      <label className="field-label">Приветствие
        <textarea name="widget_welcome" value={welcome} rows={2} maxLength={1000}
          onChange={event => setWelcome(event.target.value)}/>
      </label>
      <div className="widget-settings-appearance">
        <label className="field-label">Цвет акцента
          <input name="widget_accent" type="color" value={color} onChange={event => setColor(event.target.value)}/>
        </label>
        <label className="field-label">Положение кнопки
          <select name="widget_position" value={position} onChange={event => setPosition(event.target.value as Position)}>
            <option value="bottom-right">Справа внизу</option>
            <option value="bottom-left">Слева внизу</option>
          </select>
        </label>
      </div>
      <div className="row-actions">
        <button className="button button-primary" disabled={busy || !name.trim() || !origins.length || origins.length > 20}>
          {widget ? 'Сохранить виджет' : 'Создать виджет'}
        </button>
        <button type="button" className="button button-quiet" disabled={busy} onClick={cancel}>Отмена</button>
      </div>
    </form>
    <aside className="widget-appearance-preview" aria-label="Предпросмотр внешнего вида"
      style={{ '--widget-accent': color } as CSSProperties} data-position={position}>
      <p className="field-help">Предпросмотр внешнего вида</p>
      <div className="widget-preview-card">
        <strong>{name.trim() || 'Чат поддержки'}</strong>
        {welcome && <p>{welcome}</p>}
      </div>
      <div className="widget-preview-launcher" aria-hidden="true"><MessageCircle size={19}/></div>
    </aside>
  </div>
}

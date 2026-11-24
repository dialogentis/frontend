import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { api, check } from '../api'
import type { components } from '../api/schema'

const actions: Record<string, string> = {
  'organization.created': 'Создано пространство',
  'organization.settings_changed': 'Изменены настройки пространства',
  'organization.ownership_transferred': 'Передано владение',
  'organization.deletion_requested': 'Запрошено удаление пространства',
  'organization.deletion_retried': 'Удаление пространства запущено повторно',
  'member.role_changed': 'Изменена роль участника',
  'member.removed': 'Участник удалён',
  'member.left': 'Участник вышел',
  'invitation.created': 'Отправлено приглашение',
  'invitation.resent': 'Приглашение отправлено повторно',
  'invitation.accepted': 'Приглашение принято',
  'invitation.revoked': 'Приглашение отозвано',
  'agent.created': 'Создан агент',
  'agent.copied': 'Агент скопирован',
  'agent.archived': 'Агент отправлен в архив',
  'agent.restored': 'Агент восстановлен',
  'agent.lease_revoked': 'Доступ к редактированию отозван',
  'agent.training_requested': 'Запущена подготовка версии',
  'agent.import_requested': 'Запрошен импорт',
  'agent.import_applied': 'Импорт применён',
  'agent.export_requested': 'Запрошен экспорт агента',
  'agent.published': 'Версия опубликована',
  'agent.rolled_back': 'Выполнен откат публикации',
  'integration.created': 'Создана интеграция',
  'integration.updated': 'Интеграция обновлена',
  'integration.secret_rotated': 'Секрет интеграции заменён',
  'integration.deleted': 'Интеграция удалена',
  'api_key.created': 'Выдан ключ API',
  'api_key.revoked': 'Ключ API отозван',
  'widget.created': 'Создан виджет',
  'widget.updated': 'Виджет обновлён',
  'widget.disabled': 'Виджет отключён',
  'history.export_requested': 'Запрошена выгрузка истории',
  'history.export_downloaded': 'Выгрузка истории скачана',
  'history.deletion_requested': 'Запрошено удаление истории',
  'history.deleted': 'История удалена',
}
const roles = { admin: 'Администратор', editor: 'Редактор', viewer: 'Наблюдатель' }
const time = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' })

function description(details: components['schemas']['AuditDetails']) {
  return [
    details.reason && `Причина: ${details.reason}`,
    details.role_before && details.role_after && `${roles[details.role_before]} → ${roles[details.role_after]}`,
    details.history_retention_days != null && `Срок хранения: ${details.history_retention_days} дн.`,
    details.store_message_text != null && (details.store_message_text ? 'Текст сохраняется' : 'Сохранение текста отключено'),
    details.purge_existing_text && 'Запрошена очистка сохранённого текста',
    details.format && `Формат: ${details.format.toUpperCase()}`,
    details.selected_dialogues != null && `Выбрано диалогов: ${details.selected_dialogues}`,
    details.dialogues != null && `Удалено диалогов: ${details.dialogues}`,
    details.turns != null && `Удалено ходов: ${details.turns}`,
  ].filter(Boolean).join(' · ')
}

export function OrganizationAudit({ orgId }: { orgId: string }) {
  const [action, setAction] = useState('')
  const events = useInfiniteQuery({
    queryKey: ['organization-audit', orgId, action], initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => {
      const result = await api.GET('/api/v1/organizations/{org_id}/audit', {
        params: { path: { org_id: orgId }, query: { action: action || undefined, cursor: pageParam || undefined } },
        signal,
      })
      check(result.response, result.error)
      if (!result.data) throw new Error('Журнал недоступен')
      return result.data
    },
    getNextPageParam: page => page.next_cursor || undefined,
  })
  const items = events.data?.pages.flatMap(page => page.items) ?? []
  return <section className="workspace-audit">
    <div className="page-heading"><div><h1>Аудит</h1><p>Действия в пространстве за последние 180 дней</p></div>
      <label className="field-label">Действие<select name="audit_action" value={action}
        onChange={event => setAction(event.target.value)}>
        <option value="">Все действия</option>
        {Object.entries(actions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select></label>
    </div>
    {events.isPending && <p role="status">Загрузка журнала…</p>}
    {events.isError && <p role="alert">Не удалось загрузить журнал. <button type="button" className="button button-quiet"
      onClick={() => void events.refetch()}>Повторить</button></p>}
    {events.isSuccess && !items.length && <p className="field-help">Таких действий пока нет.</p>}
    <AuditRows items={items}/>
    {events.hasNextPage && <button type="button" className="button button-quiet" disabled={events.isFetchingNextPage}
      onClick={() => void events.fetchNextPage()}>Показать ещё</button>}
  </section>
}

export function AuditRows({ items }: { items: components['schemas']['AuditView'][] }) {
  return <ol className="audit-list">{items.map(item => {
      const details = description(item.details)
      return <li key={item.id} className="event-row">
        <ShieldCheck size={18} aria-hidden="true"/>
        <div><strong>{actions[item.action] ?? item.action}</strong>
          <p>{item.actor_email ?? `Участник ${item.actor_id.slice(0, 8)}`}</p>
          {details && <p>{details}</p>}
        </div>
        <time dateTime={item.created_at}>{time.format(new Date(item.created_at))}</time>
      </li>
    })}</ol>
}

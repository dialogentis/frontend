import type { Edge, Node } from '@xyflow/react'

export type AgentStatus = 'published' | 'draft' | 'archived'
export type Agent = {
  id: string
  org: string
  name: string
  slug: string
  description: string
  status: AgentStatus
  version: number
  edited: string
}
export type Intent = { id: string; name: string; code: string; examples: string[] }
export type FlowKind = 'start' | 'intent' | 'ask' | 'http' | 'say' | 'handoff' | 'end'
export type FlowData = { label: string; kind: FlowKind; body: string; detail?: string; visited?: boolean }
export type FlowNode = Node<FlowData, 'dialog'>
export type Message = { id: string; role: 'user' | 'assistant'; text: string }
export type Trace = { intent: string; entity?: string; steps: string[]; fallback: boolean }
export type PreviewState = 'full' | 'loading' | 'empty' | 'error'
export type Organization = { id: string; name: string; initials: string }

export const organizations: Organization[] = [
  { id: 'studio', name: 'Основное пространство', initials: 'ДП' },
  { id: 'team', name: 'Вторая команда', initials: 'ВК' },
]

export const seedAgents: Agent[] = [
  { id: 'support', org: 'studio', name: 'Поддержка магазина', slug: 'shop_support', description: 'Заказы, возвраты и вопросы покупателей', status: 'published', version: 3, edited: 'Сегодня' },
  { id: 'delivery', org: 'studio', name: 'Доставка', slug: 'delivery', description: 'Сроки доставки и изменение адреса', status: 'published', version: 2, edited: 'Сегодня' },
  { id: 'onboarding', org: 'studio', name: 'Помощник сотрудника', slug: 'team_assistant', description: 'Первые шаги и внутренние процессы команды', status: 'draft', version: 0, edited: 'Вчера' },
  { id: 'legacy', org: 'studio', name: 'Справочная', slug: 'helpdesk_archive', description: 'Предыдущая версия справочного агента', status: 'archived', version: 1, edited: '28 октября' },
  { id: 'reception', org: 'team', name: 'Секретарь команды', slug: 'reception', description: 'Маршрутизация вопросов внутри команды', status: 'draft', version: 0, edited: 'Сегодня' },
]

export const seedIntents: Intent[] = [
  { id: 'greeting', name: 'Приветствие', code: 'greeting', examples: ['Привет', 'Здравствуйте', 'Добрый день', 'Добрый вечер', 'Приветствую'] },
  { id: 'order_status', name: 'Статус заказа', code: 'order_status', examples: ['Где мой заказ?', 'Хочу узнать статус заказа', 'Когда придёт заказ 12345?', 'Проверьте заказ', 'Что с моим заказом?'] },
  { id: 'refund', name: 'Возврат товара', code: 'refund', examples: ['Как вернуть товар?', 'Хочу оформить возврат', 'Товар не подошёл', 'Можно вернуть покупку?', 'Как получить деньги обратно?'] },
  { id: 'delivery', name: 'Вопрос о доставке', code: 'delivery', examples: ['Изменить адрес доставки', 'Когда будет доставка?', 'Куда привезут заказ?', 'Есть доставка в другой город?', 'Помогите с доставкой'] },
  { id: 'goodbye', name: 'Завершение диалога', code: 'goodbye', examples: ['Спасибо', 'До свидания', 'Больше вопросов нет', 'Хорошего дня', 'Пока'] },
]

export const seedNodes: FlowNode[] = [
  { id: 'start', type: 'dialog', position: { x: 450, y: 0 }, data: { kind: 'start', label: 'Начало диалога', body: '' } },
  { id: 'intent', type: 'dialog', position: { x: 5, y: 75 }, data: { kind: 'intent', label: 'Распознать намерение', body: 'Выбрать подходящую ветку', detail: 'greeting / order_status / delivery' } },
  { id: 'ask', type: 'dialog', position: { x: 420, y: 75 }, data: { kind: 'ask', label: 'Узнать номер заказа', body: 'Подскажите номер вашего заказа', detail: 'order_id  /  Обязательный' } },
  { id: 'greeting', type: 'dialog', position: { x: 5, y: 240 }, data: { kind: 'say', label: 'Поздороваться', body: 'Здравствуйте! Чем могу помочь?', detail: 'Текстовый ответ' } },
  { id: 'http', type: 'dialog', position: { x: 420, y: 240 }, data: { kind: 'http', label: 'Проверить заказ', body: '/orders/{{order_id}}', detail: 'GET  /  Store API' } },
  { id: 'handoff', type: 'dialog', position: { x: 5, y: 405 }, data: { kind: 'handoff', label: 'Передать доставке', body: 'Агент «Доставка»', detail: 'Сохранить контекст диалога' } },
  { id: 'reply', type: 'dialog', position: { x: 420, y: 405 }, data: { kind: 'say', label: 'Сообщить статус', body: 'Ваш заказ {{order_id}} в пути', detail: 'Текстовый ответ' } },
  { id: 'end', type: 'dialog', position: { x: 420, y: 570 }, data: { kind: 'end', label: 'Завершить диалог', body: '' } },
]

export const seedEdges: Edge[] = [
  { id: 'start-intent', source: 'start', target: 'intent' },
  { id: 'intent-ask', source: 'intent', target: 'ask', label: 'Статус заказа', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'intent-greeting', source: 'intent', target: 'greeting', label: 'Приветствие' },
  { id: 'intent-handoff', source: 'intent', target: 'handoff', label: 'Доставка', sourceHandle: 'left-out', targetHandle: 'left' },
  { id: 'ask-http', source: 'ask', target: 'http', label: 'Номер получен' },
  { id: 'http-reply', source: 'http', target: 'reply', label: 'Успешный ответ' },
  { id: 'reply-end', source: 'reply', target: 'end' },
]

export const nodeNames: Record<FlowKind, string> = {
  start: 'Начало', intent: 'Намерение', ask: 'Сбор параметра', http: 'HTTP-запрос', say: 'Ответ', handoff: 'Другой агент', end: 'Завершение',
}

export function mockReply(text: string, waitingForOrder: boolean): { messages: string[]; trace: Trace; waiting: boolean } {
  const t = text.toLocaleLowerCase('ru')
  const order = text.match(/\b\d{3,10}\b/)
  if ((waitingForOrder && order) || (t.includes('заказ') && order)) return {
    messages: [order![0] === '12345' ? 'Заказ 12345 передан в доставку. Ожидаемая доставка — завтра.' : `Не найден заказ ${order![0]}. Попробуйте номер 12345.`],
    trace: { intent: 'order_status', entity: `order_id = ${order![0]}`, steps: ['intent', 'ask', 'http', 'reply'], fallback: false }, waiting: false,
  }
  if (t.includes('заказ')) return { messages: ['Подскажите номер вашего заказа. Для проверки используйте 12345.'], trace: { intent: 'order_status', steps: ['intent', 'ask'], fallback: false }, waiting: true }
  if (/достав|адрес/.test(t)) return { messages: ['Передаю вопрос агенту «Доставка». Подскажите, что вы хотите уточнить?'], trace: { intent: 'delivery', steps: ['intent', 'handoff'], fallback: false }, waiting: false }
  if (/верну|возврат|подош/.test(t)) return { messages: ['Для возврата понадобятся номер заказа и причина. Создание заявки сейчас недоступно.'], trace: { intent: 'refund', steps: ['intent'], fallback: false }, waiting: false }
  if (/привет|здрав|добрый/.test(t)) return { messages: ['Здравствуйте! Помогу узнать статус заказа, разобраться с доставкой или возвратом.'], trace: { intent: 'greeting', steps: ['intent', 'greeting'], fallback: false }, waiting: false }
  if (/спасиб|пока|свидан/.test(t)) return { messages: ['Спасибо за обращение. Хорошего дня!'], trace: { intent: 'goodbye', steps: ['end'], fallback: false }, waiting: false }
  return { messages: [waitingForOrder ? 'Не получилось распознать номер. Введите 12345.' : 'Пока не понимаю этот запрос. Попробуйте «Где мой заказ?» или «Вопрос о доставке».'], trace: { intent: 'fallback', steps: ['intent'], fallback: true }, waiting: waitingForOrder }
}

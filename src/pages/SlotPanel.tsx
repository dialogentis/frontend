import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { components } from '../api/schema'
import { containsReference } from './IntentPanel'

type Draft = components['schemas']['DraftView']
type Config = components['schemas']['DraftConfig']
type Slot = { id: string; code: string; name?: string; value_type?: 'string' | 'integer' | 'number' | 'boolean' | 'date'; required?: boolean; sensitive?: boolean; default?: string | number | boolean | null }
const typeNames: Record<NonNullable<Slot['value_type']>, string> = { string: 'Текст', integer: 'Целое число', number: 'Десятичное число', boolean: 'Да / нет', date: 'Дата' }

function referenced(flow: Config['flow'], slot: Slot): boolean {
  const code = typeof slot.code === 'string' ? slot.code : ''
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (typeof slot.id === 'string' && containsReference(flow, slot.id)) || (!!code && new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`).test(JSON.stringify(flow)))
}

export function SlotPanel({ draft, editable, update }: { draft: Draft; editable: boolean; update: (mutate: (config: Config) => Config) => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const slots = draft.config.slots as unknown as Slot[]
  const current = selected === null ? undefined : slots[selected]
  const used = current ? referenced(draft.config.flow, current) : false
  const change = (index: number, patch: Partial<Slot>) => { setError(''); update(config => ({ ...config, slots: (config.slots as unknown as Slot[]).map((slot, itemIndex) => itemIndex === index ? { ...slot, ...patch } : slot) })) }
  const add = () => {
    const id = crypto.randomUUID()
    const slot: Slot = { id, code: `slot_${id.replaceAll('-', '').slice(0, 12)}`, name: 'Новый параметр', value_type: 'string', required: false, sensitive: false, default: null }
    update(config => ({ ...config, slots: [...config.slots, slot] })); setSelected(slots.length); setError('')
  }
  const remove = (slot: Slot, index: number) => {
    if (referenced(draft.config.flow, slot)) { setError('Параметр используется в сценарии. Сначала удалите ссылки на него.'); return }
    if (!window.confirm(`Удалить параметр «${slot.name || slot.code}»?`)) return
    update(config => ({ ...config, slots: (config.slots as unknown as Slot[]).filter((_, itemIndex) => itemIndex !== index) })); setSelected(null); setError('')
  }
  const invalidCode = current ? !/^[a-z][a-z0-9_]{1,63}$/.test(current.code) || slots.some((slot, index) => index !== selected && slot.code === current.code) : false
  const valueType = current?.value_type || 'string'
  const hasDefault = current?.default !== null && current?.default !== undefined
  return <div className="intent-panel"><div className="section-heading"><div><h2>Параметры</h2><p>Значения, которые агент собирает и использует в диалоге.</p></div>{editable && <button type="button" className="button button-primary" onClick={add}><Plus size={16}/>Добавить параметр</button>}</div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {!slots.length ? <div className="data-state"><h2>Параметров пока нет</h2><p>Добавьте параметр, чтобы использовать его в сценарии.</p></div> : <div className="intent-layout"><div className="intent-list" aria-label="Список параметров">{slots.map((slot, index) => <button type="button" key={`${slot.id || 'invalid'}-${index}`} aria-pressed={selected === index} onClick={() => { setSelected(index); setError('') }}><strong>{slot.name || slot.code || 'Параметр без кода'}</strong><span>{slot.code || 'Нет кода'} · {typeNames[slot.value_type || 'string']}</span></button>)}</div><div className="intent-detail">{current ? <><h3>Настройки параметра</h3><label className="field-label">Название<input name="slot_name" maxLength={120} disabled={!editable} value={current.name || ''} onChange={event => change(selected!, { name: event.target.value })}/></label><label className="field-label">Код<input name="slot_code" maxLength={64} disabled={!editable || used} aria-invalid={invalidCode} value={typeof current.code === 'string' ? current.code : ''} onChange={event => change(selected!, { code: event.target.value })}/><span className={`field-help ${invalidCode ? 'error-text' : ''}`}>{used ? 'Код используется в сценарии; сначала удалите ссылки.' : invalidCode ? 'Укажите уникальный код из 2–64 символов, начиная с латинской буквы.' : 'Латинские буквы, цифры и знак подчёркивания.'}</span></label><label className="field-label">Тип значения<select name="slot_type" value={valueType} disabled={!editable} onChange={event => change(selected!, { value_type: event.target.value as NonNullable<Slot['value_type']>, default: null })}>{Object.entries(typeNames).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label><label className="intent-enabled"><input type="checkbox" checked={current.required === true} disabled={!editable} onChange={event => change(selected!, { required: event.target.checked })}/>Обязательный параметр</label><label className="intent-enabled"><input type="checkbox" checked={current.sensitive === true} disabled={!editable} onChange={event => change(selected!, { sensitive: event.target.checked })}/>Чувствительное значение</label><p className="field-help">Чувствительные значения предназначены для маскирования в истории и защиты во время выполнения.</p><label className="intent-enabled"><input type="checkbox" checked={hasDefault} disabled={!editable} onChange={event => change(selected!, { default: event.target.checked ? valueType === 'boolean' ? false : valueType === 'integer' ? 0 : valueType === 'number' ? '0' : '' : null })}/>Задать значение по умолчанию</label>{hasDefault && (valueType === 'boolean' ? <label className="field-label">Значение по умолчанию<select name="slot_default" disabled={!editable} value={String(current.default)} onChange={event => change(selected!, { default: event.target.value === 'true' })}><option value="false">Нет</option><option value="true">Да</option></select></label> : <label className="field-label">Значение по умолчанию<input name="slot_default" type={valueType === 'date' ? 'date' : 'text'} inputMode={valueType === 'integer' ? 'numeric' : valueType === 'number' ? 'decimal' : undefined} maxLength={valueType === 'string' ? 2000 : 128} disabled={!editable} value={String(current.default ?? '')} onChange={event => { const raw = event.target.value; const number = Number(raw); change(selected!, { default: valueType === 'integer' && /^-?\d+$/.test(raw) && Number.isSafeInteger(number) ? number : raw }) }}/>{valueType === 'number' && <span className="field-help">Десятичная точка, без пробелов и экспоненты.</span>}</label>)}{current.sensitive && hasDefault && <p className="field-help">Значение по умолчанию видно участникам пространства с доступом к агенту.</p>}{editable && <button type="button" className="button danger-button" onClick={() => remove(current, selected!)}><Trash2 size={15}/>Удалить параметр</button>}</> : <p className="muted">Выберите параметр, чтобы настроить его.</p>}</div></div>}
  </div>
}

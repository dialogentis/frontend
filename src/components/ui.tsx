import { AlertTriangle, ArrowUpRight, Check, LoaderCircle, Search, SlidersHorizontal } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { PreviewState } from '../model'

export function Button({ children, variant = 'quiet', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'text'; children?: ReactNode }) {
  return <button type="button" {...props} className={`button button-${variant} ${className}`}>{children}</button>
}
export function Status({ status, label }: { status: string; label?: string }) {
  const published = status === 'published'
  return <span className={`status ${published ? 'status-success' : ''}`}><Check size={13} aria-hidden="true" />{label ?? (published ? 'Опубликован' : status === 'archived' ? 'В архиве' : 'Черновик')}</span>
}
export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-actions">{action}</div>}</div>
}
export function SearchBox({ value, onChange, placeholder = 'Поиск' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className="search-input"><Search size={16} aria-hidden="true"/><input aria-label={placeholder} name="search" autoComplete="off" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}/></label>
}
export function DataState({ state, children, onRetry, emptyTitle = 'Пока ничего нет', emptyText = 'Добавьте первый элемент, чтобы продолжить.', action }: { state: PreviewState; children: ReactNode; onRetry: () => void; emptyTitle?: string; emptyText?: string; action?: ReactNode }) {
  if (state === 'loading') return <div className="skeleton-list" role="status" aria-label="Загрузка данных">{[1, 2, 3, 4].map(n => <div className="skeleton-row" key={n}><i/><span/><span/></div>)}</div>
  if (state === 'error') return <div className="data-state"><AlertTriangle size={28}/><h2>Не удалось загрузить данные</h2><p>Проверьте соединение и попробуйте ещё раз.</p><Button onClick={onRetry}>Повторить</Button></div>
  if (state === 'empty') return <div className="data-state"><Search size={28}/><h2>{emptyTitle}</h2><p>{emptyText}</p>{action}</div>
  return <>{children}</>
}
export function StatePicker({ value, onChange }: { value: PreviewState; onChange: (s: PreviewState) => void }) {
  return <label className="state-picker"><SlidersHorizontal size={14} aria-hidden="true"/><select aria-label="Состояние данных" value={value} onChange={e => onChange(e.target.value as PreviewState)}><option value="full">Обычный вид</option><option value="loading">Загрузка</option><option value="empty">Пустой список</option><option value="error">Ошибка</option></select></label>
}
export function Busy({ text }: { text: string }) { return <span className="inline-busy" role="status"><LoaderCircle size={15}/>{text}</span> }
export function ExternalMark() { return <ArrowUpRight size={15} aria-hidden="true"/> }

import { WorkspaceSwitcher } from './WorkspaceSwitcher'

/** Isolated visual states; not part of the product navigation. */
export function WorkspaceSwitcherPreview() {
  return <div className="workspace-state-preview">{[
    ['default', 'Обычный'], ['hover', 'Наведение'], ['focus', 'Фокус'], ['active', 'Нажатие'],
    ['disabled', 'Недоступен'], ['loading', 'Загрузка'], ['error', 'Ошибка'], ['success', 'Выбор сохранён'],
  ].map(([state, label]) => <section key={state} className={`workspace-preview-${state}`}><h2>{label}</h2><WorkspaceSwitcher value="studio" disabled={state === 'disabled' || state === 'loading'} onChange={() => {}}/>{state === 'loading' && <p role="status">Загрузка пространств…</p>}{state === 'error' && <p role="alert">Не удалось загрузить пространства</p>}</section>)}</div>
}

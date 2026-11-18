import { useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { api, ApiError, check } from '../api'
import type { components } from '../api/schema'
import { TestChat } from './TestChat'

type Version = components['schemas']['VersionView']
type Report = components['schemas']['ReportView']
type Role = components['schemas']['OrganizationView']['role']
type Settings = components['schemas']['NLUSettings']
type QualitySettings = components['schemas']['QualitySettings']
type Pending = { revision: number; key: string }
const labels: Record<Version['status'], string> = { building: 'Подготовка', ready: 'Модель готова', failed: 'Ошибка', cancelled: 'Отменено' }
const stages: Record<NonNullable<Version['stage']>, string> = { validation: 'Проверка данных', intent_training: 'Обучение намерений', entity_training: 'Обучение сущностей', evaluation: 'Проверка качества', packaging: 'Сохранение модели' }
const warnings: Record<string, string> = { intent_quality_unavailable: 'Недостаточно тестовых данных для оценки намерений.', entity_quality_unavailable: 'Недостаточно разметки для оценки сущностей.', unknown_quality_unavailable: 'Нет отдельных неизвестных фраз для проверки отказа.', few_test_examples: 'Добавьте минимум три тестовые фразы для каждого включённого намерения.' }
const failures: Record<string, string> = { worker_lost: 'Обучение прервано после потери обработчика. Запустите его снова.', timeout: 'Время обучения истекло.', artifact_quota_exceeded: 'Недостаточно места для модели.', artifact_storage_unavailable: 'Хранилище моделей временно недоступно.', training_failed: 'Не удалось обучить модель. Проверьте данные и повторите попытку.' }
const reasons: Record<string, string> = { empty_features: 'нет известных признаков', low_score: 'низкая оценка', ambiguous_intent: 'похожие намерения', low_similarity: 'фраза мало похожа на обучающие' }
const percent = (value: number | null) => value === null ? 'Нет данных' : new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(value)
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
export const defaultNluSettings: Settings = { score: 0.55, margin: 0.15, similarity: 0.2 }
export const defaultQualitySettings: QualitySettings = { intent_f1: 0.8, entity_f1: 0.8 }
const settingDescriptions: { key: keyof Settings; name: string; description: string }[] = [
  { key: 'score', name: 'Минимальная оценка', description: 'Минимальная оценка выбранного намерения.' },
  { key: 'margin', name: 'Разница оценок', description: 'Минимальная разница между двумя лучшими намерениями.' },
  { key: 'similarity', name: 'Сходство с примерами', description: 'Минимальное сходство запроса с обучающими фразами.' },
]

export function TrainingPanel({ orgId, agentId, userId, role, revision, enabled, archived, settings, quality, editable, onSettingsChange, onQualityChange }: { orgId: string; agentId: string; userId: string; role: Role; revision: number; enabled: boolean; archived: boolean; settings: Settings; quality: QualitySettings; editable: boolean; onSettingsChange: (settings: Settings) => void; onQualityChange: (settings: QualitySettings) => void }) {
  const cache = useQueryClient()
  const path = { org_id: orgId, agent_id: agentId }
  const pendingKey = `dialogentis:training:${userId}:${orgId}:${agentId}`
  const [pending, setPending] = useState<Pending | null>(() => { try { const value = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); return value && typeof value.key === 'string' && Number.isInteger(value.revision) ? value : null } catch { return null } })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const versions = useInfiniteQuery({
    queryKey: ['agent-versions', orgId, agentId], initialPageParam: 0, retry: false,
    queryFn: async ({ pageParam, signal }) => { const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/versions', { params: { path, query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } }, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }); check(result.response, result.error); if (!result.data) throw new Error('Некорректный ответ сервера'); return result.data },
    getNextPageParam: page => page.next_cursor ? Number(page.next_cursor) : undefined,
    refetchInterval: query => document.hidden || !query.state.data?.pages.some(page => page.items.some(item => item.status === 'building')) ? false : 3000,
    refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  })
  const items = versions.data?.pages.flatMap(page => page.items) || []
  const selected = items.find(item => item.id === selectedId) || items[0]
  const report = useQuery({
    queryKey: ['version-report', orgId, agentId, selected?.id], enabled: selected?.status === 'ready', retry: false,
    queryFn: async ({ signal }) => { const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/versions/{version_id}/report', { params: { path: { ...path, version_id: selected!.id } }, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }); check(result.response, result.error); if (!result.data) throw new Error('Некорректный ответ сервера'); return result.data },
  })
  const refresh = () => cache.invalidateQueries({ queryKey: ['agent-versions', orgId, agentId] })
  const start = async () => {
    const request = pending || { revision, key: crypto.randomUUID() }
    sessionStorage.setItem(pendingKey, JSON.stringify(request)); setPending(request); setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/versions', { params: { path, header: { 'Idempotency-Key': request.key } }, body: { source_revision: request.revision }, signal: AbortSignal.timeout(30_000) }); check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      sessionStorage.removeItem(pendingKey); setPending(null); setSelectedId(result.data.version_id); void refresh()
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) { sessionStorage.removeItem(pendingKey); setPending(null) }
      setError(e instanceof ApiError ? e.details.map(item => typeof item.message === 'string' ? item.message : '').filter(Boolean).slice(0, 3).join(' ') || e.message : 'Запуск не подтверждён. Повторите проверку запуска.'); void refresh()
    } finally { setBusy(false) }
  }
  const cancel = async (version: Version) => {
    setBusy(true); setError('')
    try { const result = await api.POST('/api/v1/organizations/{org_id}/jobs/{job_id}/cancel', { params: { path: { org_id: orgId, job_id: version.job_id } }, signal: AbortSignal.timeout(10_000) }); check(result.response, result.error); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отменить обучение'); void refresh() }
    finally { setBusy(false) }
  }
  const canManage = role !== 'viewer'
  const active = items.some(item => item.status === 'building')
  const canCancel = selected && (role === 'owner' || role === 'admin' || (role === 'editor' && selected.created_by === userId))
  return <section className="training-page">
    <div className="section-heading"><div><h2>Обучение и версии</h2><p>Модель обучается на сохранённой версии черновика.</p></div>{canManage && <button type="button" className="button button-primary" disabled={busy || (!pending && (!enabled || archived || active || versions.isPending || versions.isError))} onClick={() => void start()}><FlaskConical size={16}/>{pending ? 'Проверить запуск' : 'Обучить агента'}</button>}</div>
    {pending && <p className="field-help">Запуск версии черновика {pending.revision} не подтверждён. Повторная проверка не создаст второе задание.</p>}
    {!enabled && !pending && canManage && <p className="field-help">Дождитесь сохранения изменений перед обучением.</p>}
    {archived && canManage && <p className="field-help">Восстановите агента из архива, чтобы запустить обучение.</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    <details className="training-settings"><summary>Пороги распознавания</summary><p className="field-help">Если запрос не достигает любого из порогов, агент использует сценарий нераспознанного запроса. Оценка — показатель модели, а не вероятность правильного ответа. Изменения применятся при следующем обучении.</p>{!editable && canManage && <p className="field-help">Для изменения порогов начните редактирование агента на компьютере.</p>}<div className="training-settings-grid">{settingDescriptions.map(item => <label key={item.key} className="training-setting"><span>{item.name} <strong>{percent(settings[item.key])}</strong></span><input type="range" min="0" max="1" step="0.01" value={settings[item.key]} disabled={!editable} onChange={event => onSettingsChange({ ...settings, [item.key]: Number(event.target.value) })}/><small>{item.description}</small></label>)}</div>{editable && <button type="button" className="button button-quiet" onClick={() => onSettingsChange(defaultNluSettings)}>Вернуть начальные значения</button>}</details>
    <details className="training-settings"><summary>Предупреждения о качестве</summary><p className="field-help">Если F1 на тестовых данных ниже заданного значения, в отчёте появится предупреждение. Метрики при этом не меняются.</p><div className="training-settings-grid">{([{ key: 'intent_f1', label: 'F1 намерений' }, { key: 'entity_f1', label: 'F1 сущностей' }] as const).map(item => <label key={item.key} className="training-setting"><span>{item.label} <strong>{percent(quality[item.key])}</strong></span><input type="range" min="0" max="1" step="0.01" value={quality[item.key]} disabled={!editable} onChange={event => onQualityChange({ ...quality, [item.key]: Number(event.target.value) })}/></label>)}</div>{editable && <button type="button" className="button button-quiet" onClick={() => onQualityChange(defaultQualitySettings)}>Вернуть начальные значения</button>}</details>
    {versions.isPending ? <p role="status">Загрузка версий…</p> : versions.isError ? <div className="data-state"><h3>Не удалось загрузить версии</h3><button type="button" className="button button-quiet" onClick={() => void versions.refetch()}>Повторить</button></div> : !items.length ? <div className="data-state"><h3>Версий пока нет</h3><p>Добавьте намерения и примеры, затем обучите агента.</p></div> : <div className="training-workspace">
      <div className="training-version-list" aria-label="Версии агента">{items.map(item => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}><strong>Версия {item.number}</strong><span>{labels[item.status]} · черновик {item.source_revision}</span><small>{date(item.created_at)}</small></button>)}{versions.hasNextPage && <button type="button" disabled={versions.isFetchingNextPage} onClick={() => void versions.fetchNextPage()}>Показать ещё</button>}</div>
      {selected && <div className="training-detail"><div className="section-heading"><div><h3>Версия {selected.number}</h3><p>{labels[selected.status]} · черновик {selected.source_revision} · {date(selected.created_at)}</p></div>{selected.status === 'building' && canCancel && <button type="button" className="button button-quiet" disabled={busy || selected.cancel_requested} onClick={() => void cancel(selected)}>{selected.cancel_requested ? 'Отмена…' : 'Отменить'}</button>}</div>
        {selected.status === 'building' && <p role="status">{selected.cancel_requested ? 'Останавливаем обучение…' : selected.job_status === 'queued' ? 'Ожидает очереди' : selected.stage ? stages[selected.stage] : 'Подготовка к обучению…'}</p>}
        {selected.status === 'failed' && <p role="alert" className="auth-error">{failures[selected.error_code || ''] || 'Не удалось подготовить версию. Проверьте данные и повторите попытку.'}</p>}
        {selected.status === 'cancelled' && <p>Обучение отменено.</p>}
        {!!selected.dataset_warnings.length && <details><summary>Предупреждения данных: {selected.dataset_warnings.length}{selected.warnings_truncated ? '+' : ''}</summary>{selected.dataset_warnings.map((item, index) => <p className="field-help" key={`${item.code}-${index}`}>{item.message}</p>)}</details>}
        {selected.status === 'ready' && <TestChat key={`${orgId}:${agentId}:${selected.id}`} orgId={orgId} agentId={agentId} versionId={selected.id} canRunLive={role === 'owner' || role === 'admin'}/>}
        {selected.status === 'ready' && (report.isPending ? <p role="status">Загрузка отчёта…</p> : report.isError ? <div role="alert">Не удалось загрузить отчёт. <button type="button" className="button button-text" onClick={() => void report.refetch()}>Повторить</button></div> : report.data && <TrainingReport report={report.data} orgId={orgId} agentId={agentId}/>)}
      </div>}
    </div>}
  </section>
}

function TrainingReport({ report, orgId, agentId }: { report: Report; orgId: string; agentId: string }) {
  const intentName = (id: string | null) => id === null ? 'Неизвестный запрос' : report.intent_catalog.find(item => item.id === id)?.name || 'Намерение недоступно'
  return <div className="training-report">
    <p className="inline-note">Модель обучена. Сценарий ещё не проверен; перед публикацией потребуется его проверка.</p>
    {report.warnings.map(item => <p className="field-help" key={item}>{item === 'low_intent_quality' ? `F1 намерений ниже ${percent(report.quality_settings.intent_f1)}.` : item === 'low_entity_quality' ? `F1 сущностей ниже ${percent(report.quality_settings.entity_f1)}.` : warnings[item] || 'Проверьте качество модели.'}</p>)}
    <p className="field-help">Обучающих фраз: {report.training_examples} · тестовых: {report.intents.test_count} · неизвестных: {report.intents.unknown_count}</p>
    <p className="field-help">Пороги версии: оценка {percent(report.nlu_settings.score)} · разница {percent(report.nlu_settings.margin)} · сходство {percent(report.nlu_settings.similarity)}</p>
    <div className="training-metrics"><div><span>F1 намерений</span><strong>{percent(report.intents.macro_f1)}</strong></div><div><span>F1 сущностей</span><strong>{percent(report.entities.f1)}</strong></div><div><span>Отказ на неизвестных</span><strong>{percent(report.intents.unknown_rejection)}</strong></div><div><span>Ошибочный отказ</span><strong>{percent(report.intents.known_fallback_rate)}</strong></div></div>
    <h4>Намерения</h4><div className="training-table-scroll"><table className="training-table"><thead><tr><th scope="col">Намерение</th><th scope="col">Примеров</th><th scope="col">Точность</th><th scope="col">Полнота</th><th scope="col">F1</th></tr></thead><tbody>{report.intents.per_intent.map(item => <tr key={item.intent_id}><th scope="row">{intentName(item.intent_id)}</th><td>{item.support}</td><td>{percent(item.precision)}</td><td>{percent(item.recall)}</td><td>{percent(item.f1)}</td></tr>)}</tbody></table></div>
    {!!report.entities.per_entity.length && <><h4>Сущности</h4><div className="training-table-scroll"><table className="training-table"><thead><tr><th scope="col">Сущность</th><th scope="col">Разметок</th><th scope="col">Точность</th><th scope="col">Полнота</th><th scope="col">F1</th></tr></thead><tbody>{report.entities.per_entity.map(item => <tr key={item.entity_id}><th scope="row">{report.entity_catalog.find(entry => entry.id === item.entity_id)?.name || item.code}</th><td>{item.expected}</td><td>{percent(item.precision)}</td><td>{percent(item.recall)}</td><td>{percent(item.f1)}</td></tr>)}</tbody></table></div><p className="field-help">Ошибок преобразования значений: {report.entities.invalid_values}</p></>}
    <details><summary>Матрица ошибок намерений</summary><p className="field-help">Строки — ожидаемое намерение, столбцы — распознанное.</p><div className="training-table-scroll"><table className="training-table"><thead><tr><th scope="col">Ожидаемое / результат</th>{report.intents.labels.map((label, i) => <th scope="col" key={label || `unknown-${i}`}>{intentName(label)}</th>)}</tr></thead><tbody>{report.intents.confusion_matrix.map((row, i) => <tr key={report.intents.labels[i] || `unknown-${i}`}><th scope="row">{intentName(report.intents.labels[i])}</th>{row.map((value, j) => <td key={j}>{value}</td>)}</tr>)}</tbody></table></div></details>
    <TrainingErrors report={report} orgId={orgId} agentId={agentId}/>
  </div>
}

function TrainingErrors({ report, orgId, agentId }: { report: Report; orgId: string; agentId: string }) {
  const [kind, setKind] = useState<'intent' | 'entity'>('intent')
  const errors = useInfiniteQuery({
    queryKey: ['version-errors', orgId, agentId, report.version_id, kind], initialPageParam: 0, retry: false,
    queryFn: async ({ pageParam, signal }) => { const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/versions/{version_id}/report/errors', { params: { path: { org_id: orgId, agent_id: agentId, version_id: report.version_id }, query: { kind, limit: 20, cursor: pageParam } }, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }); check(result.response, result.error); if (!result.data) throw new Error('Некорректный ответ сервера'); return result.data },
    getNextPageParam: page => page.next_cursor ? Number(page.next_cursor) : undefined,
  })
  const items = errors.data?.pages.flatMap(page => page.items) || []
  const intentName = (id: string | null) => id === null ? 'Неизвестный запрос' : report.intent_catalog.find(item => item.id === id)?.name || 'Намерение недоступно'
  const entityName = (id: string) => report.entity_catalog.find(item => item.id === id)?.name || 'Сущность недоступна'
  return <section className="training-errors"><h4>Ошибки проверки</h4><div className="filter-tabs"><button type="button" aria-pressed={kind === 'intent'} onClick={() => setKind('intent')}>Намерения · {report.intents.error_count}</button><button type="button" aria-pressed={kind === 'entity'} onClick={() => setKind('entity')}>Сущности · {report.entities.error_count}</button></div>
    {errors.isPending ? <p role="status">Загрузка ошибок…</p> : errors.isError ? <p role="alert">Не удалось загрузить ошибки. <button type="button" className="button button-text" onClick={() => void errors.refetch()}>Повторить</button></p> : !items.length ? <p className="field-help">Ошибок не найдено.</p> : <div className="training-error-list">{items.map(item => <article key={item.example_id}><strong>{item.text}</strong>{'expected' in item ? <p>Ожидалось: {intentName(item.expected)} · результат: {intentName(item.predicted)}{item.fallback_reasons.length ? ` · Причины: ${item.fallback_reasons.map(reason => reasons[reason] || reason).join(', ')}` : ''}</p> : <p>{item.missing.map(span => `Не найдено: ${entityName(span.entity_id)} «${Array.from(item.text).slice(span.start, span.end).join('')}»`).join(' · ')}{item.unexpected.length ? ` · Лишних разметок: ${item.unexpected.length}` : ''}{item.invalid_values.length ? ` · Ошибок значения: ${item.invalid_values.length}` : ''}</p>}</article>)}{errors.hasNextPage && <button type="button" className="button button-quiet" disabled={errors.isFetchingNextPage} onClick={() => void errors.fetchNextPage()}>Показать ещё</button>}</div>}
  </section>
}

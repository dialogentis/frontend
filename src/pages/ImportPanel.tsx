import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { api, ApiError, check, getCsrf } from '../api'
import type { components } from '../api/schema'

type ImportView = components['schemas']['ImportView']
type Draft = components['schemas']['DraftView']
type Grant = components['schemas']['LeaseGrant']
const terminal = new Set<ImportView['status']>(['succeeded', 'failed', 'cancelled'])
const messages: Record<string, string> = {
  duplicate_across_splits: 'Фраза уже есть в другом наборе.', duplicate_within_split: 'Фраза уже есть в наборе.',
  duplicate_code: 'Код уже используется.', duplicate_id: 'Идентификатор уже используется.', unknown_intent: 'Намерение не найдено.', unknown_intent_output: 'В сценарии есть ветвь, ссылающаяся на отсутствующее намерение.', unknown_entity: 'Сущность не найдена.',
  invalid_json: 'Некорректный JSON.', invalid_csv: 'Некорректный CSV.', invalid_header: 'Нужны столбцы text, intent, split и entities.', invalid_utf8: 'Файл должен быть в UTF-8.',
  invalid_columns: 'Неверное число столбцов.', invalid_entities: 'Некорректный список сущностей.', invalid_range: 'Разметка выходит за границы текста.', overlap: 'Разметки пересекаются.', token_boundary: 'Разметка должна совпадать с границами слов.',
  empty_file: 'Файл не содержит примеров.', file_too_large: 'Файл превышает 10 МиБ.', row_limit: 'Слишком много строк.', configuration_too_large: 'Получившийся черновик превышает 10 МиБ.',
  too_many_errors: 'Показаны не все ошибки. Исправьте их и проверьте файл снова.',
  invalid_current_configuration: 'Проверьте текущие данные и настройки сценария.', flow_not_imported: 'Сценарий из файла отличается; при объединении сохранится текущий сценарий.', settings_not_imported: 'Настройки порогов из файла отличаются; при объединении сохранятся текущие настройки.',
  invalid_slots: 'Некорректный список параметров.', invalid_slot: 'Проверьте тип и значение параметра.', duplicate_slot_id: 'Идентификатор параметра повторяется.', duplicate_slot_code: 'Код параметра повторяется.', slot_in_use: 'Сначала удалите ссылки на изменяемый параметр в сценарии.',
  unknown_set_slot: 'Параметр блока присваивания не найден.',
  unknown_ask_slot: 'Параметр блока сбора не найден.', unknown_ask_entity: 'Сущность блока сбора не найдена.',
}
const fields: Record<string, string> = { intents: 'намерения', entities: 'сущности', slots: 'параметры', examples: 'примеры', text: 'текст', intent_id: 'намерение', spans: 'разметка', code: 'код', flow: 'сценарий', file: 'файл', row: 'строка' }

export function ImportPanel({ orgId, agentId, revision, lease, enabled, onApplying, onImported, onUncertain }: {
  orgId: string; agentId: string; revision: number; lease: Grant | null; enabled: boolean;
  onApplying: (value: boolean) => void; onImported: (draft: Draft) => void; onUncertain: () => void;
}) {
  const key = `dialogentis:import:${orgId}:${agentId}`
  const [previewId, setPreviewId] = useState(() => sessionStorage.getItem(key))
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(Date.now())
  const [now, setNow] = useState(Date.now())
  const preview = useQuery({
    queryKey: ['import-preview', orgId, agentId, previewId], enabled: !!previewId, retry: false,
    queryFn: async ({ signal }) => { const result = await api.GET('/api/v1/organizations/{org_id}/agents/{agent_id}/imports/{preview_id}', { params: { path: { org_id: orgId, agent_id: agentId, preview_id: previewId! } }, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }); check(result.response, result.error); if (!result.data) throw new Error('Некорректный ответ сервера'); return result.data },
    refetchInterval: query => document.hidden || (query.state.error instanceof ApiError && [403, 404].includes(query.state.error.status)) || (query.state.data && terminal.has(query.state.data.status)) ? false : Date.now() - started < 30_000 ? 2000 : 5000,
    refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (!preview.data?.expires_at) return
    const delay = Date.parse(preview.data.expires_at) - Date.now()
    if (delay <= 0) { setNow(Date.now()); return }
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 50)
    return () => window.clearTimeout(timer)
  }, [preview.data?.expires_at])
  const active = !!previewId && (!preview.data || !terminal.has(preview.data.status))
  const clear = () => { sessionStorage.removeItem(key); setPreviewId(null); setError('') }
  const cancel = async () => {
    if (!previewId) return
    setBusy(true); setError('')
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/jobs/{job_id}/cancel', { params: { path: { org_id: orgId, job_id: previewId } }, signal: AbortSignal.timeout(10_000) }); check(result.response, result.error)
      await preview.refetch()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отменить проверку'); void preview.refetch() }
    finally { setBusy(false) }
  }
  const create = async () => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('Файл превышает 10 МиБ.'); return }
    setBusy(true); setError('')
    try {
      const body = new FormData(); body.set('file', file); body.set('mode', mode)
      const csrf = getCsrf()
      const response = await fetch(`/api/v1/organizations/${orgId}/agents/${agentId}/imports/preview`, { method: 'POST', body, headers: csrf ? { 'X-CSRF-Token': csrf } : {}, signal: AbortSignal.timeout(30_000) })
      const data = await response.json(); check(response, response.ok ? undefined : data)
      const created = data as components['schemas']['ImportCreated']
      if (!created.preview_id) throw new Error('Некорректный ответ сервера')
      sessionStorage.setItem(key, created.preview_id); setStarted(Date.now()); setPreviewId(created.preview_id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось проверить файл') }
    finally { setBusy(false) }
  }
  const apply = async () => {
    if (!previewId || !preview.data || !lease || !enabled) return
    if (preview.data.mode === 'replace' && !window.confirm(preview.data.format === 'json' ? 'Заменить конфигурацию и сценарий данными из файла?' : 'Заменить все примеры фраз данными из файла?')) return
    setBusy(true); setError(''); onApplying(true)
    try {
      const result = await api.POST('/api/v1/organizations/{org_id}/agents/{agent_id}/imports/{preview_id}/apply', { params: { path: { org_id: orgId, agent_id: agentId, preview_id: previewId }, header: { 'X-Edit-Lease': lease.lease_token, 'X-Edit-Fence': lease.fencing_counter, 'If-Match': `"rev-${revision}"` } }, signal: AbortSignal.timeout(30_000) }); check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      onImported(result.data); clear(); setFile(null); if (fileInput.current) fileInput.current.value = ''
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) onUncertain()
      setError(e instanceof Error ? e.message : 'Не удалось применить импорт')
    } finally { onApplying(false); setBusy(false) }
  }
  const expired = !!preview.data && Date.parse(preview.data.expires_at) <= now
  const stale = !!preview.data && preview.data.base_revision !== revision
  const issueText = (issue: components['schemas']['ImportIssue']) => {
    const path = issue.path.length ? issue.path.map(part => typeof part === 'number' ? String(part + 1) : fields[part] || part).join(' → ') : fields[issue.field] || ''
    return `${issue.row ? `Строка ${issue.row}` : ''}${issue.row && path ? ' · ' : ''}${path}${issue.row || path ? ': ' : ''}${messages[issue.code] || 'Проверьте данные и настройки файла.'}`
  }
  return <details className="import-panel">
    <summary className="button button-quiet"><Upload size={16}/>Импорт</summary>
    <div className="import-body">
      <h3>Импорт данных</h3>
      <p className="field-help">Сначала проверьте CSV или JSON. Черновик изменится только после применения.</p>
      <div className="import-controls">
        <label className="field-label">Файл<span className="import-file"><span className="import-file-button">Выбрать файл</span><span className="import-file-name">{file?.name || 'Файл не выбран'}</span><input ref={fileInput} aria-label="Файл импорта" type="file" accept=".csv,.json,text/csv,application/json" disabled={busy || active} onChange={event => setFile(event.target.files?.[0] || null)}/></span></label>
        <label className="field-label">Режим<select aria-label="Режим импорта" value={mode} disabled={busy || active} onChange={event => setMode(event.target.value as 'merge' | 'replace')}><option value="merge">Добавить к текущим данным</option><option value="replace">Заменить данные</option></select></label>
      </div>
      <button type="button" className="button button-primary" disabled={!enabled || !file || busy || active} onClick={() => void create()}>Проверить файл</button>
      {!enabled && <p className="field-help">Дождитесь сохранения изменений.</p>}
      {error && <p role="alert" className="auth-error">{error}</p>}
      {preview.isError && <div role="alert" className="auth-error">Не удалось получить результат проверки. <button type="button" className="button button-text" onClick={() => void preview.refetch()}>Повторить</button><button type="button" className="button button-text" onClick={clear}>Закрыть проверку</button></div>}
      {previewId && !preview.isError && <div className="import-report" role="status">
        {!preview.data || active ? <><p>{preview.data?.cancel_requested ? 'Отмена…' : 'Проверяем файл…'}</p><button type="button" className="button button-text" disabled={busy || preview.data?.cancel_requested} onClick={() => void cancel()}>Отменить проверку</button></> : <>
          <p>Версия {preview.data.base_revision} · {preview.data.format.toUpperCase()} · {preview.data.mode === 'merge' ? 'добавление' : 'замена'}</p>
          {preview.data.status === 'failed' && <p>{preview.data.error_code === 'import_stale' ? 'Черновик изменился. Проверьте файл заново.' : 'Не удалось проверить файл. Попробуйте ещё раз.'}</p>}
          {preview.data.status === 'cancelled' && <p>Проверка отменена.</p>}
          {preview.data.report && <>
            <p>Намерений: {preview.data.report.counts.intents || 0} · сущностей: {preview.data.report.counts.entities || 0} · примеров: {preview.data.report.counts.examples || 0}</p>
            {Object.entries(preview.data.report.new_codes).map(([kind, codes]) => !!codes.length && <p key={`new-${kind}`}>Новые {fields[kind] || kind}: {codes.join(', ')}</p>)}
            {Object.entries(preview.data.report.existing_codes).map(([kind, codes]) => !!codes.length && <p key={`existing-${kind}`}>Уже существуют {fields[kind] || kind}: {codes.join(', ')}</p>)}
            {preview.data.report.codes_truncated && <p className="field-help">Показаны первые 1000 кодов каждой группы.</p>}
            {preview.data.report.errors.map((issue, index) => <p className="error-text" key={`e-${index}`}>{issueText(issue)}</p>)}
            {preview.data.report.warnings.map((issue, index) => <p className="field-help" key={`w-${index}`}>{issueText(issue)}</p>)}
            {!preview.data.report.errors.length && <p>Ошибок не найдено.</p>}
          </>}
          {expired && <p>Срок проверки истёк. Проверьте файл снова.</p>}
          {stale && <p>Черновик изменился. Проверьте файл заново.</p>}
          {preview.data.can_apply && !expired && <button type="button" className="button button-primary" disabled={!lease || !enabled || busy || stale} onClick={() => void apply()}>Применить импорт</button>}
          {preview.data.can_apply && !lease && <p className="field-help">Начните редактирование, чтобы применить импорт.</p>}
          {preview.data.applied_revision && <p>Импорт применён · версия {preview.data.applied_revision}</p>}
        </>}
      </div>}
    </div>
  </details>
}

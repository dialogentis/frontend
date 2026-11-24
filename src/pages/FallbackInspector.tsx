import type { components } from '../api/schema'

type Config = components['schemas']['FlowNode']['config']

export function FallbackInspector({ config, editable, onConfig }: {
  config: Config
  editable: boolean
  onConfig: (config: Config) => void
}) {
  const instruction = typeof config.reply_instruction === 'string' ? config.reply_instruction : null
  return <>
    <label className="field-label">Ответ на неизвестный запрос
      <select value={instruction === null ? 'fixed' : 'generated'} disabled={!editable} onChange={event => {
        const updated = { ...config }
        if (event.target.value === 'generated') updated.reply_instruction = ''
        else delete updated.reply_instruction
        onConfig(updated)
      }}>
        <option value="fixed">Заданный текст</option>
        <option value="generated">Свободный ответ модели</option>
      </select>
    </label>
    {instruction !== null && <label className="field-label">Инструкция для модели
      <textarea name="fallback_instruction" rows={3} maxLength={1000} disabled={!editable} value={instruction}
        onChange={event => onConfig({ ...config, reply_instruction: event.target.value })}/>
    </label>}
  </>
}

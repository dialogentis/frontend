import type { components } from '../api/schema'

type Flow = components['schemas']['Flow']
type FlowNode = components['schemas']['FlowNode']
type Intent = components['schemas']['Intent']

export function SwitchInspector({ node, flow, intents, names, editable, onChange }: { node: FlowNode; flow: Flow; intents: Intent[]; names: Record<FlowNode['type'], string>; editable: boolean; onChange: (handle: string, target: string) => void }) {
  const targets = flow.nodes.filter(item => item.type !== 'start')
  const branches = [...intents.map(intent => ({ id: intent.id, label: intent.name, enabled: intent.enabled !== false })), { id: 'fallback', label: 'Не распознано', enabled: true }]
  return <div className="switch-inspector"><p className="field-help">Для каждого намерения выберите следующий блок или соедините выходы на схеме.</p>{branches.map(branch => {
    const selected = flow.edges.find(edge => edge.source === node.id && edge.source_handle === branch.id)?.target || ''
    const missing = selected && !targets.some(target => target.id === selected)
    return <label className="field-label" key={branch.id}>{branch.label}{!branch.enabled && ' · отключено'}<select aria-label={`Ветвь: ${branch.label}`} value={selected} disabled={!editable} onChange={event => onChange(branch.id, event.target.value)}><option value="">Не подключена</option>{missing && <option value={selected}>Блок не найден</option>}{targets.map((target, index) => <option value={target.id} key={target.id}>{names[target.type]} · {index + 1}</option>)}</select></label>
  })}</div>
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlow, Background, BackgroundVariant, Handle, Position, addEdge, useNodesState, useEdgesState } from '@xyflow/react'
import type { Connection, NodeProps, ReactFlowInstance } from '@xyflow/react'
import { ArrowRightLeft, ArrowUpRight, Braces, Check, CheckCheck, ChevronDown, CircleStop, Copy, CornerDownLeft, Crosshair, Globe, GripVertical, Info, ListTree, Maximize, MessageSquare, Minus, MousePointer2, Play, Plus, RotateCcw, Route, Send, Settings2, Square, Trash2, Undo2, Waypoints, X } from 'lucide-react'
import { mockReply, nodeNames, seedEdges, seedNodes } from '../model'
import type { FlowKind, FlowNode, Message, Trace } from '../model'
import { Button, Busy } from './ui'

const icons = { start: Play, intent: Route, ask: Braces, http: Globe, say: MessageSquare, handoff: ArrowRightLeft, end: CircleStop }

function DialogNode({ data, selected }: NodeProps<FlowNode>) {
  const Icon = icons[data.kind]
  const terminal = data.kind === 'start' || data.kind === 'end'
  return <div className={`dialog-node ${terminal ? 'terminal-node' : ''} ${selected ? 'dialog-node-selected' : ''} ${data.visited ? 'dialog-node-visited' : ''}`}>
    {data.kind !== 'start' && <><Handle type="target" position={Position.Top}/><Handle type="target" position={Position.Left} id="left"/></>}
    <div className="node-heading"><Icon size={16}/><strong>{data.label}</strong>{data.visited ? <Check size={14} className="node-visited-icon"/> : !terminal && <GripVertical size={14} className="node-grip"/>}</div>
    {!terminal && <><div className={`node-body ${data.kind === 'http' ? 'code' : ''}`}>{data.body}</div><div className="node-detail">{data.detail ?? nodeNames[data.kind]}</div></>}
    {data.kind !== 'end' && <><Handle type="source" position={Position.Bottom}/><Handle type="source" position={Position.Right} id="right"/><Handle type="source" position={Position.Left} id="left-out"/></>}
  </div>
}
const nodeTypes = { dialog: DialogNode }

function loadFlow(id: string): { nodes: FlowNode[]; edges: typeof seedEdges } {
  try { const value = localStorage.getItem(`dialogentis-flow-${id}`); if (value) return JSON.parse(value) } catch { /* Fall back to the labelled sample. */ }
  return { nodes: structuredClone(seedNodes), edges: structuredClone(seedEdges) }
}

export function FlowEditor({ agentId }: { agentId: string }) {
  const initial = useRef(loadFlow(agentId))
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.current.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.current.edges)
  const canvas = useRef<HTMLDivElement>(null)
  const [instance, setInstance] = useState<ReactFlowInstance<FlowNode> | null>(null)
  useEffect(() => {
    if (!instance || !canvas.current) return
    let cancelled = false
    let lastWidth = 0
    const center = () => {
      const width = canvas.current?.clientWidth ?? 0
      if (cancelled || !width || width === lastWidth) return
      lastWidth = width
      instance.setViewport({ x: Math.max(64, (width - 680 * .85) / 2), y: 16, zoom: .85 }, { duration: 0 })
    }
    const observer = new ResizeObserver(center)
    observer.observe(canvas.current)
    document.fonts.ready.then(() => requestAnimationFrame(center))
    return () => { cancelled = true; observer.disconnect() }
  }, [instance])
  const [panel, setPanel] = useState<'chat' | 'node'>('chat')
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showNodeList, setShowNodeList] = useState(false)
  const [saved, setSaved] = useState(true)
  const [validation, setValidation] = useState<string[] | null>(null)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [history, setHistory] = useState<{ nodes: FlowNode[]; edges: typeof seedEdges }[]>([])
  const currentNode = nodes.find(n => n.id === selected)
  const remember = () => setHistory(h => [...h.slice(-49), structuredClone({ nodes, edges })])

  useEffect(() => {
    setSaved(false)
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(`dialogentis-flow-${agentId}`, JSON.stringify({ nodes: nodes.map(n => ({ ...n, selected: false, data: { ...n.data, visited: false } })), edges })); setSaved(true) } catch { setSaved(false) }
    }, 650)
    return () => clearTimeout(timer)
  }, [agentId, nodes, edges])

  const onConnect = useCallback((connection: Connection) => {
    setEdges(es => addEdge({ ...connection, type: 'smoothstep' }, es))
  }, [setEdges])
  const addNode = (kind: FlowKind) => {
    remember()
    const id = crypto.randomUUID()
    setNodes(ns => [...ns, { id, type: 'dialog', position: { x: 620, y: ns.length * 30 }, data: { kind, label: nodeNames[kind], body: kind === 'say' ? 'Новый ответ' : 'Настройте блок', detail: nodeNames[kind] } }])
    setSelected(id); setPanel('node'); setAdding(false)
    window.setTimeout(() => instance?.fitView({ padding: .15, duration: 0 }), 50)
  }
  const updateNode = (key: 'label' | 'body', value: string) => setNodes(ns => ns.map(n => n.id === selected ? { ...n, data: { ...n.data, [key]: value } } : n))
  const deleteNode = () => {
    if (!selected) return
    remember(); setNodes(ns => ns.filter(n => n.id !== selected)); setEdges(es => es.filter(e => e.source !== selected && e.target !== selected)); setSelected(null); setPanel('chat')
  }
  const validate = () => {
    const errors: string[] = []
    if (nodes.filter(n => n.data.kind === 'start').length !== 1) errors.push('В сценарии должен быть один блок начала.')
    for (const n of nodes) if (n.data.kind !== 'start' && !edges.some(e => e.target === n.id)) errors.push(`«${n.data.label}» не связан со сценарием.`)
    for (const n of nodes) if (!['end', 'say', 'handoff'].includes(n.data.kind) && !edges.some(e => e.source === n.id)) errors.push(`У блока «${n.data.label}» нет исходящего перехода.`)
    setValidation(errors)
  }
  const showTrace = (next: Trace | null) => {
    setTrace(next)
    setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, visited: !!next?.steps.includes(n.id) } })))
  }
  return <div className="flow-workbench">
    <div className="flow-toolbar">
      <div className="flow-toolbar-left"><span className="flow-name"><Waypoints size={16}/>Основной сценарий<ChevronDown size={13}/></span><span className="toolbar-separator"/><span className="save-state" role="status">{saved ? <CheckCheck size={15}/> : <span className="save-pending"/>}{saved ? 'Сохранено в браузере' : 'Сохранение…'}</span></div>
      <div className="flow-toolbar-right"><Button className="icon-button" aria-label="Отменить последнее действие" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (previous) { setNodes(previous.nodes); setEdges(previous.edges); setHistory(h => h.slice(0, -1)) } }}><Undo2 size={16}/></Button><Button onClick={validate}><Check size={15}/><span>Проверить связи</span></Button><Button onClick={() => { setPanel('chat'); setSelected(null) }}><Play size={14}/><span>Тестировать</span></Button></div>
    </div>
    <div className="flow-layout">
      <div ref={canvas} className="flow-canvas" aria-label="Визуальный сценарий диалога">
        <div className="canvas-top-controls"><div className="add-block-control"><Button className="add-block-button" onClick={() => setAdding(!adding)} aria-expanded={adding}><Plus size={17}/>Добавить блок<ChevronDown size={13}/></Button>{adding && <div className="block-menu">{(['say', 'intent', 'ask', 'http', 'handoff', 'end'] as FlowKind[]).map(kind => { const Icon = icons[kind]; return <button type="button" key={kind} onClick={() => addNode(kind)}><Icon size={16}/>{nodeNames[kind]}</button> })}</div>}</div><Button className="icon-button" aria-label="Список блоков для клавиатурной навигации" onClick={() => setShowNodeList(!showNodeList)}><ListTree size={18}/></Button></div>
        <div className="flow-stage"><ReactFlow<FlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onInit={setInstance} onNodeDragStart={remember} onNodeClick={(_, node) => { setSelected(node.id); setPanel('node') }} onPaneClick={() => { setSelected(null); setAdding(false) }} minZoom={.35} maxZoom={1.5} defaultEdgeOptions={{ type: 'smoothstep' }} deleteKeyCode={null} colorMode="system" ariaLabelConfig={{ 'node.a11yDescription.default': 'Выберите блок для редактирования. Стрелки перемещают блок.' }}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-grid)"/>
        </ReactFlow></div>
        {showNodeList && <div className="node-list"><div className="node-list-header"><strong>Блоки сценария</strong><Button className="icon-button" aria-label="Закрыть список блоков" onClick={() => setShowNodeList(false)}><X size={15}/></Button></div><Button onClick={() => setAdding(!adding)}><Plus size={16}/>Добавить блок</Button>{adding && <div className="mobile-block-options">{(['say', 'intent', 'ask', 'http', 'handoff', 'end'] as FlowKind[]).map(kind => <Button key={kind} onClick={() => { addNode(kind); setShowNodeList(false) }}>{nodeNames[kind]}</Button>)}</div>}{nodes.map(n => <Button key={n.id} onClick={() => { setSelected(n.id); setPanel('node'); setShowNodeList(false) }}>{n.data.label}</Button>)}</div>}
        {validation !== null && <div className={`validation-result ${validation.length ? 'validation-error' : ''}`} role="status"><span>{validation.length ? validation.join(' ') : 'Все блоки связаны.'}</span><Button className="icon-button" aria-label="Закрыть результат проверки" onClick={() => setValidation(null)}><X size={14}/></Button></div>}
        <div className="canvas-bottom"><div className="canvas-controls"><Button className="icon-button" aria-label="Уменьшить масштаб" onClick={() => instance?.zoomOut({ duration: 0 })}><Minus size={17}/></Button><span>Масштаб</span><Button className="icon-button" aria-label="Увеличить масштаб" onClick={() => instance?.zoomIn({ duration: 0 })}><Plus size={17}/></Button><span className="toolbar-separator"/><Button className="icon-button" aria-label="Показать весь сценарий" onClick={() => instance?.fitView({ padding: .06, duration: 0 })}><Maximize size={16}/></Button></div><span className="canvas-hint"><MousePointer2 size={13}/>Потяните фон, чтобы переместить схему</span></div>
        <div className="flow-mobile-note"><Crosshair size={24}/><h2>Сценарий удобнее на компьютере</h2><p>На узком экране доступны тестовый чат и список блоков.</p><Button onClick={() => setShowNodeList(true)}>Показать блоки</Button></div>
      </div>
      <aside className="workbench-panel">
        <div className="panel-tabs" role="tablist" aria-label="Панель сценария"><button type="button" role="tab" aria-selected={panel === 'chat'} onClick={() => setPanel('chat')}><MessageSquare size={15}/>Тестовый чат</button><button type="button" role="tab" aria-selected={panel === 'node'} onClick={() => setPanel('node')}><Settings2 size={15}/>Свойства блока</button></div>
        {panel === 'chat' ? <ChatPanel trace={trace} onTrace={showTrace} nodes={nodes}/> : <div className="node-inspector">{currentNode ? <>
          <div className="inspector-heading"><span className="inspector-kind">{nodeNames[currentNode.data.kind]}</span><Button className="icon-button" aria-label="Закрыть свойства блока" onClick={() => setPanel('chat')}><X size={16}/></Button></div>
          <h2>{currentNode.data.label}</h2><p className="panel-description">Настройте параметры выбранного блока.</p>
          <label className="field-label">Название блока<input name="node_label" value={currentNode.data.label} maxLength={80} onFocus={remember} onChange={e => updateNode('label', e.target.value)}/></label>
          {currentNode.data.kind !== 'start' && currentNode.data.kind !== 'end' && <label className="field-label">{currentNode.data.kind === 'http' ? 'Путь запроса' : 'Текст блока'}<textarea name="node_body" rows={4} value={currentNode.data.body} maxLength={4000} onFocus={remember} onChange={e => updateNode('body', e.target.value)}/><span className="field-help">Параметры подставляются как {'{{order_id}}'}.</span></label>}
          {currentNode.data.kind === 'http' && <div className="inline-note"><Info size={16}/><p>Вызовы внешнего API пока недоступны.</p></div>}
          <div className="inspector-meta"><span>Идентификатор</span><code>{currentNode.id}</code></div>
          <div className="inspector-actions"><Button onClick={() => { remember(); const copy = { ...structuredClone(currentNode), id: crypto.randomUUID(), selected: false, position: { x: currentNode.position.x + 260, y: currentNode.position.y + 60 }, data: { ...currentNode.data, label: `${currentNode.data.label} (копия)`, visited: false } }; setNodes(ns => [...ns, copy]); setSelected(copy.id) }}><Copy size={15}/>Дублировать</Button><Button className="danger-button" onClick={deleteNode}><Trash2 size={15}/>Удалить блок</Button></div>
        </> : <div className="panel-empty"><MousePointer2 size={27}/><h2>Выберите блок</h2><p>Его текст и настройки появятся здесь.</p></div>}</div>}
      </aside>
    </div>
    <div className="workbench-footer"><span><Square size={12}/>{nodes.length} блоков<span className="footer-spacer"/>{edges.length} переходов</span><span>Черновик<span className="footer-spacer"/>Русский язык</span></div>
  </div>
}

function ChatPanel({ trace, onTrace, nodes }: { trace: Trace | null; onTrace: (t: Trace | null) => void; nodes: FlowNode[] }) {
  const [messages, setMessages] = useState<Message[]>([{ id: 'hello', role: 'assistant', text: 'Здравствуйте! Помогу с заказом, доставкой или возвратом.' }])
  const [text, setText] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(true)
  const bottom = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [messages])
  const send = (value: string) => {
    if (!value.trim() || busy) return
    const content = value.trim(); setText(''); setBusy(true)
    setMessages(m => [...m, { id: crypto.randomUUID(), role: 'user', text: content }])
    timer.current = window.setTimeout(() => {
      const result = mockReply(content, waiting)
      const editedGreeting = nodes.find(n => n.id === 'greeting')?.data.body
      const reply = result.trace.intent === 'greeting' && editedGreeting ? [editedGreeting] : result.messages
      setMessages(m => [...m, ...reply.map(t => ({ id: crypto.randomUUID(), role: 'assistant' as const, text: t }))])
      setWaiting(result.waiting); onTrace(result.trace); setBusy(false)
    }, 420)
  }
  const reset = () => { window.clearTimeout(timer.current); setBusy(false); setWaiting(false); onTrace(null); setMessages([{ id: crypto.randomUUID(), role: 'assistant', text: 'Здравствуйте! Помогу с заказом, доставкой или возвратом.' }]) }
  return <div className="chat-panel">
    <div className="chat-context"><div><span className="chat-version">Текущий сценарий</span><small>Тестирование текущего сценария</small></div><Button className="icon-button" onClick={reset} aria-label="Начать новый тестовый диалог"><RotateCcw size={16}/></Button></div>
    <div className="chat-messages" aria-live="polite">{messages.map(m => <div className={`chat-message message-${m.role}`} key={m.id}>{m.role === 'assistant' && <span className="bot-avatar"><Waypoints size={14}/></span>}<div><span className="message-author">{m.role === 'user' ? 'Вы' : 'Агент'}</span><p>{m.text}</p></div></div>)}{busy && <Busy text="Подготовка ответа…"/>}<div ref={bottom}/></div>
    {messages.length === 1 && <div className="chat-suggestions"><span>Попробуйте спросить</span>{['Где мой заказ?', 'Вопрос о доставке'].map(s => <button type="button" key={s} onClick={() => send(s)}>{s}<ArrowUpRight size={13}/></button>)}</div>}
    <form className="chat-composer" onSubmit={e => { e.preventDefault(); send(text) }}><label className="visually-hidden" htmlFor="test-message">Сообщение агенту</label><textarea id="test-message" name="test_message" rows={2} placeholder="Напишите сообщение…" value={text} maxLength={2000} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}/><div><span><CornerDownLeft size={12}/>Enter для отправки</span><Button type="submit" className="send-button" aria-label="Отправить сообщение" disabled={busy || !text.trim()}><Send size={16}/></Button></div></form>
    <div className="diagnostics"><button type="button" className="diagnostics-heading" onClick={() => setDiagnosticsOpen(!diagnosticsOpen)} aria-expanded={diagnosticsOpen}><ListTree size={15}/><strong>Диагностика</strong><ChevronDown size={14}/></button>{diagnosticsOpen && (trace ? <div className="diagnostic-content"><dl><div><dt>Намерение</dt><dd><code>{trace.intent}</code></dd></div><div><dt>Параметры</dt><dd><code>{trace.entity ?? 'Не обнаружены'}</code></dd></div><div><dt>Источник</dt><dd>Правило</dd></div></dl><div className="trace-steps">{trace.steps.map((step, i) => <span key={`${step}-${i}`}><Check size={12}/>{nodes.find(n => n.id === step)?.data.label ?? step}</span>)}</div></div> : <p className="diagnostics-empty">Отправьте сообщение, чтобы увидеть намерение, параметры и путь по сценарию.</p>)}</div>
    <div className="chat-panel-foot"><Info size={13}/><span>Исполнение сценария пока недоступно.</span></div>
  </div>
}

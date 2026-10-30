import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Archive, Boxes, Braces, Check, Code2, Copy, FileText, FlaskConical, Globe, Info, Layers, Plus, Route, Search, Settings2, Upload, X } from 'lucide-react'
import { useStore } from '../store'
import type { Agent, AgentStatus, Intent, PreviewState } from '../model'
import { Button, DataState, PageHeading, SearchBox, StatePicker, Status } from '../components/ui'
import { FlowEditor } from '../components/FlowEditor'

export function AgentsPage() {
  const { agents, setAgents, org } = useStore()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? 'active'
  const state = (params.get('state') ?? 'full') as PreviewState
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: true }) }
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const ownAgents = agents.filter(a => a.org === org)
  const filtered = ownAgents.filter(a => (status === 'all' || (status === 'active' ? a.status !== 'archived' : a.status === status)) && `${a.name} ${a.slug}`.toLowerCase().includes(q.toLowerCase()))
  const add = () => {
    if (!name.trim()) { setError('Укажите название агента.'); return }
    const agent: Agent = { id: crypto.randomUUID(), org, name: name.trim(), slug: `agent_${Date.now().toString(36)}`, description: description.trim() || 'Новый агент', status: 'draft', version: 0, edited: 'Сегодня' }
    setAgents([...agents, agent]); setCreating(false); setName(''); setDescription(''); setError(''); navigate(`/agents/${agent.id}/flow`)
  }
  return <div className="standard-page agents-page">
    <PageHeading title="Агенты" description="Создавайте диалоги, которые понимают ваших пользователей." action={<Button variant="primary" onClick={() => { setCreating(!creating); update('state', 'full') }}><Plus size={17}/>Создать агента</Button>}/>
    <div className="workspace-context"><span><Boxes size={15}/>{ownAgents.filter(a => a.status !== 'archived').length} агента в пространстве</span><Link to="/help">Как устроены агенты<ArrowUpRight size={14}/></Link></div>
    {creating && <form className="inline-create" onSubmit={e => { e.preventDefault(); add() }}><div className="inline-create-header"><h2>Новый агент</h2><Button className="icon-button" aria-label="Отменить создание" onClick={() => setCreating(false)}><X size={17}/></Button></div><div className="inline-create-fields"><label className="field-label">Название<input autoFocus name="agent_name" autoComplete="off" placeholder="Например, помощник покупателя" value={name} onChange={e => { setName(e.target.value); setError('') }} maxLength={120} aria-invalid={!!error} aria-describedby="agent-error"/></label><label className="field-label">Описание<input name="agent_description" autoComplete="off" placeholder="С какими вопросами поможет агент" value={description} onChange={e => setDescription(e.target.value)}/></label><Button variant="primary" type="submit">Создать агента</Button></div><p id="agent-error" className="field-help error-text">{error || 'Укажите название и описание агента.'}</p></form>}
    <div className="list-toolbar"><div className="filter-tabs" role="tablist" aria-label="Статус агентов">{[['active', 'Активные'], ['published', 'Опубликованные'], ['draft', 'Черновики'], ['archived', 'Архив']].map(([value, label]) => <button type="button" key={value} role="tab" aria-selected={status === value} onClick={() => update('status', value)}>{label}{value === 'active' && <span>{ownAgents.filter(a => a.status !== 'archived').length}</span>}</button>)}</div><SearchBox value={q} onChange={v => update('q', v)} placeholder="Найти агента…"/></div>
    <DataState state={state === 'full' && !filtered.length ? 'empty' : state} onRetry={() => update('state', 'full')} emptyTitle={q ? 'Агент не найден' : 'Здесь пока нет агентов'} emptyText={q ? 'Попробуйте другое название или уберите фильтры.' : 'Начните с намерений и соберите первый сценарий диалога.'} action={<Button onClick={() => q ? update('q', '') : setCreating(true)}>{q ? 'Сбросить поиск' : 'Создать первого агента'}</Button>}>
      <div className="agent-table" role="table" aria-label="Агенты"><div className="agent-table-head" role="row"><span role="columnheader">Название и назначение</span><span role="columnheader">Статус</span><span role="columnheader">Версия</span><span role="columnheader">Изменено</span><span aria-label="Действия"/></div>{filtered.map(agent => <div key={agent.id} className="agent-table-row" role="row"><Link to={`/agents/${agent.id}/flow`} className="agent-title-cell" role="cell"><span className="agent-letter">{agent.name[0]}</span><div><strong>{agent.name}</strong><p>{agent.description}</p><code>{agent.slug}</code></div></Link><div role="cell"><Status status={agent.status}/></div><div role="cell" className="version-cell">{agent.version ? <><Layers size={14}/>v{agent.version}</> : <span className="muted">Нет версии</span>}</div><div role="cell" className="muted">{agent.edited}</div><div className="row-actions" role="cell"><Link to={`/agents/${agent.id}/flow`} aria-label={`Открыть ${agent.name}`} className="icon-link"><ArrowUpRight size={18}/></Link><Button className="icon-button" aria-label={agent.status === 'archived' ? `Восстановить ${agent.name}` : `Архивировать ${agent.name}`} onClick={() => setAgents(agents.map(a => a.id === agent.id ? { ...a, status: a.status === 'archived' ? 'draft' : 'archived' } : a))}><Archive size={16}/></Button></div></div>)}</div>
    </DataState>
    <div className="list-bottom"><p>Управляйте агентами рабочего пространства.</p><StatePicker value={state} onChange={s => update('state', s)}/></div>
    <div className="getting-started-strip"><Route size={25}/><div><h2>От идеи до первого диалога</h2><p>Добавьте намерения, соедините блоки и проверьте агента в чате.</p></div><Link to="/help" className="button button-quiet">Открыть руководство<ArrowUpRight size={15}/></Link></div>
  </div>
}

const tabs = [
  ['flow', 'Сценарий', Route], ['intents', 'Намерения', WaypointIcon], ['entities', 'Сущности', Braces], ['examples', 'Примеры', FileText], ['training', 'Обучение', FlaskConical], ['versions', 'Версии', Layers], ['channels', 'Каналы', Globe], ['settings', 'Настройки', Settings2],
] as const
function WaypointIcon({ size = 16 }: { size?: number }) { return <Boxes size={size}/> }

export function AgentPage() {
  const { agentId } = useParams()
  const { agents, org, setAgents } = useStore()
  const agent = agents.find(a => a.id === agentId && a.org === org)
  const location = useLocation()
  const tab = location.pathname.split('/').at(-1) || 'flow'
  const versionDialog = useRef<HTMLDialogElement>(null)
  const [notice, setNotice] = useState('')
  if (!agent) return <div className="data-state"><Boxes size={28}/><h1>Агент недоступен</h1><p>В текущем рабочем пространстве его нет.</p><Link className="button button-quiet" to="/agents">Открыть список агентов</Link></div>
  return <div className={`agent-workspace ${tab === 'flow' ? 'agent-workspace-flow' : ''}`}>
    <div className="agent-header"><div className="agent-heading"><Link to="/agents" className="icon-link agent-back" aria-label="К списку агентов"><ArrowLeft size={18}/></Link><div><div className="agent-heading-line"><h1>{agent.name}</h1><Status status={agent.status} label={agent.status === 'published' ? `Опубликованная v${agent.version}` : undefined}/></div><p><code>{agent.slug}</code><span className="text-divider">/</span>{agent.description}</p></div></div><div className="agent-header-actions"><Button className="agent-copy-button" aria-label="Скопировать агента" onClick={() => { const copy = { ...agent, id: crypto.randomUUID(), name: `${agent.name} (копия)`, slug: `${agent.slug}_copy_${Date.now().toString(36)}`, version: 0, status: 'draft' as AgentStatus }; setAgents([...agents, copy]); setNotice('Копия добавлена в список агентов.') }}><Copy size={15}/></Button><Button variant="primary" onClick={() => versionDialog.current?.showModal()}><Plus size={16}/>Создать версию</Button></div></div>
    <nav className="agent-tabs" aria-label="Разделы агента">{tabs.map(([path, label, Icon]) => <NavLink key={path} to={`/agents/${agent.id}/${path}`} className={({ isActive }) => isActive ? 'agent-tab active' : 'agent-tab'}><Icon size={15}/>{label}</NavLink>)}</nav>
    {notice && <div className="inline-notification" role="status"><Info size={15}/><span>{notice}</span><Button className="icon-button" aria-label="Закрыть уведомление" onClick={() => setNotice('')}><X size={14}/></Button></div>}
    {tab === 'flow' ? <FlowEditor key={agent.id} agentId={agent.id}/> : tab === 'intents' ? <IntentsPage/> : tab === 'examples' ? <ExamplesPage/> : tab === 'entities' ? <EntitiesPage/> : tab === 'training' ? <TrainingPage/> : tab === 'versions' ? <VersionsPage agent={agent}/> : tab === 'channels' ? <ChannelsPage/> : <AgentSettings agent={agent}/>}
    <dialog ref={versionDialog} className="standard-dialog" onClick={e => { if (e.target === versionDialog.current) versionDialog.current.close() }}><div className="dialog-heading"><h2>Новая версия агента</h2><Button className="icon-button" aria-label="Закрыть диалог" onClick={() => versionDialog.current?.close()}><X size={18}/></Button></div><p>Создание версии пока недоступно: сервер не подключён.</p><div className="dialog-actions"><Button onClick={() => versionDialog.current?.close()}>Отмена</Button><Button variant="primary" disabled onClick={() => { setAgents(agents.map(a => a.id === agent.id ? { ...a, version: a.version + 1, edited: 'Сегодня' } : a)); versionDialog.current?.close(); setNotice('Версия добавлена в браузере. Публикация недоступна.') }}>Добавить версию</Button></div></dialog>
  </div>
}

function IntentsPage() {
  const { intents, setIntents } = useStore()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [editing, setEditing] = useState<Intent | null>(null)
  const [error, setError] = useState('')
  const state = (params.get('state') ?? 'full') as PreviewState
  const filtered = intents.filter(i => `${i.name} ${i.code}`.toLowerCase().includes(q.toLowerCase()))
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); setParams(next, { replace: true }) }
  const save = () => {
    if (!editing || !editing.name.trim() || !/^[a-z][a-z0-9_]{1,63}$/.test(editing.code)) { setError('Укажите название и код латиницей, например order_status.'); return }
    if (intents.some(i => i.id !== editing.id && i.code === editing.code)) { setError('Намерение с таким кодом уже существует.'); return }
    setIntents(intents.some(i => i.id === editing.id) ? intents.map(i => i.id === editing.id ? editing : i) : [...intents, editing]); setEditing(null); setError('')
  }
  return <div className="tab-page"><div className="section-heading"><div><h2>Что понимает агент</h2><p>Намерения объединяют разные формулировки одного запроса.</p></div><Button onClick={() => { setEditing({ id: crypto.randomUUID(), name: '', code: '', examples: [] }); setError('') }}><Plus size={16}/>Добавить намерение</Button></div>
    <div className="two-pane-content"><div><div className="list-toolbar"><SearchBox value={q} onChange={v => update('q', v)} placeholder="Найти намерение…"/><StatePicker value={state} onChange={v => update('state', v)}/></div><DataState state={state === 'full' && !filtered.length ? 'empty' : state} onRetry={() => update('state', 'full')} emptyTitle="Намерений пока нет" emptyText="Добавьте цель, которую агент будет распознавать в сообщениях."><div className="intent-table"><div className="intent-row intent-row-head"><span>Намерение</span><span>Примеры фраз</span><span/></div>{filtered.map(intent => <button type="button" className={`intent-row ${editing?.id === intent.id ? 'intent-row-selected' : ''}`} key={intent.id} onClick={() => { setEditing(structuredClone(intent)); setError('') }}><div><strong>{intent.name}</strong><code>{intent.code}</code></div><span className="intent-examples-count">{intent.examples.length} фраз</span><ArrowUpRight size={16}/></button>)}</div></DataState></div>
    <aside className="detail-pane">{editing ? <><div className="section-heading"><h3>Настройки намерения</h3><Button className="icon-button" aria-label="Закрыть редактирование намерения" onClick={() => setEditing(null)}><X size={16}/></Button></div><label className="field-label">Название<input name="intent_name" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/></label><label className="field-label">Код<input name="intent_code" value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })}/><span className="field-help">Латинские буквы, цифры и подчёркивания</span></label><label className="field-label">Примеры фраз<textarea name="intent_examples" rows={8} value={editing.examples.join('\n')} onChange={e => setEditing({ ...editing, examples: e.target.value.split('\n') })}/><span className="field-help">Один пример на строку</span></label>{error && <p className="error-text" role="alert">{error}</p>}<Button onClick={save}><Check size={15}/>Сохранить</Button></> : <><Route size={27}/><h3>Один смысл, разные формулировки</h3><p>«Где мой заказ?» и «Когда придёт покупка?» могут вести в одну ветку сценария.</p><p>Выберите намерение, чтобы отредактировать название и обучающие фразы.</p></>}</aside></div>
  </div>
}

function ExamplesPage() {
  const { intents } = useStore()
  const [params, setParams] = useSearchParams()
  const code = params.get('intent') ?? 'all'
  const [q, setQ] = useState('')
  const [importNotice, setImportNotice] = useState(false)
  const examples = intents.filter(i => code === 'all' || i.code === code).flatMap(i => i.examples.map(text => ({ text, intent: i }))).filter(e => e.text.toLowerCase().includes(q.toLowerCase()))
  return <div className="tab-page"><div className="section-heading"><div><h2>Примеры пользовательских фраз</h2><p>Фразы для настройки намерений агента.</p></div><Button onClick={() => setImportNotice(!importNotice)}><Upload size={16}/>Импортировать</Button></div>{importNotice && <div className="inline-note"><Info size={17}/><p>Импорт CSV/JSON появится при подключении API. Пока фразы редактируются во вкладке «Намерения».</p></div>}<div className="list-toolbar"><label className="select-filter"><select aria-label="Фильтр примеров по намерению" value={code} onChange={e => setParams({ intent: e.target.value }, { replace: true })}><option value="all">Все намерения</option>{intents.map(i => <option key={i.id} value={i.code}>{i.name}</option>)}</select></label><SearchBox value={q} onChange={setQ} placeholder="Найти фразу…"/></div><div className="examples-table"><div className="example-row example-row-head"><span>Фраза</span><span>Намерение</span><span>Набор</span></div>{examples.map((e, i) => <div className="example-row" key={`${e.intent.id}-${i}`}><span>{e.text}</span><code>{e.intent.code}</code><span className="muted">Обучающий</span></div>)}{!examples.length && <div className="data-state"><Search size={24}/><h3>Фразы не найдены</h3><p>Измените запрос или фильтр намерений.</p></div>}</div><div className="list-bottom"><p>{examples.length} фраз в наборе</p><span>Редактирование доступно в намерениях</span></div></div>
}

function EntitiesPage() {
  const [example, setExample] = useState('Где мой заказ 12345?')
  const match = example.match(/\b\d{3,10}\b/)
  return <div className="tab-page"><div className="section-heading"><div><h2>Параметры из сообщения</h2><p>Сущности помогают извлекать данные для следующего действия.</p></div><span className="demo-label">Сущности</span></div><div className="two-pane-content"><div className="entity-definitions"><div className="entity-definition"><Braces size={22}/><div><h3>Номер заказа</h3><code>order_id</code><p>Последовательность от 3 до 10 цифр</p></div><span className="status">Regex</span></div><div className="entity-definition"><Globe size={22}/><div><h3>Город доставки</h3><code>city</code><p>Екатеринбург, Москва, Санкт-Петербург</p></div><span className="status">Словарь</span></div></div><aside className="detail-pane"><h3>Проверка извлечения</h3><p>Проверьте извлечение номера заказа.</p><label className="field-label">Пример сообщения<textarea name="entity_example" rows={3} value={example} onChange={e => setExample(e.target.value)}/></label><div className="entity-result" aria-live="polite"><span>{match ? 'Найден параметр' : 'Параметр не найден'}</span><code>{match ? `order_id = ${match[0]}` : 'Добавьте номер заказа в сообщение'}</code></div></aside></div></div>
}

function TrainingPage() {
  const [step, setStep] = useState(-1)
  const stages = ['Проверка конфигурации', 'Подготовка примеров', 'Предпросмотр отчёта']
  useEffect(() => { if (step < 0 || step >= stages.length) return; const timer = window.setTimeout(() => setStep(s => s + 1), 900); return () => clearTimeout(timer) }, [step, stages.length])
  return <div className="tab-page"><div className="section-heading"><div><h2>Обучение и проверка качества</h2><p>Подготовьте агента и проверьте качество распознавания.</p></div><Button disabled title="Сервер не подключён" onClick={() => setStep(0)}><PlayIcon/>Запустить проверку</Button></div><div className="training-layout"><div><div className="training-intro"><FlaskConical size={31}/><h3>{step === stages.length ? 'Проверка завершена' : step < 0 ? 'Проверьте путь до новой версии' : 'Проверка данных'}</h3><p>Обучение сейчас недоступно: сервер не подключён.</p></div><ol className="training-stages">{stages.map((s, i) => <li key={s} className={step > i ? 'stage-done' : ''}><span>{step > i ? <Check size={16}/> : i + 1}</span><div><strong>{s}</strong><small>{step === i ? 'Выполняется…' : step > i ? 'Завершено' : 'Ожидает запуска'}</small></div></li>)}</ol></div><aside className="detail-pane"><h3>Качество распознавания</h3><p>Точность намерений, ошибки и матрица неточностей появятся после подключения NLP.</p><div className="metric-placeholder"><span>Intent F1</span><span>Не измерено</span></div><div className="metric-placeholder"><span>Entity F1</span><span>Не измерено</span></div><div className="inline-note"><Info size={16}/><p>Метрики появятся после обучения модели.</p></div></aside></div></div>
}
function PlayIcon() { return <FlaskConical size={16}/> }

function VersionsPage({ agent }: { agent: Agent }) {
  return <div className="tab-page"><div className="section-heading"><div><h2>История версий</h2><p>Готовая версия сохраняет конфигурацию и сценарий агента.</p></div></div>{agent.version ? <div className="versions-list">{Array.from({ length: agent.version }, (_, i) => agent.version - i).map((v, i) => <div className="version-row" key={v}><Layers size={20}/><div><h3>Версия {v}</h3><p>{i === 0 ? 'Текущая версия агента' : 'Предыдущая версия'}</p></div><span className="demo-label">Версия</span><code>v{v}</code></div>)}</div> : <div className="data-state"><Layers size={28}/><h3>Версий пока нет</h3><p>Используйте «Создать версию» в верхней панели.</p></div>}<div className="inline-note"><Info size={16}/><p>Публикация и откат сейчас недоступны.</p></div></div>
}

function ChannelsPage() {
  const [tab, setTab] = useState('widget')
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('https://shop.example.com')
  const snippet = '<script src="https://your-domain.example.com/widget.js"\n  data-channel="your-channel-id"></script>'
  return <div className="tab-page"><div className="section-heading"><div><h2>Где общается агент</h2><p>Подключите чат к сайту или используйте HTTP API.</p></div></div><div className="filter-tabs channel-tabs"><button type="button" aria-pressed={tab === 'widget'} onClick={() => setTab('widget')}><Globe size={15}/>Чат для сайта</button><button type="button" aria-pressed={tab === 'api'} onClick={() => setTab('api')}><Code2 size={15}/>Внешний API</button></div><div className="two-pane-content"><div className="channel-config">{tab === 'widget' ? <><h3>Встраиваемый виджет</h3><label className="field-label">Разрешённый сайт<input name="allowed_origin" type="url" value={origin} onChange={e => setOrigin(e.target.value)}/><span className="field-help">Укажите адрес сайта для размещения виджета.</span></label><div className="code-heading"><span>Пример кода вставки</span><Button onClick={async () => { try { await navigator.clipboard.writeText(snippet); setCopied(true) } catch { setCopied(false) } }}><Copy size={14}/>{copied ? 'Скопировано' : 'Скопировать'}</Button></div><pre className="code-block">{snippet}</pre><p className="field-help">Замените домен и идентификатор после подключения рабочего API.</p></> : <><h3>Ключи доступа</h3><p className="panel-description">Ключ ограничивается одним агентом и может быть отозван.</p><div className="key-example"><code>dg_demo_••••••••</code><span className="demo-label">Пример, не рабочий ключ</span></div><Button disabled title="Доступно после подключения бэкенда">Создать ключ</Button><p className="field-help">Настоящий ключ создаст сервер. Его нельзя хранить в коде виджета.</p></>}</div><aside className="detail-pane"><Globe size={26}/><h3>Один сценарий во всех каналах</h3><p>Виджет и API используют опубликованную версию. Тестовый чат работает отдельно с выбранным сценарием.</p><div className="inline-note"><Info size={16}/><p>Внешние каналы сейчас не подключены.</p></div></aside></div></div>
}

function AgentSettings({ agent }: { agent: Agent }) {
  const { agents, setAgents } = useStore()
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [saved, setSaved] = useState(false)
  return <div className="tab-page"><div className="section-heading"><div><h2>Общие настройки</h2><p>Название и назначение агента в этом пространстве.</p></div></div><form className="settings-form" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; setAgents(agents.map(a => a.id === agent.id ? { ...a, name: name.trim(), description } : a)); setSaved(true) }}><label className="field-label">Название агента<input name="agent_settings_name" value={name} onChange={e => { setName(e.target.value); setSaved(false) }} required maxLength={120}/></label><label className="field-label">Описание<textarea name="agent_settings_description" rows={4} value={description} onChange={e => { setDescription(e.target.value); setSaved(false) }}/></label><label className="field-label">Язык<select name="agent_language" defaultValue="ru"><option value="ru">Русский</option></select></label><Button type="submit"><Check size={16}/>Сохранить</Button>{saved && <p className="field-help" role="status">Изменения сохранены в браузере.</p>}</form></div>
}

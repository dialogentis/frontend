import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, AudioLines, BookOpen, Boxes, Command, FlaskConical, HelpCircle, LayoutDashboard, Menu, MessageSquare, Moon, Network, PanelLeftClose, PanelLeftOpen, Search, Settings2, ShieldCheck, Sun, Users, Waypoints, X } from 'lucide-react'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { useStore } from './store'
import { Button } from './components/ui'
import { AgentsPage, AgentPage } from './pages/Agents'
import { AnalyticsPage, DialogsPage, IntegrationsPage, MembersPage, OverviewPage, SettingsPage } from './pages/Workspace'

const navigation = [
  { to: '/overview', label: 'Обзор', icon: LayoutDashboard },
  { to: '/agents', label: 'Агенты', icon: Boxes },
  { to: '/dialogs', label: 'Диалоги', icon: MessageSquare },
  { to: '/analytics', label: 'Аналитика', icon: AudioLines },
  { to: '/integrations', label: 'Интеграции', icon: Network },
  { to: '/members', label: 'Участники', icon: Users },
  { to: '/audit', label: 'Аудит', icon: ShieldCheck },
  { to: '/settings', label: 'Настройки', icon: Settings2 },
]

export function App() {
  const { agents, org, setOrg, organizationName } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenu, setMobileMenu] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem('dialogentis-sidebar-collapsed') === 'true' } catch { return false } })
  const toggleSidebar = () => setSidebarCollapsed(current => { const next = !current; try { localStorage.setItem('dialogentis-sidebar-collapsed', String(next)) } catch { /* Preference stays in this tab. */ } return next })
  const [dark, setDark] = useState(() => document.documentElement.dataset.mode === 'dark')
  const searchDialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const selectedAgent = agents.find(a => location.pathname.startsWith(`/agents/${a.id}/`))
  const active = navigation.find(n => location.pathname.startsWith(n.to))
  const openSearch = () => { setQuery(''); searchDialog.current?.showModal() }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); openSearch() } }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])
  useEffect(() => { document.title = `${selectedAgent?.name ?? active?.label ?? 'Агенты'} | Dialogentis` }, [selectedAgent?.name, active?.label])
  const toggleTheme = () => {
    const next = !dark; setDark(next)
    document.documentElement.dataset.mode = next ? 'dark' : 'light'
    try { localStorage.setItem('dialogentis-mode', next ? 'dark' : 'light') } catch { /* Preference stays in this tab. */ }
  }
  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <Button className="sidebar-edge-toggle" aria-label={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'} title={sidebarCollapsed ? 'Развернуть панель' : 'Свернуть панель'} aria-expanded={!sidebarCollapsed} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}</Button>
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <Link to="/agents" className="wordmark" aria-label="Dialogentis, список агентов"><img className="brand-mark" src="/icon.svg" alt=""/>dialogentis<span className="brand-punctuation">/</span></Link>
      <WorkspaceSwitcher value={org} onChange={id => { setOrg(id); navigate('/agents'); setMobileMenu(false) }}/>

      <nav className="primary-nav" aria-label="Основная навигация">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMobileMenu(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Icon size={18} aria-hidden="true"/><span>{label}</span>{to === '/agents' && <small>{agents.filter(a => a.org === org && a.status !== 'archived').length}</small>}</NavLink>)}</nav>
      <div className="sidebar-bottom">
        <Link to="/help" className="nav-link"><HelpCircle size={18}/>Руководство<ArrowUpRight size={14}/></Link>

        <Link className="user-profile" to="/settings"><span className="user-avatar">Вы</span><span><strong>Владелец пространства</strong><small>{organizationName}</small></span><Settings2 size={15}/></Link>
      </div>
    </aside>
    {mobileMenu && <button type="button" className="nav-backdrop" aria-label="Закрыть навигацию" onClick={() => setMobileMenu(false)}/>}
    <div className="workspace-shell">
      <header className="topbar">
        <Button className="icon-button mobile-menu-button" aria-label="Открыть навигацию" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={19}/></Button>

        <div className="breadcrumbs"><Waypoints size={17}/><span className="breadcrumb-workspace">Рабочее пространство</span><span className="breadcrumb-divider">/</span><Link to={selectedAgent ? '/agents' : location.pathname}>{active?.label ?? 'Агенты'}</Link>{selectedAgent && <><span className="breadcrumb-divider">/</span><span className="breadcrumb-agent">{selectedAgent.name}</span></>}</div>
        <div className="topbar-actions"><Button className="global-search" onClick={openSearch} aria-label="Поиск по пространству"><Search size={17}/><span>Поиск</span><kbd>⌘ K</kbd></Button><Button className="icon-button" aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} onClick={toggleTheme}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</Button><span className="topbar-avatar" aria-label="Владелец пространства">Вы</span></div>
      </header>
      <main id="main"><Routes>
        <Route path="/" element={<Navigate to="/agents/support/flow" replace/>}/>
        <Route path="/agents" element={<AgentsPage/>}/>
        <Route path="/agents/:agentId/*" element={<AgentPage/>}/>
        <Route path="/overview" element={<OverviewPage/>}/>
        <Route path="/dialogs" element={<DialogsPage/>}/>
        <Route path="/analytics" element={<AnalyticsPage/>}/>
        <Route path="/integrations" element={<IntegrationsPage/>}/>
        <Route path="/members" element={<MembersPage/>}/>
        <Route path="/settings" element={<SettingsPage/>}/>
        <Route path="/audit" element={<div className="standard-page"><div className="page-heading"><div><h1>Аудит</h1><p>История действий в рабочем пространстве.</p></div></div><div className="event-row"><ShieldCheck size={20}/><div><strong>Открыто рабочее пространство</strong><p>Владелец пространства</p></div><span className="muted">Текущий сеанс</span></div></div>}/>
        <Route path="/help" element={<div className="standard-page"><div className="page-heading"><div><h1>Руководство по платформе</h1><p>Начните с агента «Поддержка магазина».</p></div></div><div className="help-sections"><section><BookOpen size={22}/><h2>Соберите диалог</h2><p>Перетаскивайте блоки, соединяйте выходы и меняйте текст в панели свойств.</p></section><section><MessageSquare size={22}/><h2>Проверьте сценарий</h2><p>В тестовом чате спросите «Где мой заказ?», затем отправьте 12345. Подсветка покажет путь по сценарию.</p></section><section><FlaskConical size={22}/><h2>Работайте с интерфейсом</h2><p>Используйте поиск и фильтры для работы с данными.</p></section></div><Link to="/agents/support/flow" className="button button-primary">Открыть редактор</Link></div>}/>
        <Route path="*" element={<div className="data-state"><h1>Страница не найдена</h1><Link className="button button-quiet" to="/agents"><ArrowLeft size={16}/>К агентам</Link></div>}/>
      </Routes></main>
    </div>
    <dialog ref={searchDialog} className="search-dialog" onClick={e => { if (e.target === searchDialog.current) searchDialog.current.close() }}>
      <div className="dialog-heading"><Command size={18}/><h2>Быстрый переход</h2><Button className="icon-button" aria-label="Закрыть поиск" onClick={() => searchDialog.current?.close()}><X size={18}/></Button></div>
      <label className="command-input"><Search size={18}/><input name="command_query" aria-label="Найти агента или раздел" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти агента или раздел…"/></label>
      <div className="command-results">{agents.filter(a => a.org === org && a.name.toLowerCase().includes(query.toLowerCase())).map(a => <Button key={a.id} onClick={() => { searchDialog.current?.close(); navigate(`/agents/${a.id}/flow`) }}><Boxes size={17}/>{a.name}<span className="muted">Агент</span></Button>)}{navigation.filter(n => n.label.toLowerCase().includes(query.toLowerCase())).map(({ to, label, icon: Icon }) => <Button key={to} onClick={() => { searchDialog.current?.close(); navigate(to) }}><Icon size={17}/>{label}<span className="muted">Раздел</span></Button>)}</div>
    </dialog>
  </div>
}

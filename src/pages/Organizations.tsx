import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AudioLines, Boxes, ChevronRight, LayoutDashboard, LogOut, MessageSquare, Moon, Network, PanelLeftClose, PanelLeftOpen, Plus, Settings2, ShieldCheck, Sun, UserRound, Users } from 'lucide-react'
import { api, check } from '../api'
import { useSession } from '../Session'
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher'
import { AuthFrame } from './Auth'
import { MembersPage } from './Members'
import { WorkspaceAgents } from './WorkspaceAgents'
const WorkspaceDraft = lazy(() => import('./WorkspaceDraft').then(module => ({ default: module.WorkspaceDraft })))
const OrganizationSettings = lazy(() => import('./OrganizationSettings').then(module => ({ default: module.OrganizationSettings })))
const ConversationHistory = lazy(() => import('./ConversationHistory').then(module => ({ default: module.ConversationHistory })))
const OrganizationAnalytics = lazy(() => import('./OrganizationAnalytics').then(module => ({ default: module.OrganizationAnalytics })))
const OrganizationAudit = lazy(() => import('./OrganizationAudit').then(module => ({ default: module.OrganizationAudit })))
const OrganizationOverview = lazy(() => import('./OrganizationOverview').then(module => ({ default: module.OrganizationOverview })))
const Integrations = lazy(() => import('./Integrations').then(module => ({ default: module.Integrations })))

const schema = z.object({ name: z.string().trim().min(1, 'Укажите название').max(120), slug: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/, 'От 2 до 64 латинских букв, цифр и дефисов') })
type OrganizationInput = z.infer<typeof schema>

export function useOrganizations() {
  const { session } = useSession()
  return useQuery({ queryKey: ['organizations', session?.user.id], enabled: !!session?.user.email_verified, queryFn: async () => {
    const { data, error, response } = await api.GET('/api/v1/organizations'); check(response, error)
    if (!data) throw new Error('Некорректный ответ сервера')
    return data.items
  } })
}

export function RequireSession({ children }: { children: React.ReactNode }) {
  const { session } = useSession(); const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search + location.hash }}/>
  if (!session.user.email_verified) return <Navigate to="/verify-email" replace state={{ email: session.user.email }}/>
  return children
}

export function OrganizationsPage() {
  const orgs = useOrganizations(); const cache = useQueryClient(); const { session, logout } = useSession(); const navigate = useNavigate()
  const [creating, setCreating] = useState(false); const [error, setError] = useState('')
  const form = useForm<OrganizationInput>({ resolver: zodResolver(schema) })
  const submit = form.handleSubmit(async body => { setError(''); try {
    const result = await api.POST('/api/v1/organizations', { body }); check(result.response, result.error)
    if (!result.data) throw new Error('Некорректный ответ сервера')
    await cache.invalidateQueries({ queryKey: ['organizations'] }); navigate(`/app/o/${result.data.id}`)
  } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать пространство') } })
  return <main className="organization-page"><header className="organization-top"><Link className="auth-brand" to="/app/organizations"><img src="/icon.svg" alt=""/>dialogentis<span>/</span></Link><div><span className="muted">{session?.user.email}</span><button className="button button-text" onClick={() => logout().then(() => navigate('/login')).catch(e => setError(e.message))}><LogOut size={16}/>Выйти</button></div></header><section className="organization-content"><div className="section-heading"><div><h1>Рабочие пространства</h1><p>Выберите пространство или создайте новое.</p></div><button className="button button-primary" onClick={() => setCreating(!creating)}><Plus size={16}/>Создать пространство</button></div>
    {creating && <form className="inline-create" onSubmit={submit}><div className="inline-create-fields"><label className="field-label">Название<input {...form.register('name')} placeholder="Например, команда поддержки"/><span className="field-help error-text">{form.formState.errors.name?.message}</span></label><label className="field-label">Адрес пространства<input {...form.register('slug')} placeholder="support-team"/><span className="field-help">{form.formState.errors.slug?.message || 'Латинские буквы, цифры и дефис'}</span></label><button className="button button-primary" disabled={form.formState.isSubmitting}>Создать</button></div></form>}
    {error && <p role="alert" className="auth-error">{error}</p>}{orgs.isLoading ? <p role="status">Загрузка пространств…</p> : orgs.isError ? <div className="data-state"><h2>Не удалось загрузить пространства</h2><button className="button button-quiet" onClick={() => orgs.refetch()}>Повторить</button></div> : orgs.data?.length ? <div className="organization-list">{orgs.data.map(org => <Link className="organization-row" key={org.id} to={`/app/o/${org.id}`}><span className="agent-letter">{org.name[0]}</span><div><strong>{org.name}</strong><p>{org.slug}</p></div><span className="muted">{org.role === 'owner' ? 'Владелец' : org.role === 'admin' ? 'Администратор' : org.role === 'editor' ? 'Редактор' : 'Наблюдатель'}</span></Link>)}</div> : <div className="data-state"><Boxes size={28}/><h2>Здесь пока нет пространств</h2><p>Создайте пространство для работы с агентами или примите приглашение.</p><button className="button button-quiet" onClick={() => setCreating(true)}>Создать пространство</button></div>}</section></main>
}

export function WorkspacePage() {
  const { orgId, agentId } = useParams(); const { session, logout } = useSession(); const orgs = useOrganizations(); const navigate = useNavigate(); const location = useLocation(); const cache = useQueryClient(); const [error, setError] = useState(''); const [editorDirty, setEditorDirty] = useState(false); const [dark, setDark] = useState(() => document.documentElement.dataset.mode === 'dark')
  const previousOrg = useRef(orgId)
  const profile = useRef<HTMLDialogElement>(null)
  const focusSidebarToggle = useRef(false)
  useEffect(() => {
    const previous = previousOrg.current
    previousOrg.current = orgId
    if (previous && previous !== orgId) {
      const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey.includes(previous)
      void cache.cancelQueries({ predicate })
      cache.removeQueries({ predicate })
    }
  }, [cache, orgId])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('dialogentis-sidebar-collapsed') === 'true' } catch { return false }
  })
  const toggleSidebar = () => {
    const next = !sidebarCollapsed
    focusSidebarToggle.current = true
    setSidebarCollapsed(next)
    try { localStorage.setItem('dialogentis-sidebar-collapsed', String(next)) } catch { /* Preference stays in this tab. */ }
  }
  const sidebarLabel = sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'
  const sidebarToggle = <button type="button" className="button icon-button desktop-sidebar-toggle"
    aria-label={sidebarLabel} title={sidebarLabel} aria-controls="workspace-sidebar" aria-expanded={!sidebarCollapsed}
    ref={button => {
      if (!button || !focusSidebarToggle.current) return
      focusSidebarToggle.current = false
      button.focus()
    }}
    onClick={toggleSidebar}>
    {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true"/> : <PanelLeftClose size={18} aria-hidden="true"/>}
  </button>
  if (orgs.isLoading) return <div className="auth-state" role="status">Загрузка пространства…</div>
  if (orgs.isError) return <div className="auth-state"><h1>Не удалось загрузить пространство</h1><button className="button button-quiet" onClick={() => orgs.refetch()}>Повторить</button></div>
  const current = orgs.data?.find(o => o.id === orgId)
  if (!current || !session) return <div className="data-state"><h1>Пространство недоступно</h1><Link className="button button-quiet" to="/app/organizations">К пространствам</Link></div>
  const options = orgs.data!.map(o => ({ id: o.id, name: o.name, initials: o.name.slice(0, 2).toLocaleUpperCase('ru') }))
  const role = { owner: 'Владелец', admin: 'Администратор', editor: 'Редактор', viewer: 'Наблюдатель' }[current.role]
  const membersPage = location.pathname.endsWith('/members')
  const settingsPage = location.pathname.endsWith('/settings')
  const integrationsPage = location.pathname.endsWith('/integrations')
  const historyPage = location.pathname.endsWith('/conversations')
  const analyticsPage = location.pathname.endsWith('/analytics')
  const auditPage = location.pathname.endsWith('/audit')
  const overviewPage = location.pathname.endsWith('/overview')
  const canAudit = current.role === 'owner' || current.role === 'admin'
  const root = `/app/o/${current.id}`
  const switcher = { value: current.id, organizations: options, onChange: (id: string) => navigate(`/app/o/${id}`) }
  const openProfile = () => profile.current?.showModal()
  const links = [
    { suffix: '/overview', label: 'Обзор', icon: LayoutDashboard, active: overviewPage },
    { suffix: '', label: 'Агенты', icon: Boxes, active: !membersPage && !settingsPage && !integrationsPage &&
      !historyPage && !analyticsPage && !auditPage && !overviewPage },
    { suffix: '/conversations', label: 'Диалоги', icon: MessageSquare, active: historyPage },
    { suffix: '/analytics', label: 'Аналитика', icon: AudioLines, active: analyticsPage },
    { suffix: '/integrations', label: 'Интеграции', icon: Network, active: integrationsPage },
    { suffix: '/members', label: 'Участники', icon: Users, active: membersPage },
    ...(canAudit ? [{ suffix: '/audit', label: 'Аудит', icon: ShieldCheck, active: auditPage }] : []),
    { suffix: '/settings', label: 'Настройки', icon: Settings2, active: settingsPage },
  ]
  return <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}><aside id="workspace-sidebar" className="sidebar workspace-real-sidebar">
    <div className="sidebar-heading">
      <Link to="/app/organizations" className="wordmark"><img className="brand-mark" src="/icon.svg" alt=""/>dialogentis<span className="brand-punctuation">/</span></Link>
      {!sidebarCollapsed && sidebarToggle}
    </div>
    <WorkspaceSwitcher {...switcher}/>
    <nav className="primary-nav" aria-label="Основная навигация">
      {links.map(({ suffix, label, icon: Icon, active }) => <Link key={suffix} to={root + suffix}
        className={`nav-link ${active ? 'nav-link-active' : ''}`} aria-current={active ? 'page' : undefined}>
        <Icon size={18} aria-hidden="true"/>{label}
      </Link>)}
    </nav>
    <div className="sidebar-bottom">
      <button type="button" className="user-profile" aria-label="Открыть профиль" aria-haspopup="dialog" title="Профиль" onClick={openProfile}>
        <span className="user-avatar" aria-hidden="true">Вы</span>
        <span><strong>{session.user.email}</strong><small>{role}</small></span>
        <ChevronRight size={15} aria-hidden="true"/>
      </button>
    </div>
  </aside><div className="workspace-shell"><header className="topbar"><div className="breadcrumbs">
    {sidebarCollapsed && sidebarToggle}
    <Link to="/app/organizations">Пространства</Link><span className="breadcrumb-divider">/</span>
    <WorkspaceSwitcher {...switcher} compact/>
    <Link className="workspace-overview-link" to={`${root}/overview`} title="Обзор пространства" aria-label={`Обзор пространства: ${current.name}`}><span>{current.name}</span><LayoutDashboard size={17} aria-hidden="true"/></Link>
    </div><div className="topbar-actions">
    <Link className="button button-text workspace-mobile-members" to={membersPage ? root : `${root}/members`}>{membersPage ? 'Агенты' : 'Участники'}</Link>
    <Link className="button icon-button workspace-mobile-members" aria-label="Настройки пространства" to={`${root}/settings`}><Settings2 size={18}/></Link>
    <Link className="button icon-button workspace-mobile-members" aria-label="Диалоги" to={`${root}/conversations`}><MessageSquare size={18}/></Link>
    <Link className="button icon-button workspace-mobile-members" aria-label="Аналитика" to={`${root}/analytics`}><AudioLines size={18}/></Link>
    {canAudit && <Link className="button icon-button workspace-mobile-members" aria-label="Аудит" to={`${root}/audit`}><ShieldCheck size={18}/></Link>}
    <Link className="button icon-button workspace-mobile-members" aria-label="Интеграции" to={`${root}/integrations`}><Network size={18}/></Link>
    <button type="button" className="button icon-button topbar-profile" aria-label="Открыть профиль" aria-haspopup="dialog" title="Профиль" onClick={openProfile}><UserRound size={18} aria-hidden="true"/></button>
    <button className="button icon-button" aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} onClick={() => { const next = !dark; setDark(next); document.documentElement.dataset.mode = next ? 'dark' : 'light'; try { localStorage.setItem('dialogentis-mode', next ? 'dark' : 'light') } catch { /* preference is optional */ } }}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button>
    <button className="button button-text" onClick={() => { if (!editorDirty || window.confirm('Есть несохранённые изменения. Выйти из аккаунта?')) void logout().then(() => navigate('/login')).catch(e => setError(e.message)) }}><LogOut size={16}/>Выйти</button></div></header>
    <dialog ref={profile} className="standard-dialog account-profile-dialog" aria-labelledby="account-profile-title">
      <h2 id="account-profile-title">Профиль</h2>
      <dl className="account-details">
        <div><dt>Электронная почта</dt><dd>{session.user.email}<span className="field-help">Подтверждена</span></dd></div>
        <div><dt>Пространство</dt><dd>{current.name}</dd></div>
        <div><dt>Роль</dt><dd>{role}</dd></div>
      </dl>
      <div className="dialog-actions">
        <Link className="button button-quiet" to="/forgot-password" state={{ email: session.user.email }}>Восстановить пароль</Link>
        <button type="button" className="button button-primary" autoFocus onClick={() => profile.current?.close()}>Закрыть</button>
      </div>
    </dialog>
    <main className="standard-page">
    {error && <p role="alert" className="auth-error">{error}</p>}
    {overviewPage ? <Suspense fallback={<p role="status">Загрузка обзора…</p>}>
      <OrganizationOverview key={current.id} orgId={current.id} canAudit={canAudit}/>
    </Suspense> : auditPage ? (canAudit ? <Suspense fallback={<p role="status">Загрузка журнала…</p>}>
      <OrganizationAudit key={current.id} orgId={current.id}/>
    </Suspense> : <p role="alert">Журнал доступен владельцу и администраторам пространства.</p>) :
      analyticsPage ? <Suspense fallback={<p role="status">Загрузка аналитики…</p>}><OrganizationAnalytics key={current.id} orgId={current.id}/></Suspense> : historyPage ? <Suspense fallback={<p role="status">Загрузка истории…</p>}><ConversationHistory key={current.id} orgId={current.id}/></Suspense> : integrationsPage ? <Suspense fallback={<p role="status">Загрузка интеграций…</p>}><Integrations key={current.id} orgId={current.id} role={current.role}/></Suspense> : settingsPage ? <Suspense fallback={<p role="status">Загрузка настроек…</p>}><OrganizationSettings key={current.id} orgId={current.id}/></Suspense> : membersPage ? <MembersPage key={current.id} orgId={current.id} name={current.name} role={current.role} userId={session.user.id}/> : agentId ? <Suspense fallback={<p role="status">Загрузка редактора…</p>}><WorkspaceDraft key={agentId} orgId={current.id} agentId={agentId} userId={session.user.id} role={current.role} onDirtyChange={setEditorDirty}/></Suspense> : <WorkspaceAgents key={current.id} orgId={current.id} role={current.role}/>}
  </main></div></div>
}

export function InvitationPage() {
  const location = useLocation(); const navigate = useNavigate(); const cache = useQueryClient(); const { session, refresh } = useSession()
  const [token, setToken] = useState<string | null>(() => new URLSearchParams(location.hash.slice(1)).get('token') || location.state?.inviteToken || null)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { if (location.hash) { setToken(new URLSearchParams(location.hash.slice(1)).get('token')); window.history.replaceState(window.history.state, '', location.pathname + location.search) } }, [location.hash, location.pathname, location.search])
  const accept = async () => { if (!token) return; setBusy(true); setError(''); try {
    const result = await api.POST('/api/v1/invitations/accept', { body: { token } }); check(result.response, result.error)
    const data = result.data
    if (!data?.organization_id) throw new Error('Некорректный ответ сервера')
    setToken(null); await refresh(); await cache.invalidateQueries({ queryKey: ['organizations'] }); navigate(`/app/o/${data.organization_id}`, { replace: true })
  } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось принять приглашение') } finally { setBusy(false) } }
  return <AuthFrame><h1>Приглашение в пространство</h1><p className="auth-intro">Войдите с почтой, на которую пришло приглашение.</p>{error && <p role="alert" className="auth-error">{error}</p>}{!token ? <p className="auth-error">Ссылка отсутствует. Откройте приглашение из письма.</p> : !session ? <div className="auth-actions"><Link className="button button-primary" to="/login" state={{ inviteToken: token }}>Войти</Link><Link className="button button-quiet" to="/register" state={{ inviteToken: token }}>Создать аккаунт</Link></div> : !session.user.email_verified ? <Link className="button button-primary" to="/verify-email" state={{ email: session.user.email, inviteToken: token }}>Подтвердить почту</Link> : <><p className="auth-intro">Вы вошли как {session.user.email}</p><button className="button button-primary" disabled={busy} onClick={accept}>Принять приглашение</button></>}</AuthFrame>
}

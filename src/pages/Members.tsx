import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, check } from '../api'
import type { components } from '../api/schema'

type Role = components['schemas']['MemberRoleView']['role']
type OrgRole = components['schemas']['OrganizationView']['role']
const labels = { owner: 'Владелец', admin: 'Администратор', editor: 'Редактор', viewer: 'Наблюдатель' }

export function MembersPage({ orgId, role, userId }: { orgId: string; role: OrgRole; userId: string }) {
  const cache = useQueryClient()
  const navigate = useNavigate()
  const canManage = role === 'owner' || role === 'admin'
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState('')
  const [password, setPassword] = useState('')
  const members = useQuery({ queryKey: ['members', orgId], enabled: canManage, queryFn: async () => {
    const r = await api.GET('/api/v1/organizations/{org_id}/members', { params: { path: { org_id: orgId } } }); check(r.response, r.error)
    if (!r.data) throw new Error('Некорректный ответ сервера')
    return r.data.items
  } })
  const invitations = useQuery({ queryKey: ['invitations', orgId], enabled: canManage, queryFn: async () => {
    const r = await api.GET('/api/v1/organizations/{org_id}/invitations', { params: { path: { org_id: orgId } } }); check(r.response, r.error)
    if (!r.data) throw new Error('Некорректный ответ сервера')
    return r.data.items
  } })
  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true); setError(''); setNotice('')
    try {
      await action()
      await Promise.all([cache.invalidateQueries({ queryKey: ['members', orgId] }), cache.invalidateQueries({ queryKey: ['invitations', orgId] }), cache.invalidateQueries({ queryKey: ['organizations'] })])
      setNotice(message)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос') }
    finally { setBusy(false) }
  }
  const leave = () => {
    if (!window.confirm('Покинуть рабочее пространство?')) return
    void run(async () => {
      const r = await api.POST('/api/v1/organizations/{org_id}/leave', { params: { path: { org_id: orgId } } }); check(r.response, r.error)
      cache.removeQueries({ predicate: q => q.queryKey[0] !== 'session' && q.queryKey[0] !== 'organizations' })
      navigate('/app/organizations', { replace: true })
    }, '')
  }
  if (!canManage) return <div className="data-state"><h1>Участники недоступны</h1><p>Управление участниками доступно владельцу и администраторам.</p>{error && <p role="alert" className="auth-error">{error}</p>}<button className="button button-quiet" disabled={busy} onClick={leave}>Покинуть пространство</button></div>
  return <>
    <div className="page-heading"><div><h1>Участники</h1><p>Управляйте доступом к рабочему пространству.</p></div></div>
    {notice && <p role="status" className="auth-message">{notice}</p>}{error && <p role="alert" className="auth-error">{error}</p>}
    <form className="inline-create" onSubmit={event => { event.preventDefault(); void run(async () => {
      const r = await api.POST('/api/v1/organizations/{org_id}/invitations', { params: { path: { org_id: orgId } }, body: { email, role: inviteRole } }); check(r.response, r.error); setEmail('')
    }, 'Приглашение отправлено.') }}>
      <div className="inline-create-fields"><label className="field-label">Электронная почта<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/></label>
        <label className="field-label">Роль<select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}><option value="editor">Редактор</option><option value="viewer">Наблюдатель</option>{role === 'owner' && <option value="admin">Администратор</option>}</select></label>
        <button className="button button-primary" disabled={busy}>Пригласить</button></div>
    </form>
    <h2 className="members-heading">Участники</h2>
    {members.isLoading ? <p role="status">Загрузка участников…</p> : members.isError ? <p role="alert">Не удалось загрузить участников. <button className="button button-quiet" onClick={() => members.refetch()}>Повторить</button></p> : <div className="members-table">{members.data?.map(member => {
      const editable = member.role !== 'owner' && (role === 'owner' || member.role !== 'admin')
      return <div className="member-row" key={member.user_id}><span className="user-avatar">{member.email[0].toUpperCase()}</span><div className="member-identity"><strong>{member.email}</strong><p>{member.user_id === userId ? 'Вы' : 'Участник пространства'}</p></div>
        {editable ? <select aria-label={`Роль ${member.email}`} value={member.role} disabled={busy} onChange={e => { const nextRole = e.target.value as Role; void run(async () => { const r = await api.PATCH('/api/v1/organizations/{org_id}/members/{user_id}', { params: { path: { org_id: orgId, user_id: member.user_id } }, body: { role: nextRole } }); check(r.response, r.error) }, 'Роль изменена.') }}><option value="editor">Редактор</option><option value="viewer">Наблюдатель</option>{role === 'owner' && <option value="admin">Администратор</option>}</select> : <span>{labels[member.role]}</span>}
        {editable && member.user_id !== userId && <button className="button button-quiet" disabled={busy} onClick={() => { if (window.confirm(`Удалить ${member.email} из пространства?`)) void run(async () => { const r = await api.DELETE('/api/v1/organizations/{org_id}/members/{user_id}', { params: { path: { org_id: orgId, user_id: member.user_id } } }); check(r.response, r.error) }, 'Участник удалён.') }}>Удалить</button>}</div>
    })}</div>}
    <h2 className="members-heading">Приглашения</h2>
    {invitations.isLoading ? <p role="status">Загрузка приглашений…</p> : invitations.isError ? <p role="alert">Не удалось загрузить приглашения. <button className="button button-quiet" onClick={() => invitations.refetch()}>Повторить</button></p> : !invitations.data?.length ? <p className="muted">Приглашений пока нет.</p> : <div className="members-table">{invitations.data.map(invite => {
      const active = !invite.accepted && !invite.revoked
      const status = invite.accepted ? 'Принято' : invite.revoked ? 'Отозвано' : new Date(invite.expires_at) <= new Date() ? 'Срок истёк' : 'Ожидает ответа'
      const editable = active && (role === 'owner' || invite.role !== 'admin')
      const path = { org_id: orgId, invitation_id: invite.id }
      return <div className="member-row" key={invite.id}><div className="member-identity"><strong>{invite.email}</strong><p>{labels[invite.role]} · {status}</p></div>{editable && <><button className="button button-quiet" disabled={busy} onClick={() => void run(async () => { const r = await api.POST('/api/v1/organizations/{org_id}/invitations/{invitation_id}/resend', { params: { path } }); check(r.response, r.error) }, 'Приглашение отправлено повторно.')}>Отправить повторно</button><button className="button button-quiet" disabled={busy} onClick={() => { if (window.confirm(`Отозвать приглашение для ${invite.email}?`)) void run(async () => { const r = await api.DELETE('/api/v1/organizations/{org_id}/invitations/{invitation_id}', { params: { path } }); check(r.response, r.error) }, 'Приглашение отозвано.') }}>Отозвать</button></>}</div>
    })}</div>}
    {role === 'owner' && members.data && members.data.length > 1 && <form className="inline-create transfer-form" onSubmit={event => { event.preventDefault(); if (!window.confirm('Передать владение выбранному участнику? Вы станете администратором.')) return; void run(async () => {
      const r = await api.POST('/api/v1/organizations/{org_id}/transfer-ownership', { params: { path: { org_id: orgId } }, body: { new_owner_user_id: target, password } }); check(r.response, r.error); setPassword(''); setTarget(''); setInviteRole('editor')
    }, 'Владение передано.') }}><h2>Передать владение</h2><p className="field-help">После передачи вы станете администратором пространства.</p><div className="inline-create-fields"><label className="field-label">Новый владелец<select required value={target} onChange={e => setTarget(e.target.value)}><option value="">Выберите участника</option>{members.data.filter(member => member.user_id !== userId).map(member => <option value={member.user_id} key={member.user_id}>{member.email}</option>)}</select></label><label className="field-label">Ваш пароль<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></label><button className="button button-quiet" disabled={busy}>Передать владение</button></div></form>}
    {role !== 'owner' && <button className="button button-quiet transfer-form" disabled={busy} onClick={leave}>Покинуть пространство</button>}
  </>
}

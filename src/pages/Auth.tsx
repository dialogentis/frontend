import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, check, setCsrf } from '../api'
import { useSession } from '../Session'

const emailSchema = z.object({ email: z.email('Введите корректный адрес почты') })
const credentialsSchema = emailSchema.extend({ password: z.string().min(12, 'Не менее 12 символов').max(128, 'Не более 128 символов') })
type Credentials = z.infer<typeof credentialsSchema>
type Email = z.infer<typeof emailSchema>

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return <main className="auth-layout"><Link className="auth-brand" to="/login"><img src="/icon.svg" alt=""/>dialogentis<span>/</span></Link><div className="auth-content">{children}</div></main>
}

export function CredentialsPage({ register }: { register: boolean }) {
  const form = useForm<Credentials>({ resolver: zodResolver(credentialsSchema) })
  const [error, setError] = useState('')
  const { refresh } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const send = form.handleSubmit(async body => {
    setError('')
    try {
      if (register) {
        const result = await api.POST('/api/v1/auth/register', { body }); check(result.response, result.error)
        navigate('/verify-email', { state: { email: body.email, inviteToken: location.state?.inviteToken } })
      } else {
        const result = await api.POST('/api/v1/auth/login', { body }); check(result.response, result.error)
        if (!result.data) throw new Error('Некорректный ответ сервера')
        setCsrf(result.data.csrf_token); await refresh()
        const destination = typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith('/app/') ? location.state.returnTo : '/app/organizations'
        navigate(result.data.user.email_verified ? (location.state?.inviteToken ? '/invitations/accept' : destination) : '/verify-email', { replace: true, state: { email: body.email, inviteToken: location.state?.inviteToken } })
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос') }
  })
  return <AuthFrame><h1>{register ? 'Создать аккаунт' : 'Войти в Dialogentis'}</h1><p className="auth-intro">{register ? 'Создавайте и настраивайте диалоговых агентов в рабочем пространстве.' : 'Продолжите работу с вашими агентами.'}</p><form onSubmit={send} noValidate>
    <label className="field-label">Электронная почта<input {...form.register('email')} type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email}/><span className="field-help error-text">{form.formState.errors.email?.message}</span></label>
    <label className="field-label">Пароль<input {...form.register('password')} type="password" autoComplete={register ? 'new-password' : 'current-password'} aria-invalid={!!form.formState.errors.password}/><span className="field-help error-text">{form.formState.errors.password?.message}</span></label>
    {!register && <Link className="auth-link auth-forgot" to="/forgot-password">Забыли пароль?</Link>}
    {error && <p role="alert" className="auth-error">{error}</p>}<button className="button button-primary auth-submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}</button>
  </form><p className="auth-secondary">{register ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'} <Link className="auth-link" to={register ? '/login' : '/register'} state={location.state}>{register ? 'Войти' : 'Зарегистрироваться'}</Link></p></AuthFrame>
}

export function EmailPage({ verify = false }: { verify?: boolean }) {
  const location = useLocation(); const { refresh } = useSession(); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  const form = useForm<Email>({ resolver: zodResolver(emailSchema), defaultValues: { email: location.state?.email || '' } })
  const sent = useRef<string | null>(null)
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('token')
    if (!verify || !token || sent.current === token) return
    sent.current = token; window.history.replaceState(window.history.state, '', location.pathname + location.search)
    api.POST('/api/v1/auth/verify-email', { body: { token } }).then(async result => { check(result.response, result.error); await refresh(); setMessage('Почта подтверждена. Теперь можно продолжить работу.') }).catch(e => setError(e instanceof Error ? e.message : 'Не удалось подтвердить почту'))
  }, [verify, location.pathname, location.search, location.hash, refresh])
  const send = form.handleSubmit(async body => { setError(''); try {
    const result = verify ? await api.POST('/api/v1/auth/resend-verification', { body }) : await api.POST('/api/v1/auth/forgot-password', { body })
    check(result.response, result.error); setMessage('Если адрес доступен, письмо с инструкциями будет отправлено.')
  } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос') } })
  return <AuthFrame><h1>{verify ? 'Подтвердите почту' : 'Восстановление пароля'}</h1><p className="auth-intro">{verify ? 'Перейдите по ссылке из письма. Она действует 24 часа.' : 'Пришлём ссылку для установки нового пароля. Она действует 30 минут.'}</p>{message && <p role="status" className="auth-message">{message}</p>}{error && <p role="alert" className="auth-error">{error}</p>}
    <form onSubmit={send} noValidate><label className="field-label">Электронная почта<input {...form.register('email')} type="email" autoComplete="email"/><span className="field-help error-text">{form.formState.errors.email?.message}</span></label><button className="button button-primary auth-submit" disabled={form.formState.isSubmitting}>{verify ? 'Отправить письмо повторно' : 'Отправить ссылку'}</button></form><p className="auth-secondary"><Link className="auth-link" to="/login" state={{ inviteToken: location.state?.inviteToken }}>Вернуться ко входу</Link>{message && verify && <> · <Link className="auth-link" to={location.state?.inviteToken ? '/invitations/accept' : '/app/organizations'} state={{ inviteToken: location.state?.inviteToken }}>Продолжить</Link></>}</p></AuthFrame>
}

export function ResetPage() {
  const location = useLocation(); const token = useRef(new URLSearchParams(location.hash.slice(1)).get('token')); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  const form = useForm<{ password: string }>({ resolver: zodResolver(credentialsSchema.pick({ password: true })) })
  useEffect(() => { if (token.current) window.history.replaceState(window.history.state, '', location.pathname + location.search) }, [location.pathname, location.search])
  const send = form.handleSubmit(async body => { if (!token.current) return; try { const r = await api.POST('/api/v1/auth/reset-password', { body: { ...body, token: token.current } }); check(r.response, r.error); setMessage('Пароль изменён. Войдите с новым паролем.'); token.current = null } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось изменить пароль') } })
  return <AuthFrame><h1>Новый пароль</h1><p className="auth-intro">Введите новый пароль для аккаунта.</p>{message ? <p role="status" className="auth-message">{message}</p> : token.current ? <form onSubmit={send}><label className="field-label">Новый пароль<input type="password" autoComplete="new-password" {...form.register('password')}/><span className="field-help error-text">{form.formState.errors.password?.message}</span></label>{error && <p role="alert" className="auth-error">{error}</p>}<button className="button button-primary auth-submit" disabled={form.formState.isSubmitting}>Сохранить пароль</button></form> : <p className="auth-error">Ссылка отсутствует. Запросите новую ссылку для восстановления.</p>}<p className="auth-secondary"><Link className="auth-link" to={token.current ? '/login' : '/forgot-password'}>Назад</Link></p></AuthFrame>
}

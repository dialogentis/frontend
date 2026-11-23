import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, check, setCsrf } from '../api'
import { useSession } from '../Session'

const emailSchema = z.object({ email: z.email('Введите корректный адрес почты') })
const passwordSchema = z.object({ password: z.string().min(12, 'Не менее 12 символов').max(128, 'Не более 128 символов') })
const credentialsSchema = emailSchema.extend(passwordSchema.shape)

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return <main className="auth-layout"><Link className="auth-brand" to="/login"><img src="/icon.svg" alt=""/>dialogentis<span>/</span></Link><div className="auth-content">{children}</div></main>
}

export function LoginPage() {
  const form = useForm({ resolver: zodResolver(credentialsSchema) })
  const [error, setError] = useState('')
  const { refresh } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const send = form.handleSubmit(async body => {
    setError('')
    try {
      const result = await api.POST('/api/v1/auth/login', { body })
      check(result.response, result.error)
      if (!result.data) throw new Error('Некорректный ответ сервера')
      setCsrf(result.data.csrf_token)
      await refresh()
      const destination = typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith('/app/')
        ? location.state.returnTo
        : '/app/organizations'
      if (location.state?.inviteToken) {
        navigate('/invitations/accept', { replace: true, state: { inviteToken: location.state.inviteToken } })
      } else {
        navigate(destination, { replace: true })
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти') }
  })
  return <AuthFrame><h1>Войти в Dialogentis</h1><p className="auth-intro">Продолжите работу с вашими агентами.</p><form onSubmit={send} noValidate>
    <label className="field-label">Электронная почта<input {...form.register('email')} type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email}/><span className="field-help error-text">{form.formState.errors.email?.message}</span></label>
    <label className="field-label">Пароль<input {...form.register('password')} type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password}/><span className="field-help error-text">{form.formState.errors.password?.message}</span></label>
    <Link className="auth-link auth-forgot" to="/forgot-password" state={location.state}>Забыли пароль?</Link>
    {error && <p role="alert" className="auth-error">{error}</p>}<button className="button button-primary auth-submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Входим…' : 'Войти'}</button>
  </form><p className="auth-secondary">Ещё нет аккаунта? <Link className="auth-link" to="/register" state={location.state}>Зарегистрироваться</Link></p></AuthFrame>
}

export function EmailPage({ mode }: { mode: 'register' | 'verify' | 'reset' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const form = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema), defaultValues: { email: location.state?.email || '' },
  })
  const path = mode === 'register' ? '/api/v1/auth/register'
    : mode === 'verify' ? '/api/v1/auth/resend-verification' : '/api/v1/auth/forgot-password'
  const heading = mode === 'register' ? 'Создать аккаунт' : mode === 'verify' ? 'Подтвердите почту' : 'Восстановление пароля'
  const send = form.handleSubmit(async ({ email }) => {
    setError('')
    try {
      const body = mode === 'reset' ? { email } : { email, invitation_token: location.state?.inviteToken }
      const result = await api.POST(path, { body })
      check(result.response, result.error)
      if (mode === 'register') navigate('/verify-email', { state: { ...location.state, email } })
      else setMessage('Если адрес доступен, письмо с инструкциями будет отправлено.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отправить письмо') }
  })
  return <AuthFrame><h1>{heading}</h1>
    <p className="auth-intro">{mode === 'verify' ? 'Перейдите по ссылке из письма и задайте пароль. Ссылка действует 24 часа.'
      : mode === 'register' ? 'Пришлём ссылку для подтверждения почты и установки пароля.'
      : 'Пришлём ссылку для установки нового пароля. Она действует 30 минут.'}</p>
    {message && <p role="status" className="auth-message">{message}</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    <form onSubmit={send} noValidate><label className="field-label">Электронная почта<input {...form.register('email')} type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email}/><span className="field-help error-text">{form.formState.errors.email?.message}</span></label>
      <button className="button button-primary auth-submit" disabled={form.formState.isSubmitting}>{mode === 'register' ? 'Создать аккаунт' : mode === 'verify' ? 'Отправить письмо повторно' : 'Отправить ссылку'}</button>
    </form><p className="auth-secondary"><Link className="auth-link" to="/login" state={location.state}>Вернуться ко входу</Link></p>
  </AuthFrame>
}

export function PasswordPage({ verify = false }: { verify?: boolean }) {
  const location = useLocation()
  const [link, setLink] = useState<{ token: string; inviteToken: string | null } | null>(null)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  const form = useForm({ resolver: zodResolver(passwordSchema) })
  const { refresh } = useSession()
  const inviteToken = link?.inviteToken ?? location.state?.inviteToken
  useEffect(() => {
    if (!location.hash) return
    const params = new URLSearchParams(location.hash.slice(1))
    const token = params.get('token')
    window.history.replaceState(window.history.state, '', location.pathname + location.search)
    setLink(token ? { token, inviteToken: verify ? params.get('invite') : null } : null)
    setComplete(false)
    setError('')
  }, [verify, location.hash, location.pathname, location.search])

  const send = form.handleSubmit(async ({ password }) => {
    if (!link) return
    setError('')
    try {
      const result = await api.POST(verify ? '/api/v1/auth/verify-email' : '/api/v1/auth/reset-password', {
        body: { token: link.token, password },
      })
      check(result.response, result.error)
      form.reset()
      setComplete(true)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить пароль') }
  })

  if (!link && verify) return <EmailPage mode="verify"/>
  return <AuthFrame><h1>{verify ? 'Задайте пароль' : 'Новый пароль'}</h1>
    {complete ? <p role="status" className="auth-message">{verify ? 'Почта подтверждена. Теперь можно войти в аккаунт.' : 'Пароль изменён. Войдите с новым паролем.'}</p> :
      link ? <form onSubmit={send} noValidate><label className="field-label">Новый пароль<input type="password" autoComplete="new-password" {...form.register('password')} aria-invalid={!!form.formState.errors.password}/><span className="field-help error-text">{form.formState.errors.password?.message}</span></label>
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button className="button button-primary auth-submit" disabled={form.formState.isSubmitting}>Сохранить пароль</button>
      </form> : <p className="auth-error">Ссылка отсутствует. Запросите новую ссылку для восстановления.</p>}
    <p className="auth-secondary">{error && verify
      ? <button className="button button-text" type="button" onClick={() => setLink(null)}>Запросить новую ссылку</button>
      : <Link className="auth-link" to={link ? '/login' : '/forgot-password'} state={{ ...location.state, inviteToken }}>Вернуться ко входу</Link>}</p>
  </AuthFrame>
}

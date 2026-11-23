import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, check, onSessionExpired, setCsrf } from './api'
import type { components } from './api/schema'

type SessionData = components['schemas']['MeResult']
type Context = { session: SessionData | null; refresh: () => Promise<void>; logout: () => Promise<void> }
const SessionContext = createContext<Context | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient()
  useEffect(() => onSessionExpired(() => {
    void cache.cancelQueries()
    cache.removeQueries({ predicate: query => query.queryKey[0] !== 'session' })
    cache.setQueryData(['session'], null)
  }), [cache])
  const query = useQuery({ queryKey: ['session'], queryFn: async () => {
    const { data, error, response } = await api.GET('/api/v1/auth/me')
    if (response.status === 401) {
      setCsrf(null)
      cache.removeQueries({ predicate: query => query.queryKey[0] !== 'session' })
      return null
    }
    check(response, error)
    if (!data) throw new Error('Некорректный ответ сервера')
    setCsrf(data.csrf_token)
    return data
  }, retry: 1 })
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ['session'] }) }
  const logout = async () => {
    const { response, error } = await api.POST('/api/v1/auth/logout')
    if (response.status !== 401) check(response, error)
    setCsrf(null); cache.clear(); cache.setQueryData(['session'], null)
  }
  if (query.isPending) return <div className="auth-state" role="status">Загрузка…</div>
  if (query.isError) return <div className="auth-state"><h1>Не удалось подключиться</h1><p>Проверьте соединение с сервером.</p><button className="button button-quiet" onClick={() => query.refetch()}>Повторить</button></div>
  return <SessionContext.Provider value={{ session: query.data, refresh, logout }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('SessionProvider отсутствует')
  return value
}

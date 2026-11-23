import createClient from 'openapi-fetch'
import type { components, paths } from './api/schema'

export const api = createClient<paths>({ baseUrl: '' })
let csrf: string | null = null
export function setCsrf(value: string | null) { csrf = value }
export function getCsrf() { return csrf }
const sessionEvents = new EventTarget()
const authenticatedRequests = new WeakMap<Request, string>()

export function onSessionExpired(listener: () => void) {
  sessionEvents.addEventListener('expired', listener)
  return () => sessionEvents.removeEventListener('expired', listener)
}

api.use({
  onRequest({ request, schemaPath }) {
    if (csrf && /^\/api\/v1\/(organizations|deletions|invitations)(?:\/|$)/.test(schemaPath)) {
      authenticatedRequests.set(request, csrf)
    }
    if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) request.headers.set('X-CSRF-Token', csrf)
    return request
  },
  onResponse({ request, response }) {
    if (response.status === 401 && csrf && authenticatedRequests.get(request) === csrf) {
      setCsrf(null)
      sessionEvents.dispatchEvent(new Event('expired'))
    }
  },
})

export class ApiError extends Error {
  constructor(public status: number, message: string, public details: { message?: unknown }[] = []) { super(message) }
}

export function check(response: Response, error: unknown): void {
  if (response.ok) return
  const body = error as components['schemas']['ErrorResponse'] | undefined
  throw new ApiError(response.status, body?.error?.message || 'Не удалось выполнить запрос', body?.error?.details || [])
}

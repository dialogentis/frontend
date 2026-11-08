// shortcut: known credential names only; replace with schema-based export for integrations.
const credentialFields = new Set(['password', 'password_hash', 'secret', 'client_secret', 'secret_key', 'token', 'access_token', 'refresh_token', 'auth_token', 'bearer_token', 'authorization', 'credentials', 'api_key', 'private_key', 'access_key'])

export function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => {
    const normalized = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replaceAll('-', '_').toLowerCase()
    return !credentialFields.has(normalized)
  }).map(([key, item]) => [key, withoutSecrets(item)]))
}

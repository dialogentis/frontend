import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { seedAgents, seedIntents, organizations } from './model'
import type { Agent, Intent } from './model'

type Store = {
  agents: Agent[]; intents: Intent[]; org: string; organizationName: string
  setOrg: (id: string) => void; setAgents: (next: Agent[]) => void; setIntents: (next: Intent[]) => void
  reset: () => void
}
const StoreContext = createContext<Store | null>(null)
function read<T,>(key: string, initial: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial } catch { return initial }
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [agents, updateAgents] = useState<Agent[]>(() => read('dialogentis-demo-agents', seedAgents))
  const [intentSets, updateIntentSets] = useState<Record<string, Intent[]>>(() => read('dialogentis-demo-intent-sets', {}))
  const [org, setOrg] = useState('studio')
  const { pathname } = useLocation()
  const agentId = pathname.match(/^\/agents\/([^/]+)\//)?.[1] ?? 'support'
  const intentKey = `${org}:${agentId}`
  const intents = intentSets[intentKey] ?? (org === 'studio' && agentId === 'support' ? seedIntents : [])
  const setAgents = (next: Agent[]) => { updateAgents(next); try { localStorage.setItem('dialogentis-demo-agents', JSON.stringify(next)) } catch { /* Demo remains usable without storage. */ } }
  const setIntents = (next: Intent[]) => { const sets = { ...intentSets, [intentKey]: next }; updateIntentSets(sets); try { localStorage.setItem('dialogentis-demo-intent-sets', JSON.stringify(sets)) } catch { /* Demo remains usable without storage. */ } }
  const reset = () => {
    setAgents(seedAgents); updateIntentSets({})
    localStorage.removeItem('dialogentis-demo-intent-sets')
    for (const key of Object.keys(localStorage)) if (key.startsWith('dialogentis-flow-')) localStorage.removeItem(key)
  }
  return <StoreContext.Provider value={{ agents, intents, org, setOrg, setAgents, setIntents, reset, organizationName: organizations.find(o => o.id === org)?.name ?? 'Основное пространство' }}>{children}</StoreContext.Provider>
}
export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('StoreProvider is required')
  return value
}

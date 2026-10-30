import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/onest'
import '@fontsource-variable/jetbrains-mono'
import '@xyflow/react/dist/style.css'
import './styles/app.css'
import { SessionProvider } from './Session'
import { Root } from './Root'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><QueryClientProvider client={queryClient}><SessionProvider><Root/></SessionProvider></QueryClientProvider></BrowserRouter></StrictMode>)

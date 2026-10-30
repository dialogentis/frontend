import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/onest'
import '@fontsource-variable/jetbrains-mono'
import '@xyflow/react/dist/style.css'
import './styles/app.css'
import { StoreProvider } from './store'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><StoreProvider><App/></StoreProvider></BrowserRouter></StrictMode>)

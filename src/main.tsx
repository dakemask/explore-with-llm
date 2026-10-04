import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { recoverInterruptedNodes } from './db'
import './index.css'

recoverInterruptedNodes().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

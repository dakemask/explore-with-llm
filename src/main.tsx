import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { dropEmptyNotes, recoverInterruptedNodes } from './db'
import { compressPending } from './lib/records'
import './index.css'

// A file dropped outside an input's drop area would make the browser open it in place of the app.
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (e) => {
    if (e.defaultPrevented || !e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'none'
  })
}

Promise.all([recoverInterruptedNodes(), dropEmptyNotes()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  // Records DB v7 moved out uncompressed; in the background, the app needn't wait.
  compressPending().catch((e) => console.error('compressing stored records failed', e))
})

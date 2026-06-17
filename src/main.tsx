import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

// Re-render on navigation between the landing site and the #/coverage dashboard.
window.addEventListener('hashchange', () => window.location.reload())

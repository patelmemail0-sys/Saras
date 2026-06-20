import { Suspense, lazy } from 'react'
import App from './App.tsx'

// Lightweight hash routes, all lazy-loaded so their chunks (and the ~600KB
// curriculum dataset) stay out of the landing bundle:
//   #/try      → the visualize surface (the spec engine)
//   #/topics   → subject browser backed by Supabase
//   #/coverage → the internal curriculum planning dashboard
// everything else renders the landing site.
const CurriculumCoverage = lazy(() => import('./coverage/CurriculumCoverage.tsx'))
const VisualizePanel = lazy(() => import('./engine/VisualizePanel.tsx'))
const TopicsPage = lazy(() => import('./topics/TopicsPage.tsx'))

const route = () => window.location.hash.replace(/^#/, '')

export default function Root() {
  const path = route()
  if (path.startsWith('/coverage')) {
    return (
      <Suspense fallback={null}>
        <CurriculumCoverage />
      </Suspense>
    )
  }
  if (path.startsWith('/try')) {
    return (
      <Suspense fallback={null}>
        <VisualizePanel />
      </Suspense>
    )
  }
  if (path.startsWith('/topics')) {
    return (
      <Suspense fallback={null}>
        <TopicsPage />
      </Suspense>
    )
  }
  return <App />
}

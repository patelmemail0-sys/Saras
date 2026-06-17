import { Suspense, lazy } from 'react'
import App from './App.tsx'

// Lightweight hash route: #/coverage opens the internal curriculum planning
// dashboard; everything else renders the landing site. The dashboard (and the
// ~600KB curriculum dataset it pulls in) is lazy-loaded so the landing bundle
// stays lean.
const CurriculumCoverage = lazy(() => import('./coverage/CurriculumCoverage.tsx'))
const isCoverage = () => window.location.hash.replace(/^#/, '').startsWith('/coverage')

export default function Root() {
  if (isCoverage()) {
    return (
      <Suspense fallback={null}>
        <CurriculumCoverage />
      </Suspense>
    )
  }
  return <App />
}

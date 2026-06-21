import { Suspense, lazy } from 'react'
import AuthProvider from './auth/AuthProvider.tsx'

// Lightweight hash routes, lazy-loaded so their chunks (and the ~600KB
// curriculum dataset) stay out of the landing bundle:
//   #/try         → the visualize surface (the spec engine)
//   #/coverage    → the internal curriculum planning dashboard
//   #/get-started → new-user onboarding (account + name/grade/subjects)
//   #/login       → returning-user login
// everything else renders the landing site.
const CurriculumCoverage = lazy(() => import('./coverage/CurriculumCoverage.tsx'))
const VisualizePanel = lazy(() => import('./engine/VisualizePanel.tsx'))
const Onboarding = lazy(() => import('./auth/Onboarding.tsx'))
const Login = lazy(() => import('./auth/Login.tsx'))
const LandingLotus = lazy(() => import('./landing/LandingLotus.tsx'))

const route = () => window.location.hash.replace(/^#/, '')

export default function Root() {
  const path = route()
  return (
    <AuthProvider>
      <Suspense fallback={null}>{renderRoute(path)}</Suspense>
    </AuthProvider>
  )
}

function renderRoute(path: string) {
  if (path.startsWith('/coverage')) return <CurriculumCoverage />
  if (path.startsWith('/try')) return <VisualizePanel />
  if (path.startsWith('/get-started')) return <Onboarding />
  if (path.startsWith('/login')) return <Login />
  return <LandingLotus />
}

import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AppNav } from './components/layout/AppNav'
import { Sidebar } from './components/layout/Sidebar'
import { Button } from './components/ui/Button'
import { Card, CardContent } from './components/ui/Card'
import { api, unwrap } from './services/api'

const LandingPage = lazy(() => import('./pages/saas/LandingPage'))
const AuthPage = lazy(() => import('./pages/saas/AuthPage'))
const GeneratorPage = lazy(() => import('./pages/saas/GeneratorPage'))
const ResultPage = lazy(() => import('./pages/saas/ResultPage'))
const Profile = lazy(() => import('./pages/saas/Profile'))
const UserDashboard = lazy(() => import('./pages/saas/UserDashboard'))
const MyProjects = lazy(() => import('./pages/saas/MyProjects'))
const AdminDashboard = lazy(() => import('./pages/saas/AdminDashboard'))
const UserManagement = lazy(() => import('./pages/saas/UserManagement'))
const SaasAdminProjects = lazy(() => import('./pages/saas/AdminProjects'))
const SystemUsage = lazy(() => import('./pages/saas/SystemUsage'))
const Overview = lazy(() => import('./pages/Overview'))
const Projects = lazy(() => import('./pages/Projects'))
const CreateProject = lazy(() => import('./pages/CreateProject'))
const GeneratedFiles = lazy(() => import('./pages/GeneratedFiles'))
const GeneratedFilePreview = lazy(() => import('./pages/GeneratedFilePreview'))
const Deployments = lazy(() => import('./pages/Deployments'))
const GitOps = lazy(() => import('./pages/GitOps'))
const Kubernetes = lazy(() => import('./pages/Kubernetes'))
const Monitoring = lazy(() => import('./pages/Monitoring'))
const Logs = lazy(() => import('./pages/Logs'))
const Incidents = lazy(() => import('./pages/Incidents'))
const AIAssistant = lazy(() => import('./pages/AIAssistant'))
const Security = lazy(() => import('./pages/Security'))
const Infrastructure = lazy(() => import('./pages/Infrastructure'))
const Settings = lazy(() => import('./pages/Settings'))
const UploadProject = lazy(() => import('./pages/UploadProject'))
const ProjectAnalysis = lazy(() => import('./pages/ProjectAnalysis'))
const DevOpsGenerator = lazy(() => import('./pages/DevOpsGenerator'))
const ConnectGitHub = lazy(() => import('./pages/ConnectGitHub'))

function LoadingState() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-32 animate-pulse rounded-lg border border-slate-800 bg-slate-900/70" />
      ))}
    </div>
  )
}

function GlobalActivityIndicator() {
  const [activeRequests, setActiveRequests] = useState(0)

  useEffect(() => {
    const start = () => setActiveRequests((count) => count + 1)
    const end = () => setActiveRequests((count) => Math.max(0, count - 1))
    window.addEventListener('opsforge:api-start', start)
    window.addEventListener('opsforge:api-end', end)
    return () => {
      window.removeEventListener('opsforge:api-start', start)
      window.removeEventListener('opsforge:api-end', end)
    }
  }, [])

  if (!activeRequests) return null
  return (
    <div className="pointer-events-none fixed left-0 right-0 top-0 z-[100]">
      <div className="h-1 w-full overflow-hidden bg-slate-900">
        <div className="h-full w-1/3 animate-pulse rounded-r-full bg-cyan-400 shadow-lg shadow-cyan-400/40" />
      </div>
    </div>
  )
}

function AuthRequired() {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent>
        <p className="text-sm text-cyan-300">Login required</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Sign in to continue</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Projects, deployments, Kubernetes resources, logs, incidents, security scans, and self-healing actions require an authenticated OpsForge account.
        </p>
        <Link to="/login" className="mt-6 inline-flex"><Button>Login</Button></Link>
      </CardContent>
    </Card>
  )
}

function AdminRequired({ user }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent>
        <p className="text-sm text-purple-300">Admin only</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Platform admin access required</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Current role: {user?.role || 'Guest'}. Admin accounts are seeded from backend environment variables.
        </p>
      </CardContent>
    </Card>
  )
}

function ProtectedRoute({ user, admin = false, children }) {
  if (!user) return <AuthRequired />
  if (admin && user.role !== 'ADMIN') return <AdminRequired user={user} />
  return children
}

function DashboardLayout({ user, children }) {
  return (
    <div className="lg:pl-72">
      <Sidebar role={user?.role || 'USER'} />
      <div className="pb-24 lg:pb-0">{children}</div>
    </div>
  )
}

function RouteTransitions({ user, onAuthenticated, onLogout }) {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <Suspense fallback={<LoadingState />}>
          <Routes location={location}>
            <Route path="/" element={<LandingPage user={user} />} />
            <Route path="/generate" element={<GeneratorPage user={user} />} />
            <Route path="/result/:id" element={<ResultPage />} />
            <Route path="/login" element={<AuthPage key="login" mode="login" onAuthenticated={onAuthenticated} />} />
            <Route path="/signup" element={<AuthPage key="signup" mode="signup" onAuthenticated={onAuthenticated} />} />
            <Route path="/forgot-password" element={<AuthPage key="forgot" mode="forgot" onAuthenticated={onAuthenticated} />} />
            <Route path="/reset-password" element={<AuthPage key="reset" mode="reset" onAuthenticated={onAuthenticated} />} />

            <Route path="/dashboard" element={<ProtectedRoute user={user}><UserDashboard user={user} /></ProtectedRoute>} />
            <Route path="/my-projects" element={<ProtectedRoute user={user}><MyProjects user={user} /></ProtectedRoute>} />
            <Route path="/app" element={<Navigate to="/app/overview" replace />} />
            <Route path="/app/overview" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Overview /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/projects" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Projects user={user} /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/create-project" element={<ProtectedRoute user={user}><DashboardLayout user={user}><CreateProject /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/upload-project" element={<ProtectedRoute user={user}><DashboardLayout user={user}><UploadProject /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/project-analysis" element={<ProtectedRoute user={user}><DashboardLayout user={user}><ProjectAnalysis /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/projects/:projectId/analysis" element={<ProtectedRoute user={user}><DashboardLayout user={user}><ProjectAnalysis /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/devops-generator" element={<ProtectedRoute user={user}><DashboardLayout user={user}><DevOpsGenerator /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/connect-github" element={<ProtectedRoute user={user}><DashboardLayout user={user}><ConnectGitHub /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/generated-files" element={<ProtectedRoute user={user}><DashboardLayout user={user}><GeneratedFiles /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/generated-files/:fileId" element={<ProtectedRoute user={user}><DashboardLayout user={user}><GeneratedFilePreview /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/deployments" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Deployments /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/gitops" element={<ProtectedRoute user={user}><DashboardLayout user={user}><GitOps /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/kubernetes" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Kubernetes /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/monitoring" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Monitoring /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/logs" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Logs /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/incidents" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Incidents /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/ai-assistant" element={<ProtectedRoute user={user}><DashboardLayout user={user}><AIAssistant /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/security" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Security /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/infrastructure" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Infrastructure /></DashboardLayout></ProtectedRoute>} />
            <Route path="/app/settings" element={<ProtectedRoute user={user}><DashboardLayout user={user}><Settings /></DashboardLayout></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute user={user}><Profile user={user} onLogout={onLogout} /></ProtectedRoute>} />

            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<ProtectedRoute user={user} admin><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/user-management" element={<ProtectedRoute user={user} admin><UserManagement /></ProtectedRoute>} />
            <Route path="/admin/generated-projects" element={<ProtectedRoute user={user} admin><SaasAdminProjects /></ProtectedRoute>} />
            <Route path="/admin/system-usage" element={<ProtectedRoute user={user} admin><SystemUsage /></ProtectedRoute>} />
            <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('opsforge_user')
    return stored ? JSON.parse(stored) : null
  })
  const [checkingAuth, setCheckingAuth] = useState(Boolean(localStorage.getItem('opsforge_access_token')))

  useEffect(() => {
    async function loadUser() {
      if (!localStorage.getItem('opsforge_access_token')) {
        setCheckingAuth(false)
        return
      }
      try {
        const currentUser = unwrap(await api.get('/auth/me'))
        localStorage.setItem('opsforge_user', JSON.stringify(currentUser))
        setUser(currentUser)
      } catch {
        localStorage.removeItem('opsforge_access_token')
        localStorage.removeItem('opsforge_refresh_token')
        localStorage.removeItem('opsforge_user')
        setUser(null)
      } finally {
        setCheckingAuth(false)
      }
    }
    loadUser()
  }, [])

  async function logout() {
    const refreshToken = localStorage.getItem('opsforge_refresh_token')
    try {
      if (refreshToken) await api.post('/auth/logout', { refresh_token: refreshToken })
    } catch {
      // Local logout still clears the browser session if the API is unavailable.
    }
    localStorage.removeItem('opsforge_access_token')
    localStorage.removeItem('opsforge_refresh_token')
    localStorage.removeItem('opsforge_user')
    setUser(null)
    navigate('/')
  }

  function handleAuthenticated(currentUser) {
    setUser(currentUser)
  }

  if (checkingAuth) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <GlobalActivityIndicator />
      <AppNav user={user} onLogout={logout} />
      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <RouteTransitions user={user} onAuthenticated={handleAuthenticated} onLogout={logout} />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

import { useState } from 'react'
import { CheckCircle2, FileCode2, Lock, Mail, UserPlus } from 'lucide-react'
import { api, unwrap } from '../services/api'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'

function AuthForm({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')

  async function submitLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const data = unwrap(
        await api.post('/auth/login', {
          email: form.get('email'),
          password: form.get('password'),
        }),
      )
      localStorage.setItem('opsforge_access_token', data.access_token)
      localStorage.setItem('opsforge_refresh_token', data.refresh_token)
      localStorage.setItem('opsforge_user', JSON.stringify(data.user))
      onAuthenticated(data.user)
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function submitRegister(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const email = form.get('email')
    try {
      await api.post('/auth/register', {
        name: form.get('name'),
        email,
        password: form.get('password'),
      })
      setPendingEmail(email)
      setMode('verify')
      setMessage('Account created. Enter the 6-digit verification code printed by the backend in development.')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  async function submitVerify(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await api.post('/auth/verify-email', {
        email: form.get('email'),
        code: form.get('code'),
      })
      setMode('login')
      setMessage('Email verified. You can sign in now.')
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-5 flex rounded-md border border-slate-800 bg-slate-950 p-1">
          <button
            className={`h-10 flex-1 rounded text-sm font-medium transition ${mode === 'login' ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setMode('login')}
            type="button"
          >
            Login
          </button>
          <button
            className={`h-10 flex-1 rounded text-sm font-medium transition ${mode === 'register' ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setMode('register')}
            type="button"
          >
            Register
          </button>
        </div>

        {message ? <div className="mb-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</div> : null}
        {error ? <div className="mb-4 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</div> : null}

        {mode === 'login' ? (
          <form className="space-y-4" onSubmit={submitLogin}>
            <label className="space-y-2 block">
              <span className="text-sm text-slate-300">Email</span>
              <input name="email" type="email" required className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="you@example.com" />
            </label>
            <label className="space-y-2 block">
              <span className="text-sm text-slate-300">Password</span>
              <input name="password" type="password" required minLength={8} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="Your password" />
            </label>
            <Button className="w-full" icon={Lock} loading={loading} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</Button>
          </form>
        ) : null}

        {mode === 'register' ? (
          <form className="space-y-4" onSubmit={submitRegister}>
            <label className="space-y-2 block">
              <span className="text-sm text-slate-300">Name</span>
              <input name="name" required minLength={2} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="Dev User" />
            </label>
            <label className="space-y-2 block">
              <span className="text-sm text-slate-300">Email</span>
              <input name="email" type="email" required className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="you@example.com" />
            </label>
            <label className="space-y-2 block">
              <span className="text-sm text-slate-300">Password</span>
              <input name="password" type="password" required minLength={8} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="At least 8 characters" />
            </label>
            <Button className="w-full" icon={UserPlus} loading={loading} disabled={loading}>{loading ? 'Creating account...' : 'Create user account'}</Button>
          </form>
        ) : null}

        {mode === 'verify' ? (
          <form className="space-y-4" onSubmit={submitVerify}>
            <label className="space-y-2 block">
              <span className="text-sm text-slate-300">Email</span>
              <input name="email" type="email" required defaultValue={pendingEmail} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" />
            </label>
            <label className="space-y-2 block">
              <span className="text-sm text-slate-300">Verification code</span>
              <input name="code" required minLength={6} maxLength={6} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="123456" />
            </label>
            <Button className="w-full" icon={Mail} loading={loading} disabled={loading}>{loading ? 'Verifying...' : 'Verify email'}</Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function Auth({ onAuthenticated, embedded = false }) {
  if (embedded) {
    return <AuthForm onAuthenticated={onAuthenticated} />
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
            <FileCode2 className="h-6 w-6 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">OpsForge</h1>
            <p className="text-sm text-slate-400">DevOps platform dashboard</p>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/20">
            <p className="text-sm text-cyan-300">User and admin access</p>
            <h2 className="mt-3 text-3xl font-bold text-white">One login, role-based dashboard.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
              Normal users register, verify email, and use their own project dashboard. Admins sign in with the seeded backend environment credentials and get the admin dashboard.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ['User dashboard', 'Create projects, generate files, deploy, scan, analyze incidents.'],
                ['Admin dashboard', 'Manage users, platform integrations, clusters, audit logs, and health.'],
                ['Secure by default', 'No admin password or provider token is stored in the frontend.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                  <CheckCircle2 className="h-5 w-5 text-cyan-300" />
                  <h3 className="mt-4 text-sm font-semibold text-slate-100">{title}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <AuthForm onAuthenticated={onAuthenticated} />
        </div>
      </div>
    </main>
  )
}

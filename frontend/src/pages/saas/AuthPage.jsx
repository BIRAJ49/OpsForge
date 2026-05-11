import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileCode2 } from 'lucide-react'
import { api, apiErrorMessage, unwrap } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'

export default function AuthPage({ mode = 'login', onAuthenticated }) {
  const navigate = useNavigate()
  const [view, setView] = useState(mode)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetCodeVerified, setResetCodeVerified] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      if (view === 'signup') {
        const password = form.get('password')
        if (password !== form.get('confirm_password')) throw new Error('Passwords do not match')
        await api.post('/auth/register', { name: form.get('name'), email: form.get('email'), password })
        setPendingEmail(form.get('email'))
        setView('verify')
        setMessage('Account created. Enter the 6-digit verification code from email or backend logs.')
      } else if (view === 'verify') {
        await api.post('/auth/verify-email', { email: form.get('email'), code: form.get('code') })
        setView('login')
        setMessage('Email verified. You can login now.')
      } else if (view === 'forgot') {
        await api.post('/auth/forgot-password', { email: form.get('email') })
        setPendingEmail(form.get('email'))
        setResetCode('')
        setResetCodeVerified(false)
        setView('reset')
        setMessage('Reset code sent to your email.')
      } else if (view === 'reset') {
        if (!resetCodeVerified) {
          await api.post('/auth/verify-reset-code', { email: form.get('email'), code: form.get('code') })
          setPendingEmail(form.get('email'))
          setResetCode(form.get('code'))
          setResetCodeVerified(true)
          setMessage('Code verified. Enter your new password.')
          return
        }
        const password = form.get('password')
        if (password !== form.get('confirm_password')) throw new Error('Passwords do not match')
        await api.post('/auth/reset-password', { email: pendingEmail, code: resetCode, new_password: password })
        setResetCode('')
        setResetCodeVerified(false)
        setView('login')
        setMessage('Password reset successful. Login with the new password.')
      } else {
        const data = unwrap(await api.post('/auth/login', { email: form.get('email'), password: form.get('password') }))
        localStorage.setItem('opsforge_access_token', data.access_token)
        localStorage.setItem('opsforge_refresh_token', data.refresh_token)
        localStorage.setItem('opsforge_user', JSON.stringify(data.user))
        onAuthenticated(data.user)
        navigate(data.user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard')
      }
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const titles = {
    login: ['Welcome back', 'Login to manage your generated DevOps projects.'],
    signup: ['Create your workspace', 'Signup as a USER and start saving generated projects.'],
    verify: ['Verify email', 'Enter the 6-digit code sent to your email or printed in backend logs.'],
    forgot: ['Forgot password', 'Request a 6-digit reset code for your account.'],
    reset: resetCodeVerified ? ['Create new password', 'Set a new password for your account.'] : ['Verify reset code', 'Enter the 6-digit code sent to your email.'],
  }
  const [title, subtitle] = titles[view]
  const submitLabel = { login: 'Login', signup: 'Create account', verify: 'Verify email', forgot: 'Send reset code', reset: resetCodeVerified ? 'Update password' : 'Verify code' }[view]
  const helperActions = {
    login: [['Reset password', 'forgot']],
    signup: [],
    verify: [['Back to login', 'login']],
    forgot: [
      ['Back to login', 'login'],
      ['Create account', 'signup'],
    ],
    reset: [['Back to login', 'login']],
  }[view]

  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[460px] items-center px-4 py-10">
      <Card className="w-full border-slate-700/80 bg-slate-950/85 shadow-2xl shadow-slate-950/40">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
              <FileCode2 className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{title}</h2>
              <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
            </div>
          </div>
          {message ? <div className="mb-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</div> : null}
          {error ? <div className="mb-4 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</div> : null}
          <form className="space-y-4" onSubmit={submit}>
            {view === 'signup' ? (
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Full name</span>
                <input name="name" required className="h-12 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:bg-slate-950" />
              </label>
            ) : null}
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Email</span>
              <input name="email" type="email" required defaultValue={pendingEmail} readOnly={view === 'reset' && resetCodeVerified} className="h-12 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none transition read-only:cursor-not-allowed read-only:opacity-70 focus:border-cyan-400 focus:bg-slate-950" />
            </label>
            {view === 'verify' || (view === 'reset' && !resetCodeVerified) ? (
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">6-digit code</span>
                <input name="code" required minLength={6} maxLength={6} className="h-12 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:bg-slate-950" />
              </label>
            ) : null}
            {['login', 'signup'].includes(view) || (view === 'reset' && resetCodeVerified) ? (
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">{view === 'reset' ? 'New password' : 'Password'}</span>
                <input name="password" type="password" required minLength={8} className="h-12 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:bg-slate-950" />
              </label>
            ) : null}
            {view === 'signup' || (view === 'reset' && resetCodeVerified) ? (
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Confirm password</span>
                <input name="confirm_password" type="password" required minLength={8} className="h-12 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:bg-slate-950" />
              </label>
            ) : null}
            <Button className="h-12 w-full text-sm shadow-lg shadow-cyan-950/30" loading={loading} disabled={loading}>
              {loading ? 'Please wait...' : submitLabel}
            </Button>
          </form>
          <div className="mt-5 space-y-4">
            {view === 'login' ? (
              <div className="text-center text-sm text-slate-400">
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setMessage('')
                    setResetCode('')
                    setResetCodeVerified(false)
                    setView('signup')
                  }}
                  className="font-semibold text-cyan-200 transition hover:text-cyan-100"
                >
                  Sign up
                </button>
              </div>
            ) : null}
            {view === 'signup' ? (
              <div className="text-center text-sm text-slate-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setMessage('')
                    setResetCode('')
                    setResetCodeVerified(false)
                    setView('login')
                  }}
                  className="font-semibold text-cyan-200 transition hover:text-cyan-100"
                >
                  Login
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {helperActions.map(([label, nextView]) => (
                <button
                  key={nextView}
                  type="button"
                  onClick={() => {
                    setError('')
                    setMessage('')
                    setResetCode('')
                    setResetCodeVerified(false)
                    setView(nextView)
                  }}
                  className="text-sm font-medium text-slate-400 transition hover:text-cyan-100"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

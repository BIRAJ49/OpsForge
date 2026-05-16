import { GitBranch, ShieldCheck, Unlink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { api, apiErrorMessage, unwrap } from '../services/api'

export default function ConnectGitHub() {
  const location = useLocation()
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [connecting, setConnecting] = useState(false)
  const callbackMessage = useMemo(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('github') === 'connected') return 'GitHub connected successfully'
    if (params.get('github') === 'failed') return 'GitHub connection failed'
    return ''
  }, [location.search])

  useEffect(() => {
    async function loadStatus() {
      try {
        setStatus(unwrap(await api.get('/integrations/github/status')))
      } catch {
        setStatus(null)
      }
    }
    loadStatus()
  }, [])

  async function connectGitHub() {
    setMessage('')
    setConnecting(true)
    try {
      const data = unwrap(await api.post('/integrations/github/oauth/start'))
      window.location.href = data.auth_url
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not start GitHub connection'))
      setConnecting(false)
    }
  }

  async function unlinkGitHub() {
    setMessage('')
    try {
      const data = unwrap(await api.delete('/integrations/github/user'))
      setStatus(data)
      setMessage('GitHub disconnected')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not disconnect GitHub'))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm text-cyan-300">Source control integration</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Connect GitHub</h1>
        <p className="mt-2 text-sm text-slate-400">Authorize OpsForge to create repositories and push generated DevOps files to your GitHub account.</p>
      </div>

      {message || callbackMessage ? <div className="rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message || callbackMessage}</div> : null}

      <Card>
        <CardHeader
          title="GitHub account"
          description="Connect your GitHub account to create repositories and push generated DevOps files."
          action={<Badge tone={status?.status === 'configured' ? 'green' : 'amber'}>{status?.status || 'not_connected'}</Badge>}
        />
        <CardContent>
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-md border border-cyan-400/30 bg-cyan-400/10 p-2">
                  <GitBranch className="h-5 w-5 text-cyan-300" />
                </div>
                <div>
                  <p className="font-medium text-slate-100">Push generated files to GitHub</p>
                  <p className="text-sm text-slate-400">Required before using Push to GitHub from generated files.</p>
                  {status?.config?.login ? <p className="mt-1 text-xs text-emerald-300">Connected as {status.config.login}</p> : null}
                </div>
              </div>
              {status?.status !== 'configured' ? (
                <p className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-400">
                  GitHub is not connected for this account yet. Use the connect button to authorize OpsForge with GitHub OAuth.
                </p>
              ) : null}
              <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <p>GitHub will ask for repository, workflow, and package permissions so OpsForge can create repos and commit generated lifecycle files.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button icon={GitBranch} onClick={connectGitHub} disabled={connecting}>
                {connecting ? 'Opening GitHub...' : status?.status === 'configured' ? 'Reconnect GitHub' : 'Connect GitHub'}
              </Button>
              <Button variant="danger" icon={Unlink} onClick={unlinkGitHub} disabled={status?.scope !== 'user' || status?.status !== 'configured'}>
                Unlink GitHub
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

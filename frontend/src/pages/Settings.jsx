import { GitBranch, KeyRound, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { api, apiErrorMessage, unwrap } from '../services/api'

const sections = [
  'Profile settings',
  'API keys',
  'GitHub integration',
  'Docker registry integration',
  'Kubernetes cluster config',
  'Notification settings',
]

export default function Settings() {
  const location = useLocation()
  const [githubStatus, setGithubStatus] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadStatus() {
      try {
        setGithubStatus(unwrap(await api.get('/integrations/github/status')))
      } catch {
        setGithubStatus(null)
      }
    }
    loadStatus()
    const params = new URLSearchParams(location.search)
    if (params.get('github') === 'connected') setMessage('GitHub connected for your account')
    if (params.get('github') === 'failed') setMessage('GitHub connection failed')
  }, [location.search])

  async function connectGitHub() {
    setMessage('')
    try {
      const data = unwrap(await api.post('/integrations/github/oauth/start'))
      window.location.href = data.auth_url
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not start GitHub connection'))
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader title="Settings" description="Workspace and platform integrations." />
        <CardContent className="space-y-2">
          {sections.map((section) => (
            <button key={section} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white">
              <KeyRound className="h-4 w-4 text-cyan-300" />
              {section}
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Workspace Configuration" description="Profile, providers, cluster access, and notification preferences." action={<Button icon={Save}>Save Changes</Button>} />
        <CardContent>
          {message ? <div className="mb-5 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-cyan-300" />
                  <p className="font-medium text-slate-100">Connect GitHub for your account</p>
                </div>
                <p className="mb-3 text-sm text-slate-400">
                  Push generated files to repositories under your GitHub account. You will be redirected to GitHub to authorize repo, workflow, and package permissions.
                </p>
                <p className="text-sm text-slate-300">
                  Status: <span className={githubStatus?.status === 'configured' ? 'text-emerald-300' : 'text-amber-300'}>{githubStatus?.status || 'not_connected'}</span>
                </p>
              </div>
              <Button type="button" icon={GitBranch} onClick={connectGitHub}>
                {githubStatus?.status === 'configured' ? 'Reconnect GitHub' : 'Connect GitHub'}
              </Button>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {[
              ['Workspace name', 'OpsForge Production'],
              ['Owner email', 'admin@opsforge.dev'],
              ['GitHub organization', 'opsforge-labs'],
              ['Docker registry', 'registry.opsforge.dev'],
            ].map(([label, value]) => (
              <label key={label} className="space-y-2">
                <span className="text-sm text-slate-300">{label}</span>
                <input defaultValue={value} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" />
              </label>
            ))}
            <label className="space-y-2">
              <span className="text-sm text-slate-300">AI provider selection</span>
              <select className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400">
                <option>Bedrock</option>
                <option>OpenRouter</option>
                <option>Gemini</option>
                <option>OpenAI</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Kubernetes context</span>
              <input defaultValue="prod-us-east-1" className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" />
            </label>
            <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
              {['Slack alerts', 'Email digests', 'PagerDuty escalation'].map((item) => (
                <label key={item} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-cyan-400" />
                  <span className="text-sm text-slate-200">{item}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

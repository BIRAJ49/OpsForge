import { useCallback, useEffect, useState } from 'react'
import { GitCommitHorizontal, RefreshCw, RotateCw } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { api, apiErrorMessage, unwrap } from '../services/api'

export default function GitOps() {
  const [projects, setProjects] = useState([])
  const [project, setProject] = useState(null)
  const [status, setStatus] = useState(null)
  const [applications, setApplications] = useState([])
  const [mode, setMode] = useState('loading')
  const [history, setHistory] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const loadGitOps = useCallback(async (selectedProjectId) => {
    setLoading(true)
    setMessage('')
    try {
      const [projectResponse, appResponse] = await Promise.all([
        api.get('/projects'),
        api.get('/gitops/applications'),
      ])
      const loadedProjects = unwrap(projectResponse)
      const appPayload = unwrap(appResponse)
      const selected = loadedProjects.find((item) => String(item.id) === String(selectedProjectId)) || loadedProjects[0] || null
      setProjects(loadedProjects)
      setProject(selected)
      setApplications(appPayload.items || [])
      setMode(appPayload.mode || 'unknown')
      if (!selected) {
        setStatus((appPayload.items || [])[0] || null)
        setHistory([])
        return
      }
      const loadedStatus = unwrap(await api.get(`/projects/${selected.id}/gitops/status`))
      const loadedHistory = unwrap(await api.get(`/projects/${selected.id}/gitops/history`))
      setStatus(loadedStatus)
      setHistory(loadedHistory.map((item) => ({
        commit: item.revision || 'main',
        author: 'argocd',
        status: item.status || loadedStatus.sync_status,
        time: item.deployed_at || 'pending',
      })))
      if (appPayload.error) setMessage(`GitOps API fallback: ${appPayload.error}`)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not load GitOps status'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadGitOps()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadGitOps])

  async function syncApp() {
    if (!project) return
    try {
      const result = unwrap(await api.post(`/projects/${project.id}/gitops/sync`))
      setMessage(result.message || 'Sync requested')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not sync GitOps app'))
    }
  }

  async function refreshApp() {
    if (!project) return
    try {
      const result = unwrap(await api.post(`/projects/${project.id}/gitops/refresh`))
      setMessage(result.message || 'Refresh requested')
      await loadGitOps(project.id)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not refresh GitOps app'))
    }
  }

  const cards = status ? [
    ['Argo CD sync status', status.sync_status, status.sync_status === 'Synced' ? 'green' : status.sync_status === 'not_connected' ? 'amber' : 'cyan'],
    ['Health status', status.health_status, status.health_status === 'Healthy' ? 'green' : 'amber'],
    ['GitOps app', status.app_name, 'cyan'],
    ['Current revision', status.current_revision ? status.current_revision.slice(0, 12) : 'pending', 'purple'],
  ] : [
    ['Argo CD sync status', 'OutOfSync', 'amber'],
    ['Health status', 'unknown', 'amber'],
    ['GitOps app', 'pending', 'cyan'],
    ['Current commit', '9f42c18', 'purple'],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Argo CD GitOps</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Application Status</h1>
          <p className="mt-1 text-sm text-slate-400">Source: {mode}. Showing real Argo CD Application sync and health state.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={project?.id || ''}
            onChange={(event) => loadGitOps(event.target.value)}
            className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
          >
            {projects.length ? projects.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            )) : <option value="">No projects</option>}
          </select>
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => loadGitOps(project?.id)}>Reload</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {cards.map(([label, value, tone]) => (
          <Card key={label} hover>
            <CardContent>
              <p className="text-sm text-slate-400">{label}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="truncate text-lg font-semibold text-white">{value}</p>
                <Badge tone={tone}>{label.includes('status') ? 'state' : 'tracked'}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader
          title="Desired State vs Live State"
          description={status?.message || 'Argo CD desired/live state for the selected project.'}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" icon={RotateCw} onClick={refreshApp}>Refresh App</Button>
              <Button icon={RefreshCw} onClick={syncApp}>Sync</Button>
            </div>
          }
        />
        <CardContent>
          {message ? <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <pre className="overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-cyan-100 custom-scrollbar">{`desired:
  app: ${status?.app_name || 'billing-api-prod'}
  targetRevision: ${status?.target_revision || 'main'}
  repo: ${status?.repo_url || 'not configured'}
  path: ${status?.path || 'not configured'}
  namespace: ${status?.destination_namespace || status?.namespace || 'opsforge'}`}</pre>
            <pre className="overflow-auto rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100 custom-scrollbar">{`live:
  sync: ${status?.sync_status || 'OutOfSync'}
  health: ${status?.health_status || 'unknown'}
  revision: ${status?.current_revision || 'pending'}
  operation: ${status?.operation_phase || 'none'}`}</pre>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Argo CD Applications" description="Applications currently registered in the cluster." />
        <CardContent>
          <Table
            columns={[
              { key: 'app_name', header: 'Application', render: (row) => <span className="font-medium text-slate-100">{row.app_name}</span> },
              { key: 'sync_status', header: 'Sync', render: (row) => <StatusBadge status={row.sync_status} /> },
              { key: 'health_status', header: 'Health', render: (row) => <StatusBadge status={row.health_status} /> },
              { key: 'destination_namespace', header: 'Namespace' },
              { key: 'repo_url', header: 'Repository' },
              { key: 'path', header: 'Path' },
            ]}
            data={applications}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Deployment History" description="Recent GitOps reconciliation history." />
        <CardContent>
          <Table
            columns={[
              { key: 'commit', header: 'Commit', render: (row) => <span className="inline-flex items-center gap-2 font-mono text-cyan-200"><GitCommitHorizontal className="h-4 w-4" />{row.commit}</span> },
              { key: 'author', header: 'Author' },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              { key: 'time', header: 'Time' },
            ]}
            data={history}
          />
        </CardContent>
      </Card>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { GitCommitHorizontal, RefreshCw } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { gitopsHistory } from '../data/mockData'
import { api, unwrap } from '../services/api'

export default function GitOps() {
  const [project, setProject] = useState(null)
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState(gitopsHistory)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadGitOps() {
      try {
        const projects = unwrap(await api.get('/projects'))
        const selected = projects[0]
        setProject(selected)
        if (!selected) return
        const loadedStatus = unwrap(await api.get(`/projects/${selected.id}/gitops/status`))
        const loadedHistory = unwrap(await api.get(`/projects/${selected.id}/gitops/history`))
        setStatus(loadedStatus)
        setHistory(loadedHistory.map((item) => ({
          commit: item.revision || 'main',
          author: 'argocd',
          status: item.status || loadedStatus.sync_status,
          time: item.deployed_at || 'pending',
        })))
      } catch (error) {
        setMessage(error.response?.data?.message || 'Could not load GitOps status')
      }
    }
    loadGitOps()
  }, [])

  async function syncApp() {
    if (!project) return
    try {
      const result = unwrap(await api.post(`/projects/${project.id}/gitops/sync`))
      setMessage(result.message || 'Sync requested')
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not sync GitOps app')
    }
  }

  const cards = status ? [
    ['Argo CD sync status', status.sync_status, status.sync_status === 'not_connected' ? 'amber' : 'cyan'],
    ['GitOps app', status.app_name, 'cyan'],
    ['Current revision', status.current_revision || 'pending', 'purple'],
  ] : [
    ['Argo CD sync status', 'OutOfSync', 'amber'],
    ['GitOps repository', 'github.com/opsforge/platform-envs', 'cyan'],
    ['Current commit', '9f42c18', 'purple'],
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
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
          action={<Button icon={RefreshCw} onClick={syncApp}>Sync</Button>}
        />
        <CardContent>
          {message ? <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <pre className="overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-cyan-100 custom-scrollbar">{`desired:
  app: ${status?.app_name || 'billing-api-prod'}
  targetRevision: ${status?.target_revision || 'main'}
  namespace: ${status?.namespace || 'opsforge'}`}</pre>
            <pre className="overflow-auto rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100 custom-scrollbar">{`live:
  sync: ${status?.sync_status || 'OutOfSync'}
  health: ${status?.health_status || 'unknown'}
  revision: ${status?.current_revision || 'pending'}`}</pre>
          </div>
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

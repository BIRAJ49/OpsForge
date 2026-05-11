import { RotateCcw, ScrollText, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { deployments, timeline } from '../data/mockData'
import { api, unwrap } from '../services/api'

export default function Deployments() {
  const [rows, setRows] = useState(deployments)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadDeployments() {
      try {
        const projects = unwrap(await api.get('/projects'))
        const all = []
        for (const project of projects) {
          const projectDeployments = unwrap(await api.get(`/projects/${project.id}/deployments`))
          all.push(...projectDeployments.map((deployment) => ({
            id: deployment.id,
            name: project.name,
            image: `${deployment.image_name}:${deployment.image_tag}`,
            environment: deployment.environment,
            status: deployment.status,
            replicas: deployment.replicas,
            lastDeployment: deployment.deployed_at ? new Date(deployment.deployed_at).toLocaleString() : 'Pending',
          })))
        }
        setRows(all.length ? all : [])
      } catch (error) {
        setMessage(error.response?.data?.message || 'Could not load deployments')
      }
    }
    loadDeployments()
  }, [])

  async function deploymentAction(row, action) {
    try {
      await api.post(`/deployments/${row.id}/${action}`)
      setMessage(`${action} requested for ${row.name}`)
    } catch (error) {
      setMessage(error.response?.data?.message || `Could not ${action} deployment`)
    }
  }

  const columns = [
    { key: 'name', header: 'Deployment name', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
    { key: 'image', header: 'Current image tag' },
    { key: 'environment', header: 'Environment' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'replicas', header: 'Replicas' },
    { key: 'lastDeployment', header: 'Last deployment' },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="warning" icon={Undo2} onClick={() => deploymentAction(row, 'rollback')}>Rollback</Button>
          <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => deploymentAction(row, 'restart')}>Restart</Button>
          <Button size="sm" variant="ghost" icon={ScrollText}>View logs</Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Deployments" description="Current release state, image versions, and self-healing actions." />
        <CardContent>
          {message ? <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          <Table columns={columns} data={rows} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Deployment Timeline" description="Latest rollout events for production services." />
        <CardContent>
          <div className="space-y-5">
            {timeline.map((event, index) => (
              <div key={event.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full bg-cyan-300 shadow-lg shadow-cyan-500/50" />
                  {index < timeline.length - 1 ? <div className="mt-2 h-12 w-px bg-slate-700" /> : null}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-100">{event.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{event.time}</p>
                  <p className="mt-1 text-sm text-slate-400">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

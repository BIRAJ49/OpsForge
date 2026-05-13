import { useEffect, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Card, CardContent, CardHeader } from '../../components/ui/Card'
import { Table } from '../../components/ui/Table'
import { api, apiErrorMessage, unwrap } from '../../services/api'

export default function AdminProjects() {
  const [projects, setProjects] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadProjects() {
      try {
        setProjects(unwrap(await api.get('/admin/projects')) || [])
      } catch (error) {
        setMessage(apiErrorMessage(error, 'Could not load user projects.'))
      }
    }
    loadProjects()
  }, [])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">User Projects</h1>
        <p className="mt-2 text-sm text-slate-400">Read-only project visibility for platform administrators.</p>
      </div>
      {message ? <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</div> : null}
      <Card>
        <CardHeader title="Projects" description="Projects created by users across the platform. Admins can review ownership and deployment metadata without creating projects." />
        <CardContent>
          <Table
            columns={[
              { key: 'name', header: 'Project', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
              { key: 'owner_id', header: 'Owner ID' },
              { key: 'deployment_type', header: 'Deployment', render: (row) => <Badge tone="cyan">{row.deployment_type}</Badge> },
              { key: 'environment', header: 'Environment', render: (row) => <Badge tone={row.environment === 'prod' ? 'amber' : 'purple'}>{row.environment}</Badge> },
              { key: 'namespace', header: 'Namespace' },
              { key: 'github_repo_url', header: 'GitHub', render: (row) => row.github_repo_url ? <a className="text-cyan-300 hover:text-cyan-100" href={row.github_repo_url} target="_blank" rel="noreferrer">Open repo</a> : '-' },
              { key: 'created_at', header: 'Created', render: (row) => row.created_at ? new Date(row.created_at).toLocaleString() : '-' },
            ]}
            data={projects}
            emptyMessage="No user projects found."
          />
        </CardContent>
      </Card>
    </div>
  )
}

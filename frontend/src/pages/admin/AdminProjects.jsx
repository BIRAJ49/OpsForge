import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Table } from '../../components/ui/Table'
import { allProjects } from '../../data/mockData'
import { api, unwrap } from '../../services/api'

export default function AdminProjects() {
  const [projects, setProjects] = useState(allProjects)

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = unwrap(await api.get('/admin/projects'))
        setProjects(data.map((project) => ({
          name: project.name,
          owner: `User ${project.owner_id}`,
          team: project.namespace,
          stack: project.stack,
          environment: project.environment,
          deploymentType: project.deployment_type,
          status: 'Healthy',
        })))
      } catch {
        setProjects(allProjects)
      }
    }
    loadProjects()
  }, [])

  return (
    <Card>
      <CardHeader title="All Projects" description="Platform-wide project inventory across teams and owners." />
      <CardContent>
        <Table
          columns={[
            { key: 'name', header: 'Project', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
            { key: 'owner', header: 'Owner' },
            { key: 'team', header: 'Team' },
            { key: 'stack', header: 'Stack' },
            { key: 'environment', header: 'Environment' },
            { key: 'deploymentType', header: 'Deployment type' },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
          ]}
          data={projects}
        />
      </CardContent>
    </Card>
  )
}

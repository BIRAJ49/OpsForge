import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Table } from '../../components/ui/Table'
import { allDeployments } from '../../data/mockData'
import { api, unwrap } from '../../services/api'

export default function AdminDeployments() {
  const [deployments, setDeployments] = useState(allDeployments)

  useEffect(() => {
    async function loadDeployments() {
      try {
        const data = unwrap(await api.get('/admin/deployments'))
        setDeployments(data.map((deployment) => ({
          name: `Project ${deployment.project_id}`,
          image: `${deployment.image_name}:${deployment.image_tag}`,
          environment: deployment.environment,
          status: deployment.status,
          replicas: deployment.replicas,
          lastDeployment: deployment.deployed_at ? new Date(deployment.deployed_at).toLocaleString() : 'Pending',
        })))
      } catch {
        setDeployments(allDeployments)
      }
    }
    loadDeployments()
  }, [])

  return (
    <Card>
      <CardHeader title="All Deployments" description="Platform-wide deployment health and rollout state." />
      <CardContent>
        <Table
          columns={[
            { key: 'name', header: 'Deployment', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
            { key: 'image', header: 'Image tag' },
            { key: 'environment', header: 'Environment' },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            { key: 'replicas', header: 'Replicas' },
            { key: 'lastDeployment', header: 'Last deployment' },
          ]}
          data={deployments}
        />
      </CardContent>
    </Card>
  )
}

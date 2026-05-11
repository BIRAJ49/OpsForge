import { Activity, Boxes, CloudCog, ShieldAlert, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, CardContent } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Table } from '../../components/ui/Table'
import { allDeployments, allProjects, auditLogs, clusters, platformUsers, systemHealth } from '../../data/mockData'
import { api, unwrap } from '../../services/api'

export default function AdminOverview() {
  const [counts, setCounts] = useState({
    users: platformUsers.length,
    projects: allProjects.length,
    deployments: allDeployments.length,
    clusters: clusters.length,
    audits: auditLogs.length,
  })
  const [health, setHealth] = useState(systemHealth)

  useEffect(() => {
    async function loadAdminOverview() {
      try {
        const [users, projects, deployments, audits, system] = await Promise.all([
          api.get('/admin/users'),
          api.get('/admin/projects'),
          api.get('/admin/deployments'),
          api.get('/admin/audit-logs'),
          api.get('/admin/system-health'),
        ])
        setCounts({
          users: unwrap(users).length,
          projects: unwrap(projects).length,
          deployments: unwrap(deployments).length,
          clusters: clusters.length,
          audits: unwrap(audits).length,
        })
        const systemData = unwrap(system)
        setHealth([
          { service: 'API', uptime: 'live', status: systemData.api === 'healthy' ? 'Healthy' : 'Warning', latency: 'API-backed' },
          { service: 'Database', uptime: 'live', status: systemData.database === 'configured' ? 'Healthy' : 'Warning', latency: 'configured' },
          { service: 'Monitoring', uptime: 'mock', status: 'Healthy', latency: `${systemData.monitoring?.api_latency_ms || 0}ms` },
        ])
      } catch {
        setCounts({
          users: platformUsers.length,
          projects: allProjects.length,
          deployments: allDeployments.length,
          clusters: clusters.length,
          audits: auditLogs.length,
        })
        setHealth(systemHealth)
      }
    }
    loadAdminOverview()
  }, [])

  const stats = [
    ['Users', counts.users, Users, 'Active platform accounts'],
    ['Projects', counts.projects, Boxes, 'Across all teams'],
    ['Deployments', counts.deployments, Activity, 'Current workloads'],
    ['Clusters', counts.clusters, CloudCog, 'Registered Kubernetes clusters'],
    ['Audit Events', counts.audits, ShieldAlert, 'Sensitive actions today'],
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-cyan-300">Platform admin</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">OpsForge platform overview</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value, Icon, detail]) => (
          <Card key={label} hover>
            <CardContent>
              <Icon className="h-5 w-5 text-cyan-300" />
              <p className="mt-4 text-sm text-slate-400">{label}</p>
              <p className="mt-2 text-3xl font-bold text-white">{value}</p>
              <p className="mt-2 text-xs text-slate-500">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent>
          <Table
            columns={[
              { key: 'service', header: 'Platform service', render: (row) => <span className="font-medium text-slate-100">{row.service}</span> },
              { key: 'uptime', header: 'Uptime' },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              { key: 'latency', header: 'Latency' },
            ]}
            data={health}
          />
        </CardContent>
      </Card>
    </div>
  )
}
